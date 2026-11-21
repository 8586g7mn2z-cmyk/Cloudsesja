import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import type { Ctx } from '../context.js';
import { getSetting } from '../context.js';
import { fmtDatePl, fmtMoney, nowIso } from '../util.js';
import { filePath, getFile } from './files.js';

export const assetsDir = () => process.env.DIAGNOS_ASSETS_DIR ?? path.resolve('server/assets');
const FONT = () => path.join(assetsDir(), 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = () => path.join(assetsDir(), 'fonts', 'DejaVuSans-Bold.ttf');
const NAVY = '#1b2f5b';
const GREY = '#6b7280';
const LINE = '#cfd5df';

export interface Company {
  name: string;
  address: string;
  nip: string;
  phone: string;
  email: string;
  www: string;
  bank_account: string;
  footer: string;
  logo_file_id: number | null;
}
export const defaultCompany: Company = {
  name: 'DIAGNOS',
  address: '',
  nip: '',
  phone: '',
  email: '',
  www: '',
  bank_account: '',
  footer: '',
  logo_file_id: null,
};
export function company(ctx: Ctx): Company {
  return getSetting(ctx, 'company', defaultCompany);
}

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'int' | 'money' | 'percent' | 'hours' | 'date' | 'datetime' | 'number';
  width?: number;
}
export interface ReportResult {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any> | null;
  chart?: { labels: string[]; series: { name: string; values: number[] }[]; unit?: string } | null;
}

export function fmtCell(v: any, type?: ReportColumn['type']): string {
  if (v == null || v === '') return '';
  switch (type) {
    case 'money':
      return fmtMoney(v);
    case 'percent':
      return `${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`;
    case 'hours':
      return Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'number':
      return Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
    case 'int':
      return String(v);
    case 'date':
      return fmtDatePl(String(v));
    case 'datetime':
      return `${fmtDatePl(String(v))} ${String(v).slice(11, 16)}`;
    default:
      return String(v);
  }
}
const isNum = (t?: string) => ['int', 'money', 'percent', 'hours', 'number'].includes(t ?? '');

function newDoc(landscape = false) {
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 40, bufferPages: true, info: { Producer: 'DIAGNOS CRM' } });
  doc.registerFont('main', FONT());
  doc.registerFont('bold', FONT_BOLD());
  doc.font('main');
  return doc;
}
function finish(doc: PDFKit.PDFDocument, footer: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const y = doc.page.height - 28;
      doc.font('main').fontSize(7).fillColor(GREY);
      doc.text(footer, 40, y, { width: doc.page.width - 160, lineBreak: false, height: 10 });
      doc.text(`Strona ${i + 1} z ${range.count}`, doc.page.width - 120, y, { width: 80, align: 'right', lineBreak: false, height: 10 });
    }
    doc.end();
  });
}

function header(ctx: Ctx, doc: PDFKit.PDFDocument) {
  const c = company(ctx);
  const left = 40;
  let x = left;
  if (c.logo_file_id) {
    const f = getFile(ctx, c.logo_file_id);
    if (f && /png|jpe?g/i.test(f.mime ?? '') && fs.existsSync(filePath(ctx, f))) {
      try {
        doc.image(filePath(ctx, f), left, 34, { fit: [110, 40] });
        x = left + 122;
      } catch {
        /* logo w nieobsługiwanym formacie */
      }
    }
  }
  doc.font('bold').fontSize(13).fillColor(NAVY).text(c.name || 'DIAGNOS', x, 36, { lineBreak: false });
  const info = [c.address, c.nip ? `NIP ${c.nip}` : '', c.phone ? `tel. ${c.phone}` : '', c.email, c.www].filter(Boolean).join('  ·  ');
  doc.font('main').fontSize(8).fillColor(GREY).text(info, x, 54, { width: doc.page.width - x - 40 });
  doc.moveTo(left, 80).lineTo(doc.page.width - 40, 80).lineWidth(1.2).strokeColor(NAVY).stroke();
  doc.y = 92;
  doc.x = left;
}

function drawTable(doc: PDFKit.PDFDocument, columns: ReportColumn[], rows: Record<string, any>[], totals?: Record<string, any> | null, opts: { header?: () => void } = {}) {
  const left = 40;
  const width = doc.page.width - 80;
  const weights = columns.map((c) => c.width ?? (isNum(c.type) ? 1 : 2));
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / sum) * width);
  const rowH = 16;
  const bottom = () => doc.page.height - 50;
  const drawHead = () => {
    let x = left;
    doc.rect(left, doc.y, width, rowH).fill('#e8ecf3');
    doc.font('bold').fontSize(8).fillColor(NAVY);
    const y = doc.y + 4;
    columns.forEach((c, i) => {
      doc.text(c.label, x + 3, y, { width: widths[i] - 6, align: isNum(c.type) ? 'right' : 'left', lineBreak: false, height: rowH });
      x += widths[i];
    });
    doc.y = y - 4 + rowH;
  };
  const drawRow = (r: Record<string, any>, bold = false) => {
    if (doc.y + rowH > bottom()) {
      doc.addPage();
      opts.header?.();
      doc.y = Math.max(doc.y, 50);
      drawHead();
    }
    let x = left;
    const y = doc.y + 4;
    doc.font(bold ? 'bold' : 'main').fontSize(8).fillColor('#111827');
    columns.forEach((c, i) => {
      doc.text(fmtCell(r[c.key], c.type), x + 3, y, { width: widths[i] - 6, align: isNum(c.type) ? 'right' : 'left', lineBreak: false, height: rowH, ellipsis: true });
      x += widths[i];
    });
    doc.moveTo(left, y - 4 + rowH).lineTo(left + width, y - 4 + rowH).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.y = y - 4 + rowH;
  };
  drawHead();
  rows.forEach((r) => drawRow(r));
  if (totals) {
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor(NAVY).stroke();
    drawRow(totals, true);
  }
  doc.x = left;
}

const SERIES_COLORS = ['#1b2f5b', '#5b7bb5', '#c2410c', '#9aa7bd'];

function drawChart(doc: PDFKit.PDFDocument, chart: NonNullable<ReportResult['chart']>) {
  if (!chart.labels.length) return;
  const left = 70;
  const width = doc.page.width - left - 50;
  const height = 200;
  if (doc.y + height + 60 > doc.page.height - 50) doc.addPage();
  const top = doc.y + 20;
  const max = Math.max(1, ...chart.series.flatMap((s) => s.values));
  const nice = niceMax(max);
  doc.font('main').fontSize(7).fillColor(GREY);
  for (let i = 0; i <= 4; i++) {
    const v = (nice / 4) * i;
    const y = top + height - (v / nice) * height;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.4).strokeColor(LINE).dash(2, { space: 2 }).stroke().undash();
    doc.text(v.toLocaleString('pl-PL', { maximumFractionDigits: 1 }), left - 40, y - 4, { width: 35, align: 'right' });
  }
  const groupW = width / chart.labels.length;
  const barW = Math.min(40, (groupW * 0.7) / chart.series.length);
  chart.labels.forEach((label, gi) => {
    const gx = left + gi * groupW + (groupW - barW * chart.series.length) / 2;
    chart.series.forEach((s, si) => {
      const v = s.values[gi] ?? 0;
      const h = (v / nice) * height;
      doc.rect(gx + si * barW, top + height - h, barW - 2, h).fill(SERIES_COLORS[si % SERIES_COLORS.length]);
      doc.fillColor('#111827').fontSize(7).text(v.toLocaleString('pl-PL', { maximumFractionDigits: 1 }), gx + si * barW - 6, top + height - h - 10, { width: barW + 10, align: 'center' });
    });
    doc.fillColor('#111827').fontSize(7).text(label, left + gi * groupW, top + height + 4, { width: groupW, align: 'center', height: 20, ellipsis: true });
  });
  doc.moveTo(left, top + height).lineTo(left + width, top + height).lineWidth(1).strokeColor('#111827').stroke();
  if (chart.series.length > 1) {
    let lx = left;
    const ly = top + height + 26;
    chart.series.forEach((s, si) => {
      doc.rect(lx, ly, 8, 8).fill(SERIES_COLORS[si % SERIES_COLORS.length]);
      doc.fillColor('#111827').fontSize(8).text(s.name, lx + 12, ly, { lineBreak: false });
      lx += 20 + doc.widthOfString(s.name);
    });
  }
  doc.y = top + height + 44;
  doc.x = 40;
}
function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export async function reportPdf(ctx: Ctx, r: ReportResult): Promise<Buffer> {
  const landscape = r.columns.length > 6;
  const doc = newDoc(landscape);
  const hdr = () => header(ctx, doc);
  hdr();
  doc.font('bold').fontSize(14).fillColor('#111827').text(r.title, 40, doc.y, { align: 'left' });
  if (r.subtitle) doc.font('main').fontSize(9).fillColor(GREY).text(r.subtitle);
  doc.moveDown(0.8);
  if (r.rows.length) drawTable(doc, r.columns, r.rows, r.totals, { header: hdr });
  else doc.font('main').fontSize(9).fillColor(GREY).text('Brak danych dla wybranych parametrów.');
  if (r.chart && r.rows.length) drawChart(doc, r.chart);
  return finish(doc, `${company(ctx).name || 'DIAGNOS'} · wygenerowano ${fmtDatePl(nowIso())} ${nowIso().slice(11, 16)} · DIAGNOS CRM`);
}

export interface DocItem {
  name: string;
  qty: number;
  unit: string | null;
  net_price: number;
  vat_rate: number;
  net_value: number;
  gross_value: number;
}

/** Dokument z szablonu: wspólny nagłówek firmy, treść z polami podstawionymi, tabela pozycji. */
export async function templatePdf(ctx: Ctx, body: string, items: DocItem[]): Promise<Buffer> {
  const doc = newDoc(false);
  const hdr = () => header(ctx, doc);
  hdr();
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('# ')) {
      doc.font('bold').fontSize(15).fillColor(NAVY).text(line.slice(2), { align: 'left' });
      doc.moveDown(0.5);
    } else if (line.trim() === '[[POZYCJE]]') {
      doc.moveDown(0.3);
      if (items.length) {
        const cols: ReportColumn[] = [
          { key: 'lp', label: 'Lp.', type: 'int', width: 0.5 },
          { key: 'name', label: 'Nazwa', width: 4 },
          { key: 'qty', label: 'Ilość', type: 'number', width: 0.8 },
          { key: 'unit', label: 'J.m.', width: 0.6 },
          { key: 'net_price', label: 'Cena netto', type: 'money', width: 1.3 },
          { key: 'vat', label: 'VAT', width: 0.6 },
          { key: 'net_value', label: 'Wartość netto', type: 'money', width: 1.4 },
          { key: 'gross_value', label: 'Wartość brutto', type: 'money', width: 1.4 },
        ];
        const rows = items.map((it, i) => ({ ...it, lp: i + 1, vat: `${it.vat_rate}%` }));
        const totals = {
          name: 'Razem',
          net_value: rows.reduce((s, r) => s + r.net_value, 0),
          gross_value: rows.reduce((s, r) => s + r.gross_value, 0),
        };
        drawTable(doc, cols, rows, totals, { header: hdr });
      } else doc.font('main').fontSize(9).fillColor(GREY).text('(brak pozycji)');
      doc.moveDown(0.6);
    } else if (line.trim() === '') doc.moveDown(0.5);
    else doc.font('main').fontSize(10).fillColor('#111827').text(line, { align: 'left' });
  }
  const c = company(ctx);
  return finish(doc, [c.name, c.footer].filter(Boolean).join(' · ') || 'DIAGNOS');
}
