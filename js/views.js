// ── Places · Owed · Totals ─────────────────────────────────────────────────

// ── Places: what should physically be where ────────────────────────────────

function renderPlaces() {
  const el = document.getElementById('places-body');
  if (!el) return;
  const s = getSettings() || {};
  const inStock = _allShoes.filter(x => x.status === 'in_stock');

  if (!inStock.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <h3>Nothing in stock</h3>
        <p>Pairs you add will be grouped by place here.</p>
      </div>`;
    return;
  }

  // Include configured places with nothing in them: "Car boot: 0" is itself
  // useful information when you are checking what you should be carrying.
  const names = [...new Set([
    ...(s.locations || []).map(l => l.name),
    ...inStock.map(x => x.location).filter(Boolean),
  ])];

  el.innerHTML = names.map(name => {
    const here    = inStock.filter(x => x.location === name);
    const partner = isPartnerLocation(s, name);
    const value   = here.reduce((sum, x) => sum + expectedOf(x), 0);
    const cost    = here.reduce((sum, x) => sum + (Number(x.costPrice) || 0), 0);

    // Money a partner actually owes: pairs they have already sold and not yet
    // paid for. Stock still sitting with them is not a debt, so it is phrased
    // as a possibility ("if sold") and kept separate from the owed figure.
    const owedHere = partner ? _allShoes.filter(x => isOwed(x) && x.soldBy === name) : [];
    const owedSum  = owedHere.reduce((sum, x) => sum + proceedsOf(x), 0);

    return `
      <button class="place-card" onclick="showPlace('${esc(name).replace(/'/g, "\\'")}')">
        <div class="place-top">
          <span class="place-name">${esc(name)}${partner ? '<span class="place-tag">partner</span>' : ''}</span>
          <span class="place-count">${here.length}</span>
        </div>
        <div class="place-meta">
          <span>${partner ? `${fmtNaira(value)} if sold` : `Worth ${fmtNaira(value)}`}</span>
          <span>Cost ${fmtNaira(cost)}</span>
        </div>
        ${owedSum > 0 ? `<div class="place-owed">Owes you ${fmtNaira(owedSum)} for ${owedHere.length} sold pair${owedHere.length === 1 ? '' : 's'}</div>` : ''}
      </button>`;
  }).join('');
}

// Tapping a place jumps to the grid filtered to it — the check-my-car flow
function showPlace(name) {
  _filter.status   = 'in_stock';
  _filter.location = name;
  _filter.size     = 'all';
  _filter.q        = '';
  const searchEl = document.getElementById('stock-search');
  if (searchEl) searchEl.value = '';
  navigate('stock');
  renderFilters();
  renderGrid();
}

// ── Owed: partner sales where the money has not arrived ────────────────────

function renderOwed() {
  const el = document.getElementById('owed-body');
  if (!el) return;

  const owed  = _allShoes.filter(isOwed);
  const total = owed.reduce((sum, x) => sum + proceedsOf(x), 0);

  const head = document.getElementById('owed-total');
  if (head) head.textContent = fmtNaira(total);

  if (!owed.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
        <h3>All settled</h3>
        <p>No partner sales are waiting on payment.</p>
      </div>`;
    return;
  }

  // Grouped by partner, because you settle up with one person at a time
  const byPartner = {};
  for (const sh of owed) (byPartner[sh.soldBy || sh.location] ||= []).push(sh);

  el.innerHTML = Object.entries(byPartner).map(([partner, list]) => {
    const sub = list.reduce((sum, x) => sum + proceedsOf(x), 0);
    return `
      <div class="owed-group">
        <div class="owed-head">
          <span>${esc(partner)}</span>
          <span>${fmtNaira(sub)}</span>
        </div>
        ${list.map(sh => `
          <button class="owed-row" onclick="openShoe(${sh.id})">
            ${sh.photo ? `<img src="${sh.photo}" alt="" />` : `<div class="owed-nophoto"></div>`}
            <div class="owed-info">
              <div class="owed-name">${esc(shoeTitle(sh))}</div>
              <div class="owed-meta">${sh.size ? 'Sz ' + esc(sh.size) + ' · ' : ''}sold ${fmtDate(sh.soldDate)}</div>
            </div>
            <div class="owed-amt">${fmtNaira(proceedsOf(sh))}</div>
          </button>`).join('')}
      </div>`;
  }).join('');
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
    </div>` : ''}

    ${aging.length ? `
    <div class="stat-section">Sitting too long</div>
    <div class="stat-grid">
      ${stat(aging.length, `pairs over ${AGING_DAYS} days`, 'stat-warn')}
      ${stat(fmtNaira(sum(aging, x => Number(x.costPrice) || 0)), 'tied up in them', 'stat-warn')}
    </div>
    <div style="padding:0 16px 16px;">
      <button class="btn btn-outline" style="width:100%;" onclick="showAging()">See them</button>
    </div>` : ''}

    ${topBrands()}
    <div style="height:8px;"></div>
  `;
}

// What actually sells, by profit — worth knowing before the next buying trip
function topBrands() {
  const sold = _allShoes.filter(x => x.status === 'sold' && x.brand);
  if (sold.length < 3) return '';

  const by = {};
  for (const sh of sold) {
    const b = by[sh.brand] ||= { n: 0, profit: 0 };
    b.n += 1;
    b.profit += profitOf(sh);
  }
  const rows = Object.entries(by)
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 5);

  return `
    <div class="stat-section">Best sellers by profit</div>
    <div class="brand-list">
      ${rows.map(([brand, v]) => `
        <div class="brand-row">
          <span class="brand-name">${esc(brand)}</span>
          <span class="brand-n">${v.n} sold</span>
          <span class="brand-profit">${fmtNaira(v.profit)}</span>
        </div>`).join('')}
    </div>`;
}

function showAging() {
  _filter.status   = 'in_stock';
  _filter.location = 'all';
  _filter.size     = 'all';
  _filter.q        = '';
  const searchEl = document.getElementById('stock-search');
  if (searchEl) searchEl.value = '';
  navigate('stock');
  renderFilters();
  // Reuse the grid but narrow it to the aging pairs only
  const grid = document.getElementById('stock-grid');
  const tally = document.getElementById('stock-tally');
  const aging = _allShoes.filter(isAging);
  tally.textContent = `${aging.length} pair${aging.length===1?'':'s'} over ${AGING_DAYS} days`;
  grid.innerHTML = aging.map(sh => `
    <button class="tile" onclick="openShoe(${sh.id})">
      <div class="tile-photo">
        ${sh.photo ? `<img src="${sh.photo}" alt="" loading="lazy" />` : `<div class="tile-nophoto">No photo</div>`}
        <span class="tile-badge badge-aging">${daysSince(sh.acquiredDate)}d</span>
      </div>
      <div class="tile-info">
        <div class="tile-name">${esc(shoeTitle(sh))}</div>
        <div class="tile-meta">
          <span class="tile-size">${sh.size ? 'Sz ' + esc(sh.size) : '—'}</span>
          <span class="tile-price">${fmtShort(expectedOf(sh))}</span>
        </div>
        <div class="tile-loc">${esc(sh.location || '')}</div>
      </div>
    </button>`).join('');
}

window.renderPlaces = renderPlaces;
window.showPlace    = showPlace;
window.renderOwed   = renderOwed;
window.renderTotals = renderTotals;
window.showAging    = showAging;
