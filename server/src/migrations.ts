import type { Db } from './db.js';

export interface Migration {
  version: number;
  sql: string;
  run?: (db: Db) => void;
}

const schema = `
CREATE TABLE operators (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'handlowiec',
  manager_id INTEGER REFERENCES operators(id),
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE operator_departments (
  operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, department_id)
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  operator_id INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE dict_items (
  id INTEGER PRIMARY KEY,
  dict TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  parent_id INTEGER REFERENCES dict_items(id),
  color TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  system INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_dict_items_dict ON dict_items(dict);
CREATE TABLE custom_fields (
  id INTEGER PRIMARY KEY,
  entity TEXT NOT NULL DEFAULT 'contractor',
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  options TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (entity, code)
);
CREATE TABLE contractors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  type_id INTEGER REFERENCES dict_items(id),
  status_id INTEGER REFERENCES dict_items(id),
  group_id INTEGER REFERENCES dict_items(id),
  subgroup_id INTEGER REFERENCES dict_items(id),
  price_group_id INTEGER REFERENCES dict_items(id),
  source_id INTEGER REFERENCES dict_items(id),
  owner_id INTEGER REFERENCES operators(id),
  nip TEXT,
  regon TEXT,
  krs TEXT,
  tax_office TEXT,
  contract_no TEXT,
  permissions_note TEXT,
  referred_by_id INTEGER REFERENCES contractors(id),
  headquarters_id INTEGER REFERENCES contractors(id),
  credit_limit REAL,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  voivodeship TEXT,
  country TEXT,
  phone TEXT,
  phone2 TEXT,
  fax TEXT,
  email TEXT,
  www TEXT,
  is_key INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  custom TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  external_source TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL,
  created_by INTEGER REFERENCES operators(id),
  updated_at TEXT,
  updated_by INTEGER REFERENCES operators(id)
);
CREATE INDEX ix_contractors_nip ON contractors(nip);
CREATE INDEX ix_contractors_owner ON contractors(owner_id);
CREATE TABLE contractor_addresses (
  id INTEGER PRIMARY KEY,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  street TEXT, postal_code TEXT, city TEXT, voivodeship TEXT, country TEXT, notes TEXT
);
CREATE TABLE contractor_group_members (
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES dict_items(id) ON DELETE CASCADE,
  PRIMARY KEY (contractor_id, group_id)
);
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  first_name TEXT, last_name TEXT NOT NULL,
  position TEXT, phone TEXT, mobile TEXT, email TEXT, notes TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  external_source TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_contacts_contractor ON contacts(contractor_id);
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'notatka',
  body TEXT NOT NULL,
  author_id INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL
);
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  storage_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL,
  created_by INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL
);
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL REFERENCES files(id),
  source_document_id INTEGER REFERENCES documents(id),
  created_by INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL
);
CREATE INDEX ix_attachments_owner ON attachments(owner_type, owner_id);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  number TEXT,
  name TEXT NOT NULL,
  contractor_id INTEGER REFERENCES contractors(id),
  manager_id INTEGER REFERENCES operators(id),
  start_date TEXT, end_date TEXT,
  status_id INTEGER REFERENCES dict_items(id),
  budget REAL,
  description TEXT,
  created_at TEXT NOT NULL,
  created_by INTEGER REFERENCES operators(id)
);
CREATE TABLE project_stages (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT, end_date TEXT,
  status TEXT NOT NULL DEFAULT 'planowany',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE correspondence (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL,
  kind_id INTEGER NOT NULL REFERENCES dict_items(id),
  direction TEXT NOT NULL,
  event_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  topic_id INTEGER REFERENCES dict_items(id),
  topic_text TEXT,
  contractor_id INTEGER REFERENCES contractors(id),
  contact_id INTEGER REFERENCES contacts(id),
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  project_id INTEGER REFERENCES projects(id),
  stage_id INTEGER REFERENCES project_stages(id),
  related_contractor_id INTEGER REFERENCES contractors(id),
  body TEXT,
  email_to TEXT,
  email_cc TEXT,
  phone_to TEXT,
  send_status TEXT,
  sent_at TEXT,
  send_error TEXT,
  campaign_id INTEGER REFERENCES campaigns(id),
  created_at TEXT NOT NULL,
  created_by INTEGER REFERENCES operators(id),
  updated_at TEXT
);
CREATE INDEX ix_corr_contractor ON correspondence(contractor_id);
CREATE INDEX ix_corr_event ON correspondence(event_at);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  cc TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  attachments TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  correspondence_id INTEGER REFERENCES correspondence(id),
  campaign_recipient_id INTEGER,
  reminder_id INTEGER,
  report_schedule_id INTEGER,
  send_after TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  created_by INTEGER REFERENCES operators(id)
);
CREATE INDEX ix_outbox_status ON outbox(status);
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  target_desc TEXT,
  topic_id INTEGER REFERENCES dict_items(id),
  attachments TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL,
  queued_at TEXT
);
CREATE TABLE campaign_recipients (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contractor_id INTEGER REFERENCES contractors(id),
  contact_id INTEGER REFERENCES contacts(id),
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  correspondence_id INTEGER REFERENCES correspondence(id),
  outbox_id INTEGER REFERENCES outbox(id)
);
CREATE TABLE internal_messages (
  id INTEGER PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES operators(id),
  subject TEXT NOT NULL,
  body TEXT,
  deliver_at TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id),
  created_at TEXT NOT NULL
);
CREATE TABLE internal_recipients (
  message_id INTEGER NOT NULL REFERENCES internal_messages(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES operators(id),
  delivered_at TEXT,
  read_at TEXT,
  PRIMARY KEY (message_id, recipient_id)
);
CREATE TABLE task_series (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  operator_ids TEXT NOT NULL,
  principal_id INTEGER REFERENCES operators(id),
  priority INTEGER NOT NULL DEFAULT 2,
  contractor_id INTEGER REFERENCES contractors(id),
  project_id INTEGER REFERENCES projects(id),
  freq TEXT NOT NULL,
  interval_n INTEGER NOT NULL DEFAULT 1,
  weekdays TEXT,
  month_day INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT,
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  remind_before_min INTEGER,
  remind_inapp INTEGER NOT NULL DEFAULT 1,
  remind_email INTEGER NOT NULL DEFAULT 0,
  remind_sms INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  generated_until TEXT,
  created_by INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL
);
CREATE TABLE auto_rules (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  event TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  delay_days INTEGER NOT NULL DEFAULT 0,
  time_of_day TEXT NOT NULL DEFAULT '09:00',
  duration_min INTEGER NOT NULL DEFAULT 30,
  title_tpl TEXT NOT NULL,
  description_tpl TEXT,
  assign_to TEXT NOT NULL DEFAULT 'owner',
  operator_id INTEGER REFERENCES operators(id),
  priority INTEGER NOT NULL DEFAULT 2,
  remind_before_min INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  principal_id INTEGER REFERENCES operators(id),
  priority INTEGER NOT NULL DEFAULT 2,
  status_id INTEGER NOT NULL REFERENCES dict_items(id),
  progress INTEGER NOT NULL DEFAULT 0,
  contractor_id INTEGER REFERENCES contractors(id),
  contact_id INTEGER REFERENCES contacts(id),
  correspondence_id INTEGER REFERENCES correspondence(id),
  project_id INTEGER REFERENCES projects(id),
  stage_id INTEGER REFERENCES project_stages(id),
  is_group INTEGER NOT NULL DEFAULT 0,
  remind_before_min INTEGER,
  remind_inapp INTEGER NOT NULL DEFAULT 1,
  remind_email INTEGER NOT NULL DEFAULT 0,
  remind_sms INTEGER NOT NULL DEFAULT 0,
  series_id INTEGER REFERENCES task_series(id) ON DELETE SET NULL,
  occurrence_date TEXT,
  rule_id INTEGER REFERENCES auto_rules(id) ON DELETE SET NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  created_by INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX ix_tasks_start ON tasks(start_at);
CREATE UNIQUE INDEX ux_tasks_series_occ ON tasks(series_id, occurrence_date);
CREATE TABLE task_assignees (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  PRIMARY KEY (task_id, operator_id)
);
CREATE TABLE reminders (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  remind_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  inapp INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 0,
  sms INTEGER NOT NULL DEFAULT 0,
  external_sent INTEGER NOT NULL DEFAULT 0,
  acked_at TEXT
);
CREATE INDEX ix_reminders_due ON reminders(status, remind_at);
CREATE TABLE time_entries (
  id INTEGER PRIMARY KEY,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  work_date TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  contractor_id INTEGER REFERENCES contractors(id),
  project_id INTEGER REFERENCES projects(id),
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE quick_notes (
  id INTEGER PRIMARY KEY,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  body TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'szt.',
  net_price REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 23,
  ean TEXT,
  product_group TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  external_source TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id),
  order_date TEXT NOT NULL,
  delivery_date TEXT,
  status_id INTEGER REFERENCES dict_items(id),
  operator_id INTEGER REFERENCES operators(id),
  project_id INTEGER REFERENCES projects(id),
  notes TEXT,
  net_total REAL NOT NULL DEFAULT 0,
  gross_total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by INTEGER REFERENCES operators(id)
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  unit TEXT,
  net_price REAL NOT NULL,
  vat_rate REAL NOT NULL,
  net_value REAL NOT NULL,
  gross_value REAL NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  doc_number TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id),
  operator_id INTEGER REFERENCES operators(id),
  net_total REAL NOT NULL DEFAULT 0,
  gross_total REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'ręcznie',
  external_source TEXT,
  external_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by INTEGER REFERENCES operators(id)
);
CREATE INDEX ix_sales_date ON sales(doc_date);
CREATE INDEX ix_contractors_ext ON contractors(external_source, external_id);
CREATE INDEX ix_contacts_ext ON contacts(external_source, external_id);
CREATE INDEX ix_products_ext ON products(external_source, external_id);
CREATE INDEX ix_sales_ext ON sales(external_source, external_id);
CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  unit TEXT,
  net_price REAL NOT NULL,
  vat_rate REAL NOT NULL,
  net_value REAL NOT NULL,
  gross_value REAL NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE doc_folders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  folder_id INTEGER REFERENCES doc_folders(id),
  type_id INTEGER REFERENCES dict_items(id),
  contractor_id INTEGER REFERENCES contractors(id),
  project_id INTEGER REFERENCES projects(id),
  valid_from TEXT,
  valid_to TEXT,
  author_id INTEGER REFERENCES operators(id),
  published_at TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'rejestr',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE document_versions (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  file_id INTEGER NOT NULL REFERENCES files(id),
  author_id INTEGER REFERENCES operators(id),
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (document_id, version)
);
CREATE TABLE document_permissions (
  id INTEGER PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  level TEXT NOT NULL
);
CREATE INDEX ix_docperm_target ON document_permissions(target_type, target_id);
CREATE TABLE document_log (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER,
  operator_id INTEGER REFERENCES operators(id),
  action TEXT NOT NULL,
  details TEXT,
  at TEXT NOT NULL
);
CREATE TABLE doc_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  folder_id INTEGER REFERENCES doc_folders(id),
  type_id INTEGER REFERENCES dict_items(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE report_schedules (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  params TEXT NOT NULL,
  period TEXT NOT NULL,
  frequency TEXT NOT NULL,
  weekday INTEGER,
  time_of_day TEXT NOT NULL DEFAULT '18:00',
  recipients TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT,
  last_run_at TEXT,
  last_status TEXT,
  created_by INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL
);
CREATE TABLE import_logs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  file_name TEXT,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  details TEXT,
  created_by INTEGER REFERENCES operators(id),
  created_at TEXT NOT NULL
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  operator_id INTEGER REFERENCES operators(id),
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  details TEXT
);
`;

/** Domyślne pozycje słowników. `code` oznacza pozycję systemową, na której opiera się logika. */
export const defaultDicts: Record<string, Array<string | { name: string; code?: string; color?: string; children?: string[] }>> = {
  contractor_type: ['Klient', 'Dostawca', 'Partner', 'Potencjalny klient', 'Konkurencja'],
  contractor_status: [
    { name: 'Potencjalny', color: '#6b7280' },
    { name: 'Aktywny', color: '#1d4ed8' },
    { name: 'Stały klient', color: '#15803d' },
    { name: 'Nieaktywny', color: '#9ca3af' },
    { name: 'Zablokowany', color: '#b91c1c' },
  ],
  contractor_group: [
    { name: 'Handel', children: ['Hurt', 'Detal', 'E-commerce'] },
    { name: 'Produkcja', children: ['Spożywcza', 'Metalowa', 'Tworzywa sztuczne'] },
    { name: 'Usługi', children: ['IT', 'Transport', 'Doradztwo'] },
    { name: 'Budownictwo', children: ['Generalne wykonawstwo', 'Instalacje'] },
    { name: 'Sektor publiczny', children: ['Samorząd', 'Ochrona zdrowia', 'Edukacja'] },
  ],
  price_group: ['Detal', 'Hurt', 'Dealer', 'Kluczowy'],
  contact_source: ['Polecenie', 'Strona WWW', 'Targi', 'Telefon przychodzący', 'Baza zakupiona', 'Kampania e-mail'],
  corr_kind: [
    { name: 'Telefon', code: 'phone' },
    { name: 'E-mail', code: 'email' },
    { name: 'SMS', code: 'sms' },
    { name: 'Spotkanie', code: 'meeting' },
    { name: 'Notatka', code: 'note' },
    { name: 'Pismo', code: 'letter' },
  ],
  corr_topic: ['Badanie zainteresowania', 'Oferta', 'Prezentacja', 'Wycena', 'Zaproszenie', 'Szkolenie', 'Umowa', 'Reklamacja', 'Serwis', 'Windykacja'],
  doc_type: ['Oferta', 'Umowa', 'Cennik', 'Instrukcja', 'Katalog', 'Zamówienie', 'Faktura pro forma', 'Procedura ISO', 'Inne'],
  task_status: [
    { name: 'Nowe', code: 'new', color: '#1d4ed8' },
    { name: 'W toku', code: 'in_progress', color: '#b45309' },
    { name: 'Wstrzymane', code: 'on_hold', color: '#6b7280' },
    { name: 'Zrealizowane', code: 'done', color: '#15803d' },
    { name: 'Anulowane', code: 'cancelled', color: '#9ca3af' },
  ],
  project_status: ['Planowany', 'W realizacji', 'Wstrzymany', 'Zakończony'],
  order_status: ['Nowe', 'Potwierdzone', 'W realizacji', 'Zrealizowane', 'Anulowane'],
};

export const dictLabels: Record<string, string> = {
  contractor_type: 'Typy kontrahentów',
  contractor_status: 'Statusy kontrahentów',
  contractor_group: 'Grupy i podgrupy kontrahentów',
  price_group: 'Grupy cenowe',
  contact_source: 'Źródła kontaktu',
  corr_kind: 'Rodzaje korespondencji',
  corr_topic: 'Tematy korespondencji',
  doc_type: 'Typy dokumentów',
  task_status: 'Statusy zadań',
  project_status: 'Statusy zapytań i przetargów',
  order_status: 'Statusy zamówień',
};

function seedDicts(db: Db) {
  for (const [dict, items] of Object.entries(defaultDicts)) {
    items.forEach((it, i) => {
      const o = typeof it === 'string' ? { name: it } : it;
      const id = db.insert('dict_items', {
        dict,
        name: o.name,
        code: o.code ?? null,
        color: o.color ?? null,
        sort: i,
        system: o.code ? 1 : 0,
      });
      (o.children ?? []).forEach((c, j) => db.insert('dict_items', { dict: 'contractor_subgroup', name: c, parent_id: id, sort: j }));
    });
  }
  const now = new Date().toISOString();
  ['Cenniki', 'Oferty', 'Umowy', 'Instrukcje', 'Katalogi', 'Procedury ISO', 'Dokumenty wygenerowane', 'Załączniki korespondencji'].forEach((n, i) =>
    db.insert('doc_folders', { name: n, sort: i }),
  );
  ['Zarząd', 'Dział handlowy', 'Księgowość', 'Serwis'].forEach((n) => db.insert('departments', { name: n }));
  db.insert('auto_rules', {
    name: 'Kontakt z nowym kontrahentem',
    event: 'contractor.created',
    delay_days: 3,
    time_of_day: '10:00',
    duration_min: 30,
    title_tpl: 'Kontakt z nowym kontrahentem: {{kontrahent}}',
    description_tpl: 'Skontaktuj się z kontrahentem {{kontrahent}} (dodany {{data}}) i ustal potrzeby.',
    assign_to: 'owner',
    priority: 2,
    remind_before_min: 15,
    created_at: now,
  });
}

const templateOffer = `# Oferta handlowa nr {{numer}}

Szanowni Państwo,

w odpowiedzi na zainteresowanie naszą ofertą przedstawiamy propozycję współpracy dla firmy {{kontrahent.nazwa}}.

{{pozycje}}

Oferta ważna 30 dni od daty wystawienia. Ceny podane są w złotych.

Z poważaniem
{{operator.nazwa}}
{{operator.email}} {{operator.telefon}}`;

const templateOrder = `# Zamówienie nr {{numer}}

Zamawiający: {{kontrahent.nazwa}}, NIP {{kontrahent.nip}}
Adres: {{kontrahent.adres}}
Data zamówienia: {{zamowienie.data}}

{{pozycje}}

Uwagi: {{zamowienie.uwagi}}

Osoba prowadząca: {{operator.nazwa}}`;

const templateProforma = `# Faktura pro forma nr {{numer}}

Nabywca: {{kontrahent.nazwa}}
NIP: {{kontrahent.nip}}
Adres: {{kontrahent.adres}}
Data wystawienia: {{data}}

{{pozycje}}

Do zapłaty: {{suma.brutto}}
Płatność przelewem na rachunek: {{firma.konto}}

Dokument nie jest fakturą VAT.`;

export const migrations: Migration[] = [
  {
    version: 1,
    sql: schema,
    run: (db) => {
      seedDicts(db);
      const now = new Date().toISOString();
      const folder = db.get<{ id: number }>("SELECT id FROM doc_folders WHERE name = 'Dokumenty wygenerowane'")!.id;
      const t = (n: string) => db.get<{ id: number }>("SELECT id FROM dict_items WHERE dict='doc_type' AND name = ?", n)?.id ?? null;
      db.insert('doc_templates', { name: 'Oferta handlowa', kind: 'oferta', title: 'Oferta {{numer}} — {{kontrahent.skrot}}', body: templateOffer, folder_id: folder, type_id: t('Oferta'), created_at: now });
      db.insert('doc_templates', { name: 'Zamówienie', kind: 'zamowienie', title: 'Zamówienie {{zamowienie.numer}} — {{kontrahent.skrot}}', body: templateOrder, folder_id: folder, type_id: t('Zamówienie'), created_at: now });
      db.insert('doc_templates', { name: 'Faktura pro forma', kind: 'proforma', title: 'Pro forma {{numer}} — {{kontrahent.skrot}}', body: templateProforma, folder_id: folder, type_id: t('Faktura pro forma'), created_at: now });
    },
  },
  {
    // Przypomnienia pamiętają pierwotny termin (base_at), dzięki czemu odłożenie lub potwierdzenie
    // nie jest gubione przy późniejszych zmianach zadania.
    version: 2,
    sql: `ALTER TABLE reminders ADD COLUMN base_at TEXT; UPDATE reminders SET base_at = remind_at;`,
  },
  {
    // Sprawy: zapytania ofertowe i przetargi (rozszerzenie dawnych „projektów") oraz przełączniki modułów.
    version: 3,
    sql: `
      ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'projekt';
      ALTER TABLE projects ADD COLUMN ref_no TEXT;
      ALTER TABLE projects ADD COLUMN source TEXT;
      ALTER TABLE projects ADD COLUMN received_date TEXT;
      ALTER TABLE projects ADD COLUMN submit_deadline TEXT;
      ALTER TABLE projects ADD COLUMN result TEXT;
      ALTER TABLE projects ADD COLUMN result_date TEXT;
      ALTER TABLE projects ADD COLUMN deadline_task_id INTEGER;
    `,
    run: (db) => {
      const rename = (dict: string, from: string, to: string) => db.run('UPDATE dict_items SET name = ? WHERE dict = ? AND name = ?', to, dict, from);
      rename('project_status', 'Planowany', 'Nowe');
      rename('project_status', 'W realizacji', 'W przygotowaniu');
      rename('project_status', 'Wstrzymany', 'Wstrzymane');
      rename('project_status', 'Zakończony', 'Zakończone');
      const add = (dict: string, name: string, sort: number) => {
        if (!db.get('SELECT id FROM dict_items WHERE dict = ? AND name = ?', dict, name)) db.insert('dict_items', { dict, name, sort });
      };
      db.run("UPDATE dict_items SET sort = sort * 10 WHERE dict = 'project_status'");
      add('project_status', 'Oferta złożona', 15);
      add('project_status', 'Rozstrzygnięte', 16);
      add('doc_type', 'Zapytanie ofertowe', 20);
      add('doc_type', 'Dokumentacja przetargowa', 21);
      add('doc_type', 'Oferta przetargowa', 22);
      for (const n of ['Zapytania ofertowe', 'Przetargi']) if (!db.get('SELECT id FROM doc_folders WHERE name = ?', n)) db.insert('doc_folders', { name: n, sort: -1 });
      if (!db.get("SELECT key FROM settings WHERE key = 'modules'")) db.run("INSERT INTO settings (key, value) VALUES ('modules', ?)", JSON.stringify({ sales: false, mailing: false, templates: false, task_tools: false, internal: false }));
    },
  },
];
