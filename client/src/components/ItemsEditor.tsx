import { Plus, Trash2 } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { fmtMoney } from '../lib/format';
import { Combo, Input } from './ui';

export interface Item {
  product_id: number | null;
  name: string;
  qty: number | string;
  unit: string;
  net_price: number | string;
  vat_rate: number | string;
}
export const emptyItem = (): Item => ({ product_id: null, name: '', qty: 1, unit: 'szt.', net_price: '', vat_rate: 23 });

export function itemTotals(items: Item[]) {
  let net = 0;
  let gross = 0;
  for (const i of items) {
    const n = Math.round(Number(i.qty || 0) * Number(i.net_price || 0) * 100) / 100;
    net += n;
    gross += Math.round(n * (1 + Number(i.vat_rate || 0) / 100) * 100) / 100;
  }
  return { net, gross };
}

/** Edycja pozycji dokumentu (zamówienie, sprzedaż, oferta) z wyborem towaru z kartoteki. */
export function ItemsEditor({ items, onChange, readOnly }: { items: Item[]; onChange: (i: Item[]) => void; readOnly?: boolean }) {
  const products = useApi<any[]>('/api/products');
  const prodItems = (products.data ?? []).filter((p) => p.active).map((p) => ({ id: p.id, label: p.name, sub: `${p.sku ?? ''} · ${fmtMoney(p.net_price)} netto / ${p.unit} · VAT ${p.vat_rate}%` }));
  const upd = (i: number, patch: Partial<Item>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const t = itemTotals(items);
  return (
    <div>
      <table className="grid">
        <thead>
          <tr>
            <th style={{ width: 30 }}>Lp.</th>
            <th style={{ width: 260 }}>Towar z kartoteki</th>
            <th>Nazwa na dokumencie</th>
            <th style={{ width: 80 }} className="num">Ilość</th>
            <th style={{ width: 64 }}>J.m.</th>
            <th style={{ width: 110 }} className="num">Cena netto</th>
            <th style={{ width: 70 }} className="num">VAT %</th>
            <th style={{ width: 110 }} className="num">Wartość netto</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <Combo
                  items={prodItems}
                  value={it.product_id}
                  disabled={readOnly}
                  placeholder="wyszukaj towar…"
                  onChange={(pid) => {
                    const p = (products.data ?? []).find((x) => x.id === pid);
                    upd(i, p ? { product_id: pid, name: p.name, unit: p.unit, net_price: p.net_price, vat_rate: p.vat_rate } : { product_id: null });
                  }}
                />
              </td>
              <td><Input value={it.name} disabled={readOnly} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Nazwa pozycji" /></td>
              <td><Input type="number" step="any" min={0} value={it.qty} disabled={readOnly} onChange={(e) => upd(i, { qty: e.target.value })} style={{ textAlign: 'right' }} aria-label="Ilość" /></td>
              <td><Input value={it.unit} disabled={readOnly} onChange={(e) => upd(i, { unit: e.target.value })} aria-label="Jednostka" /></td>
              <td><Input type="number" step="0.01" min={0} value={it.net_price} disabled={readOnly} onChange={(e) => upd(i, { net_price: e.target.value })} style={{ textAlign: 'right' }} aria-label="Cena netto" /></td>
              <td><Input type="number" step="1" min={0} value={it.vat_rate} disabled={readOnly} onChange={(e) => upd(i, { vat_rate: e.target.value })} style={{ textAlign: 'right' }} aria-label="VAT" /></td>
              <td className="num">{fmtMoney(Math.round(Number(it.qty || 0) * Number(it.net_price || 0) * 100) / 100)}</td>
              <td>{!readOnly && <button type="button" className="btn sm ghost danger" title="Usuń pozycję" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={13} /></button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7} className="num">Razem netto / brutto</td>
            <td className="num">{fmtMoney(t.net)}</td>
            <td />
          </tr>
          <tr>
            <td colSpan={7} />
            <td className="num">{fmtMoney(t.gross)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {!readOnly && (
        <button type="button" className="btn sm mt8" onClick={() => onChange([...items, emptyItem()])}>
          <Plus size={13} /> Dodaj pozycję
        </button>
      )}
    </div>
  );
}
