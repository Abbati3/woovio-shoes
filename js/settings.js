// ── Settings — load, save, render ──────────────────────────────────────────

const SETTINGS_KEY = 'main';

const DEFAULTS = {
  id:           SETTINGS_KEY,
  businessName: 'Shoe Stock',
  priceKey:     'MAKEPROFIT',
  locations: [
    { name: 'Shop',     partner: false },
    { name: 'Car boot', partner: false },
  ],
};

let _settings = null;

async function loadSettings() {
  const db = await getDB();
  const saved = await db.get('settings', SETTINGS_KEY);
  _settings = Object.assign({}, DEFAULTS, saved || {});
  if (!Array.isArray(_settings.locations) || !_settings.locations.length) {
    _settings.locations = DEFAULTS.locations.slice();
  }
  return _settings;
}

async function saveSettings(patch) {
  const db = await getDB();
  _settings = Object.assign({}, _settings, patch);
  await db.put('settings', _settings);
  return _settings;
}

function getSettings() { return _settings; }

window.loadSettings = loadSettings;
window.saveSettings = saveSettings;
window.getSettings  = getSettings;

// ── Settings UI ────────────────────────────────────────────────────────────

function renderSettingsView() {
  const s = _settings || DEFAULTS;

  document.getElementById('view-settings').innerHTML = `
    <div class="page-header">
      <h1>Settings</h1>
      <div class="subtitle" id="settings-version">Places &amp; data</div>
    </div>

    <div class="settings-list">

      <div class="field-group">
        <div class="field-group-label">Business</div>
        <div class="field-row">
          <label>Name</label>
          <input id="s-businessName" type="text" value="${esc(s.businessName)}" placeholder="Shoe Stock" />
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">Places</div>
        <p class="hint">Where pairs are kept. Mark a place as a partner when a friend sells on your behalf and sends you an agreed amount per pair.</p>
        <div id="loc-list"></div>
        <div style="padding:10px 16px;">
          <button class="btn btn-outline" style="width:100%;height:42px;font-size:14px;" onclick="addLocation()">+ Add place</button>
        </div>
      </div>

      <button class="btn btn-primary" onclick="submitSettings()">Save Settings</button>

      <div class="field-group">
        <div class="field-group-label">Customer View</div>
        <p class="hint">Show a customer what you have without showing them your cost, profit, or where anything is kept. Every unsold pair appears, wherever it is being kept. Prices show only as your price code, so the price is yours to open with.${isLockEnabled() ? ' Your passcode is needed to leave it.' : ''}</p>
        <div class="field-row">
          <label>Price code key — ten different letters for 1 2 3 4 5 6 7 8 9 0</label>
          <input id="s-priceKey" type="text" maxlength="10" value="${esc(priceKey())}" autocapitalize="characters" autocorrect="off" spellcheck="false" oninput="previewPriceKey(this.value)" style="letter-spacing:3px;font-weight:600;" />
        </div>
        <div class="hint" id="price-key-legend"></div>
        <div style="padding:6px 16px 14px;display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-outline" style="width:100%;" onclick="savePriceKey()">Save code key</button>
          <button class="btn btn-outline" style="width:100%;" onclick="enterCustomerView()">Show customer view</button>
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">Privacy</div>
        ${isLockEnabled() ? `
          <p class="hint">A passcode is set. The app locks when you open it, and again if you have been away for more than a couple of minutes.</p>
          <div style="padding:0 16px 14px;display:flex;flex-direction:column;gap:10px;">
            <button class="btn btn-outline" style="width:100%;" onclick="startSetPasscode()">Change passcode</button>
            <button class="btn btn-outline" style="width:100%;color:var(--danger);border-color:var(--danger);" onclick="removePasscode()">Remove passcode</button>
          </div>
          <div id="faceid-setting"></div>
        ` : `
          <p class="hint">Lock the app with four digits so your stock and takings are not open to anyone holding your phone. There is no way to recover a forgotten passcode — the only way back in is to erase the data and restore a backup. Once a passcode is set, iPhones with Face ID can unlock with that instead.</p>
          <div style="padding:0 16px 14px;">
            <button class="btn btn-outline" style="width:100%;" onclick="startSetPasscode()">Set a passcode</button>
          </div>
        `}
      </div>

      <div class="field-group">
        <div class="field-group-label">Backup</div>
        <p class="hint">One file with every pair, its photo, your places and settings. Keep it in Files or iCloud Drive — if the app is ever deleted, this is how everything comes back.</p>
        <div id="last-backup" class="hint" style="padding-top:0;"></div>
        <div style="padding:0 16px 14px;display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-outline" style="width:100%;" onclick="backupData()">Export backup</button>
          <button class="btn btn-outline" style="width:100%;color:var(--danger);border-color:var(--danger);" onclick="openRestorePicker()">Restore from backup</button>
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">App Updates</div>
        <p class="hint">The app updates itself whenever you open it with a connection. The version is shown at the top of this page.</p>
        <div style="padding:0 16px 14px;">
          <button class="btn btn-outline" style="width:100%;" onclick="checkForUpdates()">Check for updates</button>
        </div>
      </div>

      <div style="height:8px;"></div>
    </div>
  `;

  renderLocationList();
  showLastBackup();
  showVersion('settings-version');
  previewPriceKey(priceKey());
  renderFaceIdSetting();
}

// ── Price code key ─────────────────────────────────────────────────────────

function previewPriceKey(raw) {
  const el = document.getElementById('price-key-legend');
  if (!el) return;
  const k = String(raw || '').toUpperCase();
  if (!isValidPriceKey(k)) {
    el.classList.add('bad');
    el.textContent = 'Needs exactly ten letters, none repeated.';
    return;
  }
  el.classList.remove('bad');
  const pairs = '1234567890'.split('').map((d, i) => `${d}=${k[i]}`).join('  ');
  el.textContent = `${pairs}   ·   ₦55,000 shows as ${priceCode(55000, k)}, ₦48,500 as ${priceCode(48500, k)}`;
}

async function savePriceKey() {
  const k = String(document.getElementById('s-priceKey').value || '').toUpperCase();
  if (!isValidPriceKey(k)) { toast('The key needs ten different letters', 'error'); return; }
  await saveSettings({ priceKey: k });
  document.getElementById('s-priceKey').value = k;
  previewPriceKey(k);
  toast('Price code key saved ✓', 'success');
}

// Locations are edited in place; the array is only read back on save
let _locDraft = null;

function renderLocationList() {
  const s = _settings || DEFAULTS;
  if (!_locDraft) _locDraft = s.locations.map(l => ({ ...l }));

  document.getElementById('loc-list').innerHTML = _locDraft.map((l, i) => `
    <div class="field-row loc-row">
      <div class="loc-top">
        <input type="text" class="loc-name" value="${esc(l.name)}" placeholder="Place name" />
        <button class="item-remove" onclick="removeLocation(${i})" aria-label="Remove place">×</button>
      </div>
      <label class="loc-partner">
        <input type="checkbox" class="loc-is-partner" ${l.partner ? 'checked' : ''} />
        <span>A friend sells here and sends me an agreed amount</span>
      </label>
    </div>
  `).join('');
}

function readLocationDraft() {
  const rows = Array.from(document.querySelectorAll('.loc-row'));
  return rows
    .map(r => ({
      name:    r.querySelector('.loc-name').value.trim(),
      partner: r.querySelector('.loc-is-partner').checked,
    }))
    .filter(l => l.name);
}

function addLocation() {
  _locDraft = readLocationDraft();
  _locDraft.push({ name: '', partner: false });
  renderLocationList();
}

function removeLocation(i) {
  _locDraft = readLocationDraft();
  if (_locDraft.length <= 1) { toast('Keep at least one place', 'error'); return; }
  _locDraft.splice(i, 1);
  renderLocationList();
}

async function submitSettings() {
  const locations = readLocationDraft();
  if (!locations.length) { toast('Add at least one place', 'error'); return; }

  const names = locations.map(l => l.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    toast('Two places share a name', 'error'); return;
  }

  // A place being renamed must carry its pairs with it, or they would point at
  // a place that no longer exists and vanish from every filter.
  const old = (_settings.locations || []).map(l => l.name);
  const renames = [];
  if (old.length === locations.length) {
    old.forEach((prev, i) => {
      if (prev !== locations[i].name) renames.push([prev, locations[i].name]);
    });
  }

  await saveSettings({
    businessName: document.getElementById('s-businessName').value.trim() || 'Shoe Stock',
    locations,
  });

  if (renames.length) {
    const db = await getDB();
    const all = await db.getAll('shoes');
    for (const [prev, next] of renames) {
      for (const sh of all.filter(x => x.location === prev)) {
        sh.location = next;
        // A partner's unpaid sales carry the partner's name too
        if (sh.soldBy === prev) sh.soldBy = next;
        await db.put('shoes', sh);
      }
    }
  }

  _locDraft = null;
  renderSettingsView();
  toast('Settings saved ✓', 'success');
}

// Only the part of the old storage readout that mattered: how stale your backup is
function showLastBackup() {
  const el = document.getElementById('last-backup');
  if (!el) return;
  const last = localStorage.getItem('lastBackupAt');
  if (!last) {
    el.textContent = 'No backup taken yet.';
    el.classList.add('bad');
    return;
  }
  const t = new Date(last);
  const p = n => String(n).padStart(2, '0');
  const days = daysSince(`${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`);
  el.textContent = days === 0 ? 'Last backup: today.' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago.`;
  el.classList.toggle('bad', days > 14);
}

window.renderSettingsView = renderSettingsView;
window.addLocation        = addLocation;
window.removeLocation     = removeLocation;
window.submitSettings     = submitSettings;
window.previewPriceKey    = previewPriceKey;
window.savePriceKey       = savePriceKey;
window.showLastBackup     = showLastBackup;
