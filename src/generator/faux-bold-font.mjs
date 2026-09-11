import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Tên file font tô đậm nằm cạnh preview.html trong output/
export const FAUX_BOLD_FILE = 'times-faux-bold.woff2';

// Danh sách phần tử được tô đậm. Phải khớp với danh sách cùng tên trong
// templates/topcv/cv-style.css (khối "CHỮ ĐẬM"); sửa một chỗ thì sửa cả hai.
const BOLD_SELECTORS = [
  '.cv-name',
  '.section-title',
  '.project-sub',
  '.pub-author-first',
  '.edu-item .item-title',
  '.project-item .item-title'
].join(',\n');

/**
 * Dựng lại file font tô đậm nếu chưa có hoặc đã cũ hơn nguồn.
 *
 * Gọi script Python `tools/build-faux-bold-font.py`. Mọi lỗi (thiếu Python,
 * thiếu fontTools, không có times.ttf - ví dụ khi chạy trên máy không phải
 * Windows) đều được nuốt và trả về false, để bản build vẫn chạy được và tự lùi
 * về face Bold thật.
 *
 * @param {string} rootDir Thư mục gốc dự án
 * @param {string} outputDir Thư mục output, nơi đặt file font
 * @param {string} resumePath Đường dẫn data/resume.yaml, dùng để chọn ký tự
 * @returns {boolean} true nếu file font đã sẵn sàng dùng
 */
export function ensureFauxBoldFont(rootDir, outputDir, resumePath) {
  const script = path.join(rootDir, 'tools', 'build-faux-bold-font.py');
  const fontPath = path.join(outputDir, FAUX_BOLD_FILE);

  // Chỉ dựng lại khi cần: dựng font mất vài giây, không nên chạy mỗi lần build.
  if (fs.existsSync(fontPath) && fs.existsSync(script) && fs.existsSync(resumePath)) {
    const fontTime = fs.statSync(fontPath).mtimeMs;
    const srcTime = Math.max(fs.statSync(script).mtimeMs, fs.statSync(resumePath).mtimeMs);
    if (fontTime >= srcTime) return true;
  }
  if (!fs.existsSync(script)) return false;

  for (const exe of ['python', 'python3', 'py']) {
    try {
      execFileSync(exe, [script, fontPath, resumePath], { stdio: 'pipe', timeout: 120000 });
      return fs.existsSync(fontPath);
    } catch {
      // Thử trình thông dịch tiếp theo
    }
  }
  return false;
}

/**
 * Sinh khối CSS ghi đè để dùng font tô đậm thay cho face Bold thật.
 *
 * Khối này được nối vào CUỐI file CSS sinh ra nên thắng luật `font-weight: 700`
 * trong template. Nhờ vậy template vẫn dùng được độc lập: thiếu font thì chữ
 * vẫn đậm, chỉ là đậm bằng face Bold.
 *
 * @returns {string} đoạn CSS cần nối vào cuối cv-style.css
 */
export function fauxBoldCss() {
  return `
/* ==========================================================================
   Sinh tự động lúc build bởi src/generator/faux-bold-font.mjs - đừng sửa tay.
   Thay face Bold thật bằng face Times đã tô dày nét sẵn, để khớp đúng kiểu chữ
   đậm của bản gốc (bản gốc không nhúng face Bold nào). Xem README, mục
   "Chữ đậm".
   ========================================================================== */
@font-face {
  font-family: "TimesFauxBold";
  src: url("${FAUX_BOLD_FILE}") format("woff2");
  font-weight: 400;
  font-style: normal;
}

${BOLD_SELECTORS} {
  font-family: "TimesFauxBold", "Times New Roman", Times, serif;
  font-weight: 400;
}
`;
}
