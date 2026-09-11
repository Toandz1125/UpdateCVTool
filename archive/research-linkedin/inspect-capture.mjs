/**
 * Đọc file capture do record-linkedin.mjs tạo ra và tóm tắt lại những gì đáng chú ý.
 *
 * Mục tiêu là trả lời một câu hỏi duy nhất: khi bạn sửa một mục hồ sơ, LinkedIn
 * gửi đi cái gì, và cái đó có ổn định đủ để tự động hoá lại hay không.
 *
 * Cách dùng:  npm run inspect              (lấy file capture mới nhất)
 *             npm run inspect -- <đường dẫn file .jsonl>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURE_DIR = path.join(ROOT, 'captures');

/**
 * Tìm file capture cần phân tích: lấy từ tham số dòng lệnh, nếu không có thì
 * lấy file .jsonl mới nhất trong thư mục captures.
 *
 * @returns {string} Đường dẫn tuyệt đối tới file capture
 * @throws {Error} Nếu không tìm thấy file capture nào
 */
function resolveCaptureFile() {
  const fromArgs = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (fromArgs) return path.resolve(fromArgs);

  if (!fs.existsSync(CAPTURE_DIR)) {
    throw new Error('Chưa có thư mục captures. Chạy "npm run record" trước.');
  }
  const files = fs
    .readdirSync(CAPTURE_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(CAPTURE_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (files.length === 0) {
    throw new Error('Không tìm thấy file .jsonl nào. Chạy "npm run record" trước.');
  }
  return files[0];
}

/**
 * Đọc file JSONL thành mảng object, bỏ qua dòng hỏng.
 *
 * @param {string} filePath Đường dẫn file capture
 * @returns {object[]} Danh sách bản ghi
 */
function readRecords(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

/**
 * Xác định một bản ghi có phải lời gọi GHI dữ liệu hay không.
 *
 * Kiểm theo cả method chứ không chỉ theo nhãn, để đọc được cả những file capture
 * cũ (khi đó nhãn "graphql" gộp chung cả GET đọc lẫn POST ghi).
 *
 * @param {object} record Một bản ghi trong file capture
 * @returns {boolean} true nếu đây là lời gọi ghi
 */
function isWrite(record) {
  if (['write', 'write-misc', 'sdui-write', 'graphql-write'].includes(record.kind)) {
    return true;
  }
  if (record.kind === 'graphql') return record.method !== 'GET';
  return false;
}

/**
 * Đoán xem một chuỗi có phải nội dung nhị phân hay không.
 *
 * LinkedIn gửi protobuf thô ở nhiều endpoint; in thẳng ra console sẽ phá vỡ
 * terminal, nên cần phát hiện để thay bằng dòng tóm tắt.
 *
 * @param {string} text Chuỗi cần kiểm tra
 * @returns {boolean} true nếu phần lớn ký tự không in được
 */
function isBinary(text) {
  const sample = text.slice(0, 500);
  if (!sample) return false;
  // eslint-disable-next-line no-control-regex
  const unprintable = (sample.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f�]/g) ?? []).length;
  return unprintable / sample.length > 0.05;
}

/**
 * Trích sduiid — định danh thành phần/hành động trong kiến trúc server-driven UI.
 *
 * @param {string} url URL đầy đủ
 * @returns {string|null} sduiid, hoặc null nếu không có
 */
function extractSduiId(url) {
  const match = url.match(/[?&]sduiid=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Đếm số state binding mà một lời gọi SDUI tham chiếu tới.
 *
 * Đây là chỉ số quan trọng nhất: payload lưu KHOÁ tham chiếu state chứ không
 * lưu giá trị, nên số này càng lớn thì càng khó dựng lại request từ bên ngoài.
 *
 * @param {string|null} body Request body
 * @returns {{total: number, generated: number}}
 *   total = tổng số khoá; generated = số khoá chứa UUID sinh ngẫu nhiên mỗi phiên
 */
function countStateBindings(body) {
  if (!body) return { total: 0, generated: 0 };
  const ids = body.match(/"id":\s*"([^"]+)"/g) ?? [];
  const generated = ids.filter((s) => /auto-binding-[0-9a-f-]{36}/.test(s)).length;
  return { total: ids.length, generated };
}

/**
 * Trích queryId ra khỏi URL của một request GraphQL.
 *
 * queryId là hash build của frontend LinkedIn — chính nó là thứ đổi mỗi lần họ
 * deploy, nên đây là chỉ dấu quan trọng nhất về độ bền của phương án replay API.
 *
 * @param {string} url URL đầy đủ
 * @returns {string|null} queryId, hoặc null nếu không có
 */
function extractQueryId(url) {
  const match = url.match(/[?&]queryId=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Dò xem payload có dùng cú pháp Rest.li patch ($set / $delete) hay không.
 *
 * @param {string|null} body Request body dạng chuỗi
 * @returns {string[]} Danh sách toán tử patch tìm thấy (rỗng nếu không có)
 */
function detectPatchOps(body) {
  if (!body) return [];
  const ops = new Set();
  for (const op of ['$set', '$delete', 'patch']) {
    if (body.includes(`"${op}"`)) ops.add(op);
  }
  return [...ops];
}

/**
 * In JSON đã được format, cắt ngắn nếu quá dài.
 *
 * @param {string|null} body Chuỗi JSON gốc
 * @param {number} maxChars Số ký tự tối đa được in
 * @returns {string} Chuỗi đã format để hiển thị
 */
function formatBody(body, maxChars = 1200) {
  if (!body) return '(không có body)';
  if (isBinary(body)) return `[NHỊ PHÂN ~${body.length} byte — protobuf/nén, bỏ qua]`;
  let text;
  try {
    text = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    text = body;
  }
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n    ...[còn ${text.length - maxChars} ký tự]`
    : text;
}

/**
 * In phần tóm tắt tổng quan: số lượng request theo từng nhãn.
 *
 * @param {object[]} records Toàn bộ bản ghi
 * @returns {void}
 */
function printOverview(records) {
  const counts = {};
  for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;

  console.log('\n=== TỔNG QUAN ===\n');
  for (const [kind, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(10)} ${n}`);
  }
}

/**
 * In danh sách các queryId đã gặp — dùng để đánh giá độ ổn định của API.
 *
 * @param {object[]} records Toàn bộ bản ghi
 * @returns {void}
 */
function printQueryIds(records) {
  const ids = new Map();
  for (const r of records) {
    const id = extractQueryId(r.url ?? '');
    if (!id) continue;
    const entry = ids.get(id) ?? { count: 0, write: false };
    entry.count += 1;
    entry.write = entry.write || isWrite(r);
    ids.set(id, entry);
  }
  if (ids.size === 0) return;

  console.log('\n=== CÁC queryId ĐÃ GẶP ===');
  console.log('  (mỗi id gắn với một build frontend; LinkedIn deploy là đổi)');
  console.log('  (W) = có xuất hiện trong lời gọi ghi — đây mới là nhóm đáng lo\n');
  const sorted = [...ids].sort((a, b) => Number(b[1].write) - Number(a[1].write) || b[1].count - a[1].count);
  for (const [id, entry] of sorted) {
    console.log(`  ${entry.write ? '(W)' : '   '} ${String(entry.count).padStart(3)}x  ${id}`);
  }
}

/**
 * In chi tiết từng lời gọi ghi dữ liệu, xen kẽ với các marker người dùng đã đặt.
 *
 * @param {object[]} records Toàn bộ bản ghi
 * @returns {void}
 */
function printWriteTimeline(records) {
  const interesting = records.filter((r) => r.kind === 'marker' || isWrite(r));

  console.log('\n=== DÒNG THỜI GIAN CÁC LỜI GỌI GHI ===\n');
  if (!interesting.some(isWrite)) {
    console.log('  Không bắt được lời gọi ghi nào — phiên này chưa có thao tác sửa hồ sơ thật.');
    return;
  }

  for (const r of interesting) {
    if (r.kind === 'marker') {
      console.log(`\n  --- MARKER: ${r.note} ---\n`);
      continue;
    }

    const queryId = extractQueryId(r.url);
    const sduiId = extractSduiId(r.url);
    const patchOps = detectPatchOps(r.requestBody);
    const bindings = countStateBindings(r.requestBody);

    console.log(`  [${r.ts}] ${r.method} ${r.status}  (${r.kind})`);
    console.log(`    URL      : ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 110)}`);
    if (queryId) console.log(`    queryId  : ${queryId}`);
    if (sduiId) console.log(`    sduiid   : ${sduiId}`);
    if (patchOps.length) console.log(`    patch    : ${patchOps.join(', ')}`);
    if (bindings.total) {
      console.log(`    bindings : ${bindings.total} khoá state, ${bindings.generated} khoá sinh ngẫu nhiên mỗi phiên`);
    }
    console.log(`    body     :\n${indent(formatBody(r.requestBody), 6)}`);
    console.log('');
  }
}

/**
 * Thụt lề mọi dòng của một chuỗi nhiều dòng.
 *
 * @param {string} text Chuỗi gốc
 * @param {number} spaces Số khoảng trắng cần thụt
 * @returns {string} Chuỗi đã thụt lề
 */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}

/**
 * In kết luận sơ bộ về mức độ khả thi của việc replay lại API.
 *
 * @param {object[]} records Toàn bộ bản ghi
 * @returns {void}
 */
function printVerdict(records) {
  const writes = records.filter(isWrite);
  const tracking = records.filter((r) => r.kind === 'tracking').length;
  const withQueryId = writes.filter((r) => extractQueryId(r.url)).length;
  const withPatch = writes.filter((r) => detectPatchOps(r.requestBody).length > 0).length;

  console.log('\n=== ĐÁNH GIÁ SƠ BỘ ===\n');
  console.log(`  Số lời gọi ghi              : ${writes.length}`);
  if (writes.length === 0) {
    console.log('\n  Chưa đủ dữ liệu để kết luận. Chạy lại "npm run record" và nhớ');
    console.log('  bấm Save trên một mục trong hồ sơ, đặt marker trước/sau khi bấm.\n');
    return;
  }
  console.log(`  Trong đó có queryId         : ${withQueryId}  <-- càng cao càng dễ vỡ khi LinkedIn deploy`);
  console.log(`  Trong đó dùng Rest.li patch : ${withPatch}`);
  console.log(`  Beacon tracking đi kèm      : ${tracking}  <-- traffic phụ mà bản replay sẽ không có`);

  const sdui = writes.filter((r) => extractSduiId(r.url));
  if (sdui.length === 0) return;

  const bindingTotals = sdui.reduce(
    (acc, r) => {
      const b = countStateBindings(r.requestBody);
      return { total: acc.total + b.total, generated: acc.generated + b.generated };
    },
    { total: 0, generated: 0 },
  );

  console.log(`\n  --- Kiến trúc server-driven UI (/rsc-action/) ---`);
  console.log(`  Lời gọi SDUI                : ${sdui.length}`);
  console.log(`  Khoá state được tham chiếu  : ${bindingTotals.total}`);
  console.log(`  Trong đó sinh ngẫu nhiên    : ${bindingTotals.generated}  <-- không thể hardcode`);
  console.log(`
  Payload SDUI mang KHOÁ tham chiếu tới state phía client, không mang giá trị.
  Muốn dựng lại một lời gọi lưu, phải chạy được runtime SDUI của LinkedIn để
  sinh và nắm giữ đúng bộ khoá đó cho từng phiên.`);
  console.log('');
}

/**
 * Điểm vào chính.
 * @returns {void}
 */
function main() {
  const file = resolveCaptureFile();
  const records = readRecords(file);

  console.log(`\nFile: ${path.relative(ROOT, file)}  (${records.length} bản ghi)`);

  printOverview(records);
  printQueryIds(records);
  printWriteTimeline(records);
  printVerdict(records);
}

try {
  main();
} catch (err) {
  console.error(`Lỗi: ${err.message}`);
  process.exit(1);
}
