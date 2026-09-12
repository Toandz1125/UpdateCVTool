import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { load, dump } from 'js-yaml';
import { buildPdf, validateResume } from '../generator/generate-pdf.mjs';
import { buildGithubMarkdown } from '../generator/generate-github-md.mjs';
import { syncGithub } from '../adapters/github-adapter.mjs';
import { syncTopCV } from '../adapters/topcv-adapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

const DATA_FILE = path.join(ROOT_DIR, 'data', 'resume.yaml');
const BACKUP_DIR = path.join(ROOT_DIR, 'data', 'backups');
const PUBLIC_DIR = path.join(ROOT_DIR, 'src', 'ui', 'public');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
// Cổng mặc định 3000; bộ kiểm thử đặt UPDATECV_PORT để chạy song song với
// dashboard đang mở mà không tranh cổng
const PORT = Number(process.env.UPDATECV_PORT) || 3000;
// Chỉ nghe trên loopback: nếu bind 0.0.0.0 thì cả máy khác trong mạng LAN
// cũng gọi được /api/save và /api/sync/github
const HOST = '127.0.0.1';
// Giới hạn body để một request lớn không nuốt hết RAM
const MAX_BODY_BYTES = 2 * 1024 * 1024;
// Số bản sao lưu resume.yaml giữ lại (1 bản duy nhất là quá mỏng khi lưu hỏng liên tiếp)
const BACKUP_KEEP = 10;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2'
};

/**
 * Lỗi do client gửi sai, cần trả 400 chứ không phải 500.
 */
class BadRequestError extends Error {}

/**
 * Đọc và parse JSON body, có chặn kích thước.
 *
 * @param {import('node:http').IncomingMessage} req Request đến
 * @returns {Promise<object>} Body đã parse, hoặc {} nếu rỗng
 * @throws {BadRequestError} Nếu body quá lớn hoặc không phải JSON hợp lệ
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let vuotHan = false;
    req.on('data', (chunk) => {
      // Đã vượt hạn thì đọc tiếp cho hết để xả, nhưng không tích luỹ nữa:
      // bộ nhớ vẫn bị chặn mà socket không bị đập.
      if (vuotHan) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        vuotHan = true;
        // KHÔNG gọi req.destroy() ở đây: đập socket thì client chỉ thấy
        // ECONNRESET chứ không nhận được câu trả lời 400 giải thích vì sao,
        // dashboard sẽ báo "lỗi mạng" thay vì "dữ liệu quá lớn".
        reject(new BadRequestError(`Body vượt quá ${MAX_BODY_BYTES} byte.`));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (vuotHan) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new BadRequestError('Body không phải JSON hợp lệ.'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Trả về JSON. Không đặt Access-Control-Allow-Origin: dashboard chạy cùng origin
 * nên không cần CORS, mà mở CORS thì web bất kỳ cũng đọc/ghi được CV.
 *
 * @param {import('node:http').ServerResponse} res Response
 * @param {number} statusCode Mã HTTP
 * @param {object} data Dữ liệu trả về
 * @returns {void}
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

/**
 * Chặn DNS rebinding: chỉ chấp nhận Host trỏ về chính máy này.
 *
 * @param {import('node:http').IncomingMessage} req Request đến
 * @returns {boolean} true nếu Host hợp lệ
 */
function hasAllowedHost(req) {
  const host = (req.headers.host || '').split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

/**
 * Xoay vòng bản sao lưu resume.yaml, giữ lại BACKUP_KEEP bản gần nhất.
 *
 * @param {string} dataFile Đường dẫn resume.yaml hiện tại
 * @param {string} backupDir Thư mục chứa bản sao lưu
 * @returns {string|null} Đường dẫn bản sao vừa tạo, null nếu chưa có file gốc
 */
function rotateBackup(dataFile, backupDir) {
  if (!fs.existsSync(dataFile)) return null;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `resume-${stamp}.yaml`);
  fs.copyFileSync(dataFile, target);

  const old = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith('resume-') && f.endsWith('.yaml'))
    .sort()
    .slice(0, -BACKUP_KEEP);
  for (const f of old) fs.rmSync(path.join(backupDir, f), { force: true });
  return target;
}

export function startServer(autoOpen = true) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Chỉ phục vụ khi truy cập bằng localhost (chặn DNS rebinding từ web ngoài)
    if (!hasAllowedHost(req)) {
      sendJson(res, 403, { success: false, error: 'Chỉ truy cập được qua localhost.' });
      return;
    }

    // --- API ENDPOINTS ---
    if (pathname === '/api/data' && req.method === 'GET') {
      try {
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        const data = load(content);
        sendJson(res, 200, { success: true, data });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === '/api/readme' && req.method === 'GET') {
      try {
        const readmePath = path.join(OUTPUT_DIR, 'README.md');
        if (fs.existsSync(readmePath)) {
          const markdown = fs.readFileSync(readmePath, 'utf8');
          sendJson(res, 200, { success: true, markdown });
        } else {
          sendJson(res, 404, { success: false, error: 'Chưa sinh README.md' });
        }
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === '/api/linkedin' && req.method === 'GET') {
      try {
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        const data = load(content);
        const b = data.basics || {};

        const headline = `${b.title || 'Backend Developer'} | ASP.NET Core, Distributed Systems, Clean Architecture`;
        const about = `${(b.career_objective || '').trim()}\n\n${(b.about_me || '').trim()}`;
        
        const projectsFormatted = (data.projects || []).map(p => {
          return {
            name: p.name,
            subtitle: p.subtitle,
            period: p.period,
            description: `Project: ${p.name} (${p.subtitle})\nPeriod: ${p.period}\n\nRole & Highlights:\n${(p.highlights || []).map(h => `• ${h}`).join('\n')}\n\nTech Stack: ${p.tech_stack}${p.github ? `\nRepository: ${p.github}` : ''}`
          };
        });

        sendJson(res, 200, {
          success: true,
          headline: { text: headline, count: headline.length, max: 220 },
          about: { text: about, count: about.length, max: 2600 },
          projects: projectsFormatted,
          skills: data.skills || {},
          links: {
            edit_intro: 'https://www.linkedin.com/in/me/edit/forms/intro/new/?profileFormEntryPoint=PROFILE_SECTION',
            edit_about: 'https://www.linkedin.com/in/me/edit/forms/summary/new/?profileFormEntryPoint=PROFILE_SECTION',
            add_project: 'https://www.linkedin.com/in/me/details/projects/',
            add_experience: 'https://www.linkedin.com/in/me/details/experience/',
            add_skills: 'https://www.linkedin.com/in/me/details/skills/'
          }
        });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === '/api/save' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (!body.data) {
          sendJson(res, 400, { success: false, error: 'Thiếu trường data trong payload.' });
          return;
        }

        // 1. Kiểm tra dữ liệu TRƯỚC khi động vào file: gửi sai kiểu mà vẫn ghi
        //    thì resume.yaml bị phá ngay cả khi bước biên dịch sau đó báo lỗi
        const errors = validateResume(body.data);
        if (errors.length > 0) {
          sendJson(res, 400, { success: false, error: `Dữ liệu CV không hợp lệ:\n- ${errors.join('\n- ')}` });
          return;
        }

        // 2. Sao lưu (giữ nhiều bản, xoay vòng)
        const backup = rotateBackup(DATA_FILE, BACKUP_DIR);

        // 3. Ghi YAML mới
        const yamlStr = dump(body.data, { lineWidth: -1, noRefs: true, indent: 2 });
        fs.writeFileSync(DATA_FILE, yamlStr, 'utf8');

        // 4. Biên dịch; nếu hỏng thì trả file cũ về để không bỏ lại dữ liệu vỡ
        console.log('[Dashboard Server] Dữ liệu đã lưu, đang tự động biên dịch PDF & README...');
        try {
          await buildPdf();
          buildGithubMarkdown();
        } catch (buildErr) {
          if (backup) fs.copyFileSync(backup, DATA_FILE);
          sendJson(res, 500, {
            success: false,
            error: `Biên dịch thất bại, đã khôi phục resume.yaml về bản trước đó.\n${buildErr.message}`
          });
          return;
        }

        sendJson(res, 200, { success: true, message: 'Đã lưu và biên dịch CV thành công!' });
      } catch (err) {
        console.error('[Dashboard Server] Save error:', err);
        const code = err instanceof BadRequestError ? 400 : 500;
        sendJson(res, code, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === '/api/sync/github' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const raw = body.commitMessage || 'Update CV via Dashboard';
        // Gọn về một dòng, độ dài vừa phải — nội dung được truyền cho git dạng
        // tham số nên không có nguy cơ chèn lệnh, đây chỉ là vệ sinh đầu vào
        const msg = String(raw).replace(/[\r\n]+/g, ' ').trim().slice(0, 200) || 'Update CV via Dashboard';
        syncGithub(msg);
        sendJson(res, 200, { success: true, message: 'Đã commit và đồng bộ sang repo GitHub!' });
      } catch (err) {
        const code = err instanceof BadRequestError ? 400 : 500;
        sendJson(res, code, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === '/api/sync/topcv' && req.method === 'POST') {
      try {
        // Run asynchronously without blocking response
        syncTopCV().catch(e => console.error('[TopCV sync error]', e));
        sendJson(res, 200, { success: true, message: 'Đã khởi chạy trình duyệt TopCV!' });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === '/api/diff' && req.method === 'GET') {
      try {
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        const data = load(content);
        const latestProject = (data.projects || [])[0] || {};
        const formatted = `Project: ${latestProject.name || ''} (${latestProject.subtitle || ''})
Period: ${latestProject.period || ''}
Role & Highlights:
${(latestProject.highlights || []).map(h => `• ${h}`).join('\n')}
Tech Stack: ${latestProject.tech_stack || ''}
${latestProject.github ? `Repository: ${latestProject.github}` : ''}`;

        // Copy to clipboard via clip.exe
        const { spawn } = await import('node:child_process');
        const proc = spawn('clip');
        proc.stdin.write(formatted);
        proc.stdin.end();

        sendJson(res, 200, {
          success: true,
          formatted,
          project: latestProject,
          links: {
            linkedin_projects: 'https://www.linkedin.com/in/me/details/projects/',
            linkedin_experience: 'https://www.linkedin.com/in/me/details/experience/',
            linkedin_skills: 'https://www.linkedin.com/in/me/details/skills/',
            topcv: 'https://www.topcv.vn/quan-ly-cv'
          }
        });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
      }
      return;
    }

    // --- STATIC FILES SERVING ---
    let filePath = '';
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    } else if (pathname === '/preview.html' || pathname === '/cv-style.css'
               || pathname === '/Mai-The-Toan-CV.pdf' || pathname === '/times-faux-bold.woff2') {
      filePath = path.join(OUTPUT_DIR, pathname.slice(1));
    } else if (pathname.startsWith('/svg/')) {
      filePath = path.join(ROOT_DIR, 'captures', 'Toandz1125', pathname);
    } else {
      filePath = path.join(PUBLIC_DIR, pathname.slice(1));
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'X-Frame-Options': 'SAMEORIGIN'
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[UpdateCV Dashboard] Cổng ${PORT} đang bị chiếm. Hãy đóng tiến trình đang dùng cổng này rồi chạy lại.\n`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n===============================================================`);
    console.log(`🚀 [UpdateCV Dashboard] Đang chạy tại: ${url}`);
    console.log(`   Nhấn Ctrl+C để dừng server.`);
    console.log(`===============================================================\n`);

    if (autoOpen) {
      exec(`start ${url}`);
    }
  });

  return server;
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  startServer(true);
}
