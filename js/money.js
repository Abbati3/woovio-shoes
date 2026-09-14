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

// ── Reference and price codes ──────────────────────────────────────────────

// The short reference stamped on sent photos, so "#14" in a client's reply
// names exactly one pair however WhatsApp orders the images.
function refCode(shoe) { return '#' + shoe.id; }

// A trader's price code: ten different letters standing for 1 2 3 4 5 6 7 8 9 0,
// written in thousands. A customer sees letters; you read the price.
const DEFAULT_PRICE_KEY = 'MAKEPROFIT';

function isValidPriceKey(k) {
  k = String(k || '').toUpperCase();
  return /^[A-Z]{10}$/.test(k) && new Set(k).size === 10;
}

function priceKey() {
  const s = typeof getSettings === 'function' ? getSettings() : null;
  const k = String((s && s.priceKey) || '').toUpperCase();
  return isValidPriceKey(k) ? k : DEFAULT_PRICE_KEY;
}

function priceCode(amount, key) {
  const v = Number(amount) || 0;
  if (v <= 0) return '';
  const k = key || priceKey();
  const thousands = v / 1000;
  const digits = Number.isInteger(thousands) ? String(thousands) : String(Math.round(thousands * 10) / 10);
  // digit 1 is the key's first letter, … 9 the ninth, 0 the tenth
  return digits.split('').map(ch => ch === '.' ? '.' : k[(Number(ch) + 9) % 10]).join('');
}

// Asking price, then the lowest you will take if one is set
function customerPriceCode(shoe) {
  return [priceCode(shoe.askingPrice), priceCode(shoe.lowestPrice)].filter(Boolean).join(' · ');
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
window.refCode          = refCode;
window.isValidPriceKey  = isValidPriceKey;
window.priceKey         = priceKey;
window.priceCode        = priceCode;
window.customerPriceCode = customerPriceCode;
window.DEFAULT_PRICE_KEY = DEFAULT_PRICE_KEY;
