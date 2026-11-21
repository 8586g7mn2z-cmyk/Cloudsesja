import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Ctx } from '../context.js';
import { nowIso } from '../util.js';

export interface FileRow {
  id: number;
  storage_name: string;
  original_name: string;
  mime: string | null;
  size: number;
  created_by: number | null;
  created_at: string;
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
};
export function mimeFor(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}
export function extOf(name: string): string {
  return path.extname(name).slice(1).toUpperCase();
}

export function saveFile(ctx: Ctx, data: Buffer, originalName: string, mime: string | null, userId: number | null): number {
  const now = nowIso();
  const sub = path.join(now.slice(0, 4), now.slice(5, 7));
  fs.mkdirSync(path.join(ctx.config.filesDir, sub), { recursive: true });
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const storage = path.join(sub, crypto.randomUUID() + ext);
  fs.writeFileSync(path.join(ctx.config.filesDir, storage), data);
  return ctx.db.insert('files', {
    storage_name: storage,
    original_name: originalName,
    mime: mimeFor(originalName),
    size: data.length,
    created_by: userId,
    created_at: now,
  });
}

export function getFile(ctx: Ctx, id: number): FileRow | undefined {
  return ctx.db.get<FileRow>('SELECT * FROM files WHERE id = ?', id);
}
export function filePath(ctx: Ctx, f: FileRow): string {
  return path.join(ctx.config.filesDir, f.storage_name);
}

/** Nagłówek Content-Disposition z poprawnym kodowaniem polskich znaków. */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Typy, które wolno pokazać w przeglądarce (podgląd). Pozostałe pliki są zawsze pobierane. */
const INLINE_SAFE = /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp)|text\/plain)\b/;

/**
 * Nagłówki bezpiecznego wydania pliku wgranego przez użytkownika. Typ wynika z rozszerzenia (nigdy z deklaracji
 * wysyłającego); HTML, SVG i inne treści aktywne nie są wyświetlane w przeglądarce, tylko pobierane.
 */
export function fileHeaders(reply: { header: (k: string, v: string) => unknown }, f: FileRow, wantInline: boolean) {
  const mime = mimeFor(f.original_name);
  const inline = wantInline && INLINE_SAFE.test(mime);
  reply.header('Content-Type', inline ? mime : INLINE_SAFE.test(mime) ? mime : mime.startsWith('text/') || mime === 'image/svg+xml' ? 'application/octet-stream' : mime);
  reply.header('Content-Disposition', contentDisposition(f.original_name, inline));
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
}

/** Usuwa plik z dysku i z bazy, jeżeli nie wskazuje na niego już żaden dokument, załącznik ani wiadomość w kolejce. */
export function purgeFileIfUnused(ctx: Ctx, fileId: number | null | undefined) {
  if (!fileId) return;
  const used = ctx.db.get<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM attachments WHERE file_id = ?) + (SELECT COUNT(*) FROM document_versions WHERE file_id = ?) +
            (SELECT COUNT(*) FROM outbox WHERE status NOT IN ('sent', 'cancelled') AND attachments LIKE ?) AS n`,
    fileId,
    fileId,
    `%"file_id":${fileId}%`,
  )!.n;
  if (used) return;
  const company = ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'company'");
  if (company && company.value.includes(`"logo_file_id":${fileId}`)) return;
  const f = getFile(ctx, fileId);
  if (!f) return;
  ctx.db.run('DELETE FROM files WHERE id = ?', fileId);
  fs.rmSync(filePath(ctx, f), { force: true });
}
