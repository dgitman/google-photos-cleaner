// background.js — v3  (archive / unarchive per-URL)

const PAUSE_AFTER_NAV    = 2200;
const PAUSE_AFTER_ACTION = 1000;

let gpTabId = null;
let running = false;

// ── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'start') { startProcessing(); }
  if (msg.action === 'stop')  { running = false; }
});

// ── Entry ─────────────────────────────────────────────────────────────────────

async function startProcessing() {
  running = true;

  const tabs = await chrome.tabs.query({ url: 'https://photos.google.com/*' });
  if (tabs.length > 0) {
    gpTabId = tabs[0].id;
    await chrome.tabs.update(gpTabId, { active: true });
  } else {
    const tab = await chrome.tabs.create({ url: 'https://photos.google.com' });
    gpTabId = tab.id;
    await waitForTabLoad(gpTabId);
  }

  processNext();
}

// ── Loop ──────────────────────────────────────────────────────────────────────

async function processNext() {
  if (!running) return;

  const data = await chrome.storage.local.get(
    ['photos', 'currentIdx', 'done', 'errors', 'mode']
  );
  const { photos, currentIdx, done = 0, errors = 0, mode } = data;

  if (!photos || currentIdx >= photos.length) {
    running = false;
    const verb = mode === 'archive' ? 'Archived' : 'Unarchived';
    await chrome.storage.local.set({
      running:    false,
      lastAction: `✅  Done! ${verb} ${done} photos. ${errors} errors.\n\n` +
                  (mode === 'archive'
                    ? 'Now go to Google Photos main view,\nselect all photos, and delete them.'
                    : 'All album photos restored.'),
    });
    return;
  }

  const photo = photos[currentIdx];
  const verb  = mode === 'archive' ? 'Archiving' : 'Unarchiving';

  await chrome.storage.local.set({
    lastAction: `[${currentIdx + 1}/${photos.length}] ${verb}…\n${photo.title}`,
  });

  await chrome.tabs.update(gpTabId, { url: photo.url });
  await waitForTabLoad(gpTabId);
  await sleep(PAUSE_AFTER_NAV);

  let success = false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: gpTabId },
      func:   performAction,
      args:   [mode],
    });
    success = results?.[0]?.result === true;
  } catch (e) {
    console.error(e.message);
  }

  await chrome.storage.local.set({
    currentIdx: currentIdx + 1,
    done:       success ? done + 1 : done,
    errors:     success ? errors   : errors + 1,
    lastAction: `[${currentIdx + 1}/${photos.length}] ${success ? '✅' : '⚠️'} ${photo.title}`,
  });

  await sleep(PAUSE_AFTER_ACTION);
  processNext();
}

// ── Content function (injected into Google Photos tab) ────────────────────────

async function performAction(mode) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  if (!window.location.href.includes('/photo/')) return false;
  await sleep(400);

  if (mode === 'archive' || mode === 'unarchive') {
    const targetText = mode === 'archive' ? 'archive' : 'unarchive';

    window.focus();
    await sleep(300);

    // There are two "More options" buttons — find the one in the photo
    // viewer toolbar by looking for the sibling of "Move to trash"
    const trashBtn = document.querySelector('[aria-label="Move to trash"]');
    let moreBtn = null;

    if (trashBtn) {
      let parent = trashBtn.parentElement;
      for (let i = 0; i < 6; i++) {
        const candidate = parent?.querySelector('[aria-label="More options"]');
        if (candidate) { moreBtn = candidate; break; }
        parent = parent?.parentElement;
      }
    }

    // Fallback: last More options button on the page
    if (!moreBtn) {
      const all = document.querySelectorAll('[aria-label="More options"]');
      moreBtn = all[all.length - 1];
    }

    if (!moreBtn) return false;

    moreBtn.click();
    await sleep(900);

    const item = [...document.querySelectorAll('li[role="menuitem"]')]
      .find(el => el.getAttribute('aria-label')?.toLowerCase().startsWith(targetText));

    if (!item) return false;

    item.click();
    await sleep(700);
    return true;
  }

  return false;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}
