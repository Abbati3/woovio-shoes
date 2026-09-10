// ── Passcode lock ──────────────────────────────────────────────────────────
//
// Casual privacy: it keeps someone who picks up the phone out of your stock and
// takings. It is not encryption — the data on disk is unchanged — so it defends
// against a curious person, not a determined one with the device in hand.
//
// The code itself is never stored. Only a salted SHA-256 of it is kept, so the
// passcode cannot be read back out of a backup file or the database.

const LOCK_GRACE_MS   = 2 * 60 * 1000;  // returning within this window stays unlocked
const MAX_TRIES       = 5;
const COOLDOWN_MS     = 30 * 1000;

let _entered   = '';
let _mode      = 'verify';   // verify | set | confirm
let _firstCode = '';
let _tries     = 0;
let _lockedOutUntil = 0;
let _onUnlock  = null;

// Mirrored in localStorage so startup can decide to cover the screen before the
// database has been read — otherwise the stock grid flashes up first.
function isLockEnabled() { return localStorage.getItem('lockEnabled') === '1'; }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Overlay ────────────────────────────────────────────────────────────────

function buildLockUI(title, sub, showForgot) {
  const existing = document.getElementById('lock');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'lock';
  el.innerHTML = `
    <div class="lock-inner">
      <div class="lock-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="4" y="10" width="16" height="11" rx="2"/>
          <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
        </svg>
      </div>
      <div class="lock-title" id="lock-title">${title}</div>
      <div class="lock-sub" id="lock-sub">${sub}</div>
      <div class="lock-dots" id="lock-dots">${[0,1,2,3].map(()=>'<span></span>').join('')}</div>
      <div class="lock-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n=>`<button onclick="lockPress('${n}')">${n}</button>`).join('')}
        <button class="lock-blank" ${showForgot ? 'onclick="lockForgot()"' : 'disabled'}>${showForgot ? '?' : ''}</button>
        <button onclick="lockPress('0')">0</button>
        <button onclick="lockBack()" aria-label="Delete">⌫</button>
      </div>
      ${_mode !== 'verify' ? `<button class="lock-cancel" onclick="lockCancel()">Cancel</button>` : ''}
    </div>`;
  document.body.appendChild(el);
  paintDots();
}

function paintDots() {
  const dots = document.querySelectorAll('#lock-dots span');
  dots.forEach((d, i) => d.classList.toggle('on', i < _entered.length));
}

function lockPress(n) {
  if (Date.now() < _lockedOutUntil) return;
  if (_entered.length >= 4) return;
  _entered += n;
  paintDots();
  if (_entered.length === 4) setTimeout(submitCode, 140);
}

function lockBack() {
  _entered = _entered.slice(0, -1);
  paintDots();
}

function shake(msg) {
  const inner = document.querySelector('.lock-inner');
  const sub   = document.getElementById('lock-sub');
  if (sub && msg) sub.textContent = msg;
  if (inner) {
    inner.classList.remove('shake');
    void inner.offsetWidth;
    inner.classList.add('shake');
  }
  _entered = '';
  paintDots();
}

async function submitCode() {
  const s = getSettings() || {};

  if (_mode === 'set') {
    _firstCode = _entered;
    _entered = '';
    _mode = 'confirm';
    document.getElementById('lock-title').textContent = 'Confirm passcode';
    document.getElementById('lock-sub').textContent   = 'Enter the same four digits again';
    paintDots();
    return;
  }

  if (_mode === 'confirm') {
    if (_entered !== _firstCode) {
      _mode = 'set';
      _firstCode = '';
      document.getElementById('lock-title').textContent = 'Set a passcode';
      shake('They did not match — start again');
      return;
    }
    const salt = randomSalt();
    const hash = await sha256(salt + _entered);
    await saveSettings({ passcodeSalt: salt, passcodeHash: hash });
    localStorage.setItem('lockEnabled', '1');
    _mode      = 'verify';
    _firstCode = '';
    closeLock();
    touchActivity();
    toast('Passcode set ✓', 'success');
    if (typeof renderSettingsView === 'function') renderSettingsView();
    return;
  }

  // verify
  const hash = await sha256((s.passcodeSalt || '') + _entered);
  if (hash === s.passcodeHash) {
    _tries = 0;
    closeLock();
    touchActivity();
    if (_onUnlock) { const fn = _onUnlock; _onUnlock = null; fn(); }
    return;
  }

  _tries += 1;
  if (_tries >= MAX_TRIES) {
    _lockedOutUntil = Date.now() + COOLDOWN_MS;
    _tries = 0;
    shake('Too many attempts — wait 30 seconds');
    const tick = setInterval(() => {
      const left = Math.ceil((_lockedOutUntil - Date.now()) / 1000);
      const sub = document.getElementById('lock-sub');
      if (left <= 0) {
        clearInterval(tick);
        if (sub) sub.textContent = 'Enter your passcode';
      } else if (sub) {
        sub.textContent = `Too many attempts — wait ${left}s`;
      }
    }, 500);
    return;
  }
  shake(`Wrong passcode — ${MAX_TRIES - _tries} tries left`);
}

function lockCancel() {
  closeLock();
  _mode = 'verify';
  _firstCode = '';
}

function closeLock() {
  _entered = '';
  const el = document.getElementById('lock');
  if (el) el.remove();
}

// The only honest recovery without a server: there is nothing to email a reset
// to, so the choice is restore from a backup or start over.
async function lockForgot() {
  const ok = confirm(
    'There is no way to recover a forgotten passcode — nothing is stored anywhere else.\n\n' +
    'The only option is to erase everything on this device and start again. ' +
    'If you have a backup file you can restore it afterwards.\n\n' +
    'Erase all shoe data now?'
  );
  if (!ok) return;
  if (!confirm('Last check. Every pair, photo and figure will be deleted. Continue?')) return;

  try {
    const db = await getDB();
    for (const sh of await db.getAll('shoes')) await db.delete('shoes', sh.id);
    await db.delete('settings', 'main');
  } catch (e) { console.error('wipe:', e); }
  localStorage.removeItem('lockEnabled');
  location.reload();
}

// ── Entry points ───────────────────────────────────────────────────────────

function lockNow(onUnlock) {
  _mode     = 'verify';
  _entered  = '';
  _onUnlock = onUnlock || null;
  buildLockUI('Enter passcode', 'Enter your passcode', true);
}

function startSetPasscode() {
  _mode      = 'set';
  _entered   = '';
  _firstCode = '';
  buildLockUI('Set a passcode', 'Choose four digits you will remember', false);
}

async function removePasscode() {
  if (!confirm('Remove the passcode? Anyone who opens the app will see your stock and takings.')) return;
  await saveSettings({ passcodeSalt: '', passcodeHash: '' });
  localStorage.removeItem('lockEnabled');
  renderSettingsView();
  toast('Passcode removed', 'success');
}

// ── Re-lock after being away ───────────────────────────────────────────────

function touchActivity() { localStorage.setItem('lastActiveAt', String(Date.now())); }

function shouldRelock() {
  const last = parseInt(localStorage.getItem('lastActiveAt')) || 0;
  return Date.now() - last > LOCK_GRACE_MS;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    touchActivity();
  } else if (isLockEnabled() && !document.getElementById('lock') && shouldRelock()) {
    lockNow();
  }
});

window.isLockEnabled     = isLockEnabled;
window.lockPress         = lockPress;
window.lockBack          = lockBack;
window.lockCancel        = lockCancel;
window.lockForgot        = lockForgot;
window.lockNow           = lockNow;
window.startSetPasscode  = startSetPasscode;
window.removePasscode    = removePasscode;
window.touchActivity     = touchActivity;
