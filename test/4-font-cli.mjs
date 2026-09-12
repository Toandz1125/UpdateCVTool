// Kiem thu trinh dung font to dam, co che lui ve face Bold, va cac lenh CLI.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureFauxBoldFont, fauxBoldCss, FAUX_BOLD_FILE } from '../src/generator/faux-bold-font.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output');
const DATA = path.join(ROOT, 'data', 'resume.yaml');
const FONT = path.join(OUT, FAUX_BOLD_FILE);
const SCRIPT = path.join(ROOT, 'tools', 'build-faux-bold-font.py');
const GOC = fs.readFileSync(DATA, 'utf8');

let pass = 0, fail = 0;
const fails = [];
/** Ghi nhan mot ca kiem thu. */
function check(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(`${name}${detail ? ' -> ' + detail : ''}`); }
}

// ---------- Dung font tu dau ----------
fs.rmSync(FONT, { force: true });
check('dung font tu dau thanh cong', ensureFauxBoldFont(ROOT, OUT, DATA) === true);
check('co file font', fs.existsSync(FONT) && fs.statSync(FONT).size > 3000,
  fs.existsSync(FONT) ? String(fs.statSync(FONT).size) : 'khong co file');
const bytes1 = fs.readFileSync(FONT);

// ---------- Khong dung lai khi khong can ----------
const mtime1 = fs.statSync(FONT).mtimeMs;
check('lan 2 van bao thanh cong', ensureFauxBoldFont(ROOT, OUT, DATA) === true);
check('lan 2 khong dung lai font', fs.statSync(FONT).mtimeMs === mtime1);

// ---------- Dung lai khi resume.yaml moi hon ----------
const sau = new Date(Date.now() + 5000);
fs.utimesSync(DATA, sau, sau);
ensureFauxBoldFont(ROOT, OUT, DATA);
check('resume.yaml moi hon -> dung lai font', fs.statSync(FONT).mtimeMs !== mtime1);

// ---------- Tat dinh: cung dau vao ra cung byte ----------
fs.rmSync(FONT, { force: true });
ensureFauxBoldFont(ROOT, OUT, DATA);
const bytes2 = fs.readFileSync(FONT);
// WOFF2 nen brotli nen so byte la vo nghia: doi mot dau thoi gian trong bang
// head lam lech gan het luong nen. Cai can on dinh la hinh hoc chu va be rong.
fs.writeFileSync(path.join(OUT, 'ft-a.woff2'), bytes1);
fs.writeFileSync(path.join(OUT, 'ft-b.woff2'), bytes2);
const soSanh = spawnSync('python', [path.join('test', 'so-sanh-font.py'),
  path.join(OUT, 'ft-a.woff2'), path.join(OUT, 'ft-b.woff2')], { encoding: 'utf8' });
check('dung 2 lan ra font cung kich thuoc', bytes1.length === bytes2.length,
  `${bytes1.length} vs ${bytes2.length}`);
check('dung 2 lan ra hinh hoc chu y het nhau',
  (soSanh.stdout || '').trim() === 'GIONG', (soSanh.stdout || soSanh.stderr || '').trim());

// ---------- Du lieu la: emoji, ky tu khong co trong Times ----------
fs.writeFileSync(DATA, `basics:
  name: "🎉 日本語 ☃ ᚠᚢᚦ Тест العربية"
  career_objective: "ệ ữ ỗ ẵ ǆ ǉ ﬁ ﬂ"
`, 'utf8');
fs.rmSync(FONT, { force: true });
let laErr = null;
let laOk = false;
try { laOk = ensureFauxBoldFont(ROOT, OUT, DATA); } catch (e) { laErr = e; }
check('ky tu la khong lam no trinh dung font', laErr === null, laErr && laErr.message);
check('ky tu la van dung duoc font', laOk === true);
fs.writeFileSync(DATA, GOC, 'utf8');

// ---------- Thieu script -> lui ve face Bold, khong nem loi ----------
fs.rmSync(FONT, { force: true });
const TAM = SCRIPT + '.tam';
fs.renameSync(SCRIPT, TAM);
let thieuErr = null, thieuKq = null;
try { thieuKq = ensureFauxBoldFont(ROOT, OUT, DATA); } catch (e) { thieuErr = e; }
fs.renameSync(TAM, SCRIPT);
check('thieu script: khong nem loi', thieuErr === null, thieuErr && thieuErr.message);
check('thieu script: tra ve false', thieuKq === false, String(thieuKq));

// ---------- Thieu font nguon -> script bao loi ro rang ----------
const r = spawnSync('python', [SCRIPT, path.join(OUT, 'thu.woff2'), DATA],
  { env: { ...process.env, WINDIR: 'Z:\\khong-ton-tai' }, encoding: 'utf8' });
check('thieu times.ttf: script thoat khac 0', r.status !== 0, `ma thoat ${r.status}`);
// Khong khop theo tieng Viet: khi stderr bi hung qua ong, Python ma hoa theo
// bang ma he thong nen chu co dau bi escape. Trong console that thi hien dung.
check('thieu times.ttf: co ghi ly do ra stderr', (r.stderr || '').includes('times.ttf'),
  (r.stderr || '').slice(0, 120));

// ---------- Thieu tham so -> in huong dan ----------
const r2 = spawnSync('python', [SCRIPT], { encoding: 'utf8' });
check('thieu tham so: thoat ma 2', r2.status === 2, `ma thoat ${r2.status}`);
check('thieu tham so: in cach dung', /build-faux-bold-font\.py <out\.woff2>/.test(r2.stderr || ''),
  (r2.stderr || '').slice(0, 120));

// ---------- CSS sinh ra ----------
const css = fauxBoldCss();
check('CSS co @font-face', css.includes('@font-face'));
check('CSS tro dung ten file', css.includes(FAUX_BOLD_FILE));
check('CSS dat font-weight 400', /font-weight:\s*400/.test(css));
check('CSS phu het cac phan tu dam',
  ['.cv-name', '.section-title', '.project-sub', '.pub-author-first',
   '.edu-item .item-title', '.project-item .item-title'].every((s) => css.includes(s)));

// ---------- CLI ----------
ensureFauxBoldFont(ROOT, OUT, DATA);
for (const [ten, args, phaiOk] of [
  ['build:pdf', ['src/cli.mjs', 'build:pdf'], true],
  ['build:github', ['src/cli.mjs', 'build:github'], true],
  ['build', ['src/cli.mjs', 'build'], true],
  ['khong tham so', ['src/cli.mjs'], null],
  ['lenh la', ['src/cli.mjs', 'lenh-khong-co'], null],
]) {
  const rc = spawnSync('node', args, { encoding: 'utf8', cwd: ROOT, timeout: 180000 });
  if (phaiOk === true) {
    check(`CLI ${ten} chay xong ma 0`, rc.status === 0, `ma ${rc.status} ${(rc.stderr || '').slice(0, 160)}`);
  } else {
    check(`CLI ${ten} khong treo va khong no`, rc.status !== null,
      `ma ${rc.status} ${(rc.stderr || '').slice(0, 160)}`);
    check(`CLI ${ten} co in bang huong dan`, /CLI HELPER/.test(
      (rc.stdout || '') + (rc.stderr || '')), ((rc.stdout || '') + (rc.stderr || '')).slice(0, 160));
    check(`CLI ${ten} liet ke day du lenh`,
      ['npm run ui', 'npm run build', 'npm run sync:github'].every(
        (x) => (rc.stdout || '').includes(x)));
  }
}

// ---------- Chan chen lenh qua commit message ----------
// Khong chay git that; chi kiem tra adapter dung execFileSync (tham so dang mang)
const adapter = fs.readFileSync(path.join(ROOT, 'src', 'adapters', 'github-adapter.mjs'), 'utf8');
check('adapter khong dung execSync chuoi', !/\bexecSync\s*\(/.test(adapter));
check('adapter dung execFileSync', /execFileSync\s*\(\s*'git'\s*,\s*\[/.test(adapter));
check('adapter khong noi chuoi vao lenh', !/execFileSync\([^)]*\$\{/.test(adapter));

fs.writeFileSync(DATA, GOC, 'utf8');
console.log(`\n=== FONT & CLI: ${pass} dat / ${fail} hong ===`);
for (const f of fails) console.log('  HONG: ' + f);
process.exit(fail ? 1 : 0);
