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
      ${_mode === 'verify' && isFaceIdEnabled() ? `
      <button class="lock-faceid" onclick="unlockWithFaceId()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/>
          <path d="M9 9.5v1M15 9.5v1M12 9v4h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/>
        </svg>
        Unlock with Face ID
      </button>` : ''}
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
    unlockSucceeded();
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

// Shared by the passcode and Face ID, so both unlock in exactly the same way
function unlockSucceeded() {
  _tries = 0;
  closeLock();
  touchActivity();
  if (_onUnlock) { const fn = _onUnlock; _onUnlock = null; fn(); }
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
  disableFaceId();
  location.reload();
}

// ── Entry points ───────────────────────────────────────────────────────────

function lockNow(onUnlock) {
  _mode     = 'verify';
  _entered  = '';
  _onUnlock = onUnlock || null;
  buildLockUI('Enter passcode', isFaceIdEnabled() ? 'Use Face ID or enter your passcode' : 'Enter your passcode', true);
}

function startSetPasscode() {
  _mode      = 'set';
  _entered   = '';
  _firstCode = '';
  buildLockUI('Set a passcode', 'Choose four digits you will remember', false);
}

async function removePasscode() {
  if (!confirm('Remove the passcode? Anyone who opens the app will see your stock and takings.' +
               (isFaceIdEnabled() ? ' Face ID unlock will be turned off too.' : ''))) return;
  await saveSettings({ passcodeSalt: '', passcodeHash: '' });
  localStorage.removeItem('lockEnabled');
  // Face ID only ever stands in for the passcode, so it cannot outlive it
  disableFaceId();
  renderSettingsView();
  toast('Passcode removed', 'success');
}

// ── Face ID ────────────────────────────────────────────────────────────────
//
// A passkey (WebAuthn) held by the phone's own authenticator, so iOS asks for
// Face ID and nothing leaves the device — it works offline. Safari only allows
// the prompt straight after a tap, so it is a button on the lock screen rather
// than something raised by itself when the app opens.
//
// There is no server to check the passkey's signature, and none is needed: the
// lock only keeps out someone holding the phone, and anyone able to tamper with
// the app's code could get past the passcode just as easily. The app checks that
// the passkey which answered is the one set up here, and that iOS reports the
// owner was verified rather than the screen merely being tapped.

function isFaceIdEnabled() {
  return isLockEnabled()
      && localStorage.getItem('faceIdEnabled') === '1'
      && !!localStorage.getItem('faceIdCredId');
}

async function faceIdAvailable() {
  try {
    return !!(window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) {
    return false;
  }
}

function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

function toB64url(buf) {
  let s = '';
  new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

// The same user handle every time, so setting Face ID up again replaces the
// passkey on the phone rather than leaving another beside it in Passwords.
function faceIdUserHandle() {
  let h = localStorage.getItem('faceIdUserId');
  if (!h) {
    h = toB64url(randomBytes(16));
    localStorage.setItem('faceIdUserId', h);
  }
  return fromB64url(h);
}

// True only when the stored passkey answered and iOS verified the owner
async function verifyFaceId(credId) {
  const assertion = await navigator.credentials.get({ publicKey: {
    challenge: randomBytes(32),
    allowCredentials: [{ type: 'public-key', id: fromB64url(credId), transports: ['internal'] }],
    userVerification: 'required',
    timeout: 60000,
  }});
  if (!assertion || toB64url(assertion.rawId) !== credId) return false;
  const flags = new Uint8Array(assertion.response.authenticatorData)[32];
  return (flags & 0x04) !== 0;   // UV bit: Face ID or the phone's passcode, not just a tap
}

async function unlockWithFaceId() {
  const credId = localStorage.getItem('faceIdCredId');
  if (!credId) return;
  const sub = document.getElementById('lock-sub');
  try {
    if (await verifyFaceId(credId)) {
      unlockSucceeded();
      return;
    }
    if (sub) sub.textContent = 'Face ID did not confirm it was you — enter your passcode';
  } catch (e) {
    // NotAllowedError covers both a cancelled prompt and a failed scan
    if (sub) sub.textContent = 'Face ID did not work — enter your passcode';
    console.warn('Face ID:', e.name, e.message);
  }
}

async function enableFaceId() {
  if (!isLockEnabled()) {
    toast('Set a passcode first', 'error');
    return false;
  }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Shoe Stock' },
      user: { id: faceIdUserHandle(), name: 'Shoe Stock', displayName: 'Shoe Stock' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      attestation: 'none',
      timeout: 60000,
    }});
    if (!cred) return false;
    localStorage.setItem('faceIdCredId', toB64url(cred.rawId));
    localStorage.setItem('faceIdEnabled', '1');
    return true;
  } catch (e) {
    // A cancelled prompt is a choice, not an error worth a message
    if (e.name !== 'NotAllowedError') toast('Could not set up Face ID: ' + e.message, 'error');
    return false;
  }
}

function disableFaceId() {
  localStorage.removeItem('faceIdEnabled');
  localStorage.removeItem('faceIdCredId');
}

async function renderFaceIdSetting() {
  const el = document.getElementById('faceid-setting');
  if (!el) return;
  if (!isLockEnabled() || !(await faceIdAvailable())) {
    el.innerHTML = '';
    return;
  }
  const on = isFaceIdEnabled();
  el.innerHTML = `
    <div class="field-row toggle-row faceid-row">
      <div>
        <div class="toggle-label" style="font-weight:600;">Unlock with Face ID</div>
        <div class="hint" style="padding:0;margin-top:2px;">Tap the Face ID button on the lock screen. Your passcode still works whenever Face ID doesn't.</div>
      </div>
      <button class="toggle ${on ? 'on' : ''}" id="faceid-toggle" onclick="toggleFaceId()" aria-pressed="${on}"></button>
    </div>`;
}

async function toggleFaceId() {
  if (isFaceIdEnabled()) {
    disableFaceId();
    toast('Face ID unlock turned off', 'success');
  } else if (await enableFaceId()) {
    toast('Face ID unlock turned on ✓', 'success');
  }
  renderFaceIdSetting();
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
window.isFaceIdEnabled   = isFaceIdEnabled;
window.faceIdAvailable   = faceIdAvailable;
window.unlockWithFaceId  = unlockWithFaceId;
window.enableFaceId      = enableFaceId;
window.disableFaceId     = disableFaceId;
window.renderFaceIdSetting = renderFaceIdSetting;
window.toggleFaceId      = toggleFaceId;
