import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildGithubMarkdown } from '../generator/generate-github-md.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_PDF = path.join(ROOT_DIR, 'output', 'Mai-The-Toan-CV.pdf');
const CLONED_REPO = path.join(ROOT_DIR, 'captures', 'Toandz1125');

export function syncGithub(commitMessage = 'Update CV and Profile README') {
  console.log('[GitHub Adapter] Starting GitHub sync...');

  // 1. Build latest markdown
  const mdPath = buildGithubMarkdown();

  if (!fs.existsSync(CLONED_REPO)) {
    console.log(`[GitHub Adapter] Cloned repo not found at ${CLONED_REPO}. Please clone first.`);
    return;
  }

  // 2. Copy latest CV.pdf into the repo as well (for direct download)
  if (fs.existsSync(OUTPUT_PDF)) {
    const targetPdf = path.join(CLONED_REPO, 'Mai-The-Toan-CV.pdf');
    fs.copyFileSync(OUTPUT_PDF, targetPdf);
    console.log(`[GitHub Adapter] Copied CV PDF to repo: ${targetPdf}`);
  }

  // 3. Git status & commit
  try {
    // execFileSync truyền tham số dạng mảng nên nội dung commit message không
    // bao giờ được shell diễn giải — chặn command injection qua /api/sync/github.
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: CLONED_REPO, encoding: 'utf8' }).trim();
    if (!status) {
      console.log('[GitHub Adapter] No changes detected in GitHub profile repository.');
      return;
    }

    console.log('[GitHub Adapter] Changes detected:\n' + status);
    execFileSync('git', ['add', 'README.md'], { cwd: CLONED_REPO, stdio: 'inherit' });
    if (fs.existsSync(path.join(CLONED_REPO, 'Mai-The-Toan-CV.pdf'))) {
      execFileSync('git', ['add', 'Mai-The-Toan-CV.pdf'], { cwd: CLONED_REPO, stdio: 'inherit' });
    }

    execFileSync('git', ['commit', '-m', String(commitMessage)], { cwd: CLONED_REPO, stdio: 'inherit' });
    console.log(`[GitHub Adapter] Committed changes: "${commitMessage}"`);

    console.log('[GitHub Adapter] Ready to push! To push upstream to GitHub, run:');
    console.log(`                 git -C "${CLONED_REPO}" push origin main`);
  } catch (err) {
    console.error('[GitHub Adapter] Git command error:', err.message);
  }
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const msg = process.argv[2] || 'Update CV and Profile README';
  syncGithub(msg);
}
