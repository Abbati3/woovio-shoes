// ── Places · Totals ────────────────────────────────────────────────────────

// ── Places: what is where, and what partners owe ───────────────────────────

let _placeNames = [];   // addressed by index, so a name like "Musa's shop" needs no escaping

function renderPlaces() {
  const el = document.getElementById('places-body');
  if (!el) return;
  const s = getSettings() || {};
  const inStock = _allShoes.filter(x => x.status === 'in_stock');
  const owedAll = _allShoes.filter(isOwed);

  if (!inStock.length && !owedAll.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <h3>Nothing in stock</h3>
        <p>Pairs you add will be grouped by place here.</p>
      </div>`;
    return;
  }

  // Configured places even when empty — "Car boot: 0" is itself useful when
  // checking what you should be carrying — plus any place still holding stock
  // or unpaid sales after being removed from Settings, so none drops from view.
  _placeNames = [...new Set([
    ...(s.locations || []).map(l => l.name),
    ...inStock.map(x => x.location),
    ...owedAll.map(x => x.location),
  ].filter(Boolean))];

  el.innerHTML = _placeNames.map((name, i) => {
    const here    = inStock.filter(x => x.location === name);
    const partner = isPartnerLocation(s, name);
    const value   = here.reduce((sum, x) => sum + expectedOf(x), 0);
    const cost    = here.reduce((sum, x) => sum + (Number(x.costPrice) || 0), 0);

    // Owed money is pairs a partner has already sold and not paid for. Stock
    // still sitting with them is not a debt, so that is phrased as "if sold".
    // Matched on location, which a rename in Settings carries across.
    const owedHere = owedAll.filter(x => x.location === name);
    const owedSum  = owedHere.reduce((sum, x) => sum + proceedsOf(x), 0);

    return `
      <div class="place-card">
        <button class="place-main" onclick="showPlaceAt(${i})">
          <div class="place-top">
            <span class="place-name">${esc(name)}${partner ? '<span class="place-tag">partner</span>' : ''}</span>
            <span class="place-count">${here.length}</span>
          </div>
          <div class="place-meta">
            <span>${partner ? `${fmtNaira(value)} if sold` : `Worth ${fmtNaira(value)}`}</span>
            <span>Cost ${fmtNaira(cost)}</span>
          </div>
        </button>
        ${owedSum > 0 ? `
        <button class="place-owed" onclick="openOwedAt(${i})">
          <span>Owes you ${fmtNaira(owedSum)} for ${owedHere.length} sold pair${owedHere.length === 1 ? '' : 's'}</span>
          <span class="place-owed-go">Settle ›</span>
        </button>` : ''}
      </div>`;
  }).join('');
}

function showPlaceAt(i) { showPlace(_placeNames[i]); }
function openOwedAt(i)  { openOwed(_placeNames[i]); }

// Tapping a place jumps to the grid filtered to it — the check-my-car flow
function showPlace(name) {
  _filter.status   = 'in_stock';
  _filter.location = name;
  _filter.size     = 'all';
  _filter.q        = '';
  _filter.aging    = false;
  const searchEl = document.getElementById('stock-search');
  if (searchEl) searchEl.value = '';
  navigate('stock');
}

// ── What a partner owes ────────────────────────────────────────────────────

let _owedPlace = null;

// Settled one partner at a time, because that is how the money arrives
function openOwed(name) {
  const list  = _allShoes.filter(x => isOwed(x) && x.location === name);
  if (!list.length) return;
  const total = list.reduce((sum, x) => sum + proceedsOf(x), 0);
  _owedPlace = name;

  const existing = document.getElementById('sheet');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'sheet';
  el.innerHTML = `
    <div class="sheet-overlay" onclick="closeSheet()"></div>
    <div class="sheet-panel" id="sheet-panel">
      <div class="sheet-handle"></div>
      <div class="d-title">${esc(name)} owes you ${fmtNaira(total)}</div>
      <div class="d-sub" style="margin-bottom:12px;">${list.length} sold pair${list.length === 1 ? '' : 's'} not yet paid for</div>
      <div class="owed-group" style="margin-bottom:14px;">
        ${list.map(sh => `
          <button class="owed-row" onclick="openShoe(${sh.id})">
            ${sh.photo ? `<img src="${sh.photo}" alt="" />` : `<div class="owed-nophoto"></div>`}
            <div class="owed-info">
              <div class="owed-name">${esc(shoeTitle(sh))}</div>
              <div class="owed-meta">${sh.size ? 'Sz ' + esc(sh.size) + ' · ' : ''}sold ${fmtDate(sh.soldDate)}</div>
            </div>
            <div class="owed-amt">${fmtNaira(proceedsOf(sh))}</div>
          </button>`).join('')}
      </div>
      <div class="sheet-actions">
        <button class="btn btn-gold" style="width:100%;" onclick="settleOwed()">Mark all ${fmtNaira(total)} received</button>
        <button class="btn btn-outline" style="width:100%;margin-top:10px;" onclick="closeSheet()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  openSheet(el);
}

async function settleOwed() {
  const name = _owedPlace;
  if (!name) return;
  const db   = await getDB();
  const list = (await db.getAll('shoes')).filter(x => isOwed(x) && x.location === name);
  if (!list.length) { closeSheet(); return; }
  const total = list.reduce((sum, x) => sum + proceedsOf(x), 0);
  if (!confirm(`Mark ${fmtNaira(total)} from ${name} as received, for ${list.length} pair${list.length === 1 ? '' : 's'}?`)) return;

  const when = today();
  for (const sh of list) {
    sh.remitted     = true;
    sh.remittedDate = when;
    await db.put('shoes', sh);
  }
  _owedPlace = null;
  closeSheet();
  await loadShoes();
  renderPlaces();
  toast(`${fmtNaira(total)} from ${name} marked received ✓`, 'success');
}

// ── Totals ─────────────────────────────────────────────────────────────────

function renderTotals() {
  const el = document.getElementById('totals-body');
  if (!el) return;

  if (!_allShoes.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>
        <h3>Nothing to total yet</h3>
        <p>Add a few pairs and your figures will appear here.</p>
      </div>`;
    return;
  }

  const inStock = _allShoes.filter(x => x.status === 'in_stock');
  const sold    = _allShoes.filter(x => x.status === 'sold');

  const stockCost     = inStock.reduce((s, x) => s + (Number(x.costPrice) || 0), 0);
  const stockExpected = inStock.reduce((s, x) => s + expectedOf(x), 0);

  const month      = thisMonth();
  const soldMonth  = sold.filter(x => (x.soldDate || '').startsWith(month));

  const sum   = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
  const owed  = _allShoes.filter(isOwed);
  const aging = inStock.filter(isAging);

  const stat = (value, label, cls) => `
    <div class="stat ${cls || ''}">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;

  el.innerHTML = `
    <div class="stat-section">Stock on hand</div>
    <div class="stat-grid">
      ${stat(inStock.length, 'pairs in stock')}
      ${stat(fmtNaira(stockCost), 'tied up at cost')}
      ${stat(fmtNaira(stockExpected), 'expected if all sell')}
      ${stat(fmtNaira(stockExpected - stockCost), 'profit if all sell')}
    </div>

    <div class="stat-section">This month</div>
    <div class="stat-grid">
      ${stat(soldMonth.length, 'pairs sold')}
      ${stat(fmtNaira(sum(soldMonth, proceedsOf)), 'taken in')}
      ${stat(fmtNaira(sum(soldMonth, profitOf)), 'profit', sum(soldMonth, profitOf) < 0 ? 'stat-warn' : '')}
    </div>

    <div class="stat-section">All time</div>
    <div class="stat-grid">
      ${stat(sold.length, 'pairs sold')}
      ${stat(fmtNaira(sum(sold, proceedsOf)), 'taken in')}
      ${stat(fmtNaira(sum(sold, profitOf)), 'profit', sum(sold, profitOf) < 0 ? 'stat-warn' : '')}
    </div>

    ${owed.length ? `
    <div class="stat-section">Waiting on partners</div>
    <div class="stat-grid">
      ${stat(owed.length, 'pairs sold, unpaid', 'stat-warn')}
      ${stat(fmtNaira(sum(owed, proceedsOf)), 'owed to you', 'stat-warn')}
    </div>
    <div style="padding:10px 16px 0;">
      <button class="btn btn-outline" style="width:100%;" onclick="navigate('places')">See who owes</button>
    </div>` : ''}

    ${aging.length ? `
    <div class="stat-section">Sitting too long</div>
    <div class="stat-grid">
      ${stat(aging.length, `pairs over ${AGING_DAYS} days`, 'stat-warn')}
      ${stat(fmtNaira(sum(aging, x => Number(x.costPrice) || 0)), 'tied up in them', 'stat-warn')}
    </div>
    <div style="padding:10px 16px 16px;">
      <button class="btn btn-outline" style="width:100%;" onclick="showAging()">See them</button>
    </div>` : ''}

    <div style="height:8px;"></div>
  `;
}

// A filter on the normal grid rather than a separate list, so aging pairs keep
// their references and can be selected, moved and sent like any others
function showAging() {
  _filter.status   = 'in_stock';
  _filter.location = 'all';
  _filter.size     = 'all';
  _filter.q        = '';
  _filter.aging    = true;
  const searchEl = document.getElementById('stock-search');
  if (searchEl) searchEl.value = '';
  navigate('stock');
}

window.renderPlaces = renderPlaces;
window.showPlace    = showPlace;
window.showPlaceAt  = showPlaceAt;
window.openOwedAt   = openOwedAt;
window.openOwed     = openOwed;
window.settleOwed   = settleOwed;
window.renderTotals = renderTotals;
window.showAging    = showAging;
