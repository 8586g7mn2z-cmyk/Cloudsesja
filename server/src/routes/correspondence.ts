import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { isManager, requireUser } from '../auth.js';
import { audit, bad, forbidden, fmtDatePl, isValidEmail, makeNumber, notFound, nowIso, parseLocal, renderTemplate, str, todayIso, toInt } from '../util.js';
import { OUTBOX_LABELS, processOutbox, queueMessage, textToHtml } from '../services/messaging.js';
import { fireEvent } from '../services/tasks.js';
import { documentLevel, logDocument } from '../services/docperms.js';
import { attachmentsFor } from './contractors.js';

export const DIRECTIONS: Record<string, string> = { out: 'Wychodząca', in: 'Przychodząca' };

function kindCode(ctx: Ctx, id: number): string | null {
  return ctx.db.get<any>("SELECT code FROM dict_items WHERE id = ? AND dict = 'corr_kind'", id)?.code ?? null;
}

export function correspondenceList(ctx: Ctx, where: string, params: any[]) {
  return ctx.db.all<any>(
    `SELECT k.*, kd.name AS kind_name, kd.code AS kind_code, t.name AS topic_name, c.name AS contractor_name, c.short_name AS contractor_short, c.city AS contractor_city,
            TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS contact_name, o.name AS operator_name,
            pr.name AS project_name, st.name AS stage_name, rc.name AS related_name,
            (SELECT COUNT(*) FROM attachments a WHERE a.owner_type = 'correspondence' AND a.owner_id = k.id) AS attachments_count
     FROM correspondence k
     JOIN dict_items kd ON kd.id = k.kind_id LEFT JOIN dict_items t ON t.id = k.topic_id
     LEFT JOIN contractors c ON c.id = k.contractor_id LEFT JOIN contacts p ON p.id = k.contact_id
     LEFT JOIN operators o ON o.id = k.operator_id LEFT JOIN projects pr ON pr.id = k.project_id
     LEFT JOIN project_stages st ON st.id = k.stage_id LEFT JOIN contractors rc ON rc.id = k.related_contractor_id
     ${where} ORDER BY k.event_at DESC, k.id DESC`,
    ...params,
  ).map((r) => ({
    ...r,
    direction_label: DIRECTIONS[r.direction] ?? r.direction,
    subject: r.topic_text || r.topic_name || '',
    send_status_label: r.send_status ? OUTBOX_LABELS[r.send_status] ?? r.send_status : '',
  }));
}

function corrData(ctx: Ctx, b: any) {
  const kind_id = toInt(b.kind_id);
  if (!kind_id || !ctx.db.get("SELECT id FROM dict_items WHERE id = ? AND dict = 'corr_kind'", kind_id)) throw bad('Wybierz rodzaj korespondencji.');
  if (!['in', 'out'].includes(b.direction)) throw bad('Wybierz kierunek korespondencji.');
  const event_at = str(b.event_at);
  if (!event_at || isNaN(parseLocal(event_at).getTime())) throw bad('Podaj datę i godzinę zdarzenia.');
  if (!toInt(b.topic_id) && !str(b.topic_text)) throw bad('Wybierz temat ze słownika lub wpisz temat własny.');
  const dur = Math.max(0, toInt(b.duration_sec) ?? 0);
  if (dur > 24 * 3600) throw bad('Czas trwania nie może przekraczać 24 godzin.');
  const contact_id = toInt(b.contact_id);
  const contractor_id = toInt(b.contractor_id);
  if (contact_id && contractor_id) {
    const p = ctx.db.get<any>('SELECT contractor_id FROM contacts WHERE id = ?', contact_id);
    if (!p || p.contractor_id !== contractor_id) throw bad('Adresat nie jest osobą kontaktową wybranego kontrahenta.');
  }
  const stage_id = toInt(b.stage_id);
  const project_id = toInt(b.project_id);
  if (stage_id) {
    const s = ctx.db.get<any>('SELECT project_id FROM project_stages WHERE id = ?', stage_id);
    if (!s || s.project_id !== project_id) throw bad('Etap nie należy do wybranego projektu.');
  }
  const email_to = str(b.email_to);
  if (email_to && email_to.split(/[;,]/).some((e: string) => e.trim() && !isValidEmail(e))) throw bad('Niepoprawny adres e-mail odbiorcy.');
  return {
    kind_id,
    direction: b.direction,
    event_at: event_at.length === 16 ? `${event_at}:00` : event_at,
    duration_sec: dur,
    topic_id: toInt(b.topic_id),
    topic_text: str(b.topic_text),
    contractor_id,
    contact_id,
    project_id,
    stage_id,
    related_contractor_id: toInt(b.related_contractor_id),
    body: b.body == null ? null : String(b.body),
    email_to,
    email_cc: str(b.email_cc),
    phone_to: str(b.phone_to),
  };
}

export async function correspondenceRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/correspondence', async (req) => {
    requireUser(req);
    const q = req.query as any;
    const w: string[] = [];
    const p: any[] = [];
    if (q.contractor_id) {
      if (q.related === '1') (w.push('(k.contractor_id = ? OR k.related_contractor_id = ?)'), p.push(+q.contractor_id, +q.contractor_id));
      else (w.push('k.contractor_id = ?'), p.push(+q.contractor_id));
    }
    if (q.project_id) (w.push('k.project_id = ?'), p.push(+q.project_id));
    if (q.operator_id) (w.push('k.operator_id = ?'), p.push(+q.operator_id));
    if (q.from) (w.push('k.event_at >= ?'), p.push(`${q.from}T00:00:00`));
    if (q.to) (w.push('k.event_at <= ?'), p.push(`${q.to}T23:59:59`));
    if (q.campaign_id) (w.push('k.campaign_id = ?'), p.push(+q.campaign_id));
    return correspondenceList(ctx, w.length ? 'WHERE ' + w.join(' AND ') : '', p);
  });
  app.get('/api/correspondence/next-number', async (req) => {
    requireUser(req);
    const row = db.get<any>('SELECT value FROM counters WHERE name = ?', `K-${todayIso().slice(0, 4)}`);
    return { number: `DIAGNOS/${(row?.value ?? 0) + 1}/${todayIso().replace(/-/g, '')}`, provisional: true };
  });
  app.get('/api/correspondence/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const r = correspondenceList(ctx, 'WHERE k.id = ?', [id])[0];
    if (!r) throw notFound('Korespondencja nie istnieje.');
    return { ...r, attachments: attachmentsFor(ctx, u, 'correspondence', id) };
  });
  app.post('/api/correspondence', async (req) => {
    const u = requireUser(req);
    const d = corrData(ctx, req.body);
    const id = db.tx(() => {
      const number = makeNumber(db, 'K', d.event_at);
      const id = db.insert('correspondence', { ...d, number, operator_id: u.id, created_at: nowIso(), created_by: u.id });
      if (d.direction === 'in') fireEvent(ctx, 'correspondence.incoming', { contractor_id: d.contractor_id, project_id: d.project_id, correspondence_id: id, number, actor_id: u.id });
      audit(db, u.id, 'correspondence', id, 'dodanie');
      return id;
    });
    return { id, number: db.get<any>('SELECT number FROM correspondence WHERE id = ?', id).number };
  });
  app.put('/api/correspondence/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const cur = db.get<any>('SELECT * FROM correspondence WHERE id = ?', id);
    if (!cur) throw notFound();
    if (cur.operator_id !== u.id && !isManager(u)) throw forbidden('Edytować korespondencję może jej autor, kierownik lub administrator.');
    const d = corrData(ctx, req.body);
    if (cur.send_status === 'sent') {
      // po wysłaniu nie zmieniamy adresatów ani treści wysłanej wiadomości
      Object.assign(d, { email_to: cur.email_to, email_cc: cur.email_cc, phone_to: cur.phone_to, body: cur.body, kind_id: cur.kind_id, direction: cur.direction });
    }
    db.update('correspondence', id, { ...d, updated_at: nowIso() });
    audit(db, u.id, 'correspondence', id, 'zmiana');
    return { id };
  });
  app.delete('/api/correspondence/:id', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const cur = db.get<any>('SELECT * FROM correspondence WHERE id = ?', id);
    if (!cur) throw notFound();
    if (!isManager(u) && cur.operator_id !== u.id) throw forbidden();
    if (cur.send_status === 'sent') throw bad('Wysłanej wiadomości nie można usunąć z rejestru.');
    db.tx(() => {
      db.run("UPDATE outbox SET status = 'cancelled', correspondence_id = NULL WHERE correspondence_id = ? AND status <> 'sent'", id);
      db.run('UPDATE tasks SET correspondence_id = NULL WHERE correspondence_id = ?', id);
      db.run('UPDATE campaign_recipients SET correspondence_id = NULL WHERE correspondence_id = ?', id);
      db.run("DELETE FROM attachments WHERE owner_type = 'correspondence' AND owner_id = ?", id);
      db.run('DELETE FROM correspondence WHERE id = ?', id);
      audit(db, u.id, 'correspondence', id, 'usunięcie', { number: cur.number });
    });
    return { ok: true };
  });

  /** Wysyłka zapisanej korespondencji e-mail lub SMS przez kolejkę. */
  app.post('/api/correspondence/:id/send', async (req) => {
    const u = requireUser(req);
    const id = Number((req.params as any).id);
    const k = db.get<any>('SELECT * FROM correspondence WHERE id = ?', id);
    if (!k) throw notFound();
    if (k.send_status === 'sent') throw bad('Ta wiadomość została już wysłana.');
    if (k.send_status && ['queued', 'sending', 'awaiting_config'].includes(k.send_status)) throw bad('Wiadomość jest już w kolejce wysyłki.');
    const code = kindCode(ctx, k.kind_id);
    const topic = k.topic_text || db.get<any>('SELECT name FROM dict_items WHERE id = ?', k.topic_id)?.name || '';
    if (code === 'email') {
      if (!k.email_to) throw bad('Podaj adres e-mail odbiorcy.');
      const atts = db.all<any>("SELECT a.file_id, f.original_name AS filename FROM attachments a JOIN files f ON f.id = a.file_id WHERE a.owner_type = 'correspondence' AND a.owner_id = ?", id);
      db.tx(() => {
        db.update('correspondence', id, { direction: 'out' });
        queueMessage(ctx, { channel: 'email', recipient: k.email_to, cc: k.email_cc, subject: topic, body_text: k.body ?? '', body_html: textToHtml(k.body ?? ''), attachments: atts, correspondence_id: id, created_by: u.id });
      });
    } else if (code === 'sms') {
      if (!k.phone_to) throw bad('Podaj numer telefonu odbiorcy.');
      if (!k.body) throw bad('Wpisz treść wiadomości SMS.');
      db.tx(() => {
        db.update('correspondence', id, { direction: 'out' });
        queueMessage(ctx, { channel: 'sms', recipient: k.phone_to, body_text: k.body, correspondence_id: id, created_by: u.id });
      });
    } else throw bad('Wysyłać można tylko korespondencję rodzaju E-mail lub SMS.');
    await processOutbox(ctx);
    const after = db.get<any>('SELECT send_status, send_error FROM correspondence WHERE id = ?', id);
    return { status: after.send_status, status_label: OUTBOX_LABELS[after.send_status] ?? after.send_status, error: after.send_error };
  });

  // ---------- Korespondencja seryjna ----------
  type Target = { type: 'group'; group_id: number } | { type: 'ids'; contractor_ids: number[] };
  const resolveRecipients = (target: Target, mode: string) => {
    let ids: number[] = [];
    if (target?.type === 'group') {
      ids = db
        .all<any>(
          'SELECT id FROM contractors WHERE active = 1 AND (group_id = ? OR subgroup_id = ? OR id IN (SELECT contractor_id FROM contractor_group_members WHERE group_id = ?))',
          target.group_id,
          target.group_id,
          target.group_id,
        )
        .map((r) => r.id);
    } else if (target?.type === 'ids') ids = [...new Set((target.contractor_ids ?? []).map(Number))];
    else throw bad('Wskaż grupę odbiorców.');
    if (!ids.length) throw bad('Wybrana grupa nie zawiera żadnego kontrahenta.');
    const out: Array<{ contractor: any; contact: any | null; email: string | null }> = [];
    for (const cid of ids) {
      const c = db.get<any>('SELECT * FROM contractors WHERE id = ?', cid);
      if (!c) continue;
      const contacts = db.all<any>('SELECT * FROM contacts WHERE contractor_id = ? AND active = 1 ORDER BY is_primary DESC, id', cid);
      if (mode === 'contacts') {
        const withEmail = contacts.filter((p) => p.email);
        if (!withEmail.length) out.push({ contractor: c, contact: null, email: null });
        withEmail.forEach((p) => out.push({ contractor: c, contact: p, email: p.email }));
      } else if (mode === 'primary') {
        const p = contacts.find((x) => x.email) ?? null;
        out.push({ contractor: c, contact: p, email: p?.email ?? c.email ?? null });
      } else out.push({ contractor: c, contact: contacts[0] ?? null, email: c.email ?? null });
    }
    return out;
  };
  const fieldsFor = (r: { contractor: any; contact: any | null }, opName: string) => ({
    firma: r.contractor.short_name || r.contractor.name,
    firma_pelna: r.contractor.name,
    nip: r.contractor.nip ?? '',
    miasto: r.contractor.city ?? '',
    osoba: r.contact ? [r.contact.first_name, r.contact.last_name].filter(Boolean).join(' ') : '',
    imie: r.contact?.first_name ?? '',
    nazwisko: r.contact?.last_name ?? '',
    stanowisko: r.contact?.position ?? '',
    operator: opName,
    data: fmtDatePl(todayIso()),
  });
  app.post('/api/campaigns/preview', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    const recips = resolveRecipients(b.target, b.recipient_mode);
    return {
      total: recips.length,
      with_email: recips.filter((r) => r.email).length,
      without_email: recips.filter((r) => !r.email).map((r) => r.contractor.name),
      recipients: recips.map((r) => ({
        contractor_id: r.contractor.id,
        contractor_name: r.contractor.name,
        contact_name: r.contact ? [r.contact.first_name, r.contact.last_name].filter(Boolean).join(' ') : '',
        email: r.email,
      })),
      samples: recips
        .filter((r) => r.email)
        .slice(0, 3)
        .map((r) => ({ email: r.email, subject: renderTemplate(String(b.subject ?? ''), fieldsFor(r, u.name)), body: renderTemplate(String(b.body ?? ''), fieldsFor(r, u.name)) })),
    };
  });
  app.post('/api/campaigns', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    if (!str(b.name)) throw bad('Podaj nazwę wysyłki.');
    if (!str(b.subject)) throw bad('Podaj temat wiadomości.');
    if (!str(b.body)) throw bad('Wpisz treść wiadomości.');
    const recips = resolveRecipients(b.target, b.recipient_mode);
    const emailKind = db.get<any>("SELECT id FROM dict_items WHERE dict = 'corr_kind' AND code = 'email'")!.id;
    const docs: any[] = [];
    for (const did of (b.document_ids ?? []) as number[]) {
      const d = db.get<any>('SELECT * FROM documents WHERE id = ?', did);
      if (!d || documentLevel(ctx, u, d) === 'none') throw forbidden('Brak uprawnień do jednego z dołączonych dokumentów.');
      const v = db.get<any>('SELECT v.file_id, f.original_name FROM document_versions v JOIN files f ON f.id = v.file_id WHERE v.document_id = ? AND v.version = ?', d.id, d.current_version);
      docs.push({ doc: d, file_id: v.file_id, filename: v.original_name });
    }
    const targetDesc =
      b.target.type === 'group'
        ? `Grupa: ${db.get<any>('SELECT name FROM dict_items WHERE id = ?', b.target.group_id)?.name ?? ''}`
        : str(b.target_desc) ?? `Wybrani kontrahenci (${recips.length})`;
    const id = db.tx(() => {
      const cid = db.insert('campaigns', {
        name: str(b.name),
        subject: str(b.subject),
        body: String(b.body),
        target_desc: targetDesc,
        topic_id: toInt(b.topic_id),
        attachments: JSON.stringify(docs.map((d) => ({ document_id: d.doc.id, file_id: d.file_id, filename: d.filename }))),
        status: 'queued',
        created_by: u.id,
        created_at: nowIso(),
        queued_at: nowIso(),
      });
      for (const r of recips) {
        const f = fieldsFor(r, u.name);
        const subject = renderTemplate(b.subject, f);
        const body = renderTemplate(b.body, f);
        const rid = db.insert('campaign_recipients', { campaign_id: cid, contractor_id: r.contractor.id, contact_id: r.contact?.id ?? null, email: r.email, status: r.email ? 'pending' : 'skipped', error: r.email ? null : 'Brak adresu e-mail' });
        if (!r.email) continue;
        const now = nowIso();
        const kid = db.insert('correspondence', {
          number: makeNumber(db, 'K', now),
          kind_id: emailKind,
          direction: 'out',
          event_at: now,
          duration_sec: 0,
          topic_id: toInt(b.topic_id),
          topic_text: subject,
          contractor_id: r.contractor.id,
          contact_id: r.contact?.id ?? null,
          operator_id: u.id,
          body,
          email_to: r.email,
          campaign_id: cid,
          created_at: now,
          created_by: u.id,
        });
        for (const d of docs) {
          db.insert('attachments', { owner_type: 'correspondence', owner_id: kid, file_id: d.file_id, source_document_id: d.doc.id, created_by: u.id, created_at: now });
        }
        db.update('campaign_recipients', rid, { correspondence_id: kid });
        queueMessage(ctx, {
          channel: 'email',
          recipient: r.email,
          subject,
          body_text: body,
          body_html: textToHtml(body),
          attachments: docs.map((d) => ({ file_id: d.file_id, filename: d.filename })),
          correspondence_id: kid,
          campaign_recipient_id: rid,
          created_by: u.id,
        });
      }
      for (const d of docs) logDocument(ctx, d.doc.id, u.id, 'dołączenie do korespondencji seryjnej', d.doc.current_version, str(b.name));
      audit(db, u.id, 'campaign', cid, 'utworzenie wysyłki', { recipients: recips.length });
      return cid;
    });
    processOutbox(ctx).catch(() => undefined);
    return { id };
  });
  app.get('/api/campaigns', async (req) => {
    requireUser(req);
    const rows = db.all<any>('SELECT c.*, o.name AS author FROM campaigns c LEFT JOIN operators o ON o.id = c.created_by ORDER BY c.id DESC');
    const stats = db.all<any>('SELECT campaign_id, status, COUNT(*) AS n FROM campaign_recipients GROUP BY campaign_id, status');
    return rows.map((c) => {
      const s: Record<string, number> = {};
      stats.filter((x) => x.campaign_id === c.id).forEach((x) => (s[x.status] = x.n));
      const total = Object.values(s).reduce((a, b) => a + b, 0);
      return { ...c, total, sent: s.sent ?? 0, failed: s.failed ?? 0, awaiting: (s.awaiting_config ?? 0) + (s.queued ?? 0) + (s.pending ?? 0) + (s.sending ?? 0), skipped: s.skipped ?? 0, awaiting_config: s.awaiting_config ?? 0 };
    });
  });
  app.get('/api/campaigns/:id', async (req) => {
    requireUser(req);
    const id = Number((req.params as any).id);
    const c = db.get<any>('SELECT c.*, o.name AS author FROM campaigns c LEFT JOIN operators o ON o.id = c.created_by WHERE c.id = ?', id);
    if (!c) throw notFound();
    const recipients = db
      .all<any>(
        `SELECT r.*, k.name AS contractor_name, TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS contact_name, cr.number AS corr_number, o.sent_at
         FROM campaign_recipients r LEFT JOIN contractors k ON k.id = r.contractor_id LEFT JOIN contacts p ON p.id = r.contact_id
         LEFT JOIN correspondence cr ON cr.id = r.correspondence_id LEFT JOIN outbox o ON o.id = r.outbox_id WHERE r.campaign_id = ? ORDER BY k.name`,
        id,
      )
      .map((r) => ({ ...r, status_label: r.status === 'skipped' ? 'pominięto' : r.status === 'pending' ? 'oczekuje' : OUTBOX_LABELS[r.status] ?? r.status }));
    return { ...c, attachments: JSON.parse(c.attachments || '[]'), recipients };
  });

  // ---------- Korespondencja wewnętrzna ----------
  app.get('/api/internal/inbox', async (req) => {
    const u = requireUser(req);
    return db.all(
      `SELECT m.id, m.subject, m.body, m.deliver_at, m.created_at, m.task_id, ir.read_at, o.name AS sender, t.title AS task_title
       FROM internal_recipients ir JOIN internal_messages m ON m.id = ir.message_id JOIN operators o ON o.id = m.sender_id
       LEFT JOIN tasks t ON t.id = m.task_id
       WHERE ir.recipient_id = ? AND m.deliver_at <= ? ORDER BY m.deliver_at DESC`,
      u.id,
      nowIso(),
    );
  });
  app.get('/api/internal/sent', async (req) => {
    const u = requireUser(req);
    const msgs = db.all<any>('SELECT m.*, t.title AS task_title FROM internal_messages m LEFT JOIN tasks t ON t.id = m.task_id WHERE m.sender_id = ? ORDER BY m.created_at DESC', u.id);
    const recs = db.all<any>(
      `SELECT ir.message_id, ir.read_at, ir.delivered_at, o.name FROM internal_recipients ir JOIN operators o ON o.id = ir.recipient_id
       WHERE ir.message_id IN (SELECT id FROM internal_messages WHERE sender_id = ?)`,
      u.id,
    );
    const now = nowIso();
    return msgs.map((m) => {
      const r = recs.filter((x) => x.message_id === m.id);
      return {
        ...m,
        recipients: r.map((x) => x.name).join(', '),
        read_count: r.filter((x) => x.read_at).length,
        recipients_count: r.length,
        state: m.deliver_at > now ? 'zaplanowana' : 'doręczona',
      };
    });
  });
  app.post('/api/internal', async (req) => {
    const u = requireUser(req);
    const b = req.body as any;
    if (!str(b.subject)) throw bad('Podaj temat wiadomości.');
    let ids: number[] = b.all ? db.all<any>('SELECT id FROM operators WHERE active = 1 AND id <> ?', u.id).map((r) => r.id) : (b.recipient_ids ?? []).map(Number);
    ids = [...new Set(ids)].filter(Boolean);
    if (!ids.length) throw bad('Wybierz co najmniej jednego adresata.');
    let deliver = str(b.deliver_at) ?? nowIso();
    if (deliver.length === 16) deliver += ':00';
    if (isNaN(parseLocal(deliver).getTime())) throw bad('Niepoprawny termin doręczenia.');
    const id = db.tx(() => {
      const id = db.insert('internal_messages', { sender_id: u.id, subject: str(b.subject), body: b.body ?? '', deliver_at: deliver, task_id: toInt(b.task_id), created_at: nowIso() });
      for (const r of ids) db.run('INSERT INTO internal_recipients (message_id, recipient_id, delivered_at) VALUES (?, ?, ?)', id, r, deliver <= nowIso() ? nowIso() : null);
      return id;
    });
    return { id, scheduled: deliver > nowIso() };
  });
  app.post('/api/internal/:id/read', async (req) => {
    const u = requireUser(req);
    db.run('UPDATE internal_recipients SET read_at = COALESCE(read_at, ?) WHERE message_id = ? AND recipient_id = ?', nowIso(), Number((req.params as any).id), u.id);
    return { ok: true };
  });
  app.post('/api/internal/read-all', async (req) => {
    const u = requireUser(req);
    db.run('UPDATE internal_recipients SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL AND message_id IN (SELECT id FROM internal_messages WHERE deliver_at <= ?)', nowIso(), u.id, nowIso());
    return { ok: true };
  });
  app.delete('/api/internal/:id', async (req) => {
    const u = requireUser(req);
    const m = db.get<any>('SELECT * FROM internal_messages WHERE id = ?', Number((req.params as any).id));
    if (!m) throw notFound();
    if (m.sender_id !== u.id) throw forbidden();
    if (m.deliver_at <= nowIso()) throw bad('Wiadomość została już doręczona; można wycofać tylko zaplanowane wiadomości.');
    db.run('DELETE FROM internal_messages WHERE id = ?', m.id);
    return { ok: true };
  });
}
