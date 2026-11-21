import { useRef, useState } from 'react';
import { Eye, Download, Trash2, Paperclip, FolderInput, FolderOpen } from 'lucide-react';
import { del, get, post, upload } from '../lib/api';
import { fmtDateTime, fmtSize } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useApp } from '../lib/store';
import { Modal, Select, Input, Notice, Loading } from './ui';

export function canPreview(mime?: string | null) {
  // tylko typy, które serwer wydaje do podglądu; pozostałe (HTML, SVG…) są wyłącznie pobierane
  return !!mime && /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp)|text\/plain)\b/.test(mime);
}

export function DocumentPicker({ onPick, onClose }: { onPick: (doc: any) => void; onClose: () => void }) {
  const { data, loading } = useApi<any[]>('/api/documents?state=current');
  const [q, setQ] = useState('');
  const rows = (data ?? []).filter((d) => `${d.number} ${d.name} ${d.description ?? ''} ${d.folder_name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Wybierz dokument z rejestru" onClose={onClose} width={720}>
      <Input placeholder="Szukaj po numerze, nazwie, opisie…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 380, overflow: 'auto', marginTop: 8 }}>
        {loading ? (
          <Loading />
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Nr</th>
                <th>Nazwa</th>
                <th>Segregator</th>
                <th>Rozsz.</th>
                <th className="num">Rozmiar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} onDoubleClick={() => onPick(d)}>
                  <td className="nowrap">{d.number}</td>
                  <td>{d.name}</td>
                  <td>{d.folder_name}</td>
                  <td>{d.ext}</td>
                  <td className="num">{fmtSize(d.size)}</td>
                  <td>
                    <button type="button" className="btn sm" onClick={() => onPick(d)}>
                      Wybierz
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    Brak dokumentów.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

function ToDocumentDialog({ att, onClose, onDone }: { att: any; onClose: () => void; onDone: () => void }) {
  const { toast, dicts } = useApp();
  const folders = useApi<any[]>('/api/doc-folders');
  const [name, setName] = useState(att.name.replace(/\.[^.]+$/, ''));
  const [folder, setFolder] = useState<number | null>(null);
  const [type, setType] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await post(`/api/attachments/${att.id}/to-document`, { name, folder_id: folder, type_id: type });
      toast(`Zapisano w rejestrze dokumentów jako ${r.number}.`);
      onDone();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Zapis załącznika do rejestru dokumentów"
      onClose={onClose}
      width={480}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn primary" disabled={busy}>
            Zapisz w rejestrze
          </button>
        </>
      }
    >
      <div className="form-grid one">
        <label className="lbl req">Nazwa</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <label className="lbl">Segregator</label>
        <Select value={folder} onChange={setFolder} options={(folders.data ?? []).filter((f) => f.can_add).map((f) => ({ value: f.id, label: f.name }))} />
        <label className="lbl">Typ</label>
        <Select value={type} onChange={setType} options={(dicts.doc_type ?? []).map((t) => ({ value: t.id, label: t.name }))} />
      </div>
    </Modal>
  );
}

/** Lista załączników obiektu z dodawaniem plików i dokumentów z rejestru. */
export function Attachments({ ownerType, ownerId, items, onChange, allowToDocument, readOnly }: { ownerType: string; ownerId: number; items: any[]; onChange: () => void; allowToDocument?: boolean; readOnly?: boolean }) {
  const { toast, confirm } = useApp();
  const inp = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [toDoc, setToDoc] = useState<any>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      await upload(`/api/attachments/${ownerType}/${ownerId}`, files);
      toast(files.length > 1 ? `Dodano ${files.length} pliki.` : 'Dodano plik.');
      onChange();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
      if (inp.current) inp.current.value = '';
    }
  };
  return (
    <div>
      {!readOnly && (
        <div className="row mb8">
          <input ref={inp} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
          <button type="button" className="btn" disabled={busy} onClick={() => inp.current?.click()}>
            <Paperclip size={14} /> Dodaj pliki
          </button>
          <button type="button" className="btn" onClick={() => setPicker(true)}>
            <FolderOpen size={14} /> Z rejestru dokumentów
          </button>
          {busy && <span className="muted small">Wysyłanie pliku…</span>}
        </div>
      )}
      <table className="grid">
        <thead>
          <tr>
            <th>Nazwa pliku</th>
            <th className="num">Rozmiar</th>
            <th>Dodał</th>
            <th>Data</th>
            <th>Źródło</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td className="num">{fmtSize(a.size)}</td>
              <td>{a.author}</td>
              <td className="nowrap">{fmtDateTime(a.created_at)}</td>
              <td>{a.source_document_id ? 'rejestr dokumentów' : 'plik'}</td>
              <td className="nowrap">
                {canPreview(a.mime) && (
                  <a className="btn sm ghost" href={`/api/attachments/${a.id}/file?inline=1`} target="_blank" rel="noreferrer" title="Podgląd">
                    <Eye size={13} />
                  </a>
                )}
                <a className="btn sm ghost" href={`/api/attachments/${a.id}/file`} title="Pobierz">
                  <Download size={13} />
                </a>
                {allowToDocument && !a.source_document_id && !readOnly && (
                  <button type="button" className="btn sm ghost" title="Zapisz w rejestrze dokumentów" onClick={() => setToDoc(a)}>
                    <FolderInput size={13} />
                  </button>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="btn sm ghost danger"
                    title="Usuń załącznik"
                    onClick={async () => {
                      if (!(await confirm(`Usunąć załącznik „${a.name}”?`, { ok: 'Usuń', danger: true }))) return;
                      try {
                        await del(`/api/attachments/${a.id}`);
                        onChange();
                      } catch (e: any) {
                        toast(e.message, 'error');
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={6} className="muted">
                Brak załączników.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {picker && (
        <DocumentPicker
          onClose={() => setPicker(false)}
          onPick={async (d) => {
            setPicker(false);
            try {
              await post(`/api/attachments/${ownerType}/${ownerId}/from-document`, { document_id: d.id });
              toast(`Dołączono dokument ${d.number}.`);
              onChange();
            } catch (e: any) {
              toast(e.message, 'error');
            }
          }}
        />
      )}
      {toDoc && <ToDocumentDialog att={toDoc} onClose={() => setToDoc(null)} onDone={() => (setToDoc(null), onChange())} />}
    </div>
  );
}

export function useAttachments(ownerType: string, ownerId: number | null) {
  return useApi<any[]>(ownerId ? `/api/attachments/${ownerType}/${ownerId}` : null, [ownerId]);
}
export { Notice, get };
