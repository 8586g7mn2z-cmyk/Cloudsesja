import { describe, expect, it } from 'vitest';
import { setup, uploadAs } from './helpers.js';

describe('uprawnienia do dokumentów', () => {
  it('segregator z uprawnieniem działu: obcy nie widzi, nie pobierze; dział widzi; log rejestruje pobranie', async () => {
    const env = await setup();
    try {
      const { db } = env.ctx;
      const ks = db.get<any>("SELECT id FROM departments WHERE name = 'Księgowość'").id;
      const ksiegowa = env.addOperator('ksiegowa', 'handlowiec');
      env.addOperator('obcy', 'handlowiec');
      env.addOperator('kier', 'kierownik');
      db.run('INSERT INTO operator_departments (operator_id, department_id) VALUES (?, ?)', ksiegowa, ks);
      const admin = await env.login('admin');
      const f = await admin('POST', '/api/doc-folders', { name: 'Poufne' });
      await admin('PUT', `/api/permissions/folder/${f.json.id}`, { entries: [{ subject_type: 'department', subject_id: ks, level: 'view' }] });
      const up = await uploadAs(env, 'admin', '/api/documents', { name: 'Bilans', folder_id: String(f.json.id) }, [{ name: 'bilans.pdf', content: '%PDF-1.4 test', type: 'application/pdf' }]);
      expect(up.status).toBe(200);
      const docId = up.json.id;
      const obcy = await env.login('obcy');
      expect((await obcy('GET', '/api/documents')).json.find((d: any) => d.id === docId)).toBeUndefined();
      expect((await obcy('GET', `/api/documents/${docId}/file`)).status).toBe(403);
      expect((await obcy('GET', `/api/documents/${docId}`)).status).toBe(403);
      // kierownik spoza działu też nie ma dostępu do segregatora z ograniczeniem
      expect((await (await env.login('kier'))('GET', `/api/documents/${docId}/file`)).status).toBe(403);
      const k = await env.login('ksiegowa');
      const list = (await k('GET', '/api/documents')).json;
      expect(list.find((d: any) => d.id === docId)?.level).toBe('view');
      const file = await k('GET', `/api/documents/${docId}/file`);
      expect(file.status).toBe(200);
      expect(file.raw.toString()).toContain('%PDF-1.4 test');
      // tylko podgląd: brak edycji i nowej wersji
      expect((await k('PUT', `/api/documents/${docId}`, { name: 'zmiana' })).status).toBe(403);
      const ver = await uploadAs(env, 'ksiegowa', `/api/documents/${docId}/versions`, {}, [{ name: 'v2.pdf', content: 'x' }]);
      expect(ver.status).toBe(403);
      // uprawnienie na dokumencie nadpisuje segregator: obcy dostaje podgląd tego jednego dokumentu
      const obcyId = db.get<any>("SELECT id FROM operators WHERE login='obcy'").id;
      await admin('PUT', `/api/permissions/document/${docId}`, { entries: [{ subject_type: 'operator', subject_id: obcyId, level: 'view' }] });
      expect((await obcy('GET', `/api/documents/${docId}/file`)).status).toBe(200);
      expect((await k('GET', `/api/documents/${docId}/file`)).status).toBe(403);
      const log = (await admin('GET', `/api/documents/${docId}`)).json.log.map((l: any) => `${l.operator}:${l.action}`);
      expect(log).toContain('ksiegowa:pobranie');
      expect(log).toContain('obcy:pobranie');
      expect(log).toContain('Administrator:zmiana uprawnień');
      // załącznik z dokumentu też sprawdza uprawnienia
      const kind = db.get<any>("SELECT id FROM dict_items WHERE dict='corr_kind' AND code='note'").id;
      const corr = await admin('POST', '/api/correspondence', { kind_id: kind, direction: 'out', event_at: '2026-01-10T10:00', topic_text: 'x' });
      const att = await admin('POST', `/api/attachments/correspondence/${corr.json.id}/from-document`, { document_id: docId });
      expect((await k('GET', `/api/attachments/${att.json.id}/file`)).status).toBe(403);
      expect((await obcy('GET', `/api/attachments/${att.json.id}/file`)).status).toBe(200);
      // zapis załącznika korespondencji do rejestru dokumentów
      const c = await admin('POST', '/api/contractors', { name: 'Klient z załącznikiem' });
      const corr2 = await admin('POST', '/api/correspondence', { kind_id: kind, direction: 'in', event_at: '2026-01-11T10:00', topic_text: 'umowa', contractor_id: c.json.id });
      const up2 = await uploadAs(env, 'admin', `/api/attachments/correspondence/${corr2.json.id}`, {}, [{ name: 'umowa-podpisana.pdf', content: '%PDF-1.4 umowa', type: 'application/pdf' }]);
      const aid = up2.json.ids[0];
      const toDoc = await admin('POST', `/api/attachments/${aid}/to-document`, { name: 'Umowa podpisana' });
      expect(toDoc.status).toBe(200);
      const newDoc = (await admin('GET', `/api/documents/${toDoc.json.id}`)).json;
      expect(newDoc).toMatchObject({ name: 'Umowa podpisana', contractor_id: c.json.id, source: 'korespondencja' });
      expect((await admin('GET', `/api/documents/${toDoc.json.id}/file`)).raw.toString()).toBe('%PDF-1.4 umowa');
      expect((await admin('POST', `/api/attachments/${aid}/to-document`, {})).status).toBe(400); // drugi raz nie
    } finally {
      await env.close();
    }
  });

  it('wersjonowanie zachowuje poprzednie wersje, po dacie ważności dokument jest archiwalny', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      const up = await uploadAs(env, 'admin', '/api/documents', { name: 'Cennik', valid_from: '2020-01-01', valid_to: '2020-12-31' }, [{ name: 'c1.txt', content: 'wersja 0' }]);
      const id = up.json.id;
      await uploadAs(env, 'admin', `/api/documents/${id}/versions`, { comment: 'nowe ceny' }, [{ name: 'c2.txt', content: 'wersja 1' }]);
      const d = (await admin('GET', `/api/documents/${id}`)).json;
      expect(d.current_version).toBe(1);
      expect(d.versions.map((v: any) => v.version)).toEqual([1, 0]);
      expect((await admin('GET', `/api/documents/${id}/file?version=0`)).raw.toString()).toBe('wersja 0');
      expect((await admin('GET', `/api/documents/${id}/file`)).raw.toString()).toBe('wersja 1');
      expect(d.number).toMatch(/^DIAGNOS\/D\/1\/\d{8}$/);
      expect((await admin('GET', '/api/documents?state=current')).json.length).toBe(0);
      expect((await admin('GET', '/api/documents?state=archived')).json[0].validity).toBe('po terminie ważności');
    } finally {
      await env.close();
    }
  });

  it('generuje PDF z szablonu dla kontrahenta i zapisuje w rejestrze', async () => {
    const env = await setup();
    try {
      const admin = await env.login('admin');
      const c = await admin('POST', '/api/contractors', { name: 'Testowa Firma Sp. z o.o.', short_name: 'TESTOWA', nip: '5261040828', city: 'Kraków' });
      const p = await admin('POST', '/api/products', { name: 'Analizator', net_price: 1000, vat_rate: 23 });
      const tpl = (await admin('GET', '/api/doc-templates')).json.templates.find((t: any) => t.kind === 'oferta');
      const r = await admin('POST', `/api/doc-templates/${tpl.id}/generate`, { contractor_id: c.json.id, items: [{ product_id: p.json.id, qty: 2 }] });
      expect(r.status).toBe(200);
      const docs = (await admin('GET', `/api/documents?contractor_id=${c.json.id}`)).json;
      expect(docs).toHaveLength(1);
      expect(docs[0].ext).toBe('PDF');
      const file = await admin('GET', `/api/documents/${r.json.id}/file`);
      expect(file.raw.subarray(0, 5).toString()).toBe('%PDF-');
      const atts = (await admin('GET', `/api/contractors/${c.json.id}/attachments`)).json;
      expect(atts.find((a: any) => a.source === 'dokumenty')).toBeTruthy();
    } finally {
      await env.close();
    }
  });
});
