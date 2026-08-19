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

// Drive bisa kasih ukuran berapapun lewat parameter sz — jadi ukurannya
// ditentuin di frontend sesuai kebutuhan tampilan (kecil buat grid
// thumbnail, gede cuma pas lightbox), bukan hardcode satu ukuran gede
// buat semua kayak sebelumnya.
function driveThumbUrl(fileId, width) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
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
// Tahap 1: cepet — cuma data dasar dari Sheet (judul, status, jam, dll),
// TANPA caption/gambar. Backend sengaja gak nyentuh Docs/Drive di sini.
async function fetchContent(dateISO) {
  const url = `${CONFIG.API_URL}?action=list&date=${dateISO}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal konek ke server (HTTP ' + res.status + ')');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Server mengembalikan error');
  return json.data;
}

// Tahap 2: dipanggil per item, belakangan — ambil caption + gambar buat
// SATU judul konten. Ini yang bikin card "pop-in" begitu selesai, satu-satu,
// bukan nunggu semuanya kelar dulu baru nampilin apa-apa.
async function fetchMedia(judulKonten, tanggal) {
  const url = `${CONFIG.API_URL}?action=media&judul=${encodeURIComponent(judulKonten)}&tanggal=${encodeURIComponent(tanggal)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal ambil media (HTTP ' + res.status + ')');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Server error ambil media');
  return { caption: json.caption, images: json.images };
}

// =====================================================================
// CACHE DI BROWSER — biar geser tanggal yang udah pernah dibuka itu INSTAN,
// gak perlu nunggu fetch sama sekali. Disimpan di memory (cepat, ilang pas
// reload) + sessionStorage (bertahan lintas reload dalam sesi yang sama).
// =====================================================================
const CACHE_FRESH_MS = 60 * 1000; // di bawah ini dianggap "masih segar", gak usah revalidate ulang
const memCache = new Map(); // dateISO -> { data, ts }

function cacheKey(dateISO) {
  return `siapupload_cache_${dateISO}`;
}

function getCached(dateISO) {
  if (memCache.has(dateISO)) return memCache.get(dateISO);
  try {
    const raw = sessionStorage.getItem(cacheKey(dateISO));
    if (raw) {
      const parsed = JSON.parse(raw);
      memCache.set(dateISO, parsed);
      return parsed;
    }
  } catch (e) { /* sessionStorage gak tersedia, skip aja */ }
  return null;
}

function setCached(dateISO, data) {
  const entry = { data, ts: Date.now() };
  memCache.set(dateISO, entry);
  try {
    sessionStorage.setItem(cacheKey(dateISO), JSON.stringify(entry));
  } catch (e) { /* kepenuhan/gak tersedia, gapapa — memory cache tetap jalan */ }
}

function invalidateCache(dateISO) {
  memCache.delete(dateISO);
  try {
    sessionStorage.removeItem(cacheKey(dateISO));
  } catch (e) { /* gapapa */ }
}

// Cache KHUSUS media (caption + gambar), terpisah dari cache list dasar di
// atas — key-nya per judul konten (bukan per tanggal), freshness-nya lebih
// panjang karena caption/gambar jarang berubah begitu ditulis.
const MEDIA_FRESH_MS = 5 * 60 * 1000; // 5 menit
const mediaCache = new Map();

function mediaCacheKey(tanggal, judul) {
  return `${tanggal}::${judul}`;
}

function getCachedMedia(tanggal, judul) {
  const key = mediaCacheKey(tanggal, judul);
  if (mediaCache.has(key)) return mediaCache.get(key);
  try {
    const raw = sessionStorage.getItem('siapupload_media_' + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      mediaCache.set(key, parsed);
      return parsed;
    }
  } catch (e) { /* gapapa */ }
  return null;
}

function setCachedMedia(tanggal, judul, media) {
  const key = mediaCacheKey(tanggal, judul);
  const entry = { media, ts: Date.now() };
  mediaCache.set(key, entry);
  try {
    sessionStorage.setItem('siapupload_media_' + key, JSON.stringify(entry));
  } catch (e) { /* gapapa */ }
}

// Penanda request "terbaru" — biar kalau user geser tanggal cepet-cepet,
// response dari request tanggal LAMA yang baru selesai belakangan gak
// nimpa tampilan tanggal BARU yang lagi dilihat sekarang.
let latestRequestId = 0;

async function loadDay() {
  const dateISO = toISODate(currentDate);
  const requestId = ++latestRequestId;

  elDateLabel.textContent = toDateLabel(currentDate);

  const cached = getCached(dateISO);
  const isFresh = cached && (Date.now() - cached.ts < CACHE_FRESH_MS);

  if (cached) {
    // ada data lama (walau mungkin agak basi) — tampilin LANGSUNG, jangan
    // kasih skeleton loading, biar kerasa instan
    currentData = cached.data;
    renderContent(cached.data);
    renderProgress(cached.data);
  } else {
    renderLoading();
  }

  // udah fresh banget (baru di-fetch < 1 menit lalu) — gak usah refetch,
  // cukup pastiin prefetch tanggal sebelah tetep jalan
  if (isFresh) {
    prefetchAdjacentDays_(dateISO);
    return;
  }

  try {
    const data = await fetchContent(dateISO);
    if (requestId !== latestRequestId) return; // user udah pindah tanggal lain, buang hasil ini

    setCached(dateISO, data);
    currentData = data;
    renderContent(data);
    renderProgress(data);
    prefetchAdjacentDays_(dateISO);
  } catch (err) {
    if (requestId !== latestRequestId) return;
    if (cached) {
      // masih ada data lama buat ditampilin, jadi gak usah full-error state —
      // cukup kasih tau lewat toast kalau refresh-nya gagal
      showToast('Gagal refresh data terbaru: ' + err.message, true);
    } else {
      renderError(err.message);
      renderProgress([]);
    }
  }
}

// Diam-diam ambil data H-1 dan H+1 di background (gak nge-block apapun,
// gak nampilin loading), jadi kalau user lanjut geser tanggal, kemungkinan
// besar udah ada di cache = instan. Sekalian prefetch media (caption+gambar)
// tiap itemnya juga, biar geser ke tanggal itu beneran zero-loading.
function prefetchAdjacentDays_(centerDateISO) {
  [-1, 1].forEach((offset) => {
    const d = new Date(centerDateISO + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    const iso = toISODate(d);

    const cached = getCached(iso);
    if (cached && (Date.now() - cached.ts < CACHE_FRESH_MS)) {
      prefetchMediaForItems_(cached.data);
      return;
    }

    fetchContent(iso)
      .then((data) => {
        setCached(iso, data);
        prefetchMediaForItems_(data);
      })
      .catch(() => { /* prefetch gagal, diem aja — nanti kena fetch normal kalau user beneran ke situ */ });
  });
}

function prefetchMediaForItems_(data) {
  data.forEach((item) => {
    const cachedMedia = getCachedMedia(item.tanggal, item.judulKonten);
    if (cachedMedia && (Date.now() - cachedMedia.ts < MEDIA_FRESH_MS)) return;

    fetchMedia(item.judulKonten, item.tanggal)
      .then((media) => setCachedMedia(item.tanggal, item.judulKonten, media))
      .catch(() => { /* diem aja, sama kayak di atas */ });
  });
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
// RENDER: MISSION CARDS (2 tahap — dasar dulu, media nyusul per item)
// =====================================================================

// Nomor "generasi" render — dinaikin tiap kali renderContent dipanggil.
// Dipakai buat nge-cancel efek dari fetch media yang MASIH JALAN pas user
// udah pindah ke tanggal lain, biar gak nimpa card yang salah.
let mediaGeneration = 0;
const cardRefs = new Map(); // idx -> { slidesEl, briefingEl, copyBtn, downloadSectionEl }

function renderContent(data) {
  if (!data || data.length === 0) {
    renderEmpty();
    return;
  }

  mediaGeneration++;
  const myGeneration = mediaGeneration;
  cardRefs.clear();

  // reset state media tiap item — walau item ini datang dari cache lama
  // (object yang sama dipake ulang), render awalnya tetep mulai dari
  // "loading" dulu; kalau ternyata medianya udah ke-cache juga, langsung
  // keisi lagi sesaat kemudian tanpa sempet keliatan flicker
  data.forEach((item) => {
    item._mediaState = 'loading';
    item.caption = '';
    item.images = [];
  });

  elContent.innerHTML = `<div class="grid" id="grid"></div>`;
  const grid = document.getElementById('grid');

  data.forEach((item, idx) => {
    const cardEl = renderCard(item, idx);
    cardEl.style.animationDelay = `${Math.min(idx * 0.05, 0.3)}s`;
    grid.appendChild(cardEl);
  });

  loadAllMedia_(data, myGeneration);
}

// Buat tiap item, cek cache media dulu (kalau ada & masih segar, langsung
// keisi tanpa fetch sama sekali) — kalau enggak, fetch beneran ke backend.
// Tiap item independen, jadi yang duluan selesai duluan muncul (gak nunggu
// yang lain).
function loadAllMedia_(data, generation) {
  data.forEach((item, idx) => {
    const cachedMedia = getCachedMedia(item.tanggal, item.judulKonten);
    if (cachedMedia && (Date.now() - cachedMedia.ts < MEDIA_FRESH_MS)) {
      applyMediaToCard_(idx, item, cachedMedia.media, generation);
      return;
    }

    fetchMedia(item.judulKonten, item.tanggal)
      .then((media) => {
        setCachedMedia(item.tanggal, item.judulKonten, media);
        applyMediaToCard_(idx, item, media, generation);
      })
      .catch((err) => {
        applyMediaToCard_(idx, item, { caption: '', images: [], _error: err.message }, generation);
      });
  });
}

function applyMediaToCard_(idx, item, media, generation) {
  if (generation !== mediaGeneration) return; // user udah pindah tanggal, buang hasil ini

  item.caption = media.caption || '';
  item.images = media.images || [];
  item._mediaState = 'ready';

  const refs = cardRefs.get(idx);
  if (!refs) return; // card-nya udah gak ada lagi di layar

  buildSlidesContent_(refs.slidesEl, item);
  buildBriefingContent_(refs.briefingEl, item);
  updateCopyButton_(refs.copyBtn, item);
  buildDownloadSection_(refs.downloadSectionEl, item);
}

// --- Builder per-bagian, dipanggil baik saat render awal (state "loading")
// maupun setelah media selesai dimuat (state "ready") ---

function buildSlidesContent_(container, item) {
  container.innerHTML = '';

  if (item._mediaState === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'slide-count';
    loading.textContent = '⏳ Memuat gambar...';
    container.appendChild(loading);
    return;
  }

  const hasImages = item.images && item.images.length > 0;
  if (hasImages) {
    item.images.forEach((img) => {
      // thumbnail grid cuma 52x52 CSS px — minta versi kecil dari Drive
      // (w200, bukan w1000) biar gak boros bandwidth & lebih cepet muncul.
      // Versi gedenya (w1200) baru diminta kalau di-tap buat lightbox.
      const thumbSrc = driveThumbUrl(img.id, 200);
      const fullSrc = driveThumbUrl(img.id, 1200);

      const thumb = document.createElement('div');
      thumb.className = 'slide-thumb';
      thumb.style.backgroundImage = `url("${thumbSrc}")`;
      thumb.title = img.name;
      thumb.addEventListener('click', () => openLightbox(fullSrc));
      container.appendChild(thumb);
    });
    const count = document.createElement('div');
    count.className = 'slide-count';
    count.textContent = `${item.images.length} slide`;
    container.appendChild(count);
  } else {
    const warn = document.createElement('div');
    warn.className = 'slide-count slide-warn';
    warn.textContent = '⚠ Gambar tidak ditemukan di Drive';
    container.appendChild(warn);
  }
}

function buildBriefingContent_(container, item) {
  if (item._mediaState === 'loading') {
    container.className = 'briefing';
    container.innerHTML = `<span class="label">BRIEFING</span>⏳ Memuat caption...`;
    return;
  }

  const hasCaption = !!item.caption;
  container.className = 'briefing' + (hasCaption ? '' : ' empty');
  container.innerHTML = `<span class="label">BRIEFING</span>${
    hasCaption ? escapeHtml(item.caption) : '⚠ Caption tidak ditemukan di Docs'
  }`;
}

function updateCopyButton_(copyBtn, item) {
  copyBtn.disabled = item._mediaState !== 'ready' || !item.caption;
}

function buildDownloadSection_(container, item) {
  container.innerHTML = '';
  if (item._mediaState !== 'ready') return;

  const hasImages = item.images && item.images.length > 0;
  if (!hasImages) return;

  const dlLabel = document.createElement('div');
  dlLabel.className = 'slide-count';
  dlLabel.style.padding = '0 14px 6px';
  dlLabel.textContent = 'DOWNLOAD GAMBAR:';
  container.appendChild(dlLabel);

  const dlRow = document.createElement('div');
  dlRow.className = 'actions';
  dlRow.style.paddingTop = '0';
  item.images.forEach((img, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn dl';
    btn.textContent = `⬇ ${i + 1}`;
    btn.title = 'Download ' + img.name;
    btn.addEventListener('click', () => downloadImageViaProxy(img.downloadUrl, img.name, btn));
    dlRow.appendChild(btn);
  });
  container.appendChild(dlRow);
}

function renderCard(item, idx) {
  const card = document.createElement('div');
  card.className = 'card';

  const status = statusInfo(item.statusYT);

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

  // --- slides (diisi lewat buildSlidesContent_, dipanggil di bawah) ---
  const slides = document.createElement('div');
  slides.className = 'slides';
  card.appendChild(slides);

  // --- meta ---
  const meta = document.createElement('div');
  meta.className = 'meta-row';
  meta.innerHTML = `
    <span>DROP <b>${escapeHtml(item.jamUpYT || '—')}</b></span>
    ${item.postIdYT ? `<span>POST ID <b>${escapeHtml(item.postIdYT)}</b></span>` : ''}
  `;
  card.appendChild(meta);

  // --- briefing (caption, diisi lewat buildBriefingContent_) ---
  const briefing = document.createElement('div');
  briefing.className = 'briefing';
  card.appendChild(briefing);

  // --- actions ---
  const actions = document.createElement('div');
  actions.className = 'actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn primary';
  copyBtn.innerHTML = '📋 Copy Caption';
  copyBtn.disabled = true; // aktif belakangan begitu caption-nya siap
  copyBtn.addEventListener('click', () => copyCaption(item.caption, copyBtn));
  actions.appendChild(copyBtn);

  const statusBtn = document.createElement('button');
  statusBtn.className = 'btn status-btn';
  statusBtn.id = `statusBtn-${idx}`;
  statusBtn.innerHTML = '🔄 Ubah Status';
  statusBtn.addEventListener('click', () => toggleStatusForm(idx));
  actions.appendChild(statusBtn);

  card.appendChild(actions);

  // --- download section (diisi lewat buildDownloadSection_ begitu media siap) ---
  const downloadSection = document.createElement('div');
  card.appendChild(downloadSection);

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

  // simpan referensi elemen buat diisi belakangan pas media selesai dimuat
  cardRefs.set(idx, { slidesEl: slides, briefingEl: briefing, copyBtn, downloadSectionEl: downloadSection });

  // render state awal (loading, atau langsung ready kalau kebetulan udah di-apply sebelum ini)
  buildSlidesContent_(slides, item);
  buildBriefingContent_(briefing, item);
  updateCopyButton_(copyBtn, item);
  buildDownloadSection_(downloadSection, item);

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
    invalidateCache(item.tanggal); // biar loadDay() gak nampilin data lama dulu sebelum yang baru
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

    // Auto-reload sekali begitu SW versi baru resmi ambil alih kontrol,
    // biar update kode langsung kepakai tanpa user harus uninstall/reinstall.
    let refreshedOnce = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshedOnce) return;
      refreshedOnce = true;
      window.location.reload();
    });
  });
}
