let currentData = null;
let editState = { isEditing: false, type: null, index: -1 };
let modalResolve = null;
let currentPlatformTab = 'editor';

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

// Toast Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Platform Navigation Tabs
function switchPlatformTab(tab) {
  currentPlatformTab = tab;

  // Toggle active tab buttons
  document.querySelectorAll('.platform-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));

  if (tab === 'editor') {
    document.getElementById('tabNavEditor').classList.add('active');
    document.getElementById('viewEditor').classList.add('active');
  } else if (tab === 'topcv') {
    document.getElementById('tabNavTopCV').classList.add('active');
    document.getElementById('viewTopCV').classList.add('active');
    // Nạp lại khung xem trước. Dùng chính file PDF chứ không phải preview.html
    // để thấy đúng cách chia 2 trang A4; tham số t chặn bộ nhớ đệm.
    const iframe = document.getElementById('topcvIframe');
    iframe.src = `/Mai-The-Toan-CV.pdf?t=${Date.now()}#zoom=100`;
  } else if (tab === 'github') {
    document.getElementById('tabNavGitHub').classList.add('active');
    document.getElementById('viewGitHub').classList.add('active');
    loadGithubReadme();
  } else if (tab === 'linkedin') {
    document.getElementById('tabNavLinkedIn').classList.add('active');
    document.getElementById('viewLinkedIn').classList.add('active');
    loadLinkedInAssistant();
  }
}

// Confirmation Modal Guard (Cảnh báo 2 bước)
function showConfirmModal({ icon = '⚠️', title = 'Xác nhận thao tác', message = '', isDanger = false }) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    document.getElementById('modalIcon').innerText = icon;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerText = message;

    const btnConfirm = document.getElementById('btnModalConfirm');
    if (isDanger) {
      btnConfirm.className = 'btn btn-danger';
      btnConfirm.innerText = 'Xác nhận xóa';
    } else {
      btnConfirm.className = 'btn btn-primary';
      btnConfirm.innerText = 'Tiếp tục sửa';
    }

    document.getElementById('confirmModal').classList.add('active');
  });
}

function closeConfirmModal(confirmed) {
  document.getElementById('confirmModal').classList.remove('active');
  if (modalResolve) {
    modalResolve(confirmed);
    modalResolve = null;
  }
}

// Form Tabs (Inside Editor View)
function switchFormTab(tab) {
  if (editState.isEditing) {
    cancelEditMode();
  }

  document.querySelectorAll('.form-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('formProject').style.display = 'none';
  document.getElementById('formSkill').style.display = 'none';
  document.getElementById('formCert').style.display = 'none';

  if (tab === 'project') {
    event.target.classList.add('active');
    document.getElementById('formProject').style.display = 'block';
  } else if (tab === 'skill') {
    event.target.classList.add('active');
    document.getElementById('formSkill').style.display = 'block';
  } else if (tab === 'cert') {
    event.target.classList.add('active');
    document.getElementById('formCert').style.display = 'block';
  }
}

// Load Data from Backend
async function loadData() {
  try {
    const res = await fetch('/api/data');
    const json = await res.json();
    if (json.success && json.data) {
      currentData = json.data;
      renderExistingData();
    } else {
      showToast(json.error || 'Lỗi nạp dữ liệu', 'error');
    }
  } catch (err) {
    showToast('Không thể kết nối máy chủ: ' + err.message, 'error');
  }
}

// Render Left Panel Items
function renderExistingData() {
  const container = document.getElementById('existingDataContainer');
  if (!currentData) return;

  let html = '';

  // 1. Projects
  html += `
    <div class="section-group">
      <div class="section-group-title">🚀 Projects (${(currentData.projects || []).length})</div>
  `;

  (currentData.projects || []).forEach((proj, idx) => {
    html += `
      <div class="item-card">
        <div class="item-card-header">
          <div>
            <div class="item-card-title">${escapeHtml(proj.name)}</div>
            <div class="item-card-subtitle">${escapeHtml(proj.subtitle || '')}</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-edit btn-sm" onclick="promptEditProject(${idx})">✏️ Sửa</button>
            <button class="btn btn-danger btn-sm" onclick="promptDeleteProject(${idx})">🗑️ Xóa</button>
          </div>
        </div>
        <div class="item-card-meta">📅 ${escapeHtml(proj.period || '')}</div>
        <div class="item-card-meta">🛠️ ${escapeHtml(proj.tech_stack || '')}</div>
        <ul class="item-card-highlights">
          ${(proj.highlights || []).map(h => `<li>${escapeHtml(h)}</li>`).join('')}
        </ul>
        ${proj.github ? `<div class="item-card-meta">🔗 <a href="${escapeHtml(proj.github)}" target="_blank" style="color: var(--primary);">${escapeHtml(proj.github)}</a></div>` : ''}
      </div>
    `;
  });
  html += `</div>`;

  // 2. Skills
  html += `
    <div class="section-group">
      <div class="section-group-title">💻 Skills & Technologies</div>
      <div class="item-card">
  `;
  const s = currentData.skills || {};
  for (const [key, list] of Object.entries(s)) {
    const title = key.replace(/_/g, ' ').toUpperCase();
    html += `
      <div style="margin-bottom: 8px;">
        <div style="font-size: 11.5px; font-weight: 600; color: var(--text-muted);">${title}:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px;">
          ${(list || []).map((sk, skIdx) => `
            <span class="badge badge-tech">
              ${escapeHtml(sk)}
              <span style="cursor: pointer; opacity: 0.6; margin-left: 3px;" onclick="promptDeleteSkill('${key}', ${skIdx})" title="Xóa">✕</span>
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }
  html += `</div></div>`;

  // 3. Research & Publications
  if ((currentData.research_and_publications || []).length > 0) {
    html += `
      <div class="section-group">
        <div class="section-group-title">📚 Research & Publications</div>
    `;
    currentData.research_and_publications.forEach(res => {
      html += `
        <div class="item-card">
          <div class="item-card-title">${escapeHtml(res.title)}</div>
          <div class="item-card-meta">👤 ${escapeHtml(res.authors)}</div>
          <div class="item-card-meta">📖 ${escapeHtml(res.journal)}</div>
          <div class="item-card-meta" style="margin-top: 6px; font-size: 12px; color: #cbd5e1;">${escapeHtml(res.details || '')}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  // 4. Certificates & Awards
  html += `
    <div class="section-group">
      <div class="section-group-title">🏆 Certificates & Honors</div>
      <div class="item-card">
        ${(currentData.certificates || []).map((c, cIdx) => `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span>📜 <strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.year)})</span>
            <button class="btn btn-danger btn-sm" style="padding: 2px 6px; font-size: 11px;" onclick="promptDeleteCert(${cIdx})">🗑️</button>
          </div>
        `).join('')}
        ${(currentData.honors_and_awards || []).map(a => `
          <div style="margin-top: 6px; font-size: 12px; color: var(--text-muted);">
            🥇 <strong>${escapeHtml(a.title)}</strong> (${escapeHtml(a.year)}) - ${escapeHtml(a.detail)}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// Project Edit & Delete Guards
async function promptEditProject(index) {
  const proj = currentData.projects[index];
  const confirmed = await showConfirmModal({
    icon: '⚠️',
    title: 'Xác nhận chỉnh sửa dự án',
    message: `Bạn đang chọn chỉnh sửa dự án: "${proj.name}". Bạn có chắc chắn muốn thay đổi nội dung mục này không?`,
    isDanger: false
  });

  if (!confirmed) return;

  // Switch to editor tab if not already there
  switchPlatformTab('editor');

  editState = { isEditing: true, type: 'project', index };

  document.getElementById('formPanelTitle').innerHTML = `<span>✏️</span> <span>Chỉnh Sửa Dự Án: ${escapeHtml(proj.name)}</span>`;
  document.getElementById('btnCancelEdit').style.display = 'inline-flex';
  document.getElementById('formTabs').style.display = 'none';

  // Fill Inputs
  document.getElementById('projName').value = proj.name || '';
  document.getElementById('projSubtitle').value = proj.subtitle || '';
  document.getElementById('projPeriod').value = proj.period || '';
  document.getElementById('projHighlights').value = (proj.highlights || []).join('\n');
  document.getElementById('projTechStack').value = proj.tech_stack || '';
  document.getElementById('projGithub').value = proj.github || '';
  document.getElementById('projPinned').checked = !!proj.pinned_on_github;

  document.getElementById('formProject').style.display = 'block';
  document.getElementById('formSkill').style.display = 'none';
  document.getElementById('formCert').style.display = 'none';

  document.querySelector('#formProject').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditMode() {
  editState = { isEditing: false, type: null, index: -1 };
  document.getElementById('formPanelTitle').innerHTML = `<span>➕</span> <span>Thêm Dữ Liệu Con Mới</span>`;
  document.getElementById('btnCancelEdit').style.display = 'none';
  document.getElementById('formTabs').style.display = 'flex';
  document.getElementById('formProject').reset();
}

async function promptDeleteProject(index) {
  const proj = currentData.projects[index];
  const confirmed = await showConfirmModal({
    icon: '🚨',
    title: 'CẢNH BÁO NGUY HIỂM',
    message: `Hành động này sẽ XÓA VĨNH VIỄN dự án "${proj.name}" khỏi hồ sơ CV của bạn. Bạn có chắc chắn không?`,
    isDanger: true
  });

  if (!confirmed) return;

  currentData.projects.splice(index, 1);
  await saveCurrentData('Đã xóa dự án thành công!');
}

async function promptDeleteSkill(group, index) {
  const skill = currentData.skills[group][index];
  const confirmed = await showConfirmModal({
    icon: '⚠️',
    title: 'Xác nhận xóa kỹ năng',
    message: `Bạn có chắc chắn muốn xóa kỹ năng "${skill}" khỏi nhóm ${group}?`,
    isDanger: true
  });

  if (!confirmed) return;

  currentData.skills[group].splice(index, 1);
  await saveCurrentData(`Đã xóa kỹ năng "${skill}"!`);
}

async function promptDeleteCert(index) {
  const cert = currentData.certificates[index];
  const confirmed = await showConfirmModal({
    icon: '⚠️',
    title: 'Xác nhận xóa chứng chỉ',
    message: `Bạn có chắc chắn muốn xóa chứng chỉ "${cert.name}"?`,
    isDanger: true
  });

  if (!confirmed) return;

  currentData.certificates.splice(index, 1);
  await saveCurrentData('Đã xóa chứng chỉ thành công!');
}

// Form Handlers
async function handleSaveProject(e) {
  e.preventDefault();

  const name = document.getElementById('projName').value.trim();
  const subtitle = document.getElementById('projSubtitle').value.trim();
  const period = document.getElementById('projPeriod').value.trim();
  const highlightsRaw = document.getElementById('projHighlights').value.trim();
  const highlights = highlightsRaw.split('\n').map(h => h.trim()).filter(Boolean);
  const tech_stack = document.getElementById('projTechStack').value.trim();
  const github = document.getElementById('projGithub').value.trim();
  const pinned_on_github = document.getElementById('projPinned').checked;

  const projectObj = {
    name,
    subtitle: subtitle || name.toUpperCase(),
    period,
    highlights,
    tech_stack,
    github: github || undefined,
    pinned_on_github
  };

  if (editState.isEditing && editState.type === 'project') {
    currentData.projects[editState.index] = projectObj;
    cancelEditMode();
    await saveCurrentData('Đã cập nhật dự án thành công!');
  } else {
    if (!currentData.projects) currentData.projects = [];
    currentData.projects.unshift(projectObj);
    document.getElementById('formProject').reset();
    await saveCurrentData('Đã thêm dự án mới thành công!');
  }
}

async function handleSaveSkill(e) {
  e.preventDefault();
  const group = document.getElementById('skillGroup').value;
  const name = document.getElementById('skillName').value.trim();

  if (!currentData.skills) currentData.skills = {};
  if (!currentData.skills[group]) currentData.skills[group] = [];

  if (currentData.skills[group].includes(name)) {
    showToast('Kỹ năng này đã tồn tại trong nhóm!', 'info');
    return;
  }

  currentData.skills[group].push(name);
  document.getElementById('skillName').value = '';
  await saveCurrentData(`Đã thêm kỹ năng "${name}" thành công!`);
}

async function handleSaveCert(e) {
  e.preventDefault();
  const name = document.getElementById('certName').value.trim();
  const year = document.getElementById('certYear').value.trim();

  if (!currentData.certificates) currentData.certificates = [];
  currentData.certificates.push({ name, year });

  document.getElementById('certName').value = '';
  document.getElementById('certYear').value = '';
  await saveCurrentData('Đã thêm chứng chỉ thành công!');
}

// Backend Save Pipeline
async function saveCurrentData(successMsg) {
  showToast('Đang lưu và tự động biên dịch sang TopCV, GitHub...', 'info');

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentData })
    });
    const json = await res.json();

    if (json.success) {
      showToast(successMsg || 'Lưu & Biên dịch thành công!', 'success');
      renderExistingData();
      if (currentPlatformTab === 'github') loadGithubReadme();
      if (currentPlatformTab === 'linkedin') loadLinkedInAssistant();
    } else {
      showToast(json.error || 'Lỗi khi lưu dữ liệu', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  }
}

// ==========================================
// TOPCV PLATFORM TAB ACTIONS
// ==========================================
function openPdfTab() {
  window.open(`/Mai-The-Toan-CV.pdf?t=${Date.now()}`, '_blank');
}

async function triggerTopCVSync() {
  showToast('Đang khởi chạy Playwright mở TopCV...', 'info');
  try {
    const res = await fetch('/api/sync/topcv', { method: 'POST' });
    const json = await res.json();
    showToast(json.message, 'info');
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

// ==========================================
// GITHUB PLATFORM TAB ACTIONS
// ==========================================
let githubViewMode = 'rendered';

function setGithubViewMode(mode) {
  githubViewMode = mode;
  const btnRendered = document.getElementById('btnGhRendered');
  const btnRaw = document.getElementById('btnGhRaw');
  const renderedContainer = document.getElementById('githubRenderedPreview');
  const rawContainer = document.getElementById('githubMarkdownContent');

  if (mode === 'rendered') {
    btnRendered.className = 'btn btn-sm btn-primary';
    btnRaw.className = 'btn btn-sm btn-secondary';
    renderedContainer.style.display = 'block';
    rawContainer.style.display = 'none';
  } else {
    btnRendered.className = 'btn btn-sm btn-secondary';
    btnRaw.className = 'btn btn-sm btn-primary';
    renderedContainer.style.display = 'none';
    rawContainer.style.display = 'block';
  }
}

async function loadGithubReadme() {
  const rawContainer = document.getElementById('githubMarkdownContent');
  const renderedContainer = document.getElementById('githubRenderedPreview');

  rawContainer.innerText = 'Đang tải output/README.md...';
  renderedContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Đang dựng giao diện GitHub Profile...</div>';

  try {
    const res = await fetch('/api/readme');
    const json = await res.json();
    if (json.success && json.markdown) {
      rawContainer.innerText = json.markdown;

      // Render rich HTML using marked.js
      if (window.marked && window.marked.parse) {
        // Emulate GitHub's automatic server-side URL rewrite for internal image /blob/ links
        const previewMarkdown = json.markdown.replace(
          /https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^"'\s)]+\.svg)/g,
          'https://raw.githubusercontent.com/$1/$2'
        );
        renderedContainer.innerHTML = window.marked.parse(previewMarkdown);
        renderedContainer.querySelectorAll('img').forEach(img => {
          img.onerror = () => {
            img.style.display = 'none';
          };
        });
      } else {
        renderedContainer.innerHTML = `<pre class="markdown-raw">${escapeHtml(json.markdown)}</pre>`;
      }
    } else {
      rawContainer.innerText = json.error || 'Chưa tìm thấy file output/README.md';
      renderedContainer.innerHTML = `<div style="color: var(--danger);">${json.error || 'Chưa tìm thấy file README'}</div>`;
    }
  } catch (err) {
    rawContainer.innerText = 'Lỗi nạp README: ' + err.message;
    renderedContainer.innerHTML = `<div style="color: var(--danger);">Lỗi: ${err.message}</div>`;
  }
}

async function triggerGithubSync() {
  showToast('Đang commit & đồng bộ sang repo GitHub Profile...', 'info');
  try {
    const res = await fetch('/api/sync/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitMessage: 'Update CV and Profile via Dashboard' })
    });
    const json = await res.json();
    if (json.success) {
      showToast(json.message, 'success');
    } else {
      showToast(json.error || 'Lỗi đồng bộ GitHub', 'error');
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

// ==========================================
// LINKEDIN PLATFORM TAB ACTIONS
// ==========================================
let linkedinDataCache = null;

async function loadLinkedInAssistant() {
  const container = document.getElementById('linkedinCardsContainer');
  container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">Đang chuẩn bị các trường nội dung LinkedIn...</div>`;

  try {
    const res = await fetch('/api/linkedin');
    const json = await res.json();
    if (!json.success) {
      container.innerHTML = `<div style="color: var(--danger);">${json.error}</div>`;
      return;
    }

    linkedinDataCache = json;
    renderLinkedInCards();
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger);">Lỗi kết nối: ${err.message}</div>`;
  }
}

function renderLinkedInCards() {
  if (!linkedinDataCache) return;
  const { headline, about, projects, skills, links } = linkedinDataCache;

  const container = document.getElementById('linkedinCardsContainer');

  let html = `
    <!-- Card 1: Headline -->
    <div class="linkedin-card">
      <div class="linkedin-card-header">
        <div class="linkedin-card-title">
          <span>💼</span> <span>Headline (Tiêu đề hồ sơ)</span>
        </div>
        <span class="badge badge-count">${headline.count} / ${headline.max} ký tự</span>
      </div>
      <div class="linkedin-text-box" id="textLinkedinHeadline">${escapeHtml(headline.text)}</div>
      <div class="linkedin-card-footer">
        <a href="${links.edit_intro}" target="_blank" class="btn btn-secondary btn-sm">🔗 Mở form sửa Intro</a>
        <button class="btn btn-primary btn-sm" onclick="copySnippet('textLinkedinHeadline', this)">📋 Copy Headline</button>
      </div>
    </div>

    <!-- Card 2: About / Summary -->
    <div class="linkedin-card">
      <div class="linkedin-card-header">
        <div class="linkedin-card-title">
          <span>📝</span> <span>About / Summary (Giới thiệu bản thân)</span>
        </div>
        <span class="badge badge-count">${about.count} / ${about.max} ký tự</span>
      </div>
      <div class="linkedin-text-box" id="textLinkedinAbout">${escapeHtml(about.text)}</div>
      <div class="linkedin-card-footer">
        <a href="${links.edit_about}" target="_blank" class="btn btn-secondary btn-sm">🔗 Mở form sửa About</a>
        <button class="btn btn-primary btn-sm" onclick="copySnippet('textLinkedinAbout', this)">📋 Copy About</button>
      </div>
    </div>

    <!-- Card 3: Experience & Projects -->
    <div class="linkedin-card" style="grid-column: 1 / -1;">
      <div class="linkedin-card-header">
        <div class="linkedin-card-title">
          <span>🚀</span> <span>Projects / Experience (Kinh nghiệm & Dự án)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 12px; color: var(--text-muted);">Chọn dự án:</label>
          <select class="form-select" id="linkedinProjectSelect" onchange="onSelectLinkedInProject(this.value)" style="width: auto; padding: 4px 10px; font-size: 12.5px;">
            ${(projects || []).map((p, pIdx) => `<option value="${pIdx}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="linkedin-text-box" id="textLinkedinProject" style="max-height: 220px;">
        ${(projects && projects[0]) ? escapeHtml(projects[0].description) : 'Chưa có dự án'}
      </div>
      <div class="linkedin-card-footer">
        <div style="display: flex; gap: 8px;">
          <a href="${links.add_project}" target="_blank" class="btn btn-secondary btn-sm">🔗 Thêm vào Projects</a>
          <a href="${links.add_experience}" target="_blank" class="btn btn-secondary btn-sm">🔗 Thêm vào Experience</a>
        </div>
        <button class="btn btn-primary btn-sm" onclick="copySnippet('textLinkedinProject', this)">📋 Copy Dự Án Đã Chọn</button>
      </div>
    </div>

    <!-- Card 4: Skills -->
    <div class="linkedin-card" style="grid-column: 1 / -1;">
      <div class="linkedin-card-header">
        <div class="linkedin-card-title">
          <span>💡</span> <span>Skills (Kỹ năng chuyên môn)</span>
        </div>
        <a href="${links.add_skills}" target="_blank" class="btn btn-secondary btn-sm">🔗 Mở form thêm Skills trên LinkedIn</a>
      </div>
      <div class="linkedin-text-box" id="textLinkedinSkills">
${Object.entries(skills || {}).map(([cat, list]) => `${cat.replace(/_/g, ' ').toUpperCase()}:\n• ${(list || []).join(', ')}`).join('\n\n')}
      </div>
      <div class="linkedin-card-footer" style="justify-content: flex-end;">
        <button class="btn btn-primary btn-sm" onclick="copySnippet('textLinkedinSkills', this)">📋 Copy Toàn Bộ Kỹ Năng</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function onSelectLinkedInProject(index) {
  if (!linkedinDataCache || !linkedinDataCache.projects) return;
  const proj = linkedinDataCache.projects[index];
  if (proj) {
    document.getElementById('textLinkedinProject').innerText = proj.description;
  }
}

// Universal Copy Snippet Helper
async function copySnippet(elementId, btn) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.innerText || el.textContent;

  try {
    await navigator.clipboard.writeText(text);
    const origText = btn.innerHTML;
    btn.innerHTML = '✅ Đã Copy!';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-success');

    showToast('Đã copy nội dung vào Clipboard!', 'success');

    setTimeout(() => {
      btn.innerHTML = origText;
      btn.classList.remove('btn-success');
      btn.classList.add('btn-primary');
    }, 2000);
  } catch (err) {
    showToast('Không thể copy: ' + err.message, 'error');
  }
}

// Security Helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
