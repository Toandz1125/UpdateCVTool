// Kiem thu cac dau cuoi HTTP cua dashboard: xac thuc dau vao, chan duong dan,
// gioi han kich thuoc, sao luu va khoi phuc.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/ui/server.mjs';

const PORT = Number(process.env.UPDATECV_PORT) || 3100;
const DATA = path.join('data', 'resume.yaml');
const BACKUP = path.join('data', 'backups');
const GOC = fs.readFileSync(DATA, 'utf8');

let pass = 0, fail = 0;
const fails = [];
/** Ghi nhan mot ca kiem thu. */
function check(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(`${name}${detail ? ' -> ' + detail : ''}`); }
}

/** Goi HTTP tho: duong dan truyen nguyen van, khong bi client chuan hoa. */
function goi(rawPath, { method = 'GET', body = null, host = `127.0.0.1:${PORT}`, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: rawPath, method,
      headers: { Host: host, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    // Server co the dap cong thay vi tra loi -> ghi nhan chu khong lam do test
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: '', loi: e.code }));
    if (body) req.write(body);
    req.end();
  });
}

const server = startServer(false);
await new Promise((r) => server.once('listening', r));

// ---------- File tinh ----------
for (const [duong, ma, kieu] of [
  ['/', 200, 'text/html'],
  ['/index.html', 200, 'text/html'],
  ['/app.js', 200, 'application/javascript'],
  ['/dashboard.css', 200, 'text/css'],
  ['/preview.html', 200, 'text/html'],
  ['/cv-style.css', 200, 'text/css'],
  ['/Mai-The-Toan-CV.pdf', 200, 'application/pdf'],
  ['/times-faux-bold.woff2', 200, 'font/woff2'],
  ['/khong-ton-tai', 404, null],
  ['/api/khong-co', 404, null],
]) {
  const r = await goi(duong);
  check(`tinh ${duong} -> ${ma}`, r.status === ma, `nhan ${r.status}`);
  if (kieu && r.status === 200) {
    check(`tinh ${duong} dung MIME`, (r.headers['content-type'] || '').includes(kieu),
      r.headers['content-type']);
  }
}

// ---------- Chan doc file ngoai thu muc ----------
const DUONG_DOC = [
  '/../data/resume.yaml',
  '/../../data/resume.yaml',
  '/..%2f..%2fdata%2fresume.yaml',
  '/%2e%2e%2f%2e%2e%2fdata%2fresume.yaml',
  '/....//....//data/resume.yaml',
  '/..\\..\\data\\resume.yaml',
  '/%2e%2e/%2e%2e/package.json',
  '/../package.json',
  '/../../../../../../Windows/win.ini',
  '/svg/../../../data/resume.yaml',
];
for (const d of DUONG_DOC) {
  const r = await goi(d);
  const loRi = r.status === 200 && (r.body.includes('basics:') || r.body.includes('[fonts]')
    || r.body.includes('"name": "updatecv"'));
  check(`chan duong dan: ${d}`, !loRi, `status=${r.status} dai=${r.body.length}`);
}

// ---------- Chan DNS rebinding ----------
for (const h of ['evil.com', 'attacker.local:3100', 'updatecv.com']) {
  const r = await goi('/api/data', { host: h });
  check(`chan Host la: ${h}`, r.status === 403, `nhan ${r.status}`);
}
for (const h of [`localhost:${PORT}`, `127.0.0.1:${PORT}`]) {
  const r = await goi('/api/data', { host: h });
  check(`cho phep Host: ${h}`, r.status === 200, `nhan ${r.status}`);
}

// ---------- API doc ----------
for (const [duong, truong] of [['/api/data', 'data'], ['/api/readme', 'markdown'],
                               ['/api/linkedin', 'headline']]) {
  const r = await goi(duong);
  check(`GET ${duong} -> 200`, r.status === 200, `nhan ${r.status}`);
  let j = null;
  try { j = JSON.parse(r.body); } catch { /* de nguyen null */ }
  check(`GET ${duong} tra JSON co ${truong}`, j && j.success === true && j[truong] !== undefined);
}

// ---------- /api/save: cac dau vao sai ----------
const truocKhiThu = fs.readFileSync(DATA, 'utf8');
const SAI = [
  ['khong co body', null],
  ['body rong', ''],
  ['JSON hong', '{khong phai json'],
  ['thieu truong data', JSON.stringify({ abc: 1 })],
  ['data la null', JSON.stringify({ data: null })],
  ['data la chuoi', JSON.stringify({ data: 'chuoi' })],
  ['data la mang', JSON.stringify({ data: [1, 2] })],
  ['thieu basics', JSON.stringify({ data: { education: [] } })],
  ['thieu name', JSON.stringify({ data: { basics: { title: 'T' } } })],
  ['education sai kieu', JSON.stringify({ data: { basics: { name: 'A' }, education: {} } })],
  ['skills sai kieu', JSON.stringify({ data: { basics: { name: 'A' }, skills: [] } })],
];
for (const [ten, body] of SAI) {
  const r = await goi('/api/save', { method: 'POST', body });
  check(`save tu choi: ${ten}`, r.status === 400, `nhan ${r.status}`);
  check(`save khong dung vao file: ${ten}`, fs.readFileSync(DATA, 'utf8') === truocKhiThu);
}

// Body qua lon
const qua = JSON.stringify({ data: { basics: { name: 'x'.repeat(3 * 1024 * 1024) } } });
const rLon = await goi('/api/save', { method: 'POST', body: qua });
check('save chan duoc body qua 2MB', rLon.status === 400 || rLon.status === 413 || rLon.status === 0,
  `nhan ${rLon.status}`);
check('save body qua lon van TRA LOI duoc (khong dap cong)',
  rLon.status === 400 || rLon.status === 413, `nhan ${rLon.status} loi=${rLon.loi}`);
check('save body lon khong dung vao file', fs.readFileSync(DATA, 'utf8') === truocKhiThu);

// ---------- /api/save: duong di dung ----------
fs.rmSync(BACKUP, { recursive: true, force: true });
const hopLe = { basics: { name: 'Kiem Thu', title: 'T' }, education: [], projects: [] };
const rOk = await goi('/api/save', { method: 'POST', body: JSON.stringify({ data: hopLe }) });
check('save hop le -> 200', rOk.status === 200, `${rOk.status} ${rOk.body.slice(0, 120)}`);
check('save co ghi file', fs.readFileSync(DATA, 'utf8').includes('Kiem Thu'));
check('save co tao ban sao luu', fs.existsSync(BACKUP) && fs.readdirSync(BACKUP).length === 1);

// Xoay vong ban sao luu: luu 12 lan, chi giu 10
for (let i = 0; i < 12; i++) {
  await goi('/api/save', {
    method: 'POST',
    body: JSON.stringify({ data: { basics: { name: `Lan ${i}` } } }),
  });
}
const soBan = fs.readdirSync(BACKUP).filter((f) => f.endsWith('.yaml')).length;
check('sao luu xoay vong giu dung 10 ban', soBan === 10, `co ${soBan} ban`);

// ---------- Bien dich hong -> khoi phuc lai file cu ----------
const TPL = path.join('templates', 'topcv', 'cv-template.html');
const TPL_TAM = TPL + '.tam';
fs.writeFileSync(DATA, GOC, 'utf8');
fs.renameSync(TPL, TPL_TAM);
const rHong = await goi('/api/save', {
  method: 'POST',
  body: JSON.stringify({ data: { basics: { name: 'Se That Bai' } } }),
});
fs.renameSync(TPL_TAM, TPL);
check('build hong -> tra 500', rHong.status === 500, `nhan ${rHong.status}`);
check('build hong -> khoi phuc resume.yaml', fs.readFileSync(DATA, 'utf8') === GOC,
  'file khong duoc tra ve nhu cu');

// ---------- Phuong thuc sai ----------
for (const [duong, pt] of [['/api/save', 'GET'], ['/api/data', 'POST'], ['/api/sync/github', 'GET']]) {
  const r = await goi(duong, { method: pt });
  check(`${pt} ${duong} khong thanh cong`, r.status !== 200, `nhan ${r.status}`);
}

server.close();
fs.writeFileSync(DATA, GOC, 'utf8');
console.log(`\n=== SERVER: ${pass} dat / ${fail} hong ===`);
for (const f of fails) console.log('  HONG: ' + f);
process.exit(fail ? 1 : 0);
