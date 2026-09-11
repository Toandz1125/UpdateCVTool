import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { chromium } from 'playwright';
import { buildPdf } from '../generator/generate-pdf.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_PDF = path.join(ROOT_DIR, 'output', 'Mai-The-Toan-CV.pdf');
const USER_DATA_DIR = path.join(ROOT_DIR, '.browser-profile', 'topcv');

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function syncTopCV() {
  console.log('[TopCV Adapter] Checking latest CV PDF...');
  if (!fs.existsSync(OUTPUT_PDF)) {
    console.log('[TopCV Adapter] PDF not found. Building PDF now...');
    await buildPdf();
  }

  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  console.log('[TopCV Adapter] Launching browser with persistent profile at:', USER_DATA_DIR);
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('[TopCV Adapter] Navigating to TopCV CV management page...');
  await page.goto('https://www.topcv.vn/quan-ly-cv', { waitUntil: 'domcontentloaded' });

  // Check if we are redirected to login
  const url = page.url();
  if (url.includes('login') || url.includes('dang-nhap')) {
    console.log('\n[TopCV Adapter] NOTICE: You need to log in to TopCV.');
    console.log('Please log in manually in the opened browser window (solve any CAPTCHA if needed).');
    await ask('Once you are logged in and see the CV management dashboard, press ENTER here to continue...');
  }

  console.log('[TopCV Adapter] Ready to upload CV file: ' + OUTPUT_PDF);
  console.log('[TopCV Adapter] You can now select "Tải lên CV" or drag & drop the generated PDF.');
  console.log('File path is copied for convenience: ' + OUTPUT_PDF);

  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    try {
      await fileInput.setInputFiles(OUTPUT_PDF);
      console.log('[TopCV Adapter] Successfully set file input with latest PDF!');
    } catch (err) {
      console.log('[TopCV Adapter] Note: File input was not immediately interactive:', err.message);
    }
  }

  console.log('\n[TopCV Adapter] Trình duyệt đang mở để bạn kiểm tra và lưu lại.');
  await ask('Bấm ENTER tại đây khi bạn đã hoàn tất để đóng trình duyệt...');

  await context.close();
  console.log('[TopCV Adapter] Done!');
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  syncTopCV().catch(err => {
    console.error('[TopCV Adapter] ERROR:', err);
    process.exit(1);
  });
}
