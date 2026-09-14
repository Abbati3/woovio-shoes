// ── Router ─────────────────────────────────────────────────────────────────

const VIEWS = ['stock', 'places', 'totals', 'settings', 'form'];

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
  try { if (id === 'totals')   renderTotals();       } catch (e) { console.error('totals:', e); }
  try { if (id === 'settings') renderSettingsView(); } catch (e) { console.error('settings:', e); }
}

function navigate(id) {
  // An update that arrived mid-edit applies as soon as the form is left
  if (_reloadWhenFree && id !== 'form') { location.reload(); return; }
  showView(id);
}
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

// ── Updates ────────────────────────────────────────────────────────────────
//
// The browser looks for a new version by itself each time the app opens. When
// one installs it takes over at once and the page reloads onto it, so opening
// the app is enough to be current. A reload never lands mid-edit: while the add
// or edit form is open it waits until the form is left.

let _reloadWhenFree = false;

function applyUpdateWhenFree() {
  const editing = document.getElementById('view-form')?.classList.contains('active');
  if (editing) {
    _reloadWhenFree = true;
    toast('Update ready — it applies when you leave this form', 'success');
    return;
  }
  location.reload();
}

async function checkForUpdates() {
  if (!('serviceWorker' in navigator)) { toast('Updates are not supported here', 'error'); return; }
  if (!navigator.onLine) { toast('No connection — try again once you are online', 'error'); return; }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) { toast('Not installed yet — reopen the app while online', 'error'); return; }

  // update() can resolve before the new worker is reported, so listen first
  const found = new Promise(resolve => {
    if (reg.installing || reg.waiting) return resolve(true);
    const timer = setTimeout(() => resolve(false), 2500);
    reg.addEventListener('updatefound', () => { clearTimeout(timer); resolve(true); }, { once: true });
  });

  toast('Checking for updates…', 'success');
  try {
    await reg.update();
  } catch (e) {
    toast('Could not reach the update server', 'error');
    return;
  }
  if (await found) {
    toast('Update found — installing…', 'success');   // the controller change reloads onto it
    return;
  }
  const v = await appVersion();
  toast(`You're on the latest version${v ? ' (' + v + ')' : ''}`, 'success');
}

window.checkForUpdates = checkForUpdates;

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
  // The first controller a page ever gets, on a fresh install, replaces nothing,
  // so reloading onto it would only make the screen flash. Every change after
  // that is a newer version taking over — including one that arrives in the same
  // visit as the first install, which a check made only at load would miss.
  let hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    applyUpdateWhenFree();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Left behind by the offline switch that no longer exists
  localStorage.removeItem('offlineMode');

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
