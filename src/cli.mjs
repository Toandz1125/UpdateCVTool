import { buildPdf } from './generator/generate-pdf.mjs';
import { buildGithubMarkdown } from './generator/generate-github-md.mjs';
import { syncGithub } from './adapters/github-adapter.mjs';
import { syncTopCV } from './adapters/topcv-adapter.mjs';
import { showDiffAndAssist } from './adapters/diff-helper.mjs';
import { startServer } from './ui/server.mjs';

const command = process.argv[2] || 'help';

async function main() {
  switch (command) {
    case 'ui':
    case 'start':
    case 'dashboard':
      startServer(true);
      break;

    case 'build':
    case 'all':
      console.log('🚀 [UpdateCV] Đang biên dịch cả PDF và GitHub Profile...');
      await buildPdf();
      buildGithubMarkdown();
      console.log('\n✨ Đã hoàn thành biên dịch! Các file nằm trong thư mục: output/');
      break;

    case 'build:pdf':
      await buildPdf();
      break;

    case 'build:github':
      buildGithubMarkdown();
      break;

    case 'sync:github':
      syncGithub(process.argv[3]);
      break;

    case 'sync:topcv':
      await syncTopCV();
      break;

    case 'diff':
    case 'assist':
      await showDiffAndAssist();
      break;

    default:
      console.log(`
===============================================================
                     UpdateCV - CLI HELPER                     
===============================================================
Sử dụng:
  npm run ui              Mở Giao diện Web Dashboard (http://localhost:3000)
  npm run build           Biên dịch cả CV PDF (TopCV) và README.md (GitHub)
  npm run build:pdf       Chỉ sinh file PDF A4 (output/Mai-The-Toan-CV.pdf)
  npm run build:github    Chỉ sinh GitHub README (output/README.md)
  npm run sync:github     Đồng bộ Markdown và PDF sang repo GitHub Profile
  npm run sync:topcv      Mở Playwright tự động tải PDF mới lên TopCV
  npm run diff            Xem data mới thêm vào và copy text chuẩn vào Clipboard
===============================================================
`);
      break;
  }
}

main().catch(err => {
  console.error('[UpdateCV CLI] Error:', err);
  process.exit(1);
});
