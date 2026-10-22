// Statyczny generator strony: node build/build.mjs  ->  docs/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, tones } from './data.mjs';
import { layout } from './layout.mjs';
import { pages } from './pages.mjs';
import { strandsSVG } from './art.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });

// --- fonty osadzone (base64) dla podglądu z dysku (file://) ---
{
  const css = fs.readFileSync(path.join(SRC, 'assets/css/main.css'), 'utf8');
  const faces = css.match(/@font-face \{[^}]+\}/g) || [];
  const embedded = faces
    .map((f) => f.replace(/url\(\.\.\/fonts\/([^)]+)\)/, (_, file) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(SRC, 'assets/fonts', file)).toString('base64')})`))
    .join('\n');
  fs.writeFileSync(path.join(OUT, 'assets/css/fonts-embedded.css'), `/* Wygenerowane automatycznie — fonty dla podglądu z dysku (file://) */\n${embedded}\n`);
}

// --- grafiki ---
const artDir = path.join(OUT, 'assets/img/art');
fs.mkdirSync(artDir, { recursive: true });
const brand = ['#2a1d16', '#7d5434', '#b98559', '#e8c39a'];
const art = {
  'cat-strzyzenie': { colors: ['#151110', '#3d2e26', '#7a6152', '#c2a78f'], bg: '#e6ddd2', locks: 2 },
  'cat-koloryzacja': { colors: ['#3a170d', '#8a4426', '#c9784a', '#f0b582'], bg: '#efe5da', locks: 3 },
  'cat-pielegnacja': { colors: ['#4a3420', '#a77a45', '#dcb57a', '#f7e3bd'], bg: '#f1eadf', locks: 1 },
  'cat-stylizacja': { colors: ['#22170f', '#5b3e2c', '#9a7257', '#d8bba0'], bg: '#e9e0d5', locks: 2, curl: true },
  'team-aneta': { colors: ['#4a3324', '#9a6b45', '#d2a275', '#f3d5b0'], bg: '#1f1916', bg2: '#2b231e', dark: true, locks: 2 },
  'team-maciej': { colors: ['#3b2d25', '#7d6352', '#b39a85', '#e3d3c2'], bg: '#1b1714', bg2: '#27211d', dark: true, locks: 3 },
  'studio-1': { colors: brand, bg: '#e9e0d4', locks: 3 },
  'studio-2': { colors: ['#2e2019', '#8a5a36', '#c98f5a', '#efc58f'], bg: '#1f1916', bg2: '#2a221d', dark: true, w: 1000, h: 1000, locks: 2 },
  'studio-3': { colors: ['#3a2a20', '#87654c', '#c4a184', '#efdcc6'], bg: '#ece4d9', locks: 2, curl: true },
  'studio-wide': { colors: brand, bg: '#e7ddd0', bg2: '#efe8de', w: 2100, h: 900, locks: 6, density: 54 },
  map: { colors: ['#6f665d', '#a1968a', '#c9bfb2', '#efe8de'], bg: '#e4dcd1', w: 2100, h: 900, locks: 7, density: 40 },
  og: { colors: brand, bg: '#efe8de', w: 1200, h: 630, locks: 4, density: 50 },
};
for (const [name, o] of Object.entries(art)) {
  fs.writeFileSync(path.join(artDir, `${name}.svg`), strandsSVG({ seed: name, ...o }));
}
for (const t of tones) {
  fs.writeFileSync(path.join(artDir, `tone-${t.slug}.svg`), strandsSVG({ seed: t.slug, colors: t.colors, bg: t.bg, curl: t.curl, locks: 1 + (t.slug.length % 3) }));
}

// --- logo (inline SVG) ---
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8').trim();
const logoFile = fs.existsSync(path.join(SRC, 'assets/img/logo.svg')) ? 'assets/img/logo.svg' : null;
const logoSvg = logoFile ? read(logoFile).replace('<svg ', '<svg class="logo" ') : `<span class="logo-text">${site.short}</span>`;
const wordmarkSvg = read('assets/img/wordmark.svg').replace('<svg ', '<svg class="wordmark" ');

// --- strony ---
const all = pages();
for (const p of all) {
  const depth = p.path.split('/').length - 1;
  const R = '../'.repeat(depth);
  const html = layout({ ...p, R, body: p.render(R), logoSvg, wordmarkSvg });
  const file = path.join(OUT, p.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// --- pliki pomocnicze ---
const today = new Date().toISOString().slice(0, 10);
const urls = all
  .filter((p) => p.path !== '404.html')
  .map((p) => `  <url><loc>${site.url}/${p.path === 'index.html' ? '' : p.path}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n');
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
fs.writeFileSync(
  path.join(OUT, 'site.webmanifest'),
  JSON.stringify({ name: site.name, short_name: site.short, start_url: './index.html', display: 'standalone', background_color: '#f2ede6', theme_color: '#f2ede6', icons: [{ src: 'assets/img/favicon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: 'assets/img/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] }, null, 2)
);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`Zbudowano ${all.length} stron -> ${path.relative(ROOT, OUT)}/`);
