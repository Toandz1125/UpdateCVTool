/**
 * Script ghi lại toàn bộ network traffic của LinkedIn trong khi bạn thao tác tay.
 *
 * Mục đích: quan sát xem giao diện LinkedIn thực sự gọi những API nào khi bạn
 * thêm/sửa một mục trong hồ sơ, để đánh giá xem việc tự động hoá có khả thi không.
 * Script KHÔNG tự động bấm hay ghi bất cứ thứ gì lên tài khoản — nó chỉ lắng nghe.
 *
 * Cách dùng:  npm run record
 *             npm run record -- --all    in ra console mọi request (để kiểm tra
 *                                        xem đang nghe đúng cửa sổ hay không)
 *             npm run record -- --har    xuất kèm file HAR đầy đủ
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
const CAPTURE_DIR = path.join(ROOT, 'captures');

// Cắt bớt body quá lớn để file capture không phình to vô ích
const MAX_BODY_CHARS = 200_000;

// Những header mang giá trị phiên đăng nhập — không bao giờ ghi ra file
const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'csrf-token']);

/**
 * Đọc tham số dòng lệnh.
 *
 * @returns {{har: boolean, all: boolean}}
 *   har = có xuất thêm file HAR đầy đủ hay không;
 *   all = in ra console MỌI request bắt được, không chỉ lời gọi ghi
 */
function parseArgs() {
  const argv = process.argv.slice(2);
  return { har: argv.includes('--har'), all: argv.includes('--all') };
}

/**
 * Thay giá trị các header nhạy cảm bằng một placeholder.
 *
 * Giá trị thật của li_at / csrf-token không cần thiết cho việc phân tích API,
 * nhưng nếu ghi ra file thì file capture trở thành một credential nằm trên đĩa.
 *
 * @param {Record<string, string>} headers Header gốc
 * @returns {Record<string, string>} Header đã được làm sạch
 */
function redactHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SECRET_HEADERS.has(key.toLowerCase())
      ? `[REDACTED len=${value.length}]`
      : value;
  }
  return out;
}

/**
 * Phân loại một request để biết có đáng chú ý hay không.
 *
 * GraphQL phải tách theo method: LinkedIn dùng GET cho truy vấn đọc và POST cho
 * mutation, nên gộp chung sẽ thổi phồng số lời gọi ghi bằng toàn bộ traffic
 * boilerplate lúc tải trang.
 *
 * @param {string} url URL đầy đủ của request
 * @param {string} method HTTP method
 * @returns {'write'|'write-misc'|'sdui-write'|'sdui-read'|'graphql-write'
 *   |'graphql-read'|'tracking'|'other'|'skip'} Nhãn phân loại
 */
function classify(url, method) {
  if (!url.includes('linkedin.com')) return 'skip';
  if (/\/li\/track|\/platform-telemetry|\/sensorCollect\/|\.gif(\?|$)/.test(url)) {
    return 'tracking';
  }
  // Sensor chống bot: path một đoạn, tên ngẫu nhiên, body protobuf nhị phân
  // (vd /to11yE8QZLIzkFLWm). API thật luôn có nhiều đoạn path.
  if (/^https?:\/\/[^/]+\/[A-Za-z0-9]{8,}\/?$/.test(url)) return 'tracking';
  // Kiến trúc mới của LinkedIn: server-driven UI qua React Server Components
  if (url.includes('/rsc-action/')) {
    return method === 'GET' ? 'sdui-read' : 'sdui-write';
  }
  if (url.includes('/voyager/api/graphql')) {
    return method === 'GET' ? 'graphql-read' : 'graphql-write';
  }
  if (url.includes('/voyager/api/')) {
    return method === 'GET' ? 'other' : 'write';
  }
  // Lưới an toàn: mọi request ghi tới linkedin.com đều giữ lại, kể cả khi nằm
  // ngoài /voyager/api/. Không có gì bảo đảm LinkedIn chỉ ghi qua đường đó.
  if (method !== 'GET') return 'write-misc';
  return 'skip';
}

/**
 * Rút gọn URL cho dễ đọc trên console (bỏ domain và cắt phần quá dài).
 * @param {string} url URL đầy đủ
 * @returns {string} Chuỗi ngắn gọn
 */
function shortUrl(url) {
  const stripped = url.replace(/^https?:\/\/[^/]+/, '');
  return stripped.length > 120 ? `${stripped.slice(0, 117)}...` : stripped;
}

/**
 * Mở file JSONL để ghi capture.
 *
 * @param {string} filePath Đường dẫn file đích
 * @returns {{write: (obj: object) => void, close: () => Promise<void>, count: () => number}}
 *   Bộ ba hàm để ghi, đóng và đếm số bản ghi đã ghi
 */
function openSink(filePath) {
  const stream = fs.createWriteStream(filePath, { flags: 'a' });
  let written = 0;
  return {
    write(obj) {
      stream.write(`${JSON.stringify(obj)}\n`);
      written += 1;
    },
    close() {
      return new Promise((resolve) => stream.end(resolve));
    },
    count() {
      return written;
    },
  };
}

/**
 * Gắn các listener network vào browser context và ghi kết quả ra sink.
 *
 * @param {import('playwright').BrowserContext} context Context đang chạy
 * @param {ReturnType<typeof openSink>} sink Nơi ghi kết quả
 * @param {boolean} verbose In ra console mọi request, không chỉ lời gọi ghi
 * @returns {{stats: Record<string, number>}} Bộ đếm số request theo từng nhãn
 */
function attachRecorder(context, sink, verbose = false) {
  const stats = {
    write: 0,
    'write-misc': 0,
    'sdui-write': 0,
    'sdui-read': 0,
    'graphql-write': 0,
    'graphql-read': 0,
    tracking: 0,
    other: 0,
    failed: 0,
  };

  context.on('response', async (response) => {
    const request = response.request();
    const url = request.url();
    const method = request.method();
    const kind = classify(url, method);
    if (kind === 'skip') return;

    let body = null;
    try {
      const text = await response.text();
      body = text.length > MAX_BODY_CHARS
        ? `${text.slice(0, MAX_BODY_CHARS)}\n...[TRUNCATED ${text.length} chars]`
        : text;
    } catch {
      // Response bị huỷ hoặc trang đã điều hướng — không còn body để đọc
      body = null;
    }

    stats[kind] += 1;
    sink.write({
      ts: new Date().toISOString(),
      kind,
      method,
      url,
      status: response.status(),
      requestHeaders: redactHeaders(await request.allHeaders().catch(() => ({}))),
      requestBody: request.postData(),
      responseBody: body,
    });

    if (['write', 'write-misc', 'sdui-write', 'graphql-write'].includes(kind)) {
      const flag = kind === 'sdui-write' ? '\x1b[35mSDUI \x1b[0m' : '\x1b[33mWRITE\x1b[0m';
      console.log(`  ${flag} ${method} ${response.status()}  ${shortUrl(url)}`);
    } else if (verbose) {
      console.log(`  \x1b[90m${kind.padEnd(13)} ${method} ${response.status()}  ${shortUrl(url)}\x1b[0m`);
    }
  });

  context.on('requestfailed', (request) => {
    const kind = classify(request.url(), request.method());
    if (kind === 'skip') return;
    stats.failed += 1;
    sink.write({
      ts: new Date().toISOString(),
      kind: 'failed',
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? null,
    });
  });

  return { stats };
}

/**
 * In hướng dẫn sử dụng ra console sau khi trình duyệt đã mở.
 *
 * @param {string} jsonlPath Đường dẫn file capture JSONL
 * @param {string|null} harPath Đường dẫn file HAR, hoặc null nếu không bật
 * @returns {void}
 */
function printBanner(jsonlPath, harPath) {
  const harLine = harPath
    ? `\n  File HAR     : ${path.relative(ROOT, harPath)}  <-- CHỨA COOKIE THẬT`
    : '';
  console.log(`
================================================================
  ĐANG GHI NETWORK
================================================================
  File capture : ${path.relative(ROOT, jsonlPath)}${harLine}

  THỨ TỰ RẤT QUAN TRỌNG. Marker phải kẹp ĐÚNG lúc bấm Save:

    1. Đăng nhập, vào hồ sơ, mở sẵn form sửa một mục
       (ví dụ: Projects -> bút chì ở một dự án đã có)
    2. Điền/sửa xong nội dung, DỪNG LẠI, chưa bấm Save
    3. Sang terminal gõ:  truoc khi save   + Enter
    4. Sang trình duyệt BẤM SAVE ngay. Đợi modal đóng hẳn.
       -> Console phải hiện dòng WRITE hoặc GQL-W màu.
          Nếu im ru thì báo lại, ĐỪNG thoát.
    5. Sang terminal gõ:  sau khi save     + Enter, rồi  q  + Enter

  Mở form rồi thoát ra mà không Save thì không ghi được gì —
  form trống không sinh request nào cả.

  (Ghi chú bất kỳ + Enter = chèn marker. Cứ 20 giây in một dòng trạng thái.)
================================================================
`);
}

/**
 * Chờ người dùng gõ lệnh trên stdin: ghi chú thì chèn marker, "q" thì dừng.
 *
 * @param {ReturnType<typeof openSink>} sink Nơi ghi marker
 * @returns {Promise<void>} Resolve khi người dùng yêu cầu dừng
 */
function waitForStop(sink) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.on('line', (line) => {
      const text = line.trim();
      if (text.toLowerCase() === 'q') {
        rl.close();
        return;
      }
      if (!text) return;
      sink.write({ ts: new Date().toISOString(), kind: 'marker', note: text });
      console.log(`  \x1b[32mMARKER\x1b[0m ${text}`);
    });
    rl.on('close', resolve);
  });
}

/**
 * In một dòng trạng thái định kỳ để biết script còn sống và đã bắt được gì.
 *
 * Cần thiết vì lúc chưa thao tác gì thì console hoàn toàn im lặng, rất dễ tưởng
 * là hỏng rồi đóng trình duyệt sớm.
 *
 * Có in kèm URL của tab đang mở: nếu URL không đổi trong khi bạn tưởng mình
 * đang thao tác, tức là bạn đang thao tác ở một cửa sổ trình duyệt khác.
 *
 * @param {Record<string, number>} stats Bộ đếm từ attachRecorder
 * @param {import('playwright').BrowserContext} context Context đang chạy
 * @returns {void}
 */
function printHeartbeat(stats, context) {
  const writeTotal = stats.write + stats['write-misc'] + stats['sdui-write'] + stats['graphql-write'];
  const clock = new Date().toLocaleTimeString('vi-VN');
  const note = writeTotal === 0
    ? '\x1b[33mchưa có lời gọi ghi\x1b[0m'
    : `\x1b[32m${writeTotal} lời gọi ghi\x1b[0m`;
  const tabs = context
    .pages()
    .map((p) => p.url().replace(/^https?:\/\/(www\.)?/, ''))
    .join(' | ') || '(không có tab nào)';
  console.log(`  [${clock}] ${sum(stats)} bản ghi | ${note} | tab: ${tabs.slice(0, 80)}`);
}

/**
 * Cộng tổng tất cả bộ đếm trong stats.
 *
 * @param {Record<string, number>} stats Bộ đếm từ attachRecorder
 * @returns {number} Tổng số request đã ghi nhận
 */
function sum(stats) {
  return Object.values(stats).reduce((a, b) => a + b, 0);
}

/**
 * Điểm vào chính: mở trình duyệt, ghi network, chờ người dùng gõ lệnh để dừng.
 * @returns {Promise<void>}
 */
async function main() {
  const { har, all: verbose } = parseArgs();
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonlPath = path.join(CAPTURE_DIR, `linkedin-${stamp}.jsonl`);
  const harPath = har ? path.join(CAPTURE_DIR, `linkedin-${stamp}.har`) : null;
  const sink = openSink(jsonlPath);

  // Persistent context: đăng nhập một lần, các lần chạy sau vẫn còn phiên
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
    // Chặn service worker: nếu LinkedIn gửi request qua worker thì listener ở
    // cấp context có thể không thấy. Chặn đi thì mọi fetch đều đi qua page.
    serviceWorkers: 'block',
    ...(harPath ? { recordHar: { path: harPath, content: 'embed' } } : {}),
  });

  const { stats } = attachRecorder(context, sink, verbose);

  const page = context.pages()[0] ?? (await context.newPage());
  await page
    .goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded' })
    .catch(() => console.log('  (không mở được trang, bạn tự điều hướng cũng được)'));

  printBanner(jsonlPath, harPath);

  const heartbeat = setInterval(() => printHeartbeat(stats, context), 20_000);
  await waitForStop(sink);
  clearInterval(heartbeat);

  await context.close();
  await sink.close();

  const writeTotal = stats.write + stats['write-misc'] + stats['sdui-write'] + stats['graphql-write'];
  console.log(`
  Đã ghi ${sink.count()} bản ghi -> ${path.relative(ROOT, jsonlPath)}
    write         : ${stats.write}   (POST/PUT/DELETE tới voyager REST)
    write-misc    : ${stats['write-misc']}   (POST/PUT/DELETE tới linkedin.com ngoài voyager)
    sdui-write    : ${stats['sdui-write']}   (POST /rsc-action/ — kiến trúc mới)
    sdui-read     : ${stats['sdui-read']}
    graphql-write : ${stats['graphql-write']}   (POST graphql — mutation)
    graphql-read  : ${stats['graphql-read']}   (GET graphql — chỉ đọc)
    other         : ${stats.other}   (GET voyager REST)
    tracking      : ${stats.tracking}
    failed        : ${stats.failed}
`);

  if (writeTotal === 0) {
    console.log(`  \x1b[33mCHÚ Ý: không bắt được lời gọi ghi nào.\x1b[0m
  Phiên này chưa có thao tác sửa hồ sơ thật. Chạy lại và nhớ bấm Save
  trên một mục trong hồ sơ, đồng thời đặt marker trước/sau khi bấm.
`);
  } else {
    console.log(`  Bước tiếp theo:  npm run inspect\n`);
  }
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
