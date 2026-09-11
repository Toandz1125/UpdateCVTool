import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { chromium } from 'playwright';
import { ensureFauxBoldFont, fauxBoldCss } from './faux-bold-font.mjs';

// Bám theo vị trí file nguồn thay vì cwd: chạy từ thư mục nào cũng ra cùng kết quả
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'resume.yaml');
const TEMPLATE_HTML = path.join(ROOT_DIR, 'templates', 'topcv', 'cv-template.html');
const TEMPLATE_CSS = path.join(ROOT_DIR, 'templates', 'topcv', 'cv-style.css');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'Mai-The-Toan-CV.pdf');
const TEMP_HTML = path.join(OUTPUT_DIR, 'preview.html');

/**
 * Thay thế chuỗi mà không diễn giải các ký tự đặc biệt của replacement ($&, $1...).
 *
 * @param {string} str Chuỗi gốc
 * @param {RegExp} pattern Mẫu cần tìm
 * @param {string} replacement Chuỗi thay thế, giữ nguyên từng ký tự
 * @returns {string} Chuỗi sau khi thay
 */
function safeReplace(str, pattern, replacement) {
  return str.replace(pattern, () => replacement);
}

/**
 * Escape dữ liệu người dùng trước khi nhúng vào HTML.
 *
 * Ngoài 5 ký tự HTML thông thường còn escape cả dấu `{`: nếu không, một giá trị
 * chứa "{{name}}" sẽ bị các lượt thay thế sau tưởng là placeholder của template.
 * `&#123;` hiển thị ra vẫn đúng là `{`.
 *
 * @param {any} value Giá trị bất kỳ lấy từ resume.yaml
 * @returns {string} Chuỗi đã an toàn để nhúng vào HTML
 */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;');
}

/**
 * Gộp một danh sách thành chuỗi "a, b, c", chịu được cả khi dữ liệu không phải mảng.
 *
 * @param {any} value Mảng, chuỗi, hoặc giá trị rỗng
 * @returns {string} Chuỗi đã escape, ngăn cách bằng dấu phẩy
 */
function escList(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && v !== undefined && v !== '').map(esc).join(', ');
  }
  return esc(value);
}

/**
 * Tách danh sách tác giả thành người đầu tiên và phần còn lại.
 *
 * Bản CV gốc chỉ in đậm tác giả đầu, phần sau để chữ thường — tách ở dấu phẩy
 * đầu tiên để dựng lại đúng kiểu đó.
 *
 * @param {any} authors Chuỗi tác giả đầy đủ
 * @returns {{first: string, rest: string}} Hai phần đã escape
 */
function splitAuthors(authors) {
  const text = (authors === null || authors === undefined) ? '' : String(authors);
  const i = text.indexOf(',');
  if (i === -1) return { first: esc(text), rest: '' };
  return { first: esc(text.slice(0, i)), rest: esc(text.slice(i)) };
}

/**
 * Dựng HTML CV từ template và dữ liệu.
 *
 * Mọi giá trị lấy từ resume.yaml đều đi qua esc()/escList() trước khi nhúng,
 * nên dữ liệu chứa `<`, `&` hay `<script>` không thể phá layout hay chèn mã.
 *
 * @param {string} template Nội dung file cv-template.html
 * @param {object} data Dữ liệu CV đã parse từ YAML
 * @returns {string} HTML hoàn chỉnh
 */
export function renderTemplate(template, data) {
  let html = template;
  const basics = data.basics || {};
  const githubUrl = basics.github_url || '';

  // Basics
  html = safeReplace(html, /{{basics\.name}}/g, esc(basics.name));
  html = safeReplace(html, /{{basics\.title}}/g, esc(basics.title));
  html = safeReplace(html, /{{basics\.phone}}/g, esc(basics.phone));
  html = safeReplace(html, /{{basics\.email}}/g, esc(basics.email));
  html = safeReplace(html, /{{basics\.github_url}}/g, esc(githubUrl));
  html = safeReplace(html, /{{basics\.github_display}}/g, esc(String(githubUrl).replace(/^https?:\/\//, '')));
  html = safeReplace(html, /{{basics\.location}}/g, esc(basics.location));
  html = safeReplace(html, /{{basics\.career_objective}}/g, esc(String(basics.career_objective ?? '').trim()));

  // Education
  const eduBlockRegex = /{{#each_education}}([\s\S]*?){{\/each_education}}/;
  const eduMatch = html.match(eduBlockRegex);
  if (eduMatch) {
    const itemTemplate = eduMatch[1];
    const renderedEdu = (data.education || []).map(edu => {
      let item = itemTemplate;
      item = safeReplace(item, /{{school}}/g, esc(edu.school));
      item = safeReplace(item, /{{period}}/g, esc(edu.period));
      item = safeReplace(item, /{{major}}/g, esc(edu.major));
      item = safeReplace(item, /{{gpa}}/g, esc(edu.gpa));
      return item;
    }).join('\n');
    html = safeReplace(html, eduBlockRegex, renderedEdu);
  }

  // Research and publications
  const resBlockRegex = /{{#each_publication}}([\s\S]*?){{\/each_publication}}/;
  const resMatch = html.match(resBlockRegex);
  if (resMatch) {
    const itemTemplate = resMatch[1];
    const renderedRes = (data.research_and_publications || []).map(res => {
      let item = itemTemplate;
      const authors = splitAuthors(res.authors);
      item = safeReplace(item, /{{authors_first}}/g, authors.first);
      item = safeReplace(item, /{{authors_rest}}/g, authors.rest);
      item = safeReplace(item, /{{authors}}/g, esc(res.authors));
      item = safeReplace(item, /{{title}}/g, esc(res.title));
      item = safeReplace(item, /{{journal}}/g, esc(res.journal));
      item = safeReplace(item, /{{doi}}/g, esc(res.doi));
      item = safeReplace(item, /{{details}}/g, esc(String(res.details ?? '').trim()));

      const rolesRegex = /{{#each_role}}([\s\S]*?){{\/each_role}}/;
      const rolesMatch = item.match(rolesRegex);
      if (rolesMatch) {
        const roleTpl = rolesMatch[1];
        const rolesRendered = (res.roles || []).map(r => safeReplace(roleTpl, /{{this}}/g, esc(r))).join('');
        item = safeReplace(item, rolesRegex, rolesRendered);
      }
      return item;
    }).join('\n');
    html = safeReplace(html, resBlockRegex, renderedRes);
  }

  // Projects
  const projBlockRegex = /{{#each_project}}([\s\S]*?){{\/each_project}}/;
  const projMatch = html.match(projBlockRegex);
  if (projMatch) {
    const itemTemplate = projMatch[1];
    const topCvProjects = (data.projects || []).filter(p => p.show_in_topcv !== false);
    const renderedProjects = topCvProjects.map(proj => {
      let item = itemTemplate;
      item = safeReplace(item, /{{name}}/g, esc(proj.name));
      item = safeReplace(item, /{{subtitle}}/g, esc(proj.subtitle));
      item = safeReplace(item, /{{period}}/g, esc(proj.period));
      item = safeReplace(item, /{{tech_stack}}/g, esc(proj.tech_stack));

      // Highlights
      const hlRegex = /{{#each_highlight}}([\s\S]*?){{\/each_highlight}}/;
      const hlMatch = item.match(hlRegex);
      if (hlMatch) {
        const hlTpl = hlMatch[1];
        const renderedHl = (proj.highlights || []).map(h => safeReplace(hlTpl, /{{this}}/g, esc(h))).join('');
        item = safeReplace(item, hlRegex, renderedHl);
      }

      // Github link
      const ghRegex = /{{#if github}}([\s\S]*?){{\/if}}/;
      if (proj.github) {
        item = item.replace(ghRegex, (match, p1) => safeReplace(p1, /{{github}}/g, esc(proj.github)));
      } else {
        item = safeReplace(item, ghRegex, '');
      }
      return item;
    }).join('\n');
    html = safeReplace(html, projBlockRegex, renderedProjects);
  }

  // Skills
  const s = data.skills || {};
  html = safeReplace(html, /{{skills\.programming_languages}}/g, escList(s.programming_languages));
  html = safeReplace(html, /{{skills\.backend_development}}/g, escList(s.backend_development));
  html = safeReplace(html, /{{skills\.database}}/g, escList(s.database));
  html = safeReplace(html, /{{skills\.authentication_and_security}}/g, escList(s.authentication_and_security));
  html = safeReplace(html, /{{skills\.architecture_and_design}}/g, escList(s.architecture_and_design));
  html = safeReplace(html, /{{skills\.devops}}/g, escList(s.devops));
  html = safeReplace(html, /{{skills\.monitoring}}/g, escList(s.monitoring));
  html = safeReplace(html, /{{skills\.tools}}/g, escList(s.tools));

  // Honors & Awards
  const awardBlockRegex = /{{#each_award}}([\s\S]*?){{\/each_award}}/;
  const awardMatch = html.match(awardBlockRegex);
  if (awardMatch) {
    const itemTemplate = awardMatch[1];
    const renderedAwards = (data.honors_and_awards || []).map(aw => {
      let item = itemTemplate;
      item = safeReplace(item, /{{title}}/g, esc(aw.title));
      item = safeReplace(item, /{{year}}/g, esc(aw.year));
      item = safeReplace(item, /{{detail}}/g, esc(aw.detail));
      return item;
    }).join('\n');
    html = safeReplace(html, awardBlockRegex, renderedAwards);
  }

  // Certificates
  const certBlockRegex = /{{#each_certificate}}([\s\S]*?){{\/each_certificate}}/;
  const certMatch = html.match(certBlockRegex);
  if (certMatch) {
    const itemTemplate = certMatch[1];
    const renderedCerts = (data.certificates || []).map(c => {
      let item = itemTemplate;
      item = safeReplace(item, /{{name}}/g, esc(c.name));
      item = safeReplace(item, /{{year}}/g, esc(c.year));
      return item;
    }).join('\n');
    html = safeReplace(html, certBlockRegex, renderedCerts);
  }

  // Hobbies
  html = safeReplace(html, /{{hobbies}}/g, escList(data.hobbies));

  return html;
}

/**
 * Kiểm tra dữ liệu CV có dùng được không trước khi đem đi render.
 *
 * @param {any} data Kết quả parse từ resume.yaml
 * @returns {string[]} Danh sách lỗi; mảng rỗng nghĩa là hợp lệ
 */
export function validateResume(data) {
  const errors = [];
  if (data === null || data === undefined) {
    errors.push('File resume.yaml rỗng hoặc không parse được.');
    return errors;
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    errors.push(`Dữ liệu CV phải là một object, nhận được: ${Array.isArray(data) ? 'array' : typeof data}.`);
    return errors;
  }
  if (!data.basics || typeof data.basics !== 'object' || Array.isArray(data.basics)) {
    errors.push('Thiếu mục "basics" (hoặc không phải object).');
  } else if (!data.basics.name) {
    errors.push('Thiếu "basics.name".');
  }
  for (const key of ['education', 'research_and_publications', 'projects', 'honors_and_awards', 'certificates', 'hobbies']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      errors.push(`Mục "${key}" phải là danh sách, nhận được: ${typeof data[key]}.`);
    }
  }
  if (data.skills !== undefined && (typeof data.skills !== 'object' || Array.isArray(data.skills))) {
    errors.push('Mục "skills" phải là object.');
  }
  return errors;
}

/**
 * Đọc resume.yaml, dựng HTML rồi xuất ra PDF A4.
 *
 * @returns {Promise<string>} Đường dẫn file PDF vừa tạo
 * @throws {Error} Nếu YAML hỏng hoặc dữ liệu không hợp lệ
 */
export async function buildPdf() {
  console.log('[PDF Generator] Reading data from resume.yaml...');
  const fileContent = fs.readFileSync(DATA_FILE, 'utf8');

  let data;
  try {
    data = load(fileContent);
  } catch (err) {
    throw new Error(`resume.yaml không phải YAML hợp lệ: ${err.message}`);
  }

  const errors = validateResume(data);
  if (errors.length > 0) {
    throw new Error(`Dữ liệu CV không hợp lệ:\n  - ${errors.join('\n  - ')}`);
  }

  console.log('[PDF Generator] Compiling HTML template...');
  const templateHtml = fs.readFileSync(TEMPLATE_HTML, 'utf8');
  const renderedHtml = renderTemplate(templateHtml, data);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Chữ đậm của bản gốc là face Regular được tô dày nét, không phải face Bold.
  // Nếu dựng được font tô đậm thì nối thêm khối CSS dùng nó; không dựng được
  // (thiếu Python/fontTools/times.ttf) thì giữ nguyên face Bold thật.
  const hasFauxBold = ensureFauxBoldFont(ROOT_DIR, OUTPUT_DIR, DATA_FILE);
  const css = fs.readFileSync(TEMPLATE_CSS, 'utf8') + (hasFauxBold ? fauxBoldCss() : '');
  console.log(hasFauxBold
    ? '[PDF Generator] Chữ đậm: dùng font Times tô đậm sẵn'
    : '[PDF Generator] Chữ đậm: dùng face Bold thật (không dựng được font tô đậm)');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'cv-style.css'), css, 'utf8');
  fs.writeFileSync(TEMP_HTML, renderedHtml, 'utf8');

  console.log('[PDF Generator] Launching Playwright Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const fileUrl = `file:///${path.resolve(TEMP_HTML).replace(/\\/g, '/')}`;
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  console.log('[PDF Generator] Rendering A4 PDF...');
  // Không truyền margin ở đây: preferCSSPageSize cho @page trong CSS quyết định,
  // truyền thêm sẽ thành hai nguồn lề mâu thuẫn nhau (7mm CSS vs 8mm JS).
  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true
  });

  await browser.close();
  console.log(`[PDF Generator] SUCCESS! Generated: ${OUTPUT_PDF}`);
  return OUTPUT_PDF;
}

// Allow direct execution
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  buildPdf().catch(err => {
    console.error('[PDF Generator] ERROR:', err);
    process.exit(1);
  });
}
