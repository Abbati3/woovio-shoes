// ── Formatting + the money model ───────────────────────────────────────────

function fmtNaira(n) {
  return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Compact form for the photo grid, where space is tight: ₦25k, ₦1.2m
function fmtShort(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return '₦' + (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'm';
  if (v >= 1000)    return '₦' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return '₦' + v;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// Local calendar date, not UTC. toISOString() would stamp anything recorded
// between local midnight and 01:00 in Nigeria with the previous day's date.
function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function thisMonth() { return today().slice(0, 7); }

function daysSince(iso) {
  if (!iso) return 0;
  // Parsed as local midnight; new Date('2026-09-10') would be UTC midnight
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Locations ──────────────────────────────────────────────────────────────

// A partner location is somewhere a friend sells on your behalf and remits an
// agreed figure per pair. Your own locations (shop, car) are just places.
function isPartnerLocation(s, name) {
  const l = ((s && s.locations) || []).find(x => x.name === name);
  return !!(l && l.partner);
}

// ── Per-pair money ─────────────────────────────────────────────────────────

// What a sale actually brings you. For a partner sale this is the agreed
// figure, not the retail price — the partner keeps whatever they sell above it,
// and we deliberately do not pretend to know what that was.
function proceedsOf(shoe) {
  if (!shoe || shoe.status !== 'sold') return 0;
  return Number(shoe.soldPrice) || 0;
}

function profitOf(shoe) {
  if (!shoe || shoe.status !== 'sold') return 0;
  return proceedsOf(shoe) - (Number(shoe.costPrice) || 0);
}

// A partner sale is owed until the money reaches you. Own sales are settled at
// the point of sale, so they carry remitted === null and never appear as owed.
function isOwed(shoe) {
  return !!shoe && shoe.status === 'sold' && shoe.remitted === false;
}

// What a pair still in stock should eventually bring in: the agreed figure if
// it is sitting with a partner, otherwise what you are asking for it.
function expectedOf(shoe) {
  if (!shoe || shoe.status !== 'in_stock') return 0;
  if (shoe.agreedAmount != null && shoe.agreedAmount !== '') return Number(shoe.agreedAmount) || 0;
  return Number(shoe.askingPrice) || 0;
}

function shoeTitle(shoe) {
  const parts = [shoe.brand, shoe.model].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Untitled pair';
}

const AGING_DAYS = 90;
function isAging(shoe) {
  return shoe.status === 'in_stock' && daysSince(shoe.acquiredDate) >= AGING_DAYS;
}

window.fmtNaira         = fmtNaira;
window.fmtShort         = fmtShort;
window.fmtDate          = fmtDate;
window.today            = today;
window.thisMonth        = thisMonth;
window.daysSince        = daysSince;
window.esc              = esc;
window.isPartnerLocation = isPartnerLocation;
window.proceedsOf       = proceedsOf;
window.profitOf         = profitOf;
window.isOwed           = isOwed;
window.expectedOf       = expectedOf;
window.shoeTitle        = shoeTitle;
window.isAging          = isAging;
window.AGING_DAYS       = AGING_DAYS;
