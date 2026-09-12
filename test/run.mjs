// Bộ kiểm thử: dựng một bản sao dự án trong thư mục tạm rồi chạy từng nhóm ca
// trong đó. Chạy trên bản sao vì nhiều ca phải ghi đè data/resume.yaml và
// output/ — chạy thẳng trên thư mục làm việc sẽ phá dữ liệu thật.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = path.join(os.tmpdir(), 'updatecv-kiemthu');
// Cổng riêng để chạy được song song với dashboard đang mở ở cổng 3000
const PORT = '3100';

const NHOM = [
  ['Hàm thuần (validateResume, renderTemplate)', '1-ham-thuan.mjs'],
  ['Dựng PDF end-to-end', '2-dung-pdf.mjs'],
  ['Server HTTP', '3-server.mjs'],
  ['Trình dựng font & CLI', '4-font-cli.mjs'],
  ['Ca biên (thiếu file, ghi đồng thời, YAML độc)', '5-ca-bien.mjs'],
];

/**
 * Dựng lại thư mục sandbox: copy mã nguồn và dữ liệu, nối node_modules.
 *
 * node_modules được nối bằng junction thay vì copy: thư mục này nặng vài trăm MB
 * và không có ca kiểm thử nào ghi vào đó.
 *
 * @returns {void}
 */
function dungSandbox() {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
  for (const d of ['src', 'templates', 'tools', 'data', 'test']) {
    fs.cpSync(path.join(ROOT, d), path.join(SANDBOX, d), { recursive: true });
  }
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(SANDBOX, 'package.json'));
  fs.mkdirSync(path.join(SANDBOX, 'output'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(SANDBOX, 'node_modules'), 'junction');
}

/**
 * Chạy một file kiểm thử trong sandbox và in kết quả.
 *
 * @param {string} ten Tên nhóm ca, dùng để in ra
 * @param {string} file Tên file trong thư mục test/
 * @returns {{dat: number, hong: number}} Số ca đạt và hỏng
 */
function chayNhom(ten, file) {
  const r = spawnSync('node', [path.join('test', file)], {
    cwd: SANDBOX,
    encoding: 'utf8',
    env: { ...process.env, UPDATECV_PORT: PORT },
    timeout: 15 * 60 * 1000,
  });
  const ra = (r.stdout || '') + (r.stderr || '');
  const tong = ra.match(/=== .*?: (\d+) dat \/ (\d+) hong ===/);
  const dat = tong ? Number(tong[1]) : 0;
  const hong = tong ? Number(tong[2]) : -1;

  if (hong === 0) {
    console.log(`  ✅ ${ten}: ${dat} ca đạt`);
  } else if (hong > 0) {
    console.log(`  ❌ ${ten}: ${dat} đạt / ${hong} hỏng`);
    for (const d of ra.split('\n').filter((l) => l.includes('HONG:'))) console.log('      ' + d.trim());
  } else {
    console.log(`  ❌ ${ten}: không chạy xong (mã thoát ${r.status})`);
    console.log(ra.split('\n').slice(-15).map((l) => '      ' + l).join('\n'));
  }
  return { dat, hong: Math.max(hong, 0) };
}

console.log(`\nĐang dựng bản sao để kiểm thử tại: ${SANDBOX}`);
dungSandbox();
console.log('');

let tongDat = 0;
let tongHong = 0;
for (const [ten, file] of NHOM) {
  const kq = chayNhom(ten, file);
  tongDat += kq.dat;
  tongHong += kq.hong;
}

console.log(`\n=============================================`);
console.log(`  TỔNG: ${tongDat} ca đạt, ${tongHong} ca hỏng`);
console.log(`=============================================\n`);
process.exit(tongHong ? 1 : 0);
