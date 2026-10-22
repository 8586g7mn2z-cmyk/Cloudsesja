// Generator grafik „pasma włosów” (SVG). Deterministyczny — ten sam seed daje ten sam obraz.
// Grafiki pełnią rolę art-direction do czasu podmiany na prawdziwe zdjęcia salonu.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const f = (n) => Math.round(n * 10) / 10;

// Gładka ścieżka przez punkty (Catmull-Rom -> Bezier)
function smooth(pts) {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/**
 * @param {object} o
 * @param {string} o.seed
 * @param {string[]} o.colors  od najciemniejszego do najjaśniejszego (4)
 * @param {string} o.bg
 * @param {number} [o.w]
 * @param {number} [o.h]
 * @param {number} [o.locks]  liczba pasm/kosmyków
 * @param {boolean} [o.curl]
 * @param {boolean} [o.dark]
 */
export function strandsSVG(o) {
  const W = o.w || 800;
  const H = o.h || 1000;
  const r = rng(hash(o.seed));
  const c = o.colors;
  const locks = o.locks || 3;
  const id = 'g' + (hash(o.seed) % 100000).toString(36);
  const steps = 12;

  const defs = `
  <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>
  <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[1]}"/><stop offset=".6" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></linearGradient>
  <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[2]}" stop-opacity=".2"/><stop offset=".5" stop-color="${c[3]}"/><stop offset="1" stop-color="${c[3]}" stop-opacity=".6"/></linearGradient>
  <radialGradient id="${id}s" cx=".32" cy=".38" r=".7"><stop offset="0" stop-color="#fff" stop-opacity="${o.dark ? 0.08 : 0.35}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.bg}"/><stop offset="1" stop-color="${o.bg2 || o.bg}"/></linearGradient>
  <filter id="${id}f" filterUnits="userSpaceOnUse" x="${-W * 0.3}" y="${-H * 0.3}" width="${W * 1.6}" height="${H * 1.6}"><feGaussianBlur stdDeviation="${Math.round(W / 22)}"/></filter>`;

  let volume = '';
  let back = '';
  let mid = '';
  let front = '';

  for (let L = 0; L < locks; L++) {
    const cx0 = locks === 1 ? W * (0.4 + r() * 0.2) : W * (0.18 + (L + r() * 0.8) / locks * 0.66);
    const big = locks === 1 ? 1.6 : locks === 2 ? 1.15 : 1;
    const amp = W * (0.06 + r() * 0.12);
    const freq = 0.55 + r() * 0.7;
    const phase = r() * Math.PI * 2;
    const tilt = (r() - 0.5) * 0.35;
    const spreadTop = W * (0.03 + r() * 0.04);
    const spreadMid = W * (0.14 + r() * 0.12) * big;
    const n = Math.round((o.density || 62) * (0.8 + r() * 0.4) * big);
    const curlAmp = o.curl ? W * (0.025 + r() * 0.02) : 0;
    const curlFreq = 3.5 + r() * 2;

    // miękka „masa” koloru pod pasmami
    const vp = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      vp.push([cx0 + amp * Math.sin(t * freq * Math.PI * 2 + phase) + tilt * t * W, -H * 0.06 + t * H * 1.14]);
    }
    volume += `<path d="${smooth(vp)}" stroke="url(#${id}b)" stroke-width="${f(spreadMid * 1.5)}" opacity="${o.dark ? 0.35 : 0.28}"/>`;

    for (let i = 0; i < n; i++) {
      const u = (r() + r() + r()) / 1.5 - 1; // rozkład zbliżony do normalnego
      const jp = r() * Math.PI * 2;
      const ja = W * (0.004 + r() * 0.012);
      const len = 0.82 + r() * 0.28;
      const pts = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps * len;
        const y = -H * 0.06 + t * H * 1.14;
        const spread = spreadTop + (spreadMid - spreadTop) * Math.pow(Math.sin(Math.min(t, 1) * Math.PI * 0.62), 0.9);
        const center = cx0 + amp * Math.sin(t * freq * Math.PI * 2 + phase) + tilt * t * W;
        let x = center + u * spread + Math.sin(t * 6 + jp) * ja * (0.6 + Math.abs(u));
        if (curlAmp) x += Math.sin(t * curlFreq * Math.PI * 2 + jp * 0.2 + u * 0.8) * curlAmp * (0.4 + t);
        pts.push([x, y]);
      }
      const d = smooth(pts);
      const layer = r();
      if (layer < 0.42) {
        back += `<path d="${d}" stroke="url(#${id}a)" stroke-width="${f(1.4 + r() * 2.6)}" opacity="${f(0.45 + r() * 0.5)}"/>`;
      } else if (layer < 0.86) {
        mid += `<path d="${d}" stroke="url(#${id}b)" stroke-width="${f(0.7 + r() * 1.5)}" opacity="${f(0.4 + r() * 0.55)}"/>`;
      } else {
        front += `<path d="${d}" stroke="url(#${id}c)" stroke-width="${f(0.4 + r() * 0.8)}" opacity="${f(0.5 + r() * 0.5)}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="url(#${id}bg)"/><g fill="none" stroke-linecap="round"><g filter="url(#${id}f)">${volume}</g>${back}${mid}${front}</g><rect width="${W}" height="${H}" fill="url(#${id}s)"/></svg>\n`;
}
