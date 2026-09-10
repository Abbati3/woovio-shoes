// ── Router ─────────────────────────────────────────────────────────────────

const VIEWS = ['stock', 'places', 'owed', 'totals', 'settings', 'form'];

function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('active', v === id);
    const btn = document.getElementById('nav-' + v);
    if (btn) btn.classList.toggle('active', v === id);
  });

  // Each render is isolated: a failure in one view must not take the app down
  try { if (id === 'stock')    renderStock();        } catch (e) { console.error('stock:', e); }
  try { if (id === 'places')   renderPlaces();       } catch (e) { console.error('places:', e); }
  try { if (id === 'owed')     renderOwed();         } catch (e) { console.error('owed:', e); }
  try { if (id === 'totals')   renderTotals();       } catch (e) { console.error('totals:', e); }
  try { if (id === 'settings') renderSettingsView(); } catch (e) { console.error('settings:', e); }
}

function navigate(id) { showView(id); }
window.navigate = navigate;

// ── Toast ──────────────────────────────────────────────────────────────────

let toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3200);
}
window.toast = toast;

// ── Offline mode ───────────────────────────────────────────────────────────

function getOfflineMode() {
  return localStorage.getItem('offlineMode') !== 'false'; // default on
}

function setOfflineMode(val) {
  localStorage.setItem('offlineMode', val ? 'true' : 'false');
  sendOfflineModeToSW(val);
}

function sendOfflineModeToSW(val) {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SET_OFFLINE_MODE', value: val });
  }
}

function toggleOfflineMode() {
  const btn = document.getElementById('offline-toggle');
  const on  = btn.classList.toggle('on');
  btn.setAttribute('aria-pressed', on);
  setOfflineMode(on);
  toast(on ? 'Offline mode on — network blocked' : 'Update mode on — network allowed', 'success');
}

window.getOfflineMode    = getOfflineMode;
window.setOfflineMode    = setOfflineMode;
window.toggleOfflineMode = toggleOfflineMode;

// ── Version ────────────────────────────────────────────────────────────────

// Read from the active cache name rather than a constant, so the number shown
// is the build actually running — a hardcoded one could drift from the cache
// it claims to describe and say an update landed when it had not.
async function appVersion() {
  try {
    if (!('caches' in window)) return null;
    const keys = await caches.keys();
    const key  = keys.find(k => k.startsWith('shoes-'));
    return key ? key.slice('shoes-'.length) : null;
  } catch (e) {
    return null;
  }
}

async function showVersion(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const v = await appVersion();
  const base = el.dataset.base || el.textContent;
  el.dataset.base = base;
  el.textContent = v ? `${base} · ${v}` : `${base} · not installed`;
}

window.appVersion  = appVersion;
window.showVersion = showVersion;

// ── Errors ─────────────────────────────────────────────────────────────────

window.addEventListener('error', e => console.error('Global error:', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', e => console.error('Unhandled rejection:', e.reason));

// ── Service worker ─────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready.then(() => sendOfflineModeToSW(getOfflineMode())))
      .catch(err => console.warn('SW:', err));
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Cover the screen before anything renders, so stock never flashes up behind
  // the lock while the database is still being read
  const locked = isLockEnabled();
  if (locked) lockNow();

  try {
    await loadSettings();
  } catch (e) {
    console.error('loadSettings failed:', e);
  }
  try {
    await loadShoes();
  } catch (e) {
    console.error('loadShoes failed:', e);
  }
  showView('stock');
  if (!locked) touchActivity();
});
