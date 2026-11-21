// Lokalny serwer SMTP do testów: przyjmuje każdą wiadomość, zapisuje ją jako .eml
// i pokazuje listę pod http://localhost:2526. Uruchomienie: npm run smtp-test
// W DIAGNOS CRM ustaw: serwer localhost, port 2525, bez szyfrowania, adres nadawcy dowolny.
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 2525);
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 2526);
const dir = path.resolve(process.env.MAIL_DIR ?? './data/mail-test');
fs.mkdirSync(dir, { recursive: true });
const list: { id: number; date: string; from: string; to: string; subject: string; attachments: string[]; text: string }[] = [];

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onAuth: (auth, _s, cb) => cb(null, { user: auth.username }),
  onData(stream, _s, cb) {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', async () => {
      const raw = Buffer.concat(chunks);
      const m = await simpleParser(raw);
      const id = list.length + 1;
      fs.writeFileSync(path.join(dir, `${String(id).padStart(4, '0')}.eml`), raw);
      const to = Array.isArray(m.to) ? m.to.map((t) => t.text).join(', ') : m.to?.text ?? '';
      list.push({ id, date: new Date().toISOString(), from: m.from?.text ?? '', to, subject: m.subject ?? '', attachments: m.attachments.map((a) => `${a.filename} (${a.size} B)`), text: m.text ?? '' });
      console.log(`[SMTP] #${id} do: ${to} temat: ${m.subject} załączniki: ${m.attachments.length}`);
      cb();
    });
  },
});
server.listen(SMTP_PORT, () => console.log(`Testowy SMTP nasłuchuje na porcie ${SMTP_PORT}, wiadomości w ${dir}`));
http
  .createServer((req, res) => {
    if (req.url === '/api') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(list));
    }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Testowy SMTP</title><body style="font-family:sans-serif;font-size:13px"><h1>Przechwycone wiadomości (${list.length})</h1>${list
      .slice()
      .reverse()
      .map((m) => `<div style="border:1px solid #ccc;padding:8px;margin:8px 0"><b>${esc(m.subject)}</b><br>Od: ${esc(m.from)} · Do: ${esc(m.to)} · ${m.date}<br>Załączniki: ${esc(m.attachments.join(', ') || '—')}<pre>${esc(m.text)}</pre></div>`)
      .join('')}</body>`);
  })
  .listen(HTTP_PORT, () => console.log(`Podgląd: http://localhost:${HTTP_PORT}`));
