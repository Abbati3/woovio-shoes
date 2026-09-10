// ── Stock — photo grid, item detail, add / edit / sell / move ──────────────

let _allShoes = [];
let _filter   = { status: 'in_stock', location: 'all', size: 'all', q: '' };

async function loadShoes() {
  const db = await getDB();
  _allShoes = await db.getAll('shoes');
  _allShoes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return _allShoes;
}

// ── Customer view ──────────────────────────────────────────────────────────
//
// For showing a customer what is available without showing them what you paid
// or what you are owed. Deliberately not persisted: a fresh start is always
// the full app, so you can never leave it on by accident overnight.
let _customerView = false;

function isCustomerView() { return _customerView; }

async function enterCustomerView() {
  _customerView = true;
  document.body.classList.add('customer-view');
  _filter = { status: 'in_stock', location: 'all', size: 'all', q: '' };
  const se = document.getElementById('stock-search');
  if (se) se.value = '';
  navigate('stock');
  await renderStock();
  toast('Customer view — cost and takings hidden', 'success');
}

function exitCustomerView() {
  const done = () => {
    _customerView = false;
    document.body.classList.remove('customer-view');
    renderStock();
  };
  // If a passcode exists, use it here too — otherwise a customer holding the
  // phone could simply tap out of this mode and see your margins.
  if (typeof isLockEnabled === 'function' && isLockEnabled()) lockNow(done);
  else done();
}

async function renderStock() {
  await loadShoes();
  renderStockHeader();
  renderFilters();
  renderGrid();
}

function renderStockHeader() {
  const el = document.getElementById('stock-header');
  if (!el) return;
  const s = getSettings() || {};
  // Only customer view carries a header button — the way out has to be
  // reachable. Entering is tucked into Settings, off the everyday screen.
  el.innerHTML = _customerView
    ? `<div class="hdr-row">
         <div>
           <h1>${esc(s.businessName || 'Available')}</h1>
           <div class="subtitle" id="stock-tally"></div>
         </div>
         <button class="hdr-action" onclick="exitCustomerView()">Done</button>
       </div>`
    : `<h1>Stock</h1>
       <div class="subtitle" id="stock-tally"></div>`;
}

function matchesFilter(sh) {
  // Customer view shows only what you can hand over on the spot — in stock and
  // at one of your own places, not sitting in a partner's shop.
  if (_customerView) {
    if (sh.status !== 'in_stock') return false;
    if (isPartnerLocation(getSettings(), sh.location)) return false;
  }
  if (_filter.status !== 'all'  && sh.status !== _filter.status)     return false;
  if (_filter.location !== 'all' && sh.location !== _filter.location) return false;
  if (_filter.size !== 'all'    && String(sh.size) !== _filter.size)  return false;
  if (_filter.q) {
    const hay = `${sh.brand||''} ${sh.model||''} ${sh.colour||''} ${sh.size||''} ${sh.notes||''}`.toLowerCase();
    if (!hay.includes(_filter.q.toLowerCase())) return false;
  }
  return true;
}

function renderFilters() {
  const s = getSettings() || {};
  const sizes = [...new Set(_allShoes.map(x => String(x.size)).filter(Boolean))]
    .sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));

  const statusChips = [
    ['in_stock', 'In stock'],
    ['sold',     'Sold'],
    ['all',      'All'],
  ].map(([v, label]) =>
    `<button class="chip ${_filter.status===v?'chip-on':''}" onclick="setFilter('status','${v}')">${label}</button>`
  ).join('');

  // An active select is outlined, so a filter that is hiding stock is obvious
  const sizeSelect = `
    <select class="${_filter.size!=='all' ? 'select-on' : ''}" onchange="setFilter('size', this.value)">
      <option value="all" ${_filter.size==='all'?'selected':''}>All sizes</option>
      ${sizes.map(sz => `<option value="${esc(sz)}" ${_filter.size===sz?'selected':''}>Size ${esc(sz)}</option>`).join('')}
    </select>`;

  const clearRow = filtersActive()
    ? `<button class="clear-filters" onclick="clearFilters()">Clear filters ×</button>` : '';

  // A customer only needs to browse by size — where a pair is kept, and
  // whether anything has sold, are none of their business.
  document.getElementById('stock-filters').innerHTML = _customerView
    ? `<div class="filter-selects">${sizeSelect}</div>${clearRow}`
    : `
    <div class="chip-row">${statusChips}</div>
    <div class="filter-selects">
      <select class="${_filter.location!=='all' ? 'select-on' : ''}" onchange="setFilter('location', this.value)">
        <option value="all" ${_filter.location==='all'?'selected':''}>All places</option>
        ${(s.locations||[]).map(l =>
          `<option value="${esc(l.name)}" ${_filter.location===l.name?'selected':''}>${esc(l.name)}</option>`).join('')}
      </select>
      ${sizeSelect}
    </div>
    ${clearRow}
  `;
}

function setFilter(key, value) {
  // Tapping the chip that is already on turns it off, rather than doing nothing
  if (key === 'status' && _filter.status === value && value !== 'all') value = 'all';
  _filter[key] = value;
  renderFilters();
  renderGrid();
}

// "In stock" is the resting state, not a filter the user chose
function filtersActive() {
  return _filter.location !== 'all'
      || _filter.size !== 'all'
      || !!_filter.q
      || (!_customerView && _filter.status !== 'in_stock');
}

function clearFilters() {
  _filter = { status: 'in_stock', location: 'all', size: 'all', q: '' };
  const se = document.getElementById('stock-search');
  if (se) se.value = '';
  const cb = document.getElementById('stock-clear');
  if (cb) cb.style.display = 'none';
  renderFilters();
  renderGrid();
}

function searchStock(q) {
  const had = filtersActive();
  _filter.q = q;
  document.getElementById('stock-clear').style.display = q ? '' : 'none';
  // Only redraw the filter row when the clear button needs to appear or go
  if (filtersActive() !== had) renderFilters();
  renderGrid();
}

function clearStockSearch() {
  const el = document.getElementById('stock-search');
  if (el) { el.value = ''; el.focus(); }
  searchStock('');
}

function renderGrid() {
  const grid = document.getElementById('stock-grid');
  const tally = document.getElementById('stock-tally');
  if (!grid) return;

  const shown = _allShoes.filter(matchesFilter);

  if (!_allShoes.length) {
    tally.innerHTML = '';
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
        <h3>No pairs yet</h3>
        <p>Tap Add to photograph your first pair.</p>
      </div>`;
    return;
  }

  if (!shown.length) {
    tally.innerHTML = '';
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <h3>Nothing here</h3>
        <p>No pairs match these filters.</p>
      </div>`;
    return;
  }

  if (_customerView) {
    tally.textContent = `${shown.length} pair${shown.length===1?'':'s'} available`;
  } else {
    const value = shown.reduce((sum, sh) =>
      sum + (sh.status === 'in_stock' ? expectedOf(sh) : proceedsOf(sh)), 0);
    tally.textContent = `${shown.length} pair${shown.length===1?'':'s'} · ${fmtNaira(value)}`;
  }

  grid.innerHTML = shown.map(sh => {
    // The customer sees the asking price only — never the agreed figure a
    // partner sends back, which is what expectedOf() would give.
    if (_customerView) return `
      <button class="tile" onclick="openShoe(${sh.id})">
        <div class="tile-photo">
          ${sh.photo
            ? `<img src="${sh.photo}" alt="${esc(shoeTitle(sh))}" loading="lazy" />`
            : `<div class="tile-nophoto">No photo</div>`}
        </div>
        <div class="tile-info">
          <div class="tile-name">${esc(shoeTitle(sh))}</div>
          <div class="tile-meta">
            <span class="tile-size">${sh.size ? 'Size ' + esc(sh.size) : ''}</span>
            <span class="tile-price">${fmtShort(sh.askingPrice)}</span>
          </div>
        </div>
      </button>`;

    const sold  = sh.status === 'sold';
    const owed  = isOwed(sh);
    const aging = isAging(sh);
    const price = sold ? proceedsOf(sh) : expectedOf(sh);
    return `
      <button class="tile ${sold ? 'tile-sold' : ''}" onclick="openShoe(${sh.id})">
        <div class="tile-photo">
          ${sh.photo
            ? `<img src="${sh.photo}" alt="${esc(shoeTitle(sh))}" loading="lazy" />`
            : `<div class="tile-nophoto">No photo</div>`}
          ${sold  ? `<span class="tile-badge ${owed ? 'badge-owed' : 'badge-sold'}">${owed ? 'Owed' : 'Sold'}</span>` : ''}
          ${aging ? `<span class="tile-badge badge-aging">${daysSince(sh.acquiredDate)}d</span>` : ''}
        </div>
        <div class="tile-info">
          <div class="tile-name">${esc(shoeTitle(sh))}</div>
          <div class="tile-meta">
            <span class="tile-size">${sh.size ? 'Sz ' + esc(sh.size) : '—'}</span>
            <span class="tile-price">${fmtShort(price)}</span>
          </div>
          <div class="tile-loc">${esc(sh.location || '')}</div>
        </div>
      </button>`;
  }).join('');
}

// ── Item detail sheet ──────────────────────────────────────────────────────

async function openShoe(id) {
  const db = await getDB();
  const sh = await db.get('shoes', id);
  if (!sh) return;

  const s = getSettings() || {};
  const partner = isPartnerLocation(s, sh.location);
  const sold    = sh.status === 'sold';
  const owed    = isOwed(sh);

  const row = (label, value) =>
    value === '' || value == null ? '' : `<div class="d-row"><span>${label}</span><span>${value}</span></div>`;

  const existing = document.getElementById('sheet');
  if (existing) existing.remove();

  // Customer variant: the pair and its price, nothing about the business
  if (_customerView) {
    const cust = document.createElement('div');
    cust.id = 'sheet';
    cust.innerHTML = `
      <div class="sheet-overlay" onclick="closeSheet()"></div>
      <div class="sheet-panel" id="sheet-panel">
        <div class="sheet-handle"></div>
        <div class="d-head">
          <div>
            <div class="d-title">${esc(shoeTitle(sh))}</div>
            <div class="d-sub">${sh.size ? 'Size ' + esc(sh.size) : ''}${sh.colour ? ' · ' + esc(sh.colour) : ''}</div>
          </div>
        </div>
        ${sh.photo ? `<img class="d-photo" src="${sh.photo}" alt="${esc(shoeTitle(sh))}" />` : ''}
        <div class="d-price">${fmtNaira(sh.askingPrice)}</div>
        <div class="sheet-actions">
          <button class="btn btn-outline" style="width:100%;" onclick="closeSheet()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(cust);
    openSheet(cust);
    return;
  }

  const el = document.createElement('div');
  el.id = 'sheet';
  el.innerHTML = `
    <div class="sheet-overlay" onclick="closeSheet()"></div>
    <div class="sheet-panel" id="sheet-panel">
      <div class="sheet-handle"></div>
      <div class="d-head">
        <div>
          <div class="d-title">${esc(shoeTitle(sh))}</div>
          <div class="d-sub">${sh.size ? 'Size ' + esc(sh.size) : ''}${sh.colour ? ' · ' + esc(sh.colour) : ''}</div>
        </div>
        ${sold ? `<span class="tile-badge ${owed?'badge-owed':'badge-sold'}" style="position:static;">${owed?'Owed':'Sold'}</span>` : ''}
      </div>

      ${sh.photo ? `<img class="d-photo" src="${sh.photo}" alt="${esc(shoeTitle(sh))}" />` : ''}

      <div class="d-rows">
        ${row('Place', esc(sh.location || '—'))}
        ${row('Cost', fmtNaira(sh.costPrice))}
        ${!sold ? row('Asking', fmtNaira(sh.askingPrice)) : ''}
        ${partner && !sold && sh.agreedAmount != null && sh.agreedAmount !== '' ? row('Sends you if sold', fmtNaira(sh.agreedAmount)) : ''}
        ${sold ? row('Sold for', fmtNaira(sh.soldPrice)) : ''}
        ${sold ? row('Sold on', fmtDate(sh.soldDate)) : ''}
        ${sold && sh.soldBy ? row('Sold by', esc(sh.soldBy)) : ''}
        ${sold ? row('Profit', `<strong style="color:${profitOf(sh) >= 0 ? '#2E7D32' : 'var(--danger)'}">${fmtNaira(profitOf(sh))}</strong>`) : ''}
        ${sold && sh.remitted === true ? row('Money received', fmtDate(sh.remittedDate)) : ''}
        ${row('Added', fmtDate(sh.acquiredDate))}
        ${!sold && isAging(sh) ? row('In stock', `${daysSince(sh.acquiredDate)} days`) : ''}
        ${row('Supplier', esc(sh.supplier || ''))}
        ${sh.notes ? `<div class="d-notes">${esc(sh.notes)}</div>` : ''}
      </div>

      <div class="sheet-actions">
        ${!sold ? `<button class="btn btn-gold" style="width:100%;" onclick="openSell(${sh.id})">Record sale</button>` : ''}
        ${owed  ? `<button class="btn btn-gold" style="width:100%;" onclick="markRemitted(${sh.id})">Mark money received</button>` : ''}
        <div style="display:flex;gap:10px;margin-top:10px;">
          ${!sold ? `<button class="btn btn-outline" style="flex:1;" onclick="openMove(${sh.id})">Move</button>` : ''}
          <button class="btn btn-outline" style="flex:1;" onclick="openEdit(${sh.id})">Edit</button>
          <button class="btn btn-outline" style="flex:1;color:var(--danger);border-color:var(--danger);" onclick="deleteShoe(${sh.id})">Delete</button>
        </div>
        <button class="btn btn-outline" style="width:100%;margin-top:10px;" onclick="closeSheet()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  openSheet(el);
}

// Every sheet is shown through here, so drag-to-dismiss is never forgotten on
// a new one. The handle used to be decorative: with the panel up to 88vh tall
// there was barely any overlay left to tap, so a tall sheet felt stuck.
function openSheet(el) {
  const panel = el.querySelector('#sheet-panel');
  setTimeout(() => panel.classList.add('open'), 20);
  makeSheetDraggable(panel);
}

function makeSheetDraggable(panel) {
  let startY = 0, moved = 0, dragging = false;

  const start = e => {
    // Only from the top of the sheet, otherwise the drag fights the scroll
    if (panel.scrollTop > 0) return;
    dragging = true;
    moved = 0;
    startY = (e.touches ? e.touches[0] : e).clientY;
    panel.style.transition = 'none';
    if (!e.touches) {
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', end);
    }
  };

  const move = e => {
    if (!dragging) return;
    moved = Math.max(0, (e.touches ? e.touches[0] : e).clientY - startY);
    if (moved > 0) {
      if (e.cancelable) e.preventDefault();
      panel.style.transform = `translateY(${moved}px)`;
    }
  };

  const end = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', end);
    panel.style.transition = '';
    panel.style.transform  = '';
    if (moved > 90) closeSheet();
  };

  panel.addEventListener('touchstart', start, { passive: true });
  panel.addEventListener('touchmove',  move,  { passive: false });
  panel.addEventListener('touchend',   end);
  panel.addEventListener('touchcancel', end);
  panel.addEventListener('mousedown',  start);
}

function closeSheet() {
  const el = document.getElementById('sheet');
  if (!el) return;
  const p = el.querySelector('#sheet-panel');
  if (p) { p.style.transition = ''; p.style.transform = ''; p.classList.remove('open'); }
  setTimeout(() => el.remove(), 250);
}

// ── Add / edit form ────────────────────────────────────────────────────────

let _editingId = null;
let _photoData = '';

function openAdd() {
  _editingId = null;
  _photoData = '';
  renderForm(null);
  navigate('form');
}

async function openEdit(id) {
  const db = await getDB();
  const sh = await db.get('shoes', id);
  if (!sh) return;
  closeSheet();
  _editingId = id;
  _photoData = sh.photo || '';
  renderForm(sh);
  navigate('form');
}

function renderForm(sh) {
  const s = getSettings() || {};
  const isNew = !sh;
  const loc = sh ? sh.location : (s.locations[0] && s.locations[0].name) || '';

  document.getElementById('view-form').innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:12px;">
      <button class="hdr-back" onclick="navigate('stock')" aria-label="Back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div>
        <h1>${isNew ? 'Add pair' : 'Edit pair'}</h1>
        <div class="subtitle">${isNew ? 'Photograph and describe it' : esc(shoeTitle(sh))}</div>
      </div>
    </div>

    <div class="settings-list">

      <div class="field-group">
        <div class="field-group-label">Photo</div>
        <div style="padding:14px 16px;">
          <div id="photo-preview" class="photo-preview">
            ${_photoData ? `<img src="${_photoData}" alt="" />` : `<div class="photo-empty">The photo is how you will recognise this pair later</div>`}
          </div>
          <button class="btn btn-outline" style="width:100%;margin-top:10px;" onclick="pickPhoto()">
            ${_photoData ? 'Replace photo' : 'Take or choose photo'}
          </button>
          <!-- No capture attribute: it would force the camera and hide the
               photo library, so an existing picture could not be chosen.
               Kept visually hidden rather than display:none, which some
               engines treat as unclickable. -->
          <input id="photo-input" type="file" accept="image/*"
                 style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;"
                 onchange="handlePhoto(this)" />
          ${_photoData ? `<button class="btn btn-outline" style="width:100%;margin-top:8px;height:40px;font-size:14px;color:var(--danger);border-color:var(--danger);" onclick="clearPhoto()">Remove photo</button>` : ''}
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">The pair</div>
        <div class="field-row">
          <label>Brand</label>
          <input id="f-brand" type="text" value="${esc(sh?.brand||'')}" placeholder="Nike, Clarks…" list="brand-list" autocomplete="off" />
          <datalist id="brand-list"></datalist>
        </div>
        <div class="field-row">
          <label>Model / description</label>
          <input id="f-model" type="text" value="${esc(sh?.model||'')}" placeholder="Air Force 1" />
        </div>
        <div class="field-row">
          <label>Colour</label>
          <input id="f-colour" type="text" value="${esc(sh?.colour||'')}" placeholder="White" />
        </div>
        <div class="field-row">
          <label>Size${isNew ? ' — separate with commas to add several at once' : ''}</label>
          <input id="f-size" type="text" value="${esc(sh?.size||'')}" placeholder="${isNew ? '42  or  40, 41, 42' : '42'}" autocapitalize="off" />
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">Money</div>
        <div class="field-row">
          <label>Cost price (₦) — what you paid</label>
          <input id="f-cost" type="number" min="0" step="0.01" value="${sh?.costPrice ?? ''}" placeholder="0.00" />
        </div>
        <div class="field-row">
          <label>Asking price (₦)</label>
          <input id="f-asking" type="number" min="0" step="0.01" value="${sh?.askingPrice ?? ''}" placeholder="0.00" />
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">Where it is</div>
        <div class="field-row">
          <label>Place</label>
          <select id="f-location" onchange="onFormLocationChange()">
            ${(s.locations||[]).map(l =>
              `<option value="${esc(l.name)}" ${loc===l.name?'selected':''}>${esc(l.name)}${l.partner?' (partner)':''}</option>`).join('')}
          </select>
        </div>
        <div class="field-row" id="f-agreed-row" style="${isPartnerLocation(s, loc) ? '' : 'display:none;'}">
          <label>Agreed amount back to me (₦)</label>
          <input id="f-agreed" type="number" min="0" step="0.01" value="${sh?.agreedAmount ?? ''}" placeholder="0.00" />
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">Extras</div>
        <div class="field-row">
          <label>Date added</label>
          <input id="f-acquired" type="date" value="${sh?.acquiredDate || today()}" />
        </div>
        <div class="field-row">
          <label>Supplier / where you bought it</label>
          <input id="f-supplier" type="text" value="${esc(sh?.supplier||'')}" placeholder="Optional" list="supplier-list" autocomplete="off" />
          <datalist id="supplier-list"></datalist>
        </div>
        <div class="field-row">
          <label>Notes</label>
          <textarea id="f-notes" rows="2" placeholder="Optional">${esc(sh?.notes||'')}</textarea>
        </div>
      </div>

      <button class="btn btn-primary" onclick="saveShoe()">${isNew ? 'Save pair' : 'Save changes'}</button>
      <div style="height:8px;"></div>
    </div>
  `;

  fillFormSuggestions();
}

// Brand and supplier suggestions come from what you have already entered
async function fillFormSuggestions() {
  try {
    const all = _allShoes.length ? _allShoes : await loadShoes();
    const fill = (id, values) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = [...new Set(values.filter(Boolean))]
        .map(v => `<option value="${esc(v)}"></option>`).join('');
    };
    fill('brand-list',    all.map(x => x.brand));
    fill('supplier-list', all.map(x => x.supplier));
  } catch (e) { console.error('suggestions:', e); }
}

function onFormLocationChange() {
  const s = getSettings() || {};
  const loc = document.getElementById('f-location').value;
  document.getElementById('f-agreed-row').style.display = isPartnerLocation(s, loc) ? '' : 'none';
}

// Photos are the bulk of this app's storage, so they are resized hard on the
// way in rather than stored at camera resolution.
function pickPhoto() {
  const input = document.getElementById('photo-input');
  if (input) input.click();
}

function handlePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      _photoData = await resizePhoto(e.target.result, 800, 0.72);
      const box = document.getElementById('photo-preview');
      if (box) box.innerHTML = `<img src="${_photoData}" alt="" />`;
      toast('Photo attached', 'success');
    } catch (err) {
      toast('Could not read that image', 'error');
    }
    // Cleared so re-picking the same file still fires a change event
    input.value = '';
  };
  reader.onerror = () => { toast('Could not read that image', 'error'); input.value = ''; };
  reader.readAsDataURL(file);
}

function clearPhoto() {
  _photoData = '';
  const box = document.getElementById('photo-preview');
  if (box) box.innerHTML = `<div class="photo-empty">The photo is how you will recognise this pair later</div>`;
}

function resizePhoto(dataUrl, maxEdge, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function saveShoe() {
  try {
    const s = getSettings() || {};
    const brand  = document.getElementById('f-brand').value.trim();
    const model  = document.getElementById('f-model').value.trim();
    if (!brand && !model) {
      toast('Give it a brand or a description', 'error');
      document.getElementById('f-brand').focus();
      return;
    }

    const cost   = parseFloat(document.getElementById('f-cost').value)   || 0;
    const asking = parseFloat(document.getElementById('f-asking').value) || 0;
    if (cost < 0 || asking < 0) { toast('Prices cannot be negative', 'error'); return; }

    const location = document.getElementById('f-location').value;
    const partner  = isPartnerLocation(s, location);
    const agreedRaw = document.getElementById('f-agreed').value;
    const agreed = partner ? (parseFloat(agreedRaw) || 0) : null;
    if (partner && agreed <= 0) {
      toast('Set the amount this partner sends you', 'error');
      document.getElementById('f-agreed').focus();
      return;
    }

    const base = {
      photo:        _photoData,
      brand, model,
      colour:       document.getElementById('f-colour').value.trim(),
      costPrice:    cost,
      askingPrice:  asking,
      location,
      agreedAmount: agreed,
      acquiredDate: document.getElementById('f-acquired').value || today(),
      supplier:     document.getElementById('f-supplier').value.trim(),
      notes:        document.getElementById('f-notes').value.trim(),
    };

    const db = await getDB();
    const sizeRaw = document.getElementById('f-size').value.trim();

    if (_editingId) {
      const prev = await db.get('shoes', _editingId);
      await db.put('shoes', Object.assign({}, prev, base, { size: sizeRaw, id: _editingId }));
      toast('Pair updated ✓', 'success');
    } else {
      // A comma-separated size list means one pair per size, sharing the photo
      // and details — the common case of buying one model in several sizes.
      const sizes = sizeRaw.split(',').map(x => x.trim()).filter(Boolean);
      const list  = sizes.length ? sizes : [''];
      for (const size of list) {
        await db.put('shoes', Object.assign({}, base, {
          size,
          status:       'in_stock',
          soldDate:     null,
          soldPrice:    null,
          soldBy:       null,
          buyer:        '',
          remitted:     null,
          remittedDate: null,
          createdAt:    new Date().toISOString(),
        }));
      }
      toast(list.length > 1 ? `${list.length} pairs added ✓` : 'Pair added ✓', 'success');
      nudgeBackup(list.length);
    }

    _editingId = null;
    _photoData = '';
    navigate('stock');
    await renderStock();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
    console.error('saveShoe:', e);
  }
}

async function deleteShoe(id) {
  if (!confirm('Delete this pair? This cannot be undone.')) return;
  const db = await getDB();
  await db.delete('shoes', id);
  closeSheet();
  toast('Deleted', 'success');
  await renderStock();
}

// ── Sell ───────────────────────────────────────────────────────────────────

async function openSell(id) {
  const db = await getDB();
  const sh = await db.get('shoes', id);
  if (!sh) return;
  const s = getSettings() || {};
  const partner = isPartnerLocation(s, sh.location);
  closeSheet();

  const suggested = partner
    ? (sh.agreedAmount || 0)
    : (sh.askingPrice || 0);

  await new Promise(r => setTimeout(r, 260));

  const el = document.createElement('div');
  el.id = 'sheet';
  el.innerHTML = `
    <div class="sheet-overlay" onclick="closeSheet()"></div>
    <div class="sheet-panel" id="sheet-panel">
      <div class="sheet-handle"></div>
      <div class="d-title">Record sale</div>
      <div class="d-sub" style="margin-bottom:14px;">${esc(shoeTitle(sh))}${sh.size ? ' · size ' + esc(sh.size) : ''}</div>

      ${partner ? `
        <p class="hint" style="padding:0 0 10px;">Sold at ${esc(sh.location)}. You are owed the agreed amount; whatever they sold it above that is theirs.</p>
      ` : ''}

      <div class="field-group" style="margin-bottom:14px;">
        <div class="field-row">
          <label>${partner ? 'Amount they send you (₦)' : 'Sold for (₦)'}</label>
          <input id="sell-price" type="number" min="0" step="0.01" value="${suggested || ''}" placeholder="0.00" />
        </div>
        <div class="field-row">
          <label>Date</label>
          <input id="sell-date" type="date" value="${today()}" />
        </div>
        ${!partner ? `
        <div class="field-row">
          <label>Buyer (optional)</label>
          <input id="sell-buyer" type="text" placeholder="Name or phone" />
        </div>` : ''}
      </div>

      <div class="sheet-actions">
        <button class="btn btn-gold" style="width:100%;" onclick="confirmSell(${sh.id}, ${partner})">
          ${partner ? 'Sold — money not yet received' : 'Record sale'}
        </button>
        <button class="btn btn-outline" style="width:100%;margin-top:10px;" onclick="closeSheet()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  openSheet(el);
}

async function confirmSell(id, partner) {
  const price = parseFloat(document.getElementById('sell-price').value) || 0;
  if (price <= 0) { toast('Enter the amount', 'error'); document.getElementById('sell-price').focus(); return; }

  const db = await getDB();
  const sh = await db.get('shoes', id);
  if (!sh) return;

  sh.status    = 'sold';
  sh.soldPrice = price;
  sh.soldDate  = document.getElementById('sell-date').value || today();
  sh.soldBy    = partner ? sh.location : 'Me';
  sh.buyer     = partner ? '' : (document.getElementById('sell-buyer')?.value.trim() || '');
  // Own sales are settled on the spot; a partner owes until they remit.
  sh.remitted     = partner ? false : null;
  sh.remittedDate = null;

  await db.put('shoes', sh);
  closeSheet();
  toast(partner ? `Sold — ${fmtNaira(price)} owed by ${sh.location}` : 'Sale recorded ✓', 'success');
  await renderStock();
  renderOwed();
}

async function markRemitted(id) {
  const db = await getDB();
  const sh = await db.get('shoes', id);
  if (!sh) return;
  sh.remitted     = true;
  sh.remittedDate = today();
  await db.put('shoes', sh);
  closeSheet();
  toast('Marked as received ✓', 'success');
  await loadShoes();
  renderOwed();
  renderGrid();
}

// ── Move ───────────────────────────────────────────────────────────────────

async function openMove(id) {
  const db = await getDB();
  const sh = await db.get('shoes', id);
  if (!sh) return;
  const s = getSettings() || {};
  closeSheet();
  await new Promise(r => setTimeout(r, 260));

  const el = document.createElement('div');
  el.id = 'sheet';
  el.innerHTML = `
    <div class="sheet-overlay" onclick="closeSheet()"></div>
    <div class="sheet-panel" id="sheet-panel">
      <div class="sheet-handle"></div>
      <div class="d-title">Move pair</div>
      <div class="d-sub" style="margin-bottom:14px;">${esc(shoeTitle(sh))}${sh.size ? ' · size ' + esc(sh.size) : ''}</div>

      <div class="field-group" style="margin-bottom:14px;">
        <div class="field-row">
          <label>Move to</label>
          <select id="move-loc" onchange="onMoveLocationChange()">
            ${(s.locations||[]).map(l =>
              `<option value="${esc(l.name)}" ${sh.location===l.name?'selected':''}>${esc(l.name)}${l.partner?' (partner)':''}</option>`).join('')}
          </select>
        </div>
        <div class="field-row" id="move-agreed-row" style="${isPartnerLocation(s, sh.location) ? '' : 'display:none;'}">
          <label>Agreed amount back to me (₦)</label>
          <input id="move-agreed" type="number" min="0" step="0.01" value="${sh.agreedAmount ?? ''}" placeholder="0.00" />
        </div>
      </div>

      <div class="sheet-actions">
        <button class="btn btn-gold" style="width:100%;" onclick="confirmMove(${sh.id})">Move</button>
        <button class="btn btn-outline" style="width:100%;margin-top:10px;" onclick="closeSheet()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  openSheet(el);
}

function onMoveLocationChange() {
  const s = getSettings() || {};
  const loc = document.getElementById('move-loc').value;
  document.getElementById('move-agreed-row').style.display = isPartnerLocation(s, loc) ? '' : 'none';
}

async function confirmMove(id) {
  const s = getSettings() || {};
  const loc = document.getElementById('move-loc').value;
  const partner = isPartnerLocation(s, loc);
  const agreed = partner ? (parseFloat(document.getElementById('move-agreed').value) || 0) : null;
  if (partner && agreed <= 0) {
    toast('Set the amount this partner sends you', 'error');
    document.getElementById('move-agreed').focus();
    return;
  }

  const db = await getDB();
  const sh = await db.get('shoes', id);
  if (!sh) return;
  sh.location     = loc;
  sh.agreedAmount = agreed;
  await db.put('shoes', sh);
  closeSheet();
  toast(`Moved to ${loc}`, 'success');
  await renderStock();
  renderPlaces();
}

// ── Backup nudge ───────────────────────────────────────────────────────────

function nudgeBackup(added) {
  const n = (parseInt(localStorage.getItem('sinceBackup')) || 0) + (added || 1);
  localStorage.setItem('sinceBackup', n);
  if (n >= 15) {
    setTimeout(() => toast(`${n} changes since your last backup — export one in Settings`, 'error'), 2400);
  }
}

window.renderStock       = renderStock;
window.loadShoes         = loadShoes;
window.isCustomerView    = isCustomerView;
window.enterCustomerView = enterCustomerView;
window.exitCustomerView  = exitCustomerView;
window.openSheet         = openSheet;
window.setFilter         = setFilter;
window.clearFilters      = clearFilters;
window.filtersActive     = filtersActive;
window.searchStock       = searchStock;
window.clearStockSearch  = clearStockSearch;
window.renderGrid        = renderGrid;
window.openShoe          = openShoe;
window.closeSheet        = closeSheet;
window.openAdd           = openAdd;
window.openEdit          = openEdit;
window.pickPhoto         = pickPhoto;
window.handlePhoto       = handlePhoto;
window.clearPhoto        = clearPhoto;
window.onFormLocationChange = onFormLocationChange;
window.saveShoe          = saveShoe;
window.deleteShoe        = deleteShoe;
window.openSell          = openSell;
window.confirmSell       = confirmSell;
window.markRemitted      = markRemitted;
window.openMove          = openMove;
window.onMoveLocationChange = onMoveLocationChange;
window.confirmMove       = confirmMove;
window.nudgeBackup       = nudgeBackup;
