// =====================================================================
// KONFIGURASI — ganti kalau URL deployment Apps Script berubah
// =====================================================================
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyEA_nEM3aayEJgSZMSagj3ojT6cHxEa57hbhosR0iSv0PaGQ5VevbnWF4-Tn1XJi3W/exec'
};

const BULAN_ID = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

// =====================================================================
// STATE
// =====================================================================
let currentDate = new Date();
let currentData = [];

// =====================================================================
// UTIL: TANGGAL
// =====================================================================
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateLabel(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = BULAN_ID[date.getMonth()];
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

function isToday(date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear() &&
    date.getMonth() === t.getMonth() &&
    date.getDate() === t.getDate();
}

// =====================================================================
// UI HELPERS
// =====================================================================
const elContent = document.getElementById('content');
const elDateLabel = document.getElementById('dateLabel');
const elQpCount = document.getElementById('qpCount');
const elQpBar = document.getElementById('qpBar');
const elToast = document.getElementById('toast');
const elLightbox = document.getElementById('lightbox');
const elLightboxImg = document.getElementById('lightboxImg');

function showToast(message, isError) {
  elToast.textContent = message;
  elToast.classList.toggle('error', !!isError);
  elToast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => elToast.classList.remove('show'), 2600);
}

function openLightbox(url) {
  elLightboxImg.src = url;
  elLightbox.classList.add('open');
}
function closeLightbox() {
  elLightbox.classList.remove('open');
  elLightboxImg.src = '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
elLightbox.addEventListener('click', (e) => { if (e.target === elLightbox) closeLightbox(); });

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

// =====================================================================
// STATUS HELPERS
// =====================================================================
function statusInfo(statusYT) {
  const s = (statusYT || '').trim().toLowerCase();
  if (s === 'uploaded') return { key: 'uploaded', label: 'UPLOADED' };
  if (s === 'scheduled') return { key: 'scheduled', label: 'SCHEDULED' };
  if (s === 'acc') return { key: 'ready', label: 'READY' };
  return { key: 'unknown', label: statusYT || '-' };
}

// =====================================================================
// FETCH DATA
// =====================================================================
async function fetchContent(dateISO) {
  const url = `${CONFIG.API_URL}?action=list&date=${dateISO}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal konek ke server (HTTP ' + res.status + ')');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Server mengembalikan error');
  return json.data;
}

async function loadDay() {
  elDateLabel.textContent = toDateLabel(currentDate);
  renderLoading();
  try {
    const data = await fetchContent(toISODate(currentDate));
    currentData = data;
    renderContent(data);
    renderProgress(data);
  } catch (err) {
    renderError(err.message);
    renderProgress([]);
  }
}

// =====================================================================
// RENDER: STATES
// =====================================================================
function renderLoading() {
  const cards = Array.from({ length: 4 }).map(() => `
    <div class="skeleton-card">
      <div class="skel-line w60"></div>
      <div class="skel-line w40"></div>
      <div class="skel-line tall"></div>
      <div class="skel-line w60"></div>
    </div>
  `).join('');
  elContent.innerHTML = `<div class="skeleton-grid">${cards}</div>`;
}

function renderError(message) {
  elContent.innerHTML = `
    <div class="state-panel error">
      <div class="big">⚠ ERROR</div>
      <div>${escapeHtml(message)}</div>
    </div>`;
}

function renderEmpty() {
  elContent.innerHTML = `
    <div class="state-panel">
      <div class="big">KOSONG</div>
      <div>Gak ada konten Desain berstatus Acc di tanggal ini.<br>Cek lagi Status YT di Sheet, atau pilih tanggal lain.</div>
    </div>`;
}

function renderProgress(data) {
  const total = data.length;
  const done = data.filter((d) => statusInfo(d.statusYT).key === 'uploaded').length;

  elQpCount.innerHTML = `<b>${done}</b> / ${total} SELESAI`;

  elQpBar.style.gridTemplateColumns = `repeat(${Math.max(total, 1)}, 1fr)`;
  elQpBar.innerHTML = '';
  if (total === 0) {
    const seg = document.createElement('div');
    seg.className = 'qp-seg';
    elQpBar.appendChild(seg);
    return;
  }
  for (let i = 0; i < total; i++) {
    const seg = document.createElement('div');
    seg.className = 'qp-seg' + (i < done ? ' done' : '');
    elQpBar.appendChild(seg);
  }
}

// =====================================================================
// RENDER: MISSION CARDS
// =====================================================================
function renderContent(data) {
  if (!data || data.length === 0) {
    renderEmpty();
    return;
  }

  elContent.innerHTML = `<div class="grid" id="grid"></div>`;
  const grid = document.getElementById('grid');

  data.forEach((item, idx) => {
    const cardEl = renderCard(item, idx);
    cardEl.style.animationDelay = `${Math.min(idx * 0.05, 0.3)}s`;
    grid.appendChild(cardEl);
  });
}

function renderCard(item, idx) {
  const card = document.createElement('div');
  card.className = 'card';

  const status = statusInfo(item.statusYT);
  const hasImages = item.images && item.images.length > 0;
  const hasCaption = !!item.caption;

  // --- head ---
  const head = document.createElement('div');
  head.className = 'card-head';
  head.innerHTML = `
    <div>
      <div class="eyebrow">CAROUSEL · DESAIN</div>
      <h3>${escapeHtml(item.judulKonten)}</h3>
    </div>
    <div class="badge ${status.key}">${escapeHtml(status.label)}</div>
  `;
  card.appendChild(head);

  // --- slides ---
  const slides = document.createElement('div');
  slides.className = 'slides';
  if (hasImages) {
    item.images.forEach((img) => {
      const thumb = document.createElement('div');
      thumb.className = 'slide-thumb';
      thumb.style.backgroundImage = `url("${img.previewUrl}")`;
      thumb.title = img.name;
      thumb.addEventListener('click', () => openLightbox(img.previewUrl));
      slides.appendChild(thumb);
    });
    const count = document.createElement('div');
    count.className = 'slide-count';
    count.textContent = `${item.images.length} slide`;
    slides.appendChild(count);
  } else {
    const warn = document.createElement('div');
    warn.className = 'slide-count slide-warn';
    warn.textContent = '⚠ Gambar tidak ditemukan di Drive';
    slides.appendChild(warn);
  }
  card.appendChild(slides);

  // --- meta ---
  const meta = document.createElement('div');
  meta.className = 'meta-row';
  meta.innerHTML = `
    <span>DROP <b>${escapeHtml(item.jamUpYT || '—')}</b></span>
    ${item.postIdYT ? `<span>POST ID <b>${escapeHtml(item.postIdYT)}</b></span>` : ''}
  `;
  card.appendChild(meta);

  // --- briefing (caption) ---
  const briefing = document.createElement('div');
  briefing.className = 'briefing' + (hasCaption ? '' : ' empty');
  briefing.innerHTML = `<span class="label">BRIEFING</span>${
    hasCaption ? escapeHtml(item.caption) : '⚠ Caption tidak ditemukan di Docs'
  }`;
  card.appendChild(briefing);

  // --- actions ---
  const actions = document.createElement('div');
  actions.className = 'actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn primary';
  copyBtn.innerHTML = '📋 Copy Caption';
  copyBtn.disabled = !hasCaption;
  copyBtn.addEventListener('click', () => copyCaption(item.caption, copyBtn));
  actions.appendChild(copyBtn);

  const statusBtn = document.createElement('button');
  statusBtn.className = 'btn status-btn';
  statusBtn.id = `statusBtn-${idx}`;
  statusBtn.innerHTML = '🔄 Ubah Status';
  statusBtn.addEventListener('click', () => toggleStatusForm(idx));
  actions.appendChild(statusBtn);

  card.appendChild(actions);

  // --- download per-slide (satu-satu, ini cara utama download gambar) ---
  if (hasImages) {
    const dlLabel = document.createElement('div');
    dlLabel.className = 'slide-count';
    dlLabel.style.padding = '0 14px 6px';
    dlLabel.textContent = 'DOWNLOAD GAMBAR:';
    card.appendChild(dlLabel);

    const dlRow = document.createElement('div');
    dlRow.className = 'actions';
    dlRow.style.paddingTop = '0';
    item.images.forEach((img, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `⬇ ${i + 1}`;
      btn.title = 'Download ' + img.name;
      btn.addEventListener('click', () => downloadImageViaProxy(img.downloadUrl, img.name, btn));
      dlRow.appendChild(btn);
    });
    card.appendChild(dlRow);
  }

  // --- inline status update form ---
  const form = document.createElement('div');
  form.className = 'status-form';
  form.id = `statusForm-${idx}`;
  form.innerHTML = `
    <div class="current-status">Status sekarang: <b>${escapeHtml(status.label)}</b></div>
    <label>Ubah status ke:</label>
    <select id="statusSelect-${idx}">
      <option value="Scheduled">Scheduled</option>
      <option value="Uploaded">Uploaded</option>
    </select>
    <label>Post ID YT (opsional, biasanya diisi kalau status Uploaded):</label>
    <input type="text" id="postIdInput-${idx}" placeholder="contoh: dQw4w9WgXcQ">
    <div class="row">
      <button class="btn primary" id="saveStatus-${idx}">💾 Simpan</button>
      <button class="btn ghost" id="cancelStatus-${idx}">✕</button>
    </div>
  `;
  card.appendChild(form);

  form.querySelector(`#cancelStatus-${idx}`).addEventListener('click', () => toggleStatusForm(idx, false));
  form.querySelector(`#saveStatus-${idx}`).addEventListener('click', (e) => {
    const newStatus = form.querySelector(`#statusSelect-${idx}`).value;
    const postId = form.querySelector(`#postIdInput-${idx}`).value.trim();
    const btn = e.currentTarget;
    btn.textContent = 'MENYIMPAN...';
    btn.disabled = true;
    submitStatusUpdate(item, newStatus, postId);
  });

  return card;
}

function toggleStatusForm(idx, forceOpen) {
  const form = document.getElementById(`statusForm-${idx}`);
  if (!form) return;
  const shouldOpen = forceOpen !== undefined ? forceOpen : !form.classList.contains('open');

  document.querySelectorAll('.status-form.open').forEach((f) => f.classList.remove('open'));
  document.querySelectorAll('.status-btn.active').forEach((b) => b.classList.remove('active'));

  if (shouldOpen) {
    form.classList.add('open');
    const btn = document.getElementById(`statusBtn-${idx}`);
    if (btn) btn.classList.add('active');
  }
}

// =====================================================================
// ACTIONS
// =====================================================================
async function copyCaption(caption, btnEl) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(caption);
    } else {
      const ta = document.createElement('textarea');
      ta.value = caption;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('✓ Caption disalin!');

    if (btnEl) {
      const original = btnEl.innerHTML;
      btnEl.innerHTML = '✓ COPIED';
      btnEl.classList.add('flash');
      setTimeout(() => {
        btnEl.innerHTML = original;
        btnEl.classList.remove('flash');
      }, 1200);
    }
  } catch (err) {
    showToast('Gagal copy: ' + err.message, true);
  }
}

async function downloadImageViaProxy(url, fallbackName, btnEl) {
  const originalText = btnEl.textContent;
  btnEl.textContent = '...';
  btnEl.disabled = true;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Gagal ambil file');

    const bytes = Uint8Array.from(atob(json.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: json.mimeType || 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = json.fileName || fallbackName || 'gambar.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);

    showToast(`✓ ${json.fileName || fallbackName} didownload`);
  } catch (err) {
    showToast('Gagal download: ' + err.message, true);
  } finally {
    btnEl.textContent = originalText;
    btnEl.disabled = false;
  }
}

async function submitStatusUpdate(item, newStatus, postId) {
  try {
    const body = JSON.stringify({
      action: 'updateStatus',
      judulKonten: item.judulKonten,
      tanggal: item.tanggal,
      status: newStatus,
      postId: postId || undefined
    });

    // Content-Type text/plain sengaja dipakai supaya browser gak kirim
    // CORS preflight (OPTIONS) yang gak bisa ditangani Apps Script Web App.
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Gagal update status');

    showToast(`✓ Status "${item.judulKonten}" diubah ke ${newStatus}`);
    loadDay(); // refresh biar semua card & progress bar sinkron
  } catch (err) {
    showToast('Gagal update: ' + err.message, true);
  }
}

// =====================================================================
// NAVIGASI TANGGAL
// =====================================================================
document.getElementById('prevDay').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() - 1);
  loadDay();
});
document.getElementById('nextDay').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() + 1);
  loadDay();
});
document.getElementById('todayBtn').addEventListener('click', () => {
  currentDate = new Date();
  loadDay();
});

// =====================================================================
// INIT
// =====================================================================
loadDay();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
