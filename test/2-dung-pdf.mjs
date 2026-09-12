// Kiem thu toan bo luong dung PDF voi nhieu dang du lieu khac nhau.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildPdf } from '../src/generator/generate-pdf.mjs';
import { buildGithubMarkdown } from '../src/generator/generate-github-md.mjs';

const DATA = path.join('data', 'resume.yaml');
const PDF = path.join('output', 'Mai-The-Toan-CV.pdf');
const HTML = path.join('output', 'preview.html');
const GOC = fs.readFileSync(DATA, 'utf8');

let pass = 0, fail = 0;
const fails = [];
/** Ghi nhan mot ca kiem thu. */
function check(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(`${name}${detail ? ' -> ' + detail : ''}`); }
}

/** Dem so trang cua file PDF bang cach dem the /Type /Page. */
function soTrang(file) {
  const buf = fs.readFileSync(file).toString('latin1');
  return (buf.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

/** Chay buildPdf voi mot noi dung YAML, tra ve {ok, err}. */
async function thu(yaml) {
  fs.writeFileSync(DATA, yaml, 'utf8');
  try {
    await buildPdf();
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

const CA_HOP_LE = [
  ['du lieu that', GOC, 2],
  ['toi thieu', 'basics:\n  name: A\n', 1],
  ['mang rong het', `basics:
  name: A
  title: T
education: []
research_and_publications: []
projects: []
honors_and_awards: []
certificates: []
hobbies: []
skills: {}
`, 1],
  ['thieu truong tuy chon', `basics:
  name: A
projects:
  - name: P
`, 1],
  ['gia tri so', `basics:
  name: 12345
education:
  - school: 1
    gpa: 3.5
certificates:
  - name: 1
    year: 2020
`, 1],
  ['unicode va emoji', `basics:
  name: "Nguyễn Thị Ánh Tuyết 🎉 日本語"
  career_objective: "→ ∑ ≠ … chữ ữ ỗ ặ"
hobbies: ["đọc sách", "🎸"]
`, 1],
  ['chen ma doc', `basics:
  name: "<script>alert(1)</script>"
  title: "{{basics.name}}"
  location: "</style><style>body{display:none}</style>"
hobbies: ["<img src=x onerror=alert(1)>"]
projects:
  - name: "{{#each_project}}"
    github: "javascript:alert(1)"
`, 1],
];

for (const [ten, yaml, toiThieuTrang] of CA_HOP_LE) {
  const r = await thu(yaml);
  check(`build: ${ten}`, r.ok, r.err);
  if (r.ok) {
    check(`build co file PDF: ${ten}`, fs.existsSync(PDF) && fs.statSync(PDF).size > 1000);
    check(`build du so trang: ${ten}`, soTrang(PDF) >= toiThieuTrang, `co ${soTrang(PDF)} trang`);
  }
}

// Noi dung rat dai -> phai ra nhieu trang, khong duoc treo
const DAI = `basics:
  name: A
  career_objective: "${'muc tieu rat dai '.repeat(200)}"
projects:
${Array.from({ length: 40 }, (_, i) => `  - name: "Du an ${i}"
    subtitle: "Phu de ${i}"
    period: "2020"
    tech_stack: "${'cong nghe, '.repeat(30)}"
    highlights: ["${'diem noi bat '.repeat(40)}"]`).join('\n')}
`;
const rDai = await thu(DAI);
check('build: noi dung rat dai', rDai.ok, rDai.err);
if (rDai.ok) check('build: noi dung dai ra nhieu trang', soTrang(PDF) >= 5, `co ${soTrang(PDF)} trang`);

// Kiem tra DOM cua preview.html o ca hop le lan doc hai
await thu(CA_HOP_LE[6][1]);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file:///' + path.resolve(HTML).replace(/\\/g, '/'));
const dom = await page.evaluate(() => ({
  script: document.querySelectorAll('script').length,
  img: document.querySelectorAll('img').length,
  style: document.querySelectorAll('style').length,
  iframe: document.querySelectorAll('iframe').length,
  onAttr: [...document.querySelectorAll('*')].filter(
    (e) => [...e.attributes].some((a) => /^on/i.test(a.name))).length,
  hienChu: document.body.innerText.includes('<script>alert(1)</script>'),
}));
await browser.close();
check('doc hai: khong co the script nao', dom.script === 0, JSON.stringify(dom));
check('doc hai: khong co the img nao', dom.img === 0);
check('doc hai: khong co the style chen them', dom.style === 0);
check('doc hai: khong co iframe', dom.iframe === 0);
check('doc hai: khong co thuoc tinh on*', dom.onAttr === 0);
check('doc hai: hien ra dung van ban tho', dom.hienChu);

// Cac ca phai BAO LOI chu khong duoc tao PDF sai
const CA_LOI = [
  ['YAML sai cu phap', 'basics:\n  name: "chua dong ngoac\n  title: [a, b'],
  ['file rong', ''],
  ['chi co khoang trang', '   \n\n  '],
  ['YAML la mot danh sach', '- a\n- b\n'],
  ['YAML la mot chuoi', 'chi la mot chuoi'],
  ['thieu basics', 'education: []\n'],
  ['basics khong phai object', 'basics: "chuoi"\n'],
  ['thieu name', 'basics:\n  title: T\n'],
  ['education sai kieu', 'basics:\n  name: A\neducation:\n  truong: X\n'],
  ['skills sai kieu', 'basics:\n  name: A\nskills:\n  - a\n  - b\n'],
];
for (const [ten, yaml] of CA_LOI) {
  const truoc = fs.existsSync(PDF) ? fs.statSync(PDF).mtimeMs : 0;
  const r = await thu(yaml);
  check(`bao loi dung: ${ten}`, !r.ok, 'lai chay thanh cong');
  const sau = fs.existsSync(PDF) ? fs.statSync(PDF).mtimeMs : 0;
  check(`khong ghi de PDF khi loi: ${ten}`, truoc === sau);
}

// Xay lai 2 lan tu cung du lieu -> phai ra cung ket qua
fs.writeFileSync(DATA, GOC, 'utf8');
await buildPdf();
const lan1 = fs.readFileSync(HTML, 'utf8');
await buildPdf();
const lan2 = fs.readFileSync(HTML, 'utf8');
check('on dinh: 2 lan build ra cung HTML', lan1 === lan2);

// generate-github-md
let mdErr = null;
try { buildGithubMarkdown(); } catch (e) { mdErr = e; }
check('build README GitHub chay duoc', mdErr === null, mdErr && mdErr.message);
if (!mdErr) {
  const md = fs.readFileSync(path.join('output', 'README.md'), 'utf8');
  check('README GitHub khong con placeholder', !/{{/.test(md),
    (md.match(/{{[^}]*}}/g) || []).slice(0, 3).join(','));
  check('README GitHub co noi dung', md.length > 200);
}

fs.writeFileSync(DATA, GOC, 'utf8');
console.log(`\n=== DUNG PDF: ${pass} dat / ${fail} hong ===`);
for (const f of fails) console.log('  HONG: ' + f);
process.exit(fail ? 1 : 0);
