// Kiem thu cac ham thuan: validateResume va renderTemplate.
import fs from 'node:fs';
import path from 'node:path';
import { validateResume, renderTemplate } from '../src/generator/generate-pdf.mjs';

let pass = 0, fail = 0;
const fails = [];

/** Ghi nhan mot ca kiem thu. */
function check(name, cond, detail = '') {
  if (cond) { pass++; }
  else { fail++; fails.push(`${name}${detail ? ' -> ' + detail : ''}`); }
}

const TPL = fs.readFileSync(path.join('templates', 'topcv', 'cv-template.html'), 'utf8');

// ---------- validateResume ----------
const V = [
  ['null', null, true],
  ['undefined', undefined, true],
  ['chuoi', 'hello', true],
  ['so', 42, true],
  ['mang', [1, 2], true],
  ['object rong', {}, true],
  ['thieu basics', { education: [] }, true],
  ['basics la mang', { basics: ['x'] }, true],
  ['basics la chuoi', { basics: 'x' }, true],
  ['thieu name', { basics: { title: 'x' } }, true],
  ['name rong', { basics: { name: '' } }, true],
  ['hop le toi thieu', { basics: { name: 'A' } }, false],
  ['education la object', { basics: { name: 'A' }, education: {} }, true],
  ['education la chuoi', { basics: { name: 'A' }, education: 'x' }, true],
  ['skills la mang', { basics: { name: 'A' }, skills: [] }, true],
  ['skills la chuoi', { basics: { name: 'A' }, skills: 'x' }, true],
  ['hobbies la chuoi', { basics: { name: 'A' }, hobbies: 'x' }, true],
  ['day du hop le', {
    basics: { name: 'A' }, education: [], research_and_publications: [],
    projects: [], honors_and_awards: [], certificates: [], hobbies: [], skills: {}
  }, false],
];
for (const [name, data, expectErr] of V) {
  const errs = validateResume(data);
  check(`validate: ${name}`, (errs.length > 0) === expectErr, `loi=${JSON.stringify(errs)}`);
}

// ---------- renderTemplate: khong con placeholder sot lai ----------
const FULL = {
  basics: {
    name: 'Nguyễn Văn A', title: 'Dev', phone: '0900', email: 'a@b.c',
    github_url: 'https://github.com/x', location: 'Hà Nội', career_objective: '  muc tieu  '
  },
  education: [{ school: 'S', period: 'P', major: 'M', gpa: '3.0' }],
  research_and_publications: [{
    authors: 'A B, C D, E F', title: 'T', journal: 'J', doi: 'D',
    roles: ['r1', 'r2'], details: ' chi tiet '
  }],
  projects: [
    { name: 'P1', subtitle: 'S1', period: '2020', tech_stack: 'X', highlights: ['h1'], github: 'https://g/1' },
    { name: 'P2', subtitle: 'S2', period: '2021', tech_stack: 'Y', highlights: [] },
    { name: 'An', subtitle: 'x', period: 'z', show_in_topcv: false },
  ],
  skills: {
    programming_languages: ['a', 'b'], backend_development: 'c',
    database: [], devops: null, monitoring: undefined,
    authentication_and_security: ['x', '', null, 'y'],
    architecture_and_design: 'z', tools: ['t']
  },
  honors_and_awards: [{ title: 'AW', year: 2020, detail: 'd' }],
  certificates: [{ name: 'C1', year: 2019 }],
  hobbies: ['h1', 'h2'],
};
let html = renderTemplate(TPL, FULL);
check('render: khong con placeholder {{', !/{{/.test(html), (html.match(/{{[^}]*}}/g) || []).slice(0, 5).join(','));
check('render: loc show_in_topcv=false', !html.includes('>An<'));
check('render: du an co github hien link', html.includes('https://g/1'));
check('render: du an khong github bo khoi if', !html.includes('{{#if'));
check('render: gop mang skills', html.includes('a, b'));
check('render: bo phan tu rong trong mang', html.includes('x, y'));
check('render: tac gia dau tach dung', html.includes('>A B</span>, C D, E F'));
check('render: trim career_objective', html.includes('>muc tieu<'));
check('render: roles render du', (html.match(/<li>r[12]<\/li>/g) || []).length === 2);

// ---------- renderTemplate: chong chen ma ----------
const XSS = '<script>alert(1)</script>"\'&<img src=x onerror=y>';
const BRACE = '{{basics.name}}{{#each_project}}';
const EVIL = JSON.parse(JSON.stringify(FULL));
EVIL.basics.name = XSS;
EVIL.basics.title = BRACE;
EVIL.basics.location = '</style><style>body{display:none}</style>';
EVIL.education[0].school = XSS;
EVIL.projects[0].name = BRACE;
EVIL.projects[0].github = 'javascript:alert(1)';
EVIL.skills.tools = [XSS, BRACE];
EVIL.honors_and_awards[0].title = XSS;
EVIL.certificates[0].name = BRACE;
EVIL.hobbies = [XSS];
html = renderTemplate(TPL, EVIL);
// Chuoi "onerror=" van xuat hien duoi dang VAN BAN da escape - vo hai.
// Phai bat cai the that su duoc tao ra, khong bat chuoi con.
check('xss: khong tao the script', !/<script[\s>]/i.test(html));
check('xss: khong tao the img', !/<img[\s>]/i.test(html));
check('xss: khong tao the style', !/<style[\s>]/i.test(html));
check('xss: du lieu doc bi escape het', html.includes('&lt;script&gt;') && html.includes('&lt;img'));
check('xss: dau { da escape', !html.includes('{{basics.name}}'));
check('xss: khong con placeholder sot', !/{{/.test(html));
check('xss: giu nguyen so the svg cua template', (html.match(/<svg/g) || []).length === 4);

// ---------- renderTemplate: du lieu thieu / la kieu ----------
const CASES = [
  ['object rong', {}],
  ['chi co basics.name', { basics: { name: 'A' } }],
  ['mang rong het', {
    basics: { name: 'A' }, education: [], research_and_publications: [], projects: [],
    honors_and_awards: [], certificates: [], hobbies: [], skills: {}
  }],
  ['gia tri null', {
    basics: { name: null, title: null, career_objective: null },
    education: [{}], research_and_publications: [{}], projects: [{}],
    honors_and_awards: [{}], certificates: [{}], skills: { tools: null }, hobbies: null
  }],
  ['gia tri so', {
    basics: { name: 123, phone: 456 },
    education: [{ school: 1, gpa: 3.5 }], certificates: [{ name: 1, year: 2 }]
  }],
  ['chuoi rat dai', {
    basics: { name: 'x'.repeat(5000), career_objective: 'y'.repeat(20000) }
  }],
  ['unicode va emoji', {
    basics: { name: '日本語 🎉 Tiếng Việt ắ ữ ỗ', career_objective: '→ ∑ ≠ … ‑ ' }
  }],
  ['authors khong dau phay', {
    basics: { name: 'A' }, research_and_publications: [{ authors: 'Chi Mot Nguoi' }]
  }],
  ['authors rong', { basics: { name: 'A' }, research_and_publications: [{ authors: '' }] }],
  ['github_url khong co http', { basics: { name: 'A', github_url: 'github.com/x' } }],
];
for (const [name, data] of CASES) {
  let out = null, err = null;
  try { out = renderTemplate(TPL, data); } catch (e) { err = e; }
  check(`render khong no: ${name}`, err === null, err && err.message);
  if (out !== null) {
    check(`render sach placeholder: ${name}`, !/{{/.test(out),
      (out.match(/{{[^}]*}}/g) || []).slice(0, 3).join(','));
  }
}

// ---------- renderTemplate: idempotent ----------
check('render: chay 2 lan ra ket qua giong nhau',
  renderTemplate(TPL, FULL) === renderTemplate(TPL, FULL));

console.log(`\n=== HAM THUAN: ${pass} dat / ${fail} hong ===`);
for (const f of fails) console.log('  HONG: ' + f);
process.exit(fail ? 1 : 0);
