// Wysyłka e-mail (SMTP), SMS (wymienne adaptery bramek) i kolejka wysyłki (outbox).
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import type { Ctx } from '../context.js';
import { decryptSecret, getSetting } from '../context.js';
import { addMinutesIso, nowIso } from '../util.js';
import { filePath, getFile } from './files.js';

// ---------- Ustawienia ----------
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password_enc: string;
  from_email: string;
  from_name: string;
  ignore_tls_errors: boolean;
}
export const defaultSmtp: SmtpSettings = { host: '', port: 587, secure: false, user: '', password_enc: '', from_email: '', from_name: 'DIAGNOS CRM', ignore_tls_errors: false };

export function smtpSettings(ctx: Ctx): SmtpSettings {
  return getSetting(ctx, 'smtp', defaultSmtp);
}
export function isSmtpConfigured(ctx: Ctx): boolean {
  const s = smtpSettings(ctx);
  return !!(s.host && s.port && s.from_email);
}

export interface SmsSettings {
  provider: 'none' | 'smsapi' | 'http';
  sender: string;
  token_enc: string;
  /** Adapter HTTP: adres bramki; w treści można użyć {{numer}}, {{tresc}}, {{nadawca}}, {{token}}. */
  http_url: string;
  http_method: 'GET' | 'POST';
  http_body: string;
  http_content_type: string;
  http_success_text: string;
  smsapi_url: string;
}
export const defaultSms: SmsSettings = {
  provider: 'none',
  sender: '',
  token_enc: '',
  http_url: '',
  http_method: 'POST',
  http_body: '{"to":"{{numer}}","message":"{{tresc}}","from":"{{nadawca}}"}',
  http_content_type: 'application/json',
  http_success_text: '',
  smsapi_url: 'https://api.smsapi.pl/sms.do',
};
export function smsSettings(ctx: Ctx): SmsSettings {
  return getSetting(ctx, 'sms', defaultSms);
}

// ---------- Adaptery SMS ----------
export interface SmsAdapter {
  name: string;
  configured: boolean;
  send(to: string, text: string): Promise<{ ok: boolean; info: string }>;
}

function enc(v: string) {
  return encodeURIComponent(v);
}

export function smsAdapter(ctx: Ctx): SmsAdapter {
  const s = smsSettings(ctx);
  const token = decryptSecret(ctx, s.token_enc);
  if (s.provider === 'smsapi') {
    return {
      name: 'SMSAPI',
      configured: !!token,
      async send(to, text) {
        const body = new URLSearchParams({ to, message: text, format: 'json', encoding: 'utf-8' });
        if (s.sender) body.set('from', s.sender);
        const r = await fetch(s.smsapi_url || defaultSms.smsapi_url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        const t = await r.text();
        if (!r.ok || /"error"/.test(t)) return { ok: false, info: `Bramka zwróciła ${r.status}: ${t.slice(0, 300)}` };
        return { ok: true, info: t.slice(0, 300) };
      },
    };
  }
  if (s.provider === 'http') {
    return {
      name: 'Bramka HTTP',
      configured: !!s.http_url,
      async send(to, text) {
        const subst = (tpl: string, encode: (v: string) => string) =>
          tpl.replace(/\{\{(numer|tresc|nadawca|token)\}\}/g, (_, k) => encode(k === 'numer' ? to : k === 'tresc' ? text : k === 'nadawca' ? s.sender : token));
        const jsonEsc = (v: string) => JSON.stringify(v).slice(1, -1);
        const url = subst(s.http_url, enc);
        const init: RequestInit = { method: s.http_method };
        if (s.http_method === 'POST') {
          init.body = subst(s.http_body, s.http_content_type.includes('json') ? jsonEsc : enc);
          init.headers = { 'Content-Type': s.http_content_type };
        }
        const r = await fetch(url, init);
        const t = await r.text();
        if (!r.ok) return { ok: false, info: `Bramka zwróciła ${r.status}: ${t.slice(0, 300)}` };
        if (s.http_success_text && !t.includes(s.http_success_text)) return { ok: false, info: `Odpowiedź bramki bez potwierdzenia: ${t.slice(0, 300)}` };
        return { ok: true, info: t.slice(0, 300) };
      },
    };
  }
  return {
    name: 'brak',
    configured: false,
    async send() {
      return { ok: false, info: 'Bramka SMS nie jest skonfigurowana.' };
    },
  };
}

// ---------- E-mail ----------
export interface MailAttachment {
  file_id?: number;
  filename?: string;
  path?: string;
  content?: string; // base64
}

export async function sendMailNow(
  ctx: Ctx,
  m: { to: string; cc?: string | null; subject: string; text?: string | null; html?: string | null; attachments?: MailAttachment[] },
) {
  const s = smtpSettings(ctx);
  const transport = nodemailer.createTransport({
    host: s.host,
    port: Number(s.port),
    secure: !!s.secure,
    auth: s.user ? { user: s.user, pass: decryptSecret(ctx, s.password_enc) } : undefined,
    tls: s.ignore_tls_errors ? { rejectUnauthorized: false } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });
  const atts = (m.attachments ?? []).map((a) => {
    if (a.file_id) {
      const f = getFile(ctx, a.file_id);
      if (!f) throw new Error('Brak pliku załącznika.');
      return { filename: a.filename ?? f.original_name, content: fs.readFileSync(filePath(ctx, f)) };
    }
    if (a.content) return { filename: a.filename, content: Buffer.from(a.content, 'base64') };
    return { filename: a.filename, path: a.path };
  });
  const info = await transport.sendMail({
    from: s.from_name ? `"${s.from_name.replace(/"/g, '')}" <${s.from_email}>` : s.from_email,
    to: m.to,
    cc: m.cc || undefined,
    subject: m.subject,
    text: m.text ?? undefined,
    html: m.html ?? undefined,
    attachments: atts,
  });
  return info.messageId as string;
}

// ---------- Kolejka wysyłki ----------
export type OutboxStatus = 'queued' | 'awaiting_config' | 'sending' | 'sent' | 'failed' | 'cancelled';
export const OUTBOX_LABELS: Record<string, string> = {
  queued: 'w kolejce',
  awaiting_config: 'oczekuje na konfigurację',
  sending: 'wysyłanie',
  sent: 'wysłano',
  failed: 'błąd wysyłki',
  cancelled: 'anulowano',
};

function channelConfigured(ctx: Ctx, channel: string): boolean {
  return channel === 'email' ? isSmtpConfigured(ctx) : smsAdapter(ctx).configured;
}

export function queueMessage(
  ctx: Ctx,
  m: {
    channel: 'email' | 'sms';
    recipient: string;
    cc?: string | null;
    subject?: string | null;
    body_text?: string | null;
    body_html?: string | null;
    attachments?: MailAttachment[];
    correspondence_id?: number | null;
    campaign_recipient_id?: number | null;
    reminder_id?: number | null;
    report_schedule_id?: number | null;
    send_after?: string | null;
    created_by?: number | null;
  },
): { id: number; status: OutboxStatus } {
  const status: OutboxStatus = channelConfigured(ctx, m.channel) ? 'queued' : 'awaiting_config';
  const id = ctx.db.insert('outbox', {
    ...m,
    attachments: m.attachments?.length ? JSON.stringify(m.attachments) : null,
    status,
    created_at: nowIso(),
  });
  propagate(ctx, id, status, null);
  return { id, status };
}

/** Przenosi stan pozycji kolejki na powiązaną korespondencję i odbiorcę kampanii. */
function propagate(ctx: Ctx, outboxId: number, status: OutboxStatus, error: string | null) {
  const o = ctx.db.get<any>('SELECT correspondence_id, campaign_recipient_id FROM outbox WHERE id = ?', outboxId);
  if (!o) return;
  const sentAt = status === 'sent' ? nowIso() : null;
  if (o.correspondence_id)
    ctx.db.run('UPDATE correspondence SET send_status = ?, send_error = ?, sent_at = COALESCE(?, sent_at) WHERE id = ?', status, error, sentAt, o.correspondence_id);
  if (o.campaign_recipient_id) ctx.db.run('UPDATE campaign_recipients SET status = ?, error = ?, outbox_id = ? WHERE id = ?', status, error, outboxId, o.campaign_recipient_id);
}

function setStatus(ctx: Ctx, id: number, status: OutboxStatus, error: string | null, extra: Record<string, any> = {}) {
  ctx.db.update('outbox', id, { status, last_error: error, ...extra });
  propagate(ctx, id, status, error);
}

const MAX_ATTEMPTS = 6; // z rosnącymi odstępami 2, 4, 8, 16, 32 min — krótka awaria serwera poczty nie wymaga ręcznej interwencji
let current: Promise<number> | null = null;

/** Przetwarza kolejkę: wysyła oczekujące wiadomości. Zwraca liczbę przetworzonych pozycji.
 *  Gdy przetwarzanie już trwa, czeka na jego koniec i przetwarza ponownie (nowe pozycje). */
export async function processOutbox(ctx: Ctx, limit = 50, onlyId?: number): Promise<number> {
  while (current) await current.catch(() => 0);
  current = runOutbox(ctx, limit, onlyId);
  try {
    return await current;
  } finally {
    current = null;
  }
}

async function runOutbox(ctx: Ctx, limit: number, onlyId?: number): Promise<number> {
  {
    const now = nowIso();
    // Wiadomości czekające na konfigurację wracają do kolejki, gdy kanał zostanie skonfigurowany.
    for (const ch of ['email', 'sms'] as const) {
      if (channelConfigured(ctx, ch)) {
        const ids = ctx.db.all<{ id: number }>("SELECT id FROM outbox WHERE status = 'awaiting_config' AND channel = ?", ch);
        ids.forEach((r) => setStatus(ctx, r.id, 'queued', null));
      }
    }
    const items = onlyId
      ? ctx.db.all<any>("SELECT * FROM outbox WHERE status = 'queued' AND id = ?", onlyId)
      : ctx.db.all<any>("SELECT * FROM outbox WHERE status = 'queued' AND (send_after IS NULL OR send_after <= ?) ORDER BY id LIMIT ?", now, limit);
    let n = 0;
    for (const it of items) {
      ctx.db.update('outbox', it.id, { status: 'sending', attempts: it.attempts + 1 });
      try {
        if (it.channel === 'email') {
          await sendMailNow(ctx, {
            to: it.recipient,
            cc: it.cc,
            subject: it.subject ?? '',
            text: it.body_text,
            html: it.body_html,
            attachments: it.attachments ? JSON.parse(it.attachments) : [],
          });
        } else {
          const r = await smsAdapter(ctx).send(normalizePhone(it.recipient), it.body_text ?? '');
          if (!r.ok) throw new Error(r.info);
        }
        setStatus(ctx, it.id, 'sent', null, { sent_at: nowIso() });
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 500);
        if (it.attempts + 1 >= MAX_ATTEMPTS) setStatus(ctx, it.id, 'failed', msg);
        else setStatus(ctx, it.id, 'queued', msg, { send_after: addMinutesIso(nowIso(), 2 ** (it.attempts + 1)) });
      }
      n++;
    }
    return n;
  }
}

export function retryOutbox(ctx: Ctx, id: number) {
  const it = ctx.db.get<any>('SELECT * FROM outbox WHERE id = ?', id);
  if (!it) return;
  const status: OutboxStatus = channelConfigured(ctx, it.channel) ? 'queued' : 'awaiting_config';
  setStatus(ctx, id, status, null, { attempts: 0, send_after: null });
}
export function cancelOutbox(ctx: Ctx, id: number) {
  setStatus(ctx, id, 'cancelled', null);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function textToHtml(s: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(s).replace(/\n/g, '<br>')}</div>`;
}

/** Po restarcie serwera: pozycje przerwane w trakcie wysyłania wracają do kolejki. */
export function recoverOutbox(ctx: Ctx): number {
  return ctx.db.run("UPDATE outbox SET status = 'queued', send_after = NULL WHERE status = 'sending'").changes as number;
}

/** Numer telefonu w postaci przyjmowanej przez bramki: same cyfry z prefiksem kraju (domyślnie 48), np. 48601602603. */
export function normalizePhone(v: string): string {
  let d = String(v ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 9) d = '48' + d;
  return d.replace(/\D/g, '');
}
