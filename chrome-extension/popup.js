// popup.js

const csvFile     = document.getElementById('csvFile');
const archiveBtn  = document.getElementById('archiveBtn');
const unarchiveBtn= document.getElementById('unarchiveBtn');
const stopBtn     = document.getElementById('stopBtn');
const status      = document.getElementById('status');
const bar         = document.getElementById('bar');
const pct         = document.getElementById('pct');

let photos = [];

// ── Parse CSV ─────────────────────────────────────────────────────────────────

csvFile.addEventListener('change', async () => {
  const file = csvFile.files[0];
  if (!file) return;
  const text   = await file.text();
  const rows   = text.trim().split('\n');
  const header = rows[0].split(',').map(h => h.replace(/"/g, '').trim());
  const titleIdx = header.indexOf('title');
  const dateIdx  = header.indexOf('date');
  const urlIdx   = header.indexOf('url');

  photos = [];
  for (const row of rows.slice(1)) {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of row) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    const url = cols[urlIdx]?.replace(/"/g, '').trim();
    if (!url?.startsWith('https://photos.google.com')) continue;
    photos.push({
      title: cols[titleIdx]?.replace(/"/g, '').trim() || '',
      date:  cols[dateIdx]?.replace(/"/g, '').trim()  || '',
      url,
    });
  }

  status.textContent = `Loaded ${photos.length} photos.\nReady.`;
  archiveBtn.disabled   = photos.length === 0;
  unarchiveBtn.disabled = photos.length === 0;
});

// ── Buttons ───────────────────────────────────────────────────────────────────

archiveBtn.addEventListener('click', () => startMode('archive'));
unarchiveBtn.addEventListener('click', () => startMode('unarchive'));

async function startMode(mode) {
  await chrome.storage.local.set({
    photos, currentIdx: 0, done: 0, errors: 0,
    running: true, mode, lastAction: 'Starting…',
  });
  chrome.runtime.sendMessage({ action: 'start', mode });
  archiveBtn.disabled   = true;
  unarchiveBtn.disabled = true;
  stopBtn.style.display = 'inline-block';
}

stopBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ running: false });
  chrome.runtime.sendMessage({ action: 'stop' });
  reset();
});

function reset() {
  archiveBtn.disabled   = false;
  unarchiveBtn.disabled = false;
  stopBtn.style.display = 'none';
}

// ── Progress ──────────────────────────────────────────────────────────────────

setInterval(async () => {
  const d = await chrome.storage.local.get(
    ['currentIdx', 'photos', 'done', 'errors', 'running', 'lastAction', 'mode']
  );
  if (!d.photos) return;

  const total    = d.photos.length;
  const idx      = d.currentIdx || 0;
  const progress = total > 0 ? Math.round((idx / total) * 100) : 0;
  const modeLabel = d.mode === 'archive' ? 'Archived' : 'Unarchived';

  bar.value       = progress;
  pct.textContent = `${progress}%  —  ${modeLabel}: ${d.done || 0}  Errors: ${d.errors || 0}  (${idx}/${total})`;
  if (d.lastAction) status.textContent = d.lastAction;
  if (!d.running)   reset();
}, 700);
