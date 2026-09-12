// Kiem thu cac truong hop bien: thieu file, ghi dong thoi, YAML doc hai.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { load } from 'js-yaml';
import { startServer } from '../src/ui/server.mjs';
import { buildPdf } from '../src/generator/generate-pdf.mjs';

const PORT = Number(process.env.UPDATECV_PORT) || 3100;
const DATA = path.join('data', 'resume.yaml');
const OUT = 'output';
const GOC = fs.readFileSync(DATA, 'utf8');

let pass = 0, fail = 0;
const fails = [];
/** Ghi nhan mot ca kiem thu. */
function check(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(`${name}${detail ? ' -> ' + detail : ''}`); }
}

/** Goi HTTP don gian. */
function goi(p, { method = 'GET', body = null } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: { Host: `127.0.0.1:${PORT}`, ...(body ? { 'Content-Type': 'application/json' } : {}) } },
      (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
    req.on('error', (e) => resolve({ status: 0, body: '', loi: e.code }));
    if (body) req.write(body);
    req.end();
  });
}

// ---------- js-yaml co an toan khong ----------
const pkg = JSON.parse(fs.readFileSync(path.join('node_modules', 'js-yaml', 'package.json'), 'utf8'));
check('js-yaml la ban chinh thuc', typeof pkg.version === 'string', pkg.version);
console.log('  (js-yaml phien ban ' + pkg.version + ')');
for (const [ten, yaml] of [
  ['!!js/function', 'basics:\n  name: !!js/function "function(){return 1}"\n'],
  ['!!js/regexp', 'basics:\n  name: !!js/regexp /abc/\n'],
  ['!!js/undefined', 'basics:\n  name: !!js/undefined ""\n'],
  ['the la', 'basics:\n  name: !!python/object/apply:os.system ["calc"]\n'],
]) {
  let ketQua = null, err = null;
  try { ketQua = load(yaml); } catch (e) { err = e; }
  const nguyHiem = ketQua && typeof ketQua?.basics?.name === 'function';
  check(`YAML: ${ten} khong tao ra ham`, !nguyHiem,
    err ? 'da chan bang loi' : typeof ketQua?.basics?.name);
}

// Bom anchor: phai khong treo qua lau
const bom = `a: &a ["x","x","x","x","x","x","x","x","x"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]
e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]
basics:
  name: A
`;
const t0 = Date.now();
let bomErr = null;
try { load(bom); } catch (e) { bomErr = e; }
check('YAML bom anchor khong treo', Date.now() - t0 < 5000, `${Date.now() - t0}ms`);

// ---------- Thieu file / thieu thu muc ----------
const TAM = DATA + '.tam';
fs.renameSync(DATA, TAM);
let thieuErr = null;
try { await buildPdf(); } catch (e) { thieuErr = e; }
fs.renameSync(TAM, DATA);
check('thieu resume.yaml -> bao loi ro', thieuErr !== null && /ENOENT|resume/i.test(thieuErr.message),
  thieuErr && thieuErr.message.slice(0, 100));

fs.rmSync(OUT, { recursive: true, force: true });
let khongThuMucErr = null;
try { await buildPdf(); } catch (e) { khongThuMucErr = e; }
check('thieu thu muc output -> tu tao lai', khongThuMucErr === null,
  khongThuMucErr && khongThuMucErr.message);
check('tao lai du file trong output', fs.existsSync(path.join(OUT, 'Mai-The-Toan-CV.pdf'))
  && fs.existsSync(path.join(OUT, 'preview.html'))
  && fs.existsSync(path.join(OUT, 'cv-style.css')));

// ---------- BOM va xuong dong kieu Windows ----------
for (const [ten, noiDung] of [
  ['co BOM o dau file', '﻿' + GOC],
  ['xuong dong CRLF', GOC.replace(/\n/g, '\r\n')],
  ['thieu xuong dong cuoi', GOC.trimEnd()],
]) {
  fs.writeFileSync(DATA, noiDung, 'utf8');
  let e = null;
  try { await buildPdf(); } catch (err) { e = err; }
  check(`doc duoc file ${ten}`, e === null, e && e.message.slice(0, 100));
}
fs.writeFileSync(DATA, GOC, 'utf8');

// ---------- Ghi dong thoi ----------
const server = startServer(false);
await new Promise((r) => server.once('listening', r));

const dongThoi = await Promise.all([1, 2, 3].map((i) => goi('/api/save', {
  method: 'POST',
  body: JSON.stringify({ data: { basics: { name: `Dong thoi ${i}` }, education: [] } }),
})));
check('3 lenh luu dong thoi deu co phan hoi', dongThoi.every((r) => r.status !== 0),
  JSON.stringify(dongThoi.map((r) => r.status)));
const sauDongThoi = fs.readFileSync(DATA, 'utf8');
let parseErr = null, parsed = null;
try { parsed = load(sauDongThoi); } catch (e) { parseErr = e; }
check('sau khi ghi dong thoi file van parse duoc', parseErr === null, parseErr && parseErr.message);
check('sau khi ghi dong thoi file van dung cau truc',
  parsed && parsed.basics && /^Dong thoi [123]$/.test(parsed.basics.name),
  JSON.stringify(parsed && parsed.basics));

// ---------- /api/diff (co goi clip.exe) ----------
const rDiff = await Promise.race([
  goi('/api/diff'),
  new Promise((r) => setTimeout(() => r({ status: -1, body: 'treo' }), 15000)),
]);
check('/api/diff phan hoi trong 15 giay', rDiff.status !== -1, 'bi treo');
check('/api/diff tra 200', rDiff.status === 200, `nhan ${rDiff.status}`);

// ---------- Goi lien tuc: server khong chet ----------
const loat = await Promise.all(Array.from({ length: 50 }, () => goi('/api/data')));
check('50 request lien tiep deu 200', loat.every((r) => r.status === 200),
  loat.filter((r) => r.status !== 200).length + ' cai hong');

server.close();
fs.writeFileSync(DATA, GOC, 'utf8');
await buildPdf();
console.log(`\n=== CA BIEN: ${pass} dat / ${fail} hong ===`);
for (const f of fails) console.log('  HONG: ' + f);
process.exit(fail ? 1 : 0);
