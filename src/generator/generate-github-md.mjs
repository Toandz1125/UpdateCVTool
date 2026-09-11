import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'resume.yaml');
const TEMPLATE_FILE = path.join(ROOT_DIR, 'templates', 'github', 'profile-template.md');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'README.md');

// Badge definitions mapping
const TECH_BADGES = {
  'C#': '![C#](https://img.shields.io/badge/c%23-%23239120.svg?style=for-the-badge&logo=csharp&logoColor=white)',
  'C++': '![C++](https://img.shields.io/badge/c++-%2300599C.svg?style=for-the-badge&logo=c%2B%2B&logoColor=white)',
  'HTML5': '![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)',
  'Python': '![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)',
  'Windows Terminal': '![Windows Terminal](https://img.shields.io/badge/Windows%20Terminal-%234D4D4D.svg?style=for-the-badge&logo=windows-terminal&logoColor=white)',
  'PythonAnywhere': '![PythonAnywhere](https://img.shields.io/badge/pythonanywhere-%232F9FD7.svg?style=for-the-badge&logo=pythonanywhere&logoColor=151515)',
  'GithubPages': '![GithubPages](https://img.shields.io/badge/github%20pages-121013?style=for-the-badge&logo=github&logoColor=white)',
  'Firebase': '![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase)',
  'Cloudflare': '![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white)',
  'Google Cloud': '![Google Cloud](https://img.shields.io/badge/GoogleCloud-%234285F4.svg?style=for-the-badge&logo=google-cloud&logoColor=white)',
  'MySQL': '![MySQL](https://img.shields.io/badge/mysql-4479A1.svg?style=for-the-badge&logo=mysql&logoColor=white)',
  'PostgreSQL': '![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)',
  'Docker': '![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)',
  'Redis cache': '![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)',
  'RabbitMQ': '![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)',
  'Canva': '![Canva](https://img.shields.io/badge/Canva-%2300C4CC.svg?style=for-the-badge&logo=Canva&logoColor=white)',
  'Arduino': '![Arduino](https://img.shields.io/badge/-Arduino-00979D?style=for-the-badge&logo=Arduino&logoColor=white)'
};

function safeReplace(str, pattern, replacement) {
  return str.replace(pattern, () => replacement);
}

export function buildGithubMarkdown() {
  console.log('[GitHub MD Generator] Reading data from resume.yaml...');
  const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
  const data = load(fileContent);

  console.log('[GitHub MD Generator] Reading template...');
  let md = fs.readFileSync(TEMPLATE_FILE, 'utf8');

  // Basics replacements
  const b = data.basics || {};
  md = safeReplace(md, /{{basics\.name}}/g, b.name || '');
  md = safeReplace(md, /{{basics\.email}}/g, b.email || '');
  md = safeReplace(md, /{{basics\.pronouns}}/g, b.pronouns || 'He/Him');
  md = safeReplace(md, /{{basics\.fun_fact}}/g, b.fun_fact || 'I am a Beginner');
  md = safeReplace(md, /{{basics\.about_me}}/g, (b.about_me || '').trim());
  md = safeReplace(md, /{{basics\.github_username}}/g, b.github_username || 'Toandz1125');

  // Socials
  const soc = b.socials || {};
  md = safeReplace(md, /{{basics\.socials\.discord}}/g, soc.discord || '#');
  md = safeReplace(md, /{{basics\.socials\.facebook}}/g, soc.facebook || '#');
  md = safeReplace(md, /{{basics\.socials\.instagram}}/g, soc.instagram || '#');
  md = safeReplace(md, /{{basics\.socials\.tiktok}}/g, soc.tiktok || '#');
  md = safeReplace(md, /{{basics\.socials\.youtube}}/g, soc.youtube || '#');

  // Tech Stack Badges
  // Collect all skills from resume.yaml and match with TECH_BADGES
  const allSkills = [
    ...(data.skills?.programming_languages || []),
    ...(data.skills?.backend_development || []),
    ...(data.skills?.database || []),
    ...(data.skills?.devops || []),
    ...(data.skills?.tools || [])
  ];

  const badges = [];
  for (const skill of allSkills) {
    if (TECH_BADGES[skill] && !badges.includes(TECH_BADGES[skill])) {
      badges.push(TECH_BADGES[skill]);
    }
  }

  // Fallback if badges is empty, provide the original baseline set
  const badgeString = badges.length > 0
    ? badges.join(' ')
    : Object.values(TECH_BADGES).join(' ');

  md = safeReplace(md, /{{TECH_STACK_BADGES}}/g, badgeString);

  // Featured YouTube Videos
  const ytVideos = (data.projects || []).filter(p => p.youtube_id);
  const ytCards = ytVideos.map(v => {
    const title = v.youtube_title || v.name;
    const encodedTitle = encodeURIComponent(title).replace(/%20/g, '+');
    const ts = v.youtube_timestamp || Math.floor(Date.now() / 1000);
    const dur = v.youtube_duration || 120;
    return `[![${title}](https://ytcards.demolab.com/?id=${v.youtube_id}&title=${encodedTitle}&lang=vi&timestamp=${ts}&background_color=%230d1117&title_color=%23ffffff&stats_color=%23dedede&max_title_lines=1&width=250&border_radius=5&duration=${dur} "${title}")](https://www.youtube.com/watch?v=${v.youtube_id})`;
  }).join('\n');

  md = safeReplace(md, /{{FEATURED_YOUTUBE_VIDEOS}}/g, ytCards);

  // Pinned Repos
  const pinnedProjects = (data.projects || []).filter(p => p.pinned_on_github && p.github);
  const pinnedCards = pinnedProjects.map(p => {
    // Extract repo name from URL
    const repoMatch = p.github.match(/github\.com\/[^/]+\/([^/]+)/);
    const repoName = repoMatch ? repoMatch[1] : p.name.replace(/\s+/g, '-');
    return `<a href="${p.github}">\n  <!-- Change the \`github-readme-stats.anuraghazra1.vercel.app\` to \`github-readme-stats.vercel.app\`  -->\n  <img align="center" src="https://github-readme-stats.anuraghazra1.vercel.app/api/pin/?username=${b.github_username || 'Toandz1125'}&repo=${repoName}&theme=highcontrast" />\n</a>\n`;
  }).join('\n');

  md = safeReplace(md, /{{PINNED_REPOS}}/g, pinnedCards);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_MD, md, 'utf8');
  console.log(`[GitHub MD Generator] SUCCESS! Generated: ${OUTPUT_MD}`);

  // Also sync directly to captures/Toandz1125/README.md if directory exists
  const CLONED_REPO_README = path.join(ROOT_DIR, 'captures', 'Toandz1125', 'README.md');
  if (fs.existsSync(path.dirname(CLONED_REPO_README))) {
    fs.writeFileSync(CLONED_REPO_README, md, 'utf8');
    console.log(`[GitHub MD Generator] Synced directly to cloned repo: ${CLONED_REPO_README}`);
  }

  return OUTPUT_MD;
}

// Allow direct execution
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  try {
    buildGithubMarkdown();
  } catch (err) {
    console.error('[GitHub MD Generator] ERROR:', err);
    process.exit(1);
  }
}
