import { useState } from 'react';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import { get, post, saveBlob, upload } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { Check, Input, Loading, Modal, Notice, Select } from '../components/ui';

export function ImportPage() {
  const { toast, reloadContractors, reloadDicts, isManager, isAdmin } = useApp();
  const meta = useApi<any>(isManager ? '/api/import/kinds' : null);
  const logs = useApi<any[]>(isManager ? '/api/import/logs' : null);
  const [kind, setKind] = useState('contractors');
  const [source, setSource] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [prep, setPrep] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [createDicts, setCreateDicts] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logDetail, setLogDetail] = useState<any>(null);

  if (!isManager) return <div className="page"><div className="page-head"><h1>Import danych</h1></div><div style={{ padding: 12 }}><Notice kind="info">Import danych wykonuje kierownik lub administrator.</Notice></div></div>;
  if (!meta.data) return <Loading />;
  const fields = meta.data.kinds[kind].fields as any[];
  const reset = () => (setPrep(null), setResult(null), setError(null));
  const send = async () => {
    if (!file) return;
    setBusy(true);
    reset();
    try {
      const r = await upload('/api/import/upload', [file], { kind });
      setPrep(r);
      setMapping(r.mapping);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const run = async (dry: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await post('/api/import/run', { token: prep.token, mapping, dry_run: dry, create_dicts: createDicts, source: source || undefined });
      setResult(r);
      if (!dry) {
        toast(`Import zakończony: dodano ${r.added}, zaktualizowano ${r.updated}, odrzucono ${r.rejected}.`, r.rejected ? 'warn' : 'ok');
        setPrep(null);
        logs.reload();
        reloadContractors();
        reloadDicts();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const template = () => {
    const head = fields.map((f) => f.label).join(';');
    saveBlob(new Blob(['﻿' + head + '\r\n'], { type: 'text/csv;charset=utf-8' }), `szablon-importu-${kind}.csv`);
  };
  return (
    <div className="page">
      <div className="page-head"><h1>Import danych</h1><span className="small muted">Pliki XLSX lub CSV, np. z Excela lub eksportu z programu fakturującego.</span></div>
      <div className="page-scroll">
        <div style={{ maxWidth: 1200 }}>
          <Notice kind="info">
            Import przyjmuje plik XLSX (pierwszy arkusz) lub CSV (separator ; , lub tabulator, kodowanie UTF-8 lub Windows-1250) z wierszem nagłówków.
            Ponowny import aktualizuje istniejące rekordy: po identyfikatorze z systemu źródłowego (w obrębie tej samej nazwy źródła), a dla kontrahentów zapasowo po NIP-ie — nie tworzy duplikatów.
            Zalecana kolejność: kontrahenci → osoby kontaktowe → kartoteka towarowa → transakcje sprzedaży. Bezpośrednia integracja z enova365 jest zaplanowana na kolejny etap.
          </Notice>
          <div className="form-grid mt12" style={{ maxWidth: 900 }}>
            <label className="lbl">Rodzaj danych</label>
            <Select value={kind} onChange={(k) => (setKind(k), reset())} empty={null} options={Object.entries(meta.data.kinds).map(([k, v]: any) => ({ value: k, label: v.label }))} />
            <label className="lbl">Nazwa źródła</label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder={meta.data.default_source} />
            <label className="lbl">Plik</label>
            <div className="span3 row">
              <input type="file" accept=".xlsx,.csv,.txt" onChange={(e) => (setFile(e.target.files?.[0] ?? null), reset())} aria-label="Plik importu" />
              <button className="btn primary" disabled={!file || busy} onClick={send}><Upload size={14} /> Wczytaj plik</button>
              <button className="btn" onClick={template}><Download size={14} /> Szablon CSV z nagłówkami</button>
            </div>
          </div>
          {error && <div className="mt8"><Notice kind="error">{error}</Notice></div>}
          {prep && (
            <>
              <div className="section-title">Mapowanie kolumn — plik „{prep.file_name}”, wierszy danych: {prep.total}</div>
              <table className="grid">
                <thead><tr><th style={{ width: 280 }}>Pole w DIAGNOS CRM</th><th style={{ width: 260 }}>Kolumna w pliku</th><th>Przykładowe wartości</th></tr></thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.key}>
                      <td>{f.label}{f.required && <span style={{ color: 'var(--accent)' }}> *</span>}</td>
                      <td><Select value={mapping[f.key] ?? null} onChange={(c) => setMapping({ ...mapping, [f.key]: c })} empty="(pomiń)" options={prep.headers.map((h: string, i: number) => ({ value: i, label: h || `kolumna ${i + 1}` }))} /></td>
                      <td className="small muted ellipsis" style={{ maxWidth: 400 }}>{mapping[f.key] != null ? prep.sample.slice(0, 4).map((r: string[]) => r[mapping[f.key]!]).filter(Boolean).join(' · ') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row mt8">
                {kind === 'contractors' && (isAdmin ? <Check checked={createDicts} onChange={setCreateDicts}>dopisuj brakujące pozycje słowników (typ, status, grupa…)</Check> : <span className="small muted">Wartości spoza słowników zostaną odrzucone; nowe pozycje słowników dopisuje przy imporcie tylko administrator.</span>)}
                <span className="grow" />
                <button className="btn" disabled={busy} onClick={() => run(true)}>Sprawdź bez zapisu (podgląd)</button>
                <button className="btn primary" disabled={busy} onClick={() => run(false)}><CheckCircle2 size={14} /> Importuj</button>
              </div>
              <div className="section-title">Podgląd pliku (pierwsze wiersze)</div>
              <div style={{ overflow: 'auto' }}>
                <table className="grid">
                  <thead><tr><th>Wiersz</th>{prep.headers.map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>{prep.sample.map((r: string[], i: number) => <tr key={i}><td>{i + 2}</td>{prep.headers.map((_: any, j: number) => <td key={j} className="small nowrap">{r[j]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {result && (
            <>
              <div className="section-title">{result.dry_run ? 'Wynik sprawdzenia (nic nie zapisano)' : 'Raport z importu'}</div>
              <Notice kind={result.rejected ? 'warn' : 'ok'}>
                Źródło: {result.source}. {result.dry_run ? 'Zostanie dodanych' : 'Dodano'}: <b>{result.added}</b>, {result.dry_run ? 'zaktualizowanych' : 'zaktualizowano'}: <b>{result.updated}</b>, odrzuconych: <b>{result.rejected}</b>.
              </Notice>
              {result.rejected > 0 && (
                <table className="grid mt8">
                  <thead><tr><th>Wiersz</th><th>Rekord</th><th>Powód odrzucenia</th></tr></thead>
                  <tbody>{result.results.filter((x: any) => x.status === 'odrzucono').map((x: any, i: number) => <tr key={i}><td>{x.row}</td><td>{x.label}</td><td>{x.reason}</td></tr>)}</tbody>
                </table>
              )}
            </>
          )}
          <div className="section-title">Historia importów</div>
          <table className="grid">
            <thead><tr><th>Data</th><th>Rodzaj</th><th>Plik</th><th>Operator</th><th className="num">Dodano</th><th className="num">Zaktualizowano</th><th className="num">Odrzucono</th><th /></tr></thead>
            <tbody>
              {(logs.data ?? []).map((l) => (
                <tr key={l.id}><td className="nowrap">{fmtDateTime(l.created_at)}</td><td>{meta.data.kinds[l.kind]?.label}</td><td>{l.file_name}</td><td>{l.operator}</td><td className="num">{l.added}</td><td className="num">{l.updated}</td><td className="num">{l.rejected}</td>
                  <td>{l.rejected > 0 && <button className="btn sm" onClick={async () => setLogDetail(await get(`/api/import/logs/${l.id}`))}>Odrzucone</button>}</td></tr>
              ))}
              {!(logs.data ?? []).length && <tr><td colSpan={8} className="muted">Brak importów.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {logDetail && (
        <Modal title={`Odrzucone wiersze: ${logDetail.file_name}`} onClose={() => setLogDetail(null)} width={760}>
          <table className="grid"><thead><tr><th>Wiersz</th><th>Rekord</th><th>Powód</th></tr></thead><tbody>{logDetail.details.map((x: any, i: number) => <tr key={i}><td>{x.row}</td><td>{x.label}</td><td>{x.reason}</td></tr>)}</tbody></table>
        </Modal>
      )}
    </div>
  );
}
