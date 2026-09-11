import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { load } from 'js-yaml';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'resume.yaml');

function copyToClipboard(text) {
  return new Promise(resolve => {
    try {
      const proc = spawn('clip');
      proc.stdin.write(text);
      proc.stdin.end();
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export async function showDiffAndAssist() {
  console.log('===============================================================');
  console.log('       UpdateCV - DIFF & INCREMENTAL UPDATE ASSISTANT          ');
  console.log('===============================================================\n');

  // 1. Check Git diff for data/resume.yaml
  try {
    // cwd phải là gốc dự án; và thư mục này có thể chưa phải git repo,
    // khi đó git báo lỗi và nhánh catch bên dưới xử lý
    const gitDiff = execSync('git diff -- "data/resume.yaml"', {
      cwd: ROOT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (gitDiff) {
      console.log('🔍 CÁC DATA CON MỚI ĐƯỢC THÊM VÀO resume.yaml:');
      console.log('---------------------------------------------------------------');
      console.log(gitDiff);
      console.log('---------------------------------------------------------------\n');
    } else {
      console.log('ℹ️  resume.yaml hiện đang đồng bộ với git.');
    }
  } catch {
    // If not tracked by git yet
  }

  // 2. Read resume.yaml
  const content = fs.readFileSync(DATA_FILE, 'utf8');
  const data = load(content);

  const projects = data.projects || [];
  if (projects.length === 0) {
    console.log('Chưa có dự án nào trong data/resume.yaml');
    return;
  }

  const latestProject = projects[0];
  console.log(`📌 DỰ ÁN MỚI NHẤT TRONG HỒ SƠ: "${latestProject.name}"`);
  console.log(`   Subtitle:   ${latestProject.subtitle}`);
  console.log(`   Thời gian:  ${latestProject.period}`);
  console.log(`   Tech Stack: ${latestProject.tech_stack}`);
  console.log(`   Github:     ${latestProject.github || 'N/A'}`);

  const formattedText = `Project: ${latestProject.name} (${latestProject.subtitle})
Period: ${latestProject.period}
Role & Highlights:
${(latestProject.highlights || []).map(h => `• ${h}`).join('\n')}
Tech Stack: ${latestProject.tech_stack}
${latestProject.github ? `Repository: ${latestProject.github}` : ''}`;

  console.log('\n📋 NỘI DUNG ĐÃ ĐƯỢC FORMAT CHUẨN ĐỂ CẬP NHẬT:');
  console.log('---------------------------------------------------------------');
  console.log(formattedText);
  console.log('---------------------------------------------------------------');

  const copied = await copyToClipboard(formattedText);
  if (copied) {
    console.log('✅ ĐÃ TỰ ĐỘNG COPY TOÀN BỘ ĐOẠN TEXT TRÊN VÀO CLIPBOARD!');
  }

  console.log('\n🔗 LINK MỞ NHANH TRANG CẬP NHẬT:');
  console.log('   • Thêm Project vào LinkedIn:    https://www.linkedin.com/in/me/details/projects/');
  console.log('   • Thêm Experience vào LinkedIn: https://www.linkedin.com/in/me/details/experience/');
  console.log('   • Thêm Kỹ năng vào LinkedIn:    https://www.linkedin.com/in/me/details/skills/');
  console.log('   • Quản lý CV trên TopCV:        https://www.topcv.vn/quan-ly-cv\n');
  console.log('👉 Chỉ cần nhấn Ctrl+V vào ô Description trên trình duyệt để lưu lại.');
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  showDiffAndAssist();
}
