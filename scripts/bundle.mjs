// Łączy biblioteki i main.js w jeden plik docs/assets/js/app.js (jedno żądanie zamiast pięciu).
// Uruchom po każdej zmianie w main.js:  npm run bundle
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = path.join(ROOT, 'docs/assets');
const parts = ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js', 'vendor/SplitText.min.js', 'vendor/lenis.min.js', 'js/main.js'];
const head = '/* Studio Fryzur Aneta Kunc: plik WYGENEROWANY (npm run bundle). Edytuj assets/js/main.js, nie ten plik.\n   Zawiera: GSAP 3.15 (ScrollTrigger, SplitText, licencja: gsap.com/standard-license), Lenis 1.3 (MIT), main.js. */\n';
const body = parts.map((p) => `/* ---- ${p} ---- */\n${fs.readFileSync(path.join(A, p), 'utf8').replace(/\/\/# sourceMappingURL=.*$/gm, '').trim()}\n;`).join('\n');
fs.writeFileSync(path.join(A, 'js/app.js'), head + body + '\n');
console.log(`app.js: ${(fs.statSync(path.join(A, 'js/app.js')).size / 1024).toFixed(0)} KB`);
