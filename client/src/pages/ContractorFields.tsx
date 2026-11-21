import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { isValidNip, VOIVODESHIPS } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { Check, ContractorPicker, DictSelect, Input, Notice, OperatorSelect, Select, Textarea } from '../components/ui';

export const emptyContractor = (ownerId: number) => ({
  name: '',
  short_name: '',
  type_id: null,
  status_id: null,
  group_id: null,
  subgroup_id: null,
  price_group_id: null,
  source_id: null,
  owner_id: ownerId,
  nip: '',
  regon: '',
  krs: '',
  tax_office: '',
  contract_no: '',
  permissions_note: '',
  referred_by_id: null,
  headquarters_id: null,
  credit_limit: '',
  street: '',
  postal_code: '',
  city: '',
  voivodeship: '',
  country: 'Polska',
  phone: '',
  phone2: '',
  fax: '',
  email: '',
  www: '',
  is_key: 0,
  notes: '',
  active: 1,
  custom: {},
  groups: [],
});

function regonOk(r: string) {
  const d = r.replace(/\D/g, '');
  const calc = (w: number[], len: number) => (w.reduce((s, wi, i) => s + wi * +d[i], 0) % 11) % 10 === +d[len - 1];
  if (d.length === 9) return calc([8, 9, 2, 3, 4, 5, 6, 7], 9);
  if (d.length === 14) return calc([2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8], 14);
  return false;
}

export function CustomFieldInput({ f, value, onChange }: { f: any; value: any; onChange: (v: any) => void }) {
  if (f.type === 'bool') return <Check checked={!!value} onChange={onChange}>tak</Check>;
  if (f.type === 'select') return <Select value={value ?? ''} onChange={onChange} options={f.options.map((o: string) => ({ value: o, label: o }))} />;
  if (f.type === 'date') return <Input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === 'number') return <Input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

/** Pola kartoteki kontrahenta (formularz dodawania i zakładka Szczegóły). */
export function ContractorFields({ v, setV, id }: { v: any; setV: (fn: (p: any) => any) => void; id?: number }) {
  const { dicts } = useApp();
  const fields = useApi<any[]>('/api/custom-fields');
  const [dups, setDups] = useState<any[]>([]);
  const set = (k: string) => (val: any) => setV((p: any) => ({ ...p, [k]: val?.target ? val.target.value : val }));
  const nipDigits = (v.nip ?? '').replace(/\D/g, '');
  const nipBad = nipDigits.length > 0 && !isValidNip(nipDigits);
  const regonBad = (v.regon ?? '').replace(/\D/g, '').length > 0 && !regonOk(v.regon);
  useEffect(() => {
    if (nipDigits.length === 10 && !nipBad) get(`/api/contractors/check-nip?nip=${nipDigits}&id=${id ?? ''}`).then((r) => setDups(r.duplicates)).catch(() => setDups([]));
    else setDups([]);
  }, [nipDigits, id]);
  const groups = (dicts.contractor_group ?? []).filter((g) => g.active);
  return (
    <div>
      <div className="form-grid">
        <label className="lbl req" htmlFor="c-name">Pełna nazwa</label>
        <div className="span3"><Input id="c-name" value={v.name} onChange={set('name')} /></div>
        <label className="lbl" htmlFor="c-short">Skrót nazwy</label>
        <Input id="c-short" value={v.short_name} onChange={set('short_name')} />
        <label className="lbl">Typ</label>
        <DictSelect dict="contractor_type" value={v.type_id} onChange={set('type_id')} />
        <label className="lbl">Status</label>
        <DictSelect dict="contractor_status" value={v.status_id} onChange={set('status_id')} />
        <label className="lbl">Kluczowy</label>
        <Check checked={!!v.is_key} onChange={(c) => set('is_key')(c ? 1 : 0)}>kontrahent kluczowy</Check>
        <label className="lbl">Grupa</label>
        <DictSelect dict="contractor_group" value={v.group_id} onChange={(g) => setV((p: any) => ({ ...p, group_id: g, subgroup_id: null }))} />
        <label className="lbl">Podgrupa</label>
        <DictSelect dict="contractor_subgroup" value={v.subgroup_id} onChange={set('subgroup_id')} parentId={v.group_id ?? -1} empty={v.group_id ? '—' : 'najpierw wybierz grupę'} />
        <label className="lbl">Źródło kontaktu</label>
        <DictSelect dict="contact_source" value={v.source_id} onChange={set('source_id')} />
        <label className="lbl">Grupa cenowa</label>
        <DictSelect dict="price_group" value={v.price_group_id} onChange={set('price_group_id')} />
        <label className="lbl">Prowadzący</label>
        <OperatorSelect value={v.owner_id} onChange={set('owner_id')} />
        <label className="lbl" htmlFor="c-contract">Nr umowy</label>
        <Input id="c-contract" value={v.contract_no} onChange={set('contract_no')} />
        <label className="lbl" htmlFor="c-nip">NIP</label>
        <div>
          <Input id="c-nip" value={v.nip} onChange={set('nip')} invalid={nipBad} placeholder="0000000000" />
          {nipBad && <div className="field-error">Niepoprawny NIP (suma kontrolna).</div>}
        </div>
        <label className="lbl" htmlFor="c-regon">REGON</label>
        <div>
          <Input id="c-regon" value={v.regon} onChange={set('regon')} invalid={regonBad} />
          {regonBad && <div className="field-error">Niepoprawny REGON (suma kontrolna).</div>}
        </div>
        {dups.length > 0 && (
          <div className="span4">
            <Notice kind="warn">Uwaga: w bazie jest już kontrahent z tym NIP-em: {dups.map((d) => `${d.name}${d.city ? ` (${d.city})` : ''}`).join(', ')}.</Notice>
          </div>
        )}
        <label className="lbl" htmlFor="c-krs">KRS</label>
        <Input id="c-krs" value={v.krs} onChange={set('krs')} />
        <label className="lbl" htmlFor="c-us">Urząd skarbowy</label>
        <Input id="c-us" value={v.tax_office} onChange={set('tax_office')} />
        <label className="lbl">Polecony przez</label>
        <ContractorPicker value={v.referred_by_id} onChange={set('referred_by_id')} exclude={id} />
        <label className="lbl">Centrala</label>
        <ContractorPicker value={v.headquarters_id} onChange={set('headquarters_id')} exclude={id} />
        <label className="lbl" htmlFor="c-perm">Uprawnienia</label>
        <Input id="c-perm" value={v.permissions_note} onChange={set('permissions_note')} />
        <label className="lbl" htmlFor="c-limit">Limit kredytu [zł]</label>
        <Input id="c-limit" type="number" min={0} step="0.01" value={v.credit_limit ?? ''} onChange={set('credit_limit')} style={{ textAlign: 'right' }} />
      </div>
      <div className="section-title">Adres siedziby i kontakt</div>
      <div className="form-grid">
        <label className="lbl" htmlFor="c-street">Ulica i numer</label>
        <div className="span3"><Input id="c-street" value={v.street} onChange={set('street')} /></div>
        <label className="lbl" htmlFor="c-zip">Kod pocztowy</label>
        <Input id="c-zip" value={v.postal_code} onChange={set('postal_code')} placeholder="00-000" />
        <label className="lbl" htmlFor="c-city">Miasto</label>
        <Input id="c-city" value={v.city} onChange={set('city')} />
        <label className="lbl">Województwo</label>
        <Select value={v.voivodeship} onChange={set('voivodeship')} options={VOIVODESHIPS.map((w) => ({ value: w, label: w }))} />
        <label className="lbl" htmlFor="c-country">Kraj</label>
        <Input id="c-country" value={v.country} onChange={set('country')} />
        <label className="lbl" htmlFor="c-phone">Telefon</label>
        <Input id="c-phone" value={v.phone} onChange={set('phone')} />
        <label className="lbl" htmlFor="c-phone2">Telefon 2</label>
        <Input id="c-phone2" value={v.phone2} onChange={set('phone2')} />
        <label className="lbl" htmlFor="c-email">E-mail</label>
        <Input id="c-email" type="email" value={v.email} onChange={set('email')} />
        <label className="lbl" htmlFor="c-www">WWW</label>
        <Input id="c-www" value={v.www} onChange={set('www')} placeholder="www.firma.pl" />
        <label className="lbl" htmlFor="c-notes">Uwagi</label>
        <div className="span3"><Textarea id="c-notes" rows={2} value={v.notes} onChange={set('notes')} /></div>
        <label className="lbl">Grupy (członkostwo)</label>
        <div className="span3 row wrap">
          {groups.map((g) => (
            <Check key={g.id} checked={(v.groups ?? []).includes(g.id)} onChange={(c) => setV((p: any) => ({ ...p, groups: c ? [...(p.groups ?? []), g.id] : (p.groups ?? []).filter((x: number) => x !== g.id) }))}>
              {g.name}
            </Check>
          ))}
        </div>
        {id && (
          <>
            <label className="lbl">Aktywny</label>
            <Check checked={!!v.active} onChange={(c) => set('active')(c ? 1 : 0)}>kontrahent aktywny (nieaktywni są ukryci w rejestrze)</Check>
          </>
        )}
      </div>
      {(fields.data ?? []).filter((f) => f.active).length > 0 && (
        <>
          <div className="section-title">Pola dodatkowe</div>
          <div className="form-grid">
            {(fields.data ?? [])
              .filter((f) => f.active)
              .map((f) => (
                <FragmentField key={f.id} f={f} value={v.custom?.[f.code]} onChange={(x) => setV((p: any) => ({ ...p, custom: { ...(p.custom ?? {}), [f.code]: x } }))} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
function FragmentField({ f, value, onChange }: { f: any; value: any; onChange: (v: any) => void }) {
  return (
    <>
      <label className="lbl">{f.label}</label>
      <CustomFieldInput f={f} value={value} onChange={onChange} />
    </>
  );
}
