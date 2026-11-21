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
export function mimeFor(name: string, fallback?: string | null): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return MIME[ext] ?? fallback ?? 'application/octet-stream';
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
    mime: mimeFor(originalName, mime),
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
