const COLORS = ['#1b2f5b', '#5b7bb5', '#c2410c', '#9aa7bd'];

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Wykres słupkowy (grupowany przy kilku seriach) w SVG. */
export function BarChart({ labels, series, height = 260, unit }: { labels: string[]; series: { name: string; values: number[] }[]; height?: number; unit?: string }) {
  if (!labels.length) return null;
  const w = Math.max(480, labels.length * Math.max(60, series.length * 34));
  const left = 56;
  const bottom = 40;
  const top = 18;
  const ch = height - bottom - top;
  const cw = w - left - 10;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const gw = cw / labels.length;
  const bw = Math.min(46, (gw * 0.7) / series.length);
  const fmt = (v: number) => v.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg className="chart" width={w} height={height + (series.length > 1 ? 20 : 0)} role="img" aria-label="Wykres">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (max / 4) * i;
          const y = top + ch - (v / max) * ch;
          return (
            <g key={i}>
              <line x1={left} x2={left + cw} y1={y} y2={y} stroke="#dde1e8" strokeDasharray={i ? '3 3' : undefined} />
              <text x={left - 6} y={y + 4} textAnchor="end">
                {fmt(v)}
              </text>
            </g>
          );
        })}
        {labels.map((l, gi) => {
          const gx = left + gi * gw + (gw - bw * series.length) / 2;
          return (
            <g key={gi}>
              {series.map((s, si) => {
                const v = s.values[gi] ?? 0;
                const h = (v / max) * ch;
                return (
                  <g key={si}>
                    <rect x={gx + si * bw} y={top + ch - h} width={bw - 3} height={h} fill={COLORS[si % COLORS.length]}>
                      <title>{`${l} — ${s.name}: ${fmt(v)}${unit ? ' ' + unit : ''}`}</title>
                    </rect>
                    <text className="bar-lbl" x={gx + si * bw + (bw - 3) / 2} y={top + ch - h - 4} textAnchor="middle">
                      {fmt(v)}
                    </text>
                  </g>
                );
              })}
              <text x={left + gi * gw + gw / 2} y={top + ch + 16} textAnchor="middle">
                {l.length > 22 ? l.slice(0, 21) + '…' : l}
              </text>
            </g>
          );
        })}
        <line x1={left} x2={left + cw} y1={top + ch} y2={top + ch} stroke="#1a1f2b" />
        {series.length > 1 &&
          series.map((s, si) => (
            <g key={si} transform={`translate(${left + si * 150}, ${height + 4})`}>
              <rect width={10} height={10} fill={COLORS[si % COLORS.length]} />
              <text x={14} y={9}>
                {s.name}
              </text>
            </g>
          ))}
      </svg>
    </div>
  );
}
