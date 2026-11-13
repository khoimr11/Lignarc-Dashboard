/* Lignarc Commerce Dashboard
 * Static app: decrypts data/lignarc.enc.json in the browser after login, then renders.
 * Revenue = Wayfair base cost × units (before promotion) — same basis as the KPI "Rev" line; Net Revenue = wholesale price paid.
 * COGS = landed cost per PO shipment, consumed FIFO. Profit = Net Revenue − platform fee − DDA − COGS − returns − CastleGate fees − ads.
 */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DATA_URL = 'data/lignarc.enc.json';
const store = { get: k => { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v, persist) => { try { (persist ? localStorage : sessionStorage).setItem(k, v); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} } };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------------- crypto ----------------
async function hint(user) { return hex(await crypto.subtle.digest('SHA-256', enc.encode('lignarc|' + user.trim().toLowerCase()))).slice(0, 16); }
async function kek(user, pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(user.trim().toLowerCase() + '\n' + pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(salt), iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function openWith(file, raw) {
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(file.iv) }, k, b64d(file.ct))));
}
async function fetchFile() { const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('Could not load data (' + r.status + ')'); return r.json(); }
async function login(user, pass) {
  const file = await fetchFile(), h = await hint(user);
  const u = (file.users || []).find(x => x.h === h); if (!u) throw new Error('bad');
  const k = await kek(user, pass, u.salt, file.iter || 250000);
  let raw; try { raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(u.iv) }, k, b64d(u.wk))); } catch (e) { throw new Error('bad'); }
  return { raw, data: await openWith(file, raw), updated: file.updated };
}

// ---------------- formatting ----------------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const usd = (v, d = 0) => (v < 0 ? '−$' : '$') + new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v || 0));
const usdK = v => Math.abs(v) >= 1e6 ? (v < 0 ? '−' : '') + '$' + nf1.format(Math.abs(v) / 1e6) + 'M' : Math.abs(v) >= 1e4 ? (v < 0 ? '−' : '') + '$' + nf1.format(Math.abs(v) / 1e3) + 'k' : usd(v);
const pct = (v, d = 0) => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%';
const n0 = v => nf0.format(v || 0);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dShort = s => { const [, m, d] = s.split('-'); return MON[+m - 1] + ' ' + +d; };
const dLong = s => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-'); return `${MON[+m - 1]} ${+d}, ${y}`; };
const mLabel = ym => { const [y, m] = ym.split('-'); return MON[+m - 1] + ' ' + y.slice(2); };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const sum = (a, f = x => x) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const groupBy = (a, f) => { const m = new Map(); for (const x of a) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SER = () => [cssv('--s1'), cssv('--s2'), cssv('--s3'), cssv('--s4'), cssv('--s5')];
const sizeLbl = s => s && s !== 'null' ? s + '"' : 'Rolling Cart';
const ET_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
const etHourDow = iso => { const p = Object.fromEntries(ET_FMT.formatToParts(new Date(iso)).map(x => [x.type, x.value])); return { h: (+p.hour) % 24, dow: DOW.indexOf(p.weekday) }; };
const tipRows = (title, rows) => `<b>${esc(title)}</b>` + rows.map(([k, v, c]) => `<div><span>${c ? `<i style="background:${c}"></i>` : ''}${esc(k)}</span><span>${esc(v)}</span></div>`).join('');

// US states: name, Census region, coast
const STATES = { AL: ['Alabama', 'South', 'Inland (Gulf)'], AK: ['Alaska', 'West', 'West Coast'], AZ: ['Arizona', 'West', 'Inland'], AR: ['Arkansas', 'South', 'Inland'], CA: ['California', 'West', 'West Coast'], CO: ['Colorado', 'West', 'Inland'], CT: ['Connecticut', 'Northeast', 'East Coast'], DE: ['Delaware', 'South', 'East Coast'], DC: ['District of Columbia', 'South', 'East Coast'], FL: ['Florida', 'South', 'East Coast'], GA: ['Georgia', 'South', 'East Coast'], HI: ['Hawaii', 'West', 'West Coast'], ID: ['Idaho', 'West', 'Inland'], IL: ['Illinois', 'Midwest', 'Inland'], IN: ['Indiana', 'Midwest', 'Inland'], IA: ['Iowa', 'Midwest', 'Inland'], KS: ['Kansas', 'Midwest', 'Inland'], KY: ['Kentucky', 'South', 'Inland'], LA: ['Louisiana', 'South', 'Inland (Gulf)'], ME: ['Maine', 'Northeast', 'East Coast'], MD: ['Maryland', 'South', 'East Coast'], MA: ['Massachusetts', 'Northeast', 'East Coast'], MI: ['Michigan', 'Midwest', 'Inland'], MN: ['Minnesota', 'Midwest', 'Inland'], MS: ['Mississippi', 'South', 'Inland (Gulf)'], MO: ['Missouri', 'Midwest', 'Inland'], MT: ['Montana', 'West', 'Inland'], NE: ['Nebraska', 'Midwest', 'Inland'], NV: ['Nevada', 'West', 'Inland'], NH: ['New Hampshire', 'Northeast', 'East Coast'], NJ: ['New Jersey', 'Northeast', 'East Coast'], NM: ['New Mexico', 'West', 'Inland'], NY: ['New York', 'Northeast', 'East Coast'], NC: ['North Carolina', 'South', 'East Coast'], ND: ['North Dakota', 'Midwest', 'Inland'], OH: ['Ohio', 'Midwest', 'Inland'], OK: ['Oklahoma', 'South', 'Inland'], OR: ['Oregon', 'West', 'West Coast'], PA: ['Pennsylvania', 'Northeast', 'Inland'], RI: ['Rhode Island', 'Northeast', 'East Coast'], SC: ['South Carolina', 'South', 'East Coast'], SD: ['South Dakota', 'Midwest', 'Inland'], TN: ['Tennessee', 'South', 'Inland'], TX: ['Texas', 'South', 'Inland (Gulf)'], UT: ['Utah', 'West', 'Inland'], VT: ['Vermont', 'Northeast', 'Inland'], VA: ['Virginia', 'South', 'East Coast'], WA: ['Washington', 'West', 'West Coast'], WV: ['West Virginia', 'South', 'Inland'], WI: ['Wisconsin', 'Midwest', 'Inland'], WY: ['Wyoming', 'West', 'Inland'] };
const CA_PROV = { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan' };

// ---------------- state ----------------
let D = null, M = null, US = null;
const FILTER_KEYS = [['col', 'Collection'], ['cat', 'Category'], ['type', 'Product type'], ['size', 'Size'], ['color', 'Color'], ['sku', 'SKU'], ['po', 'PO / Shipment']];
const S = { tab: 'overview', preset: '30d', from: null, to: null, compare: true, platform: 'all', incTT: false, f: Object.fromEntries(FILTER_KEYS.map(([k]) => [k, new Set()])), sort: {}, kpiAll: false, hideZero: true, open: {} };

// ---------------- model ----------------
const OK_STATUS = s => !/cancel|reject|void/i.test(s || '');
function build() {
  const P = D.products || {};
  for (const p of Object.values(P)) if (p.color === 'Walnut') p.color = 'Dark Oak';   // one dark finish: Walnut = Dark Oak
  const A = Object.assign({ dda: 0.04, wmr: 0.75, ttReimburseDDA: true, amazonFee: 0.15 }, D.assump || {});
  const CG = D.cgFees || {}, cgFee = part => (CG.actual && CG.actual[part] != null) ? CG.actual[part] : ((CG.est && CG.est[part]) || 0);
  const W = D.wf || {}, inbById = new Map((W.inb || []).map(x => [x.id, x]));
  const recvOf = po => (W.inbRecv && W.inbRecv[po.whs]) || po.recv || (inbById.get(po.whs) && (inbById.get(po.whs).recvStart || inbById.get(po.whs).gatedOut)) || null;
  const pos = (D.pos || []).map(p => ({ ...p, recv: recvOf(p) ? String(recvOf(p)).slice(0, 10) : null, inb: inbById.get(p.whs) || null }))
    .sort((a, b) => (a.recv || '9999').localeCompare(b.recv || '9999'));
  // FIFO cost layers per SKU, in receiving order; landed cost per unit = PO cost sheet + CastleGate container unload
  const layers = {};
  for (const po of pos) for (const [part, qty, fob, cogs] of po.items || []) { const un = (po.unload && po.unload[part]) || 0; (layers[part] = layers[part] || []).push({ po: po.id, qty, left: qty, fob, cogs: cogs + un, sheet: cogs, unload: un, recv: po.recv }); }
  const lastCost = part => { const L = layers[part]; if (L && L.length) return L[L.length - 1]; const fam = P[part] && P[part].fam; for (const k in layers) if (P[k] && P[k].fam === fam) return layers[k][layers[k].length - 1]; return { cogs: 0, fob: 0 }; };
  const prod = part => P[part] || { col: 'Other', cat: 'Other', type: 'Other', size: null, color: null, name: part, base: 0 };
  const SOV = W.statusOv || {}, TT = new Set(W.ttPOs || []);
  const lines = [];
  for (const r of W.orders || []) {
    const status = SOV[r[0]] || r[3]; const p = prod(r[7]); const qty = +r[11] || 0, price = +r[12] || 0, base = p.base || price;
    const ts = r[17] || null, hd = ts ? etHourDow(ts) : null;
    lines.push({ ch: 'wf', po: r[0], date: r[2], ts, hour: hd ? hd.h : null, dow: hd ? hd.dow : null, status, ok: OK_STATUS(status), retailer: r[4] || 'Wayfair', state: r[5], country: r[6] || 'US', part: r[7], qty, price, base, b2b: /yes/i.test(r[13] || ''), tt: /tried/i.test(r[14] || '') || TT.has(r[0]) });
  }
  for (const r of (D.amz && D.amz.orders) || []) {
    const qty = +r[5] || 0, price = +r[6] || 0;
    lines.push({ ch: 'amz', po: r[0], date: r[1], ts: null, hour: null, dow: null, status: r[2], ok: OK_STATUS(r[2]), retailer: 'Amazon', state: '', country: 'US', part: r[3], qty, price, base: price, b2b: false, tt: false });
  }
  lines.sort((a, b) => (a.ts || a.date + 'T12').localeCompare(b.ts || b.date + 'T12'));
  // split each order line into FIFO pieces (Tried & True units ship from the same stock, so they consume layers too)
  const pieces = [];
  const mk = (l, q, ly) => {
    const p = prod(l.part), wf = l.ch === 'wf';
    // Tried & True: Wayfair pays no wholesale — only the DDA amount comes back; units still cost COGS + fulfillment
    const rev = l.tt ? 0 : l.base * q, paid = l.price * q, net = l.tt ? (A.ttReimburseDDA ? paid * A.dda : 0) : paid;
    return { ...l, qty: q, layer: ly.po, unitCogs: ly.cogs, unitFob: ly.fob, rev, net, promo: l.tt ? 0 : rev - net, cogs: ly.cogs * q, fob: ly.fob * q,
      dda: wf && !l.tt ? paid * A.dda : 0, cg: wf ? cgFee(l.part) * q : 0, cgEst: wf && !(CG.actual && CG.actual[l.part] != null), amzFee: wf ? 0 : net * A.amazonFee,
      col: p.col, cat: p.cat, type: p.type, size: p.size, color: p.color, name: p.name, fam: p.fam };
  };
  for (const l of lines) {
    if (!l.ok) { pieces.push({ ...mk(l, l.qty, { po: '—', cogs: 0, fob: 0 }), rev: 0, net: 0, promo: 0, cogs: 0, fob: 0, dda: 0, cg: 0, amzFee: 0 }); continue; }
    let q = l.qty; const L = layers[l.part] || [];
    if (l.ch === 'wf') for (const ly of L) { if (q <= 0) break; if (ly.left <= 0) continue; const t = Math.min(q, ly.left); ly.left -= t; q -= t; pieces.push(mk(l, t, ly)); }
    if (q > 0) { const lc = lastCost(l.part); pieces.push(mk(l, q, { po: l.ch === 'amz' ? 'Amazon stock' : 'Unassigned', cogs: lc.cogs, fob: lc.fob })); }
  }
  const deds = (D.deductions || []).map(d => ({ ...d, ch: 'wf' }));
  const dates = lines.map(l => l.date).filter(Boolean).sort();
  M = { P, A, CG, cgFee, pos, layers, lines, pieces, deds, first: dates[0] || D.meta.today, today: (D.meta && D.meta.today) || new Date().toISOString().slice(0, 10) };
  M.listingParts = {}; for (const [k, p] of Object.entries(P)) if (p.fam) (M.listingParts[p.fam] = M.listingParts[p.fam] || []).push(k);
}

// ---------------- filters ----------------
function presetRange(p) {
  const t = M.today, y = t.slice(0, 4), m = t.slice(5, 7);
  switch (p) {
    case '7d': return [addDays(t, -6), t];
    case '30d': return [addDays(t, -29), t];
    case '90d': return [addDays(t, -89), t];
    case 'mtd': return [`${y}-${m}-01`, t];
    case 'qtd': return [`${y}-${String(Math.floor((+m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`, t];
    case 'ytd': return [`${y}-01-01`, t];
    default: return [M.first < t ? M.first : t, t];
  }
}
function range() { if (S.preset !== 'custom') [S.from, S.to] = presetRange(S.preset); return [S.from, S.to]; }
function prevRange() { const [f, t] = range(); const n = diffDays(f, t) + 1; return [addDays(f, -n), addDays(f, -1)]; }
const prodFilterOn = () => ['col', 'cat', 'type', 'size', 'color', 'sku'].some(k => S.f[k].size);
function passProd(part) {
  const p = M.P[part] || {}, f = S.f;
  return (!f.col.size || f.col.has(p.col)) && (!f.cat.size || f.cat.has(p.cat)) && (!f.type.size || f.type.has(p.type)) && (!f.size.size || f.size.has(String(p.size))) && (!f.color.size || f.color.has(p.color)) && (!f.sku.size || f.sku.has(part));
}
// pieces passing every filter except the date range
function basePieces({ includeBad = false, ignoreTT = false, ignoreProd = false, ignorePO = false } = {}) {
  return M.pieces.filter(x => (includeBad || x.ok) && (S.platform === 'all' || x.ch === S.platform) && (ignoreProd || passProd(x.part)) && (ignorePO || !S.f.po.size || S.f.po.has(x.layer)));
}
const inRange = (x, f, t) => x.date >= f && x.date <= t;
function agg(ps) {
  const o = { units: 0, rev: 0, net: 0, promo: 0, cogs: 0, fob: 0, dda: 0, cg: 0, amzFee: 0, ttUnits: 0, ttCost: 0, ttCogs: 0, ttCg: 0, ttBack: 0 }, orders = new Set(), ttOrders = new Set();
  for (const x of ps) {
    if (x.tt) { o.ttUnits += x.qty; o.ttCogs += x.cogs; o.ttCg += x.cg; o.ttBack += x.net; o.ttCost += x.cogs + x.cg - x.net; ttOrders.add(x.po); continue; }
    o.units += x.qty; o.rev += x.rev; o.net += x.net; o.promo += x.promo; o.cogs += x.cogs; o.fob += x.fob; o.dda += x.dda; o.cg += x.cg; o.amzFee += x.amzFee; orders.add(x.po);
  }
  o.orders = orders.size; o.ttOrders = ttOrders.size; o.gmv = o.rev * 2; o.aov = o.orders ? o.rev / o.orders : 0;
  o.platform = o.dda + o.cg + o.amzFee;                       // what the platform takes: DDA 4% + CastleGate fulfillment (+ Amazon fees)
  o.gp = o.net - o.platform - o.cogs - o.ttCost;              // before returns, incidents and ads
  return o;
}
// Wayfair deductions for returns (WMR) and incidents, by deduction date
function deductions(f, t) {
  const ds = S.platform === 'amz' ? [] : M.deds.filter(d => d.date >= f && d.date <= t && passProd(d.part));
  return { list: ds, returns: sum(ds.filter(d => d.type === 'Return'), d => d.amount), incidents: sum(ds.filter(d => d.type !== 'Return'), d => d.amount), returnUnits: ds.filter(d => d.type === 'Return').length };
}

// ---------------- advertising ----------------
// Campaign totals come from the CAMPAIGN_REPORT; per-SKU spend from the SKU_REPORT (per listing), split across the
// listing's child SKUs by their net revenue in the period (equal split when the listing sold nothing).
function ads(f, t) {
  const out = { spend: 0, impr: 0, clicks: 0, sales: 0, orders: 0, units: 0, byPart: {}, byListing: {}, daily: new Map(), camps: new Map(), unalloc: 0 };
  if (S.platform !== 'amz') {
    const W = D.wf || {}, ad = W.ads || {};
    for (const r of ad.daily || []) { if (r[1] < f || r[1] > t) continue; out.spend += r[4]; out.impr += r[2]; out.clicks += r[3]; out.units += r[5]; out.sales += r[6]; out.orders += r[7];
      const d = out.daily.get(r[1]) || { spend: 0, sales: 0, clicks: 0, impr: 0, orders: 0 }; d.spend += r[4]; d.sales += r[6]; d.clicks += r[3]; d.impr += r[2]; d.orders += r[7]; out.daily.set(r[1], d);
      const c = out.camps.get(r[0]) || { id: r[0], spend: 0, impr: 0, clicks: 0, sales: 0, orders: 0, units: 0 }; c.spend += r[4]; c.impr += r[2]; c.clicks += r[3]; c.sales += r[6]; c.orders += r[7]; c.units += r[5]; out.camps.set(r[0], c); }
    const L = {};
    for (const r of W.adsSku || []) { if (r[0] < f || r[0] > t) continue; const x = L[r[1]] = L[r[1]] || { spend: 0, clicks: 0, impr: 0, sales: 0, orders: 0, units: 0 }; x.impr += r[2]; x.clicks += r[3]; x.spend += r[4]; x.sales += r[5]; x.orders += r[6]; x.units += r[7]; }
    const skuTotal = sum(Object.values(L), x => x.spend), k = skuTotal > 0 ? out.spend / skuTotal : 0;
    const netBy = {}; for (const x of basePieces({ ignoreProd: true, ignorePO: true })) if (x.ch === 'wf' && !x.tt && inRange(x, f, t)) netBy[x.part] = (netBy[x.part] || 0) + x.net;
    for (const [lid, x] of Object.entries(L)) {
      const spend = x.spend * k; out.byListing[lid] = { ...x, spend };
      const kids = M.listingParts[lid] || [];
      if (!kids.length) { out.unalloc += spend; continue; }
      const tot = sum(kids, p => netBy[p] || 0);
      const stocked = kids.filter(p => M.layers[p]), pool = tot > 0 ? kids : (stocked.length ? stocked : kids);
      for (const p of pool) out.byPart[p] = (out.byPart[p] || 0) + spend * (tot > 0 ? (netBy[p] || 0) / tot : 1 / pool.length);
    }
    if (!skuTotal && out.spend) out.unalloc = out.spend;
  }
  if (S.platform !== 'wf') {
    const A = (D.amz && D.amz.ads) || {};
    for (const r of A.daily || []) { if (r[0] < f || r[0] > t) continue; out.spend += r[3]; out.impr += r[1]; out.clicks += r[2]; out.sales += r[4]; out.orders += r[5];
      const d = out.daily.get(r[0]) || { spend: 0, sales: 0, clicks: 0, impr: 0, orders: 0 }; d.spend += r[3]; d.sales += r[4]; d.clicks += r[2]; d.impr += r[1]; d.orders += r[5]; out.daily.set(r[0], d); }
  }
  // spend that applies to the current product / PO filter
  if (prodFilterOn() || S.f.po.size) out.filtered = sum(Object.entries(out.byPart).filter(([p]) => passProd(p)), ([, v]) => v);
  else out.filtered = out.spend;
  return out;
}

// period summary with profit
function period(f, t) {
  const all = basePieces().filter(x => inRange(x, f, t)), ps = all.filter(x => !x.tt), a = agg(all), ad = ads(f, t), dd = deductions(f, t);
  a.ads = ad.filtered; a.returns = dd.returns; a.incidents = dd.incidents; a.returnUnits = dd.returnUnits;
  a.mkt = a.promo + a.ads; a.mktPct = a.rev ? a.mkt / a.rev : null;
  a.profit = a.gp - a.returns - a.incidents - a.ads; a.margin = a.rev ? a.profit / a.rev : null; a.tacos = a.rev ? a.ads / a.rev : null; a.costs = a.rev - a.profit;
  return { ps, all, a, ad, dd };
}
function target(key, f, t) {
  const K = D.kpi; if (!K || !K[key]) return null; let v = 0;
  for (let d = f; d <= t; d = addDays(d, 1)) { const i = K.months.indexOf(d.slice(0, 7)); if (i >= 0) v += (K[key][i] || 0) / daysIn(d.slice(0, 7)); }
  return v;
}

// ---------------- chart primitives (SVG strings) ----------------
// charts are drawn at the card's real pixel width so text stays 12px on every screen
function CW(kind = 'full') { const v = $('#view').clientWidth || 1000, vw = innerWidth, pad = vw <= 860 ? 34 : 46;
  if (kind === 'half') return Math.round((vw <= 760 ? v : (v - 16) / 2) - pad);
  if (kind === 'wide') return Math.round((vw <= 1280 ? v : (v - 16) * 2 / 3) - pad);
  if (kind === 'third') return Math.round((vw <= 1280 ? v : (v - 16) / 3) - pad);
  return Math.round(v - pad); }
function nice(max, n = 4) { if (!(max > 0)) return { max: n, step: 1 }; const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].find(x => x * mag >= raw) * mag; return { max: Math.ceil(max / step) * step, step }; }
const rr = (x, y, w, h, r) => { if (h <= 0) return ''; r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
function vbars(items, { fmt = n0, h = 300, w = CW('half'), colors, showVals = true, every = 1, axisFmt, series } = {}) {
  // items: [{label, v | vs:[..], tip}] ; series: [{name,color}] for grouped bars
  if (!items.length) return '<div class="empty">No data in this period</div>';
  const C = SER(), ser = series || [{ name: '', color: (colors && colors[0]) || C[0] }], G = ser.length;
  const vals = items.flatMap(i => i.vs || [i.v]); const sc = nice(Math.max(...vals, 0));
  const L = 52, R = 8, T = showVals ? 20 : 10, B = 30, cw = w - L - R, ch = h - T - B, band = cw / items.length;
  const bw = Math.min(G > 1 ? 22 : 46, band * (G > 1 ? 0.36 : 0.62)), gap = G > 1 ? 3 : 0;
  const y = v => T + ch - (v / sc.max) * ch; const af = axisFmt || (v => fmt(v));
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><g class="grid">`;
  for (let v = 0; v <= sc.max + 1e-9; v += sc.step) s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(af(v))}</text>`;
  s += `</g>`;
  items.forEach((it, i) => {
    const cx = L + band * i + band / 2, vs = it.vs || [it.v], gw = G * bw + (G - 1) * gap;
    s += `<g data-tip="${esc(it.tip || tipRows(it.label, ser.map((se, j) => [se.name || 'Value', fmt(vs[j]), G > 1 ? se.color : null])))}"><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${ch}"/>`;
    vs.forEach((v, j) => { const x = cx - gw / 2 + j * (bw + gap); const col = (it.colors && it.colors[j]) || (colors && colors[i % colors.length] && G === 1 ? colors[i % colors.length] : ser[j].color);
      s += `<path class="bar" d="${rr(x, y(Math.max(v, 0)), bw, Math.max(0, y(0) - y(Math.max(v, 0))), 4)}" fill="${col}"${ser[j].ghost ? ' fill-opacity=".35"' : ''}/>`;
      if (showVals && G === 1 && v) s += `<text class="val-lbl" x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle">${esc(fmt(v))}</text>`; });
    if (i % Math.max(every, Math.ceil(46 / band)) === 0) s += `<text x="${cx}" y="${h - 10}" text-anchor="middle">${esc(it.label)}</text>`;
    s += `</g>`;
  });
  s += `<line class="axis" x1="${L}" x2="${w - R}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  return `<div class="chart">${s}</div>` + (G > 1 ? `<div class="legend">${ser.map(se => `<span><i style="background:${se.color};${se.ghost ? 'opacity:.35' : ''}"></i>${esc(se.name)}</span>`).join('')}</div>` : '');
}
// Generic combo: bars (left axis) · solid line (right axis) · dashed ratio line (own scale, labelled, always continuous)
function combo3(bk, cfg, { h = 400, w = CW('full') } = {}) {
  if (!bk.length) return '<div class="empty">No data in this period</div>';
  const { bar, line, dash } = cfg, cU = bar.color, cN = line.color, cP = dash.color;
  const L = 50, R = 64, T = 30, B = 34, cw = w - L - R, ch = h - T - B, n = bk.length, band = cw / n, bw = Math.min(46, band * 0.58);
  const V = (b, o) => b[o.k];
  const su = nice(Math.max(...bk.map(b => V(b, bar) || 0), bar.min || 1)), sn = nice(Math.max(...bk.map(b => V(b, line) || 0), 1), su.max / su.step);
  const dv = bk.map(b => V(b, dash)).filter(v => v != null && isFinite(v)), pm = Math.max(dash.min || 0.05, ...dv) * 1.15;
  const yu = v => T + ch - v / su.max * ch, yn = v => T + ch - v / sn.max * ch, yp = v => T + ch * 0.06 + (ch * 0.94) - (v / pm) * ch * 0.94;
  const x = i => L + band * i + band / 2;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><g class="grid">`;
  for (let v = 0; v <= su.max + 1e-9; v += su.step) s += `<line x1="${L}" x2="${w - R}" y1="${yu(v)}" y2="${yu(v)}"/><text x="${L - 8}" y="${yu(v) + 4}" text-anchor="end">${esc(bar.axis(v))}</text>`;
  for (let v = 0; v <= sn.max + 1e-9; v += sn.step) s += `<text x="${w - R + 8}" y="${yn(v) + 4}">${esc(line.axis(v))}</text>`;
  s += `</g><text x="${L - 8}" y="${T - 14}" text-anchor="end" style="font-weight:650">${esc(bar.short || bar.name)}</text><text x="${w - R + 8}" y="${T - 14}" style="font-weight:650">${esc(line.short || line.name)}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(cw / 70))));
  bk.forEach((b, i) => {
    const bv = V(b, bar) || 0;
    s += `<g class="hov" data-tip="${esc(tipRows(b.tipLabel || b.label, cfg.tip(b)))}"><line class="xh" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T + ch}"/><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${ch}"/>`;
    s += `<path class="bar" d="${rr(x(i) - bw / 2, yu(bv), bw, Math.max(0, yu(0) - yu(bv)), 4)}" fill="${cU}" fill-opacity=".88"/>`;
    if (bv && n <= 31) s += `<text class="val-lbl" x="${x(i)}" y="${yu(bv) - 6}" text-anchor="middle">${esc(bar.lbl ? bar.lbl(bv) : bar.axis(bv))}</text>`;
    if (i % every === 0 || i === n - 1) s += `<text x="${x(i)}" y="${h - 10}" text-anchor="middle">${esc(b.label)}</text>`;
    s += `</g>`;
  });
  const P = (fy, o) => bk.map((b, i) => { const v = V(b, o); return v == null || !isFinite(v) ? null : [x(i), fy(v), v, i]; }).filter(Boolean);
  const dpath = pts => pts.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  const ln = P(yn, line), dp = P(yp, dash);
  s += `<path d="${dpath(ln)}" fill="none" stroke="${cN}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
  s += `<path d="${dpath(dp)}" fill="none" stroke="${cP}" stroke-width="2.25" stroke-dasharray="7 5" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
  ln.forEach(([px, py, v]) => { if (v) s += `<circle cx="${px}" cy="${py}" r="${n > 31 ? 2.5 : 4}" fill="${cN}" stroke="var(--glass-strong)" stroke-width="1.5" pointer-events="none"/>`; });
  dp.forEach(([px, py, v]) => { s += `<circle cx="${px}" cy="${py}" r="${n > 31 ? 2 : 3.5}" fill="var(--glass-strong)" stroke="${cP}" stroke-width="2" pointer-events="none"/>`;
    if (n <= 16) s += `<text x="${px}" y="${py - 9}" text-anchor="middle" style="fill:var(--ink);font-weight:650;font-size:11px" pointer-events="none">${esc(dash.fmt(v))}</text>`; });
  s += `<line class="axis" x1="${L}" x2="${w - R}" y1="${yu(0)}" y2="${yu(0)}"/></svg>`;
  return `<div class="legend top"><span><i style="background:${cU}"></i>${esc(bar.name)}</span><span><i class="line" style="background:${cN}"></i>${esc(line.name)}</span><span><i class="dash" style="color:${cP}"></i>${esc(dash.name)}</span></div><div class="chart">${s}</div>`;
}
// Units (bars) · NMV (line) · % Mkt fee (dashed). Weeks with no sales have no ratio — the dashed line bridges them.
function combo(bk, o) {
  const C = SER();
  return combo3(bk, { bar: { k: 'units', name: 'Units sold', short: 'Units', axis: n0, color: C[0] }, line: { k: 'nmv', name: 'NMV (net revenue)', short: 'NMV', axis: usdK, color: C[2] }, dash: { k: 'mktPct', name: '% Mkt fee / revenue', fmt: v => pct(v), color: C[4] },
    tip: b => [['Units sold', n0(b.units), C[0]], ['NMV', usd(b.nmv), C[2]], ['Mkt fee', usd(b.mkt)], ['% Mkt fee / revenue', b.mktPct == null ? 'no sales' : pct(b.mktPct, 1), C[4]], ['Revenue', usd(b.rev)]] }, o);
}
function buckets(ps, ad, f, t, gran) {
  const key = d => gran === 'month' ? d.slice(0, 7) : gran === 'week' ? addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7)) : d;
  const lbl = k => gran === 'month' ? mLabel(k) : gran === 'week' ? 'Wk ' + dShort(k) : dShort(k);
  const keys = [...new Set(daysOf(f, t).map(key))], m = new Map(keys.map(k => [k, { label: lbl(k), tipLabel: gran === 'week' ? 'Week of ' + dLong(k) : gran === 'month' ? mLabel(k) : dLong(k), units: 0, nmv: 0, rev: 0, promo: 0, ads: 0 }]));
  for (const x of ps) { const b = m.get(key(x.date)); if (!b) continue; b.units += x.qty; b.nmv += x.net; b.rev += x.rev; b.promo += x.promo; }
  for (const [d, v] of ad.daily) { const b = m.get(key(d)); if (b) b.ads += v.spend; }
  const share = ad.spend ? ad.filtered / ad.spend : 0;
  return [...m.values()].map(b => { b.ads *= share; b.mkt = b.promo + b.ads; b.mktPct = b.rev ? b.mkt / b.rev : null; return b; });
}
const ADM = { tacos: ['TACoS (spend ÷ revenue)', v => pct(v), 0.05], acos: ['ACoS (spend ÷ ad sales)', v => pct(v), 0.05], roas: ['ROAS (ad sales ÷ spend)', v => v.toFixed(1) + '×', 1], cpc: ['CPC (spend ÷ clicks)', v => usd(v, 2), 0.5], ctr: ['CTR (clicks ÷ impressions)', v => pct(v, 1), 0.002] };
function adBuckets(cur, f, t, gran) {
  const key = d => gran === 'month' ? d.slice(0, 7) : gran === 'week' ? addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7)) : d;
  const lbl = k => gran === 'month' ? mLabel(k) : gran === 'week' ? 'Wk ' + dShort(k) : dShort(k);
  const keys = [...new Set(daysOf(f, t).map(key))], m = new Map(keys.map(k => [k, { label: lbl(k), tipLabel: gran === 'week' ? 'Week of ' + dLong(k) : gran === 'month' ? mLabel(k) : dLong(k), spend: 0, sales: 0, clicks: 0, impr: 0, orders: 0, rev: 0 }]));
  for (const [d, v] of cur.ad.daily) { const b = m.get(key(d)); if (b) { b.spend += v.spend; b.sales += v.sales; b.clicks += v.clicks || 0; b.impr += v.impr || 0; b.orders += v.orders || 0; } }
  for (const x of cur.ps) { const b = m.get(key(x.date)); if (b) b.rev += x.rev; }
  return [...m.values()].map(b => ({ ...b, roas: b.spend ? b.sales / b.spend : null, acos: b.sales ? b.spend / b.sales : null, tacos: b.rev ? b.spend / b.rev : null, cpc: b.clicks ? b.spend / b.clicks : null, ctr: b.impr ? b.clicks / b.impr : null }));
}
function autoGran(f, t) { const n = diffDays(f, t) + 1; return S.gran && S.gran !== 'auto' ? S.gran : n <= 14 ? 'day' : n <= 120 ? 'week' : 'month'; }
const granBtns = () => `<div class="btn-row">${[['auto', 'Auto'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => `<button class="view-toggle" data-gran="${k}" aria-pressed="${(S.gran || 'auto') === k}">${l}</button>`).join('')}</div>`;
function lines(xs, series, { fmt = n0, h = 260, w = CW('full'), area = true } = {}) {
  if (!xs.length) return '<div class="empty">No data in this period</div>';
  const all = series.flatMap(s => s.vals), mn = Math.min(0, ...all);
  const L = 56, R = 10, T = 12, B = 30, cw = w - L - R, ch = h - T - B, n = xs.length;
  const x = i => L + (n === 1 ? cw / 2 : (i / (n - 1)) * cw), lo = mn < 0 ? -nice(-mn, 2).max : 0, hi = nice(Math.max(...all, 0), 4).max;
  const y = v => T + ch - ((v - lo) / (hi - lo || 1)) * ch, step = nice(hi - lo).step;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><g class="grid">`;
  for (let v = lo; v <= hi + 1e-9; v += step) s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
  s += `</g>`;
  if (lo < 0) s += `<line class="axis" x1="${L}" x2="${w - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  for (const se of series) {
    const pts = se.vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (area && !se.dash) s += `<path d="M${x(0)},${y(Math.max(lo, 0))}L${pts.join('L')}L${x(n - 1)},${y(Math.max(lo, 0))}Z" fill="${se.color}" fill-opacity=".10"/>`;
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${se.dash ? ' stroke-dasharray="5 4"' : ''}/>`;
    if (n <= 40) se.vals.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="${n > 20 ? 2.5 : 3.5}" fill="${se.color}" stroke="var(--glass-strong)" stroke-width="1.5"/>`; });
  }
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(cw / 80)))), hw = n === 1 ? cw : cw / (n - 1);
  xs.forEach((lb, i) => {
    s += `<g class="hov" data-tip="${esc(tipRows(lb, series.map(se => [se.name, fmt(se.vals[i]), se.color])))}"><line class="xh" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T + ch}"/><rect class="hit" x="${x(i) - hw / 2}" y="${T}" width="${hw}" height="${ch}"/></g>`;
    if (i % every === 0 || i === n - 1 && n < 10) s += `<text x="${x(i)}" y="${h - 10}" text-anchor="middle">${esc(lb)}</text>`;
  });
  s += `</svg>`;
  return `<div class="chart">${s}</div><div class="legend">${series.map(se => `<span><i class="${se.dash ? 'dash' : 'line'}" style="background:${se.color};color:${se.color}"></i>${esc(se.name)}</span>`).join('')}</div>`;
}
function donut(items, { fmt = n0, center, sub = 'total', max = 6 } = {}) {
  items = items.filter(i => i.v > 0).sort((x, y) => y.v - x.v); const tot = sum(items, i => i.v);
  if (!tot) return '<div class="empty">No data in this period</div>';
  const C = SER();
  items = items.map((it, i) => ({ ...it, color: it.color || C[i % C.length] }));
  if (items.length > max) { const rest = items.slice(max - 1); items = [...items.slice(0, max - 1), { label: `Other (${rest.length})`, v: sum(rest, i => i.v), color: cssv('--muted'), extra: [['Includes', rest.map(r => r.label).join(', ')]] }]; }
  const S0 = 240, c0 = S0 / 2, R = 116, r = 72; let a = -Math.PI / 2, s = `<svg viewBox="0 0 ${S0} ${S0}" role="img">`;
  items.forEach(it => {
    const frac = it.v / tot, a2 = a + frac * Math.PI * 2 - (items.length > 1 ? 0.014 : 0);
    const big = a2 - a > Math.PI ? 1 : 0, p = (rad, ang) => [(c0 + rad * Math.cos(ang)).toFixed(2), (c0 + rad * Math.sin(ang)).toFixed(2)];
    const [x1, y1] = p(R, a), [x2, y2] = p(R, a2), [x3, y3] = p(r, a2), [x4, y4] = p(r, a);
    const d = frac >= 0.999 ? `M${c0},${c0 - R}A${R},${R} 0 1 1 ${c0 - .01},${c0 - R}L${c0 - .01},${c0 - r}A${r},${r} 0 1 0 ${c0},${c0 - r}Z` : `M${x1},${y1}A${R},${R} 0 ${big} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${big} 0 ${x4},${y4}Z`;
    s += `<path d="${d}" fill="${it.color}" data-tip="${esc(tipRows(it.label, [['Value', fmt(it.v)], ['Share', pct(frac, 1)], ...(it.extra || [])]))}"/>`;
    if (frac >= 0.08) { const [lx, ly] = p((R + r) / 2, a + frac * Math.PI); s += `<text x="${lx}" y="${+ly + 4}" text-anchor="middle" class="d-pct" pointer-events="none">${pct(frac)}</text>`; }
    a += frac * Math.PI * 2;
  });
  const cv = String(center ?? fmt(tot)), fs = cv.length > 7 ? 26 : 32;
  s += `<text x="${c0}" y="${c0 + 4}" text-anchor="middle" style="font:750 ${fs}px var(--font);fill:var(--ink);letter-spacing:-.8px">${esc(cv)}</text><text x="${c0}" y="${c0 + 26}" text-anchor="middle" style="font:600 13px var(--font);fill:var(--muted)">${esc(sub)}</text></svg>`;
  return `<div class="donut-wrap"><div class="chart">${s}</div><div class="donut-list">${items.map(it => `<div data-tip="${esc(tipRows(it.label, [['Value', fmt(it.v)], ['Share', pct(it.v / tot, 1)], ...(it.extra || [])]))}"><i style="background:${it.color}"></i><span>${esc(it.label)}</span><b>${pct(it.v / tot)}</b><small>${esc(fmt(it.v))}</small></div>`).join('')}</div></div>`;
}
function hbars(items, { fmt = n0, color } = {}) {
  if (!items.length || !items.some(i => i.v)) return '<div class="empty">No data in this period</div>';
  const max = Math.max(1, ...items.map(i => Math.abs(i.v))), C = SER();
  return `<div class="hbar">${items.map((it, i) => `<div class="row" data-tip="${esc(it.tip || tipRows(it.label, [['Value', fmt(it.v)], ...(it.extra || [])]))}"><span>${esc(it.label)}</span><div class="tr"><i style="width:${Math.max(1.5, Math.abs(it.v) / max * 100)}%;background:${it.v < 0 ? cssv('--crit') : (it.color || color || C[0])}"></i></div><b>${esc(fmt(it.v))}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</b></div>`).join('')}</div>`;
}
function ring(frac, label, color) {
  const r = 70, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
  return `<svg class="ring" viewBox="0 0 170 170"><circle cx="85" cy="85" r="${r}" fill="none" stroke="var(--grid)" stroke-width="14"/><circle cx="85" cy="85" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 85 85)"/><text x="85" y="86" text-anchor="middle" style="font:750 34px var(--font);fill:var(--ink);letter-spacing:-1px">${esc(pct(frac))}</text><text x="85" y="108" text-anchor="middle" style="font:12px var(--font);fill:var(--muted)">${esc(label)}</text></svg>`;
}
function waterfall(steps, { h = 320, w = CW('full') } = {}) {
  if (w < 600) { // phones: a vertical P&L statement reads better than a squeezed waterfall
    const rev = steps[0].v || 1;
    return `<div class="pnl">${steps.map(s => `<div class="${s.kind === 'total' ? 'tot' : ''}" data-tip="${esc(tipRows(s.label, [['Amount', usd(s.v)], ['% of revenue', pct(s.v / rev, 1)]]))}"><span>${s.kind === 'total' ? '' : '− '}${esc(s.label)}</span><b class="${s.kind === 'total' && s.v < 0 ? 'neg' : ''}">${usd(s.v)}</b><small>${pct(s.v / rev, 1)}</small><i style="width:${Math.min(100, Math.abs(s.v) / rev * 100)}%;background:${s.kind === 'total' ? (s.v < 0 ? cssv('--crit') : s.label === 'Revenue' ? cssv('--s1') : cssv('--s3')) : cssv('--s2')}"></i></div>`).join('')}</div>`;
  }
  // steps: [{label, v, kind:'total'|'down'}]
  const L = 56, R = 8, T = 22, B = 44, cw = w - L - R, ch = h - T - B, n = steps.length, band = cw / n, bw = Math.min(56, band * 0.64);
  let run = 0; const bars = steps.map(s => { if (s.kind === 'total') { const b = { ...s, y0: 0, y1: s.v }; run = s.v; return b; } const b = { ...s, y0: run, y1: run - s.v }; run -= s.v; return b; });
  const hi = nice(Math.max(...bars.map(b => Math.max(b.y0, b.y1)), 0)).max, lo = Math.min(0, ...bars.map(b => Math.min(b.y0, b.y1))), loN = lo < 0 ? -nice(-lo).max : 0;
  const step = nice(hi).step, loS = lo < 0 ? -Math.ceil(-lo / step) * step : 0;
  const y = v => T + ch - ((v - loS) / (hi - loS || 1)) * ch, C = SER();
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><g class="grid">`;
  for (let v = loS; v <= hi + 1e-9; v += step) s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(usdK(v))}</text>`;
  s += `</g>`;
  bars.forEach((b, i) => {
    const x = L + band * i + (band - bw) / 2, top = y(Math.max(b.y0, b.y1)), bot = y(Math.min(b.y0, b.y1));
    const col = b.kind === 'total' ? (b.v < 0 ? cssv('--crit') : (i === 0 ? C[0] : C[2])) : cssv('--s2');
    s += `<g data-tip="${esc(tipRows(b.label, [[b.kind === 'total' ? 'Amount' : 'Cost', usd(b.v)], ...(b.share != null ? [['% of revenue', pct(b.share, 1)]] : [])]))}"><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${ch}"/><rect class="bar" x="${x}" y="${top}" width="${bw}" height="${Math.max(1, bot - top)}" rx="4" fill="${col}"${b.kind === 'total' ? '' : ' fill-opacity=".85"'}/>`;
    s += `<text class="val-lbl" x="${x + bw / 2}" y="${top - 6}" text-anchor="middle">${esc((b.kind === 'total' ? '' : '−') + usdK(b.v))}</text>`;
    const words = b.label.split(' '); s += `<text x="${x + bw / 2}" y="${h - 26}" text-anchor="middle">${esc(words.slice(0, 2).join(' '))}</text>${words.length > 2 ? `<text x="${x + bw / 2}" y="${h - 12}" text-anchor="middle">${esc(words.slice(2).join(' '))}</text>` : ''}</g>`;
    if (i < n - 1) s += `<line x1="${x + bw}" x2="${x + band}" y1="${y(b.y1)}" y2="${y(b.y1)}" stroke="var(--axis)" stroke-dasharray="3 3"/>`;
  });
  s += `<line class="axis" x1="${L}" x2="${w - R}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  return `<div class="chart">${s}</div>`;
}
function usMap(stats, metric = 'rev') {
  if (!US) return '<div class="chart map" id="usmap"><div class="empty">Loading map…</div></div>';
  const max = Math.max(1, ...Object.values(stats).map(s => s[metric] || 0)), base = cssv('--s1');
  let s = `<svg viewBox="0 0 975 610" role="img" aria-label="Revenue by US state">`;
  for (const [code, g] of Object.entries(US)) {
    const st = stats[code], v = st ? st[metric] || 0 : 0, info = STATES[code] || [g.n, '', ''];
    const op = v ? 0.18 + 0.82 * Math.sqrt(v / max) : 0;
    s += `<path d="${g.d}" fill="${v ? base : 'var(--grid)'}" fill-opacity="${v ? op.toFixed(2) : 1}" data-tip="${esc(tipRows(info[0] + ' (' + code + ')', [['Region', info[1]], ['Coast', info[2]], ['Units sold', n0(st ? st.units : 0)], ['Orders', n0(st ? st.orders : 0)], ['Revenue', usd(st ? st.rev : 0)], ['Net revenue', usd(st ? st.net : 0)]]))}"/>`;
  }
  for (const [code, g] of Object.entries(US)) if (stats[code] && !['DC', 'RI', 'DE', 'CT', 'NJ', 'MD', 'MA', 'NH', 'VT'].includes(code)) s += `<text x="${g.c[0]}" y="${g.c[1] + 3}" text-anchor="middle">${code}</text>`;
  s += `</svg>`;
  return `<div class="chart map" id="usmap">${s}</div><div class="map-legend"><span>Lower</span><span class="grad" style="background:linear-gradient(90deg,color-mix(in srgb,${base} 18%,transparent),${base})"></span><span>Higher revenue</span><span style="margin-left:auto">Grey = no orders</span></div>`;
}
async function loadMap() { if (US) return; try { US = await (await fetch('assets/us-states.json')).json(); if (S.tab === 'customers') render(); } catch (e) {} }

// ---------------- UI pieces ----------------
const card = (title, sub, body, { cls = '', actions = '', id = '' } = {}) => `<section class="card glass ${cls}"${id ? ` id="${id}"` : ''}><div class="card-head"><div><h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions}</div>${body}</section>`;
function delta(cur, prev, { invert = false, pp = false } = {}) {
  if (!S.compare || prev == null || cur == null || !isFinite(prev) || (!pp && !prev)) return '';
  const d = pp ? cur - prev : (cur - prev) / Math.abs(prev); if (!isFinite(d)) return '';
  const cls = Math.abs(d) < 0.005 ? 'flat' : ((d > 0) !== invert ? 'up' : 'down');
  return `<span class="delta ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${pp ? (d * 100).toFixed(1) + ' pp' : pct(Math.abs(d), Math.abs(d) < 0.1 ? 1 : 0)}</span>`;
}
const kpi = (label, val, meta = '', info = '', sp = null) => `<div class="kpi card glass"><div class="lbl"><span>${label}</span>${info ? `<span class="info" data-tip="${esc(`<b>${esc(label)}</b><span style="color:var(--ink2)">${esc(info)}</span>`)}">i</span>` : ''}</div><div class="val">${val}</div>${sp ? spark(sp.vals, sp.color, sp.dash) : ''}<div class="meta">${meta}</div></div>`;
function spark(vals, color, dash) {
  const v = vals.map(x => x == null || !isFinite(x) ? null : x), ok = v.filter(x => x != null); if (ok.length < 2) return '';
  const W = 200, H = 34, mx = Math.max(...ok), mn = Math.min(0, ...ok), n = v.length, X = i => (n === 1 ? W / 2 : i / (n - 1) * W), Y = x => H - 3 - (x - mn) / (mx - mn || 1) * (H - 6);
  const pts = v.map((x, i) => x == null ? null : [X(i), Y(x)]).filter(Boolean), d = pts.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${dash ? '' : `<path d="${d}L${last[0]},${H}L${pts[0][0]},${H}Z" fill="${color}" fill-opacity=".12"/>`}<path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"${dash ? ' stroke-dasharray="5 4"' : ''}/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/></svg>`;
}
const vsPrev = () => S.compare ? '<span>vs prev. period</span>' : '';
function table(id, cols, rows, { foot = null, def = null, max = 0 } = {}) {
  const st = S.sort[id] || def || {}; let rs = rows.slice();
  if (st.k) { const c = cols.find(c => c.k === st.k); const val = c && c.sv ? c.sv : r => r[st.k]; rs.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' || typeof y === 'string' ? String(x ?? '').localeCompare(String(y ?? '')) : (x ?? -Infinity) - (y ?? -Infinity)) * (st.d === 'asc' ? 1 : -1); }); }
  if (max) rs = rs.slice(0, max);
  const cell = (c, r) => { const v = c.f ? c.f(r[c.k], r) : esc(r[c.k] ?? '—'); const neg = c.neg && (r[c.k] < 0); return `<td class="${c.num ? 'num' : ''}${neg ? ' neg' : ''}">${v}</td>`; };
  return `<div class="tbl-wrap"><table data-table="${id}"><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}"${c.nosort ? '' : ` data-sort="${c.k}"`}>${esc(c.l)}${st.k === c.k ? `<span class="arr">${st.d === 'asc' ? '↑' : '↓'}</span>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${rs.map(r => `<tr>${cols.map(c => cell(c, r)).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">No rows for the current filters</td></tr>`}</tbody>
    ${foot ? `<tfoot><tr>${cols.map(c => cell(c, foot)).join('')}</tr></tfoot>` : ''}</table></div>`;
}
const skuCell = (part) => { if (!M.P[part]) return `<b>${esc(part)}</b>`; const p = M.P[part]; return `<div class="sku"><span class="dot" style="background:${colColor(p.col)}"></span><div><b>${esc(part)}</b><small>${esc(p.name || '')}</small></div></div>`; };
const COLS = ['Zena', 'Calix', 'Caroline', 'Vestra'];
const colColor = c => { const C = SER(); const i = COLS.indexOf(c); return i >= 0 ? C[i] : C[4]; };
function rangeText() { const [f, t] = range(); return `${dLong(f)} – ${dLong(t)} · ${diffDays(f, t) + 1} days`; }
function activeChips() {
  const out = [];
  if (S.platform !== 'all') out.push(['platform', '', S.platform === 'wf' ? 'Wayfair' : 'Amazon']);
  for (const [k, lbl] of FILTER_KEYS) for (const v of S.f[k]) out.push([k, v, `${lbl}: ${k === 'size' ? sizeLbl(v) : v}`]);
  return out.length ? `<div class="chips-active">${out.map(([k, v, l]) => `<span class="tag" data-unchip="${esc(k)}" data-v="${esc(v)}">${esc(l)} ✕</span>`).join('')}</div>` : '';
}
const pageHead = (title, sub) => `<div class="page-head"><div><h1>${title}</h1><p>${sub || rangeText() + (S.compare ? ' · compared with the previous ' + (diffDays(...range()) + 1) + ' days' : '')}</p></div>${activeChips()}</div>`;

// daily series helper
function daysOf(f, t) { const out = []; for (let d = f; d <= t; d = addDays(d, 1)) out.push(d); return out; }
function byDay(ps, f, t, fn) { const m = groupBy(ps, x => x.date); return daysOf(f, t).map(d => fn(m.get(d) || [], d)); }

// ---------------- views ----------------
function viewOverview() {
  const [f, t] = range(), [pf, pt] = prevRange(), C = SER();
  const cur = period(f, t), prev = period(pf, pt), a = cur.a, b = prev.a;
  // month-to-date vs plan (ignores the date filter, keeps the others)
  const ym = M.today.slice(0, 7), mp = period(ym + '-01', M.today), mtd = mp.a, ki = D.kpi ? D.kpi.months.indexOf(ym) : -1;
  const goal = ki >= 0 ? D.kpi.rev[ki] : 0, dIn = daysIn(ym), dNow = +M.today.slice(8, 10), pace = goal * dNow / dIn, proj = mtd.rev / dNow * dIn;
  const gUnits = ki >= 0 ? D.kpi.unit[ki] : 0, gProfit = ki >= 0 ? D.kpi.profit[ki] : 0, gMkt = ki >= 0 && D.kpi.mkt ? D.kpi.mkt[ki] / D.kpi.rev[ki] : null;
  const tgt = target('rev', f, t);
  const months = D.kpi ? D.kpi.months : []; const allPs = basePieces().filter(x => !x.tt);
  const actBy = groupBy(allPs, x => x.date.slice(0, 7));
  const shown = S.kpiAll ? months : months.filter(m => m <= M.today.slice(0, 7) || m === addDays(M.today, 31).slice(0, 7));
  const gran = autoGran(f, t), bk = buckets(cur.ps, cur.ad, f, t, gran);
  const alerts = buildAlerts(cur);
  const byCol = groupBy(cur.ps, x => x.col), byType = groupBy(cur.ps, x => x.type);
  return `${pageHead('Overview')}
  <section class="hero card glass">
    ${ring(goal ? mtd.rev / goal : 0, MON[+ym.slice(5) - 1] + ' target', mtd.rev >= pace ? cssv('--s3') : cssv('--s2'))}
    <div>
      <h2>Revenue · ${MON[+ym.slice(5) - 1]} ${ym.slice(0, 4)} month-to-date vs target</h2>
      <div class="big">${usd(mtd.rev)} <span class="of">/ ${usd(goal)}</span></div>
      <div class="line">Day ${dNow} of ${dIn}: pace target ${usd(pace)} · <b style="color:${mtd.rev >= pace ? 'var(--good-ink)' : 'var(--crit-ink)'}">${mtd.rev >= pace ? 'ahead by' : 'behind by'} ${usd(Math.abs(mtd.rev - pace))}</b> · full-month projection ${usd(proj)}</div>
      <div class="hero-stats">
        <div><b>${n0(mtd.units)} / ${n0(gUnits)}</b><span>Units sold / target</span></div>
        <div><b>${usd(mtd.net)}</b><span>NMV</span></div>
        <div><b>${usd(mtd.profit)} / ${usd(gProfit)}</b><span>Profit / target</span></div>
        <div><b>${pct(mtd.mktPct, 1)}${gMkt != null ? ` / ${pct(gMkt, 1)}` : ''}</b><span>% Mkt fee / plan</span></div>
      </div>
    </div>
  </section>
  <div class="grid g-kpi">
    ${kpi('Revenue', usd(a.rev), `${delta(a.rev, b.rev)} ${vsPrev()}${tgt ? ` · ${pct(a.rev / tgt)} of target` : ''}`, 'Wayfair base cost × units (before promotion) — same basis as the KPI "Rev" line.')}
    ${kpi('NMV', usd(a.net), `${delta(a.net, b.net)} ${vsPrev()}`, 'Net revenue: the wholesale price Wayfair actually pays after promotion funding.')}
    ${kpi('Units Sold', n0(a.units), `${delta(a.units, b.units)} ${vsPrev()} · ${n0(a.orders)} orders`)}
    ${kpi('Profit', usd(a.profit), `${delta(a.profit, b.profit)} ${vsPrev()}`, 'NMV − platform fees (DDA 4% + CastleGate fulfillment) − COGS (FIFO by PO) − Tried & True cost − return & incident deductions − ad spend.')}
    ${kpi('Profit Margin', pct(a.margin, 1), `${delta(a.margin, b.margin, { pp: true })} ${vsPrev()}`, 'Profit ÷ Revenue')}
    ${kpi('Mkt Fee', usd(a.mkt), `${delta(a.mkt, b.mkt, { invert: true })} ${vsPrev()}`, 'Promotion + Ad spend')}
    ${kpi('% Mkt Fee / Revenue', pct(a.mktPct, 1), `${delta(a.mktPct, b.mktPct, { pp: true, invert: true })} ${vsPrev()}`, 'Mkt Fee ÷ Revenue')}
    ${kpi('TACoS', pct(a.tacos, 1), `${delta(a.tacos, b.tacos, { pp: true, invert: true })} ${vsPrev()}`, 'Ad spend ÷ Revenue')}
  </div>
  ${card('Units, NMV and marketing cost', `Bars = units sold · line = NMV · dashed = % Mkt fee (promotion + ads) of revenue · by ${gran}`, combo(bk), { actions: granBtns(), cls: 'big-chart' })}
  <div class="grid g-21">
    ${card('Revenue vs target by month', 'Actual revenue (base cost) vs the "Rev" plan in Cashflow 26+27', vbars(shown.map(m => { const i = months.indexOf(m), act = agg(actBy.get(m) || []).rev; return { label: mLabel(m), vs: [act, D.kpi.rev[i]], tip: tipRows(mLabel(m), [['Actual', usd(act), C[0]], ['Target', usd(D.kpi.rev[i]), C[0]], ['Achieved', pct(D.kpi.rev[i] ? act / D.kpi.rev[i] : null)]]) }; }), { fmt: usdK, series: [{ name: 'Actual', color: C[0] }, { name: 'Target', color: C[0], ghost: true }], showVals: false, w: CW('wide'), h: 340 }),
      { actions: `<button class="view-toggle" data-act="kpiAll" aria-pressed="${S.kpiAll}">${S.kpiAll ? 'To date' : 'Full plan'}</button>` })}
    ${card('Alerts & actions', '', `<div class="alerts">${alerts}</div>`)}
  </div>
  <div class="grid g-2">
    ${card('Revenue by collection', '', donut([...byCol].map(([k, ps]) => ({ label: k, v: sum(ps, x => x.rev), color: colColor(k), extra: [['Units', n0(sum(ps, x => x.qty))]] })).sort((x, y) => y.v - x.v), { fmt: usd, center: usdK(a.rev), sub: 'revenue' }))}
    ${card('Revenue by product type', '', donut([...byType].map(([k, ps]) => ({ label: k, v: sum(ps, x => x.rev), extra: [['Units', n0(sum(ps, x => x.qty))]] })).sort((x, y) => y.v - x.v), { fmt: usd, center: usdK(a.rev), sub: 'revenue' }))}
  </div>`;
}
function freeInfo(po) {
  if (!po.recv) return null; const end = addDays(po.recv, 90), left = diffDays(M.today, end), used = diffDays(po.recv, M.today);
  const recvU = sum(po.items || [], i => i[1]), L = Object.values(M.layers).flat().filter(l => l.po === po.id), remain = sum(L, l => l.left);
  return { end, left, used, recvU, remain, sold: recvU - remain };
}
function buildAlerts(cur) {
  const out = [];
  for (const po of M.pos) { const fi = freeInfo(po); if (!fi) continue;
    const v30 = sum(M.pieces.filter(x => x.ok && x.layer === po.id && x.date > addDays(M.today, -30)), x => x.qty) / 30;
    const proj = Math.max(0, Math.round(fi.remain - v30 * Math.max(0, fi.left)));
    const value = sum(Object.values(M.layers).flat().filter(l => l.po === po.id), l => l.left * l.cogs);
    out.push(`<div class="alert ${fi.left <= 14 ? 'crit' : fi.left <= 45 ? 'warn' : 'info'}"><span class="ic">⏳</span><div><b>${esc(po.id)}: ${fi.left} free-storage days left (until ${dLong(fi.end)})</b><span>${n0(fi.remain)} of ${n0(fi.recvU)} units still in stock (${usd(value)} at landed cost). At the last-30-day pace about ${n0(proj)} units will still be there when fees start.</span></div></div>`); }
  const tt = M.lines.filter(l => l.tt && l.ok && (S.platform !== 'amz'));
  if (tt.length) out.push(`<div class="alert info"><span class="ic">★</span><div><b>${new Set(tt.map(l => l.po)).size} Tried &amp; True orders (${n0(sum(tt, l => l.qty))} units)</b><span>Wayfair pays no wholesale for these; only the 4% DDA comes back. Their landed cost + fulfillment is charged to profit as "Tried &amp; True".</span></div></div>`);
  const un = M.pieces.filter(x => x.ok && x.layer === 'Unassigned');
  if (un.length) out.push(`<div class="alert warn"><span class="ic">!</span><div><b>${n0(sum(un, x => x.qty))} units sold beyond the PO quantities on file</b><span>${esc([...new Set(un.map(x => x.part))].join(', '))} — costed at the latest known landed cost. Send the next PO cost sheet to cost these exactly.</span></div></div>`);
  const st = D.incidentStats, ic = (D.incidents && D.incidents.cases) || []; if (st) out.push(`<div class="alert warn" data-goto="quality" style="cursor:pointer"><span class="ic">!</span><div><b>${ic.length} incident &amp; return cases · ${ic.filter(c => c.issue === 'Damaged').length} damaged on arrival · ${usd(sum(ic, c => c.deduction))} deducted</b><span>${esc(ic.filter(c => c.deduction).map(c => c.part + ': ' + c.detail.toLowerCase()).join(' · '))}. Replacement parts shipped ${pct(st.partsShipped)} — open Incidents &amp; Returns for customer comments →</span></div></div>`);
  const d9 = M.P.D9YA; if (d9 && d9.baseListed && d9.baseListed !== d9.base) out.push(`<div class="alert crit"><span class="ic">$</span><div><b>D9YA base cost on Wayfair is $${d9.baseListed} (siblings $${d9.base})</b><span>Orders are paid on a $${d9.base} base, but the listed base cost inflates its Wayfair retail price. Worth correcting in Partner Home.</span></div></div>`);
  const low = (D.wf.inv || []).filter(r => (r[2] || 0) > 0 && (r[2] || 0) <= 1);
  if (low.length) out.push(`<div class="alert warn"><span class="ic">↓</span><div><b>${low.length} SKUs down to 1 unit</b><span>${esc(low.map(r => r[0]).join(', '))}</span></div></div>`);
  return out.join('') || '<div class="empty">No alerts</div>';
}

function viewSales() {
  const [f, t] = range(), [pf, pt] = prevRange(), C = SER();
  const cur = period(f, t), prev = period(pf, pt), a = cur.a, b = prev.a;
  const bad = basePieces({ includeBad: true }).filter(x => !x.ok && inRange(x, f, t));
  const days = daysOf(f, t), dayA = byDay(cur.ps, f, t, ps => agg(ps));
  const grp = (key, fn = x => x[key]) => [...groupBy(cur.ps, fn)].map(([k, ps]) => ({ k, ...agg(ps) }));
  const bySize = grp('size').sort((x, y) => (x.k ?? 999) - (y.k ?? 999));
  const skuRows = grp('part').map(r => { const p = M.P[r.k] || {}; return { ...r, part: r.k, col: p.col, size: p.size, color: p.color, type: p.type, share: a.rev ? r.rev / a.rev : 0, promoPct: r.rev ? r.promo / r.rev : 0 }; });
  const ttL = M.lines.filter(l => l.tt && l.ok && (S.platform === 'all' || l.ch === S.platform) && inRange(l, f, t) && passProd(l.part));
  const ttPs = M.pieces.filter(x => x.tt && x.ok && (S.platform === 'all' || x.ch === S.platform) && inRange(x, f, t) && passProd(x.part));
  const ordRows = basePieces({ includeBad: true, ignoreTT: true }).filter(x => inRange(x, f, t)).map(x => ({ ...x }));
  return `${pageHead('Sales')}
  <div class="grid g-kpi">
    ${kpi('Units Sold', n0(a.units), `${delta(a.units, b.units)} ${vsPrev()}`)}
    ${kpi('Orders', n0(a.orders), `${delta(a.orders, b.orders)} ${vsPrev()}`)}
    ${kpi('Revenue', usd(a.rev), `${delta(a.rev, b.rev)} ${vsPrev()}`, 'Base cost × units')}
    ${kpi('NMV', usd(a.net), `${delta(a.net, b.net)} ${vsPrev()}`, 'Net revenue: wholesale price actually paid')}
    ${kpi('Promotion', usd(a.promo), `${pct(a.rev ? a.promo / a.rev : null, 1)} of revenue · ${delta(a.promo, b.promo, { invert: true })}`, 'Revenue − Net Revenue (Wayfair promotion funding)')}
    ${kpi('GMV', usd(a.gmv), `${delta(a.gmv, b.gmv)} ${vsPrev()}`, 'Revenue × 2 (estimated consumer spend)')}
    ${kpi('Avg. Order Value', usd(a.aov), `${delta(a.aov, b.aov)} ${vsPrev()}`, 'Revenue ÷ orders')}
    ${kpi('Returns', n0(cur.a.returnUnits) + '<small>units</small>', `${usd(cur.a.returns)} deducted · ${n0(sum(bad, x => x.qty))} cancelled/rejected`)}
  </div>
  ${card('Units, NMV and marketing cost', `Bars = units sold · line = NMV · dashed = % Mkt fee of revenue · by ${autoGran(f, t)}`, combo(buckets(cur.ps, cur.ad, f, t, autoGran(f, t))), { actions: granBtns(), cls: 'big-chart' })}
  <div class="grid g-2">
    ${card('By collection', 'Share of revenue', donut(grp('col').map(r => ({ label: r.k, v: r.rev, color: colColor(r.k), extra: [['Units', n0(r.units)], ['Net revenue', usd(r.net)]] })), { fmt: usd, center: usdK(a.rev), sub: 'revenue' }))}
    ${card('By product type', 'Single · Double · Floating · Rolling Cart', donut(grp('type').sort((x, y) => y.rev - x.rev).map(r => ({ label: r.k, v: r.rev, extra: [['Units', n0(r.units)]] })), { fmt: usd, center: n0(a.units), sub: 'units' }))}
    ${card('By size', 'Units sold per vanity width', vbars(bySize.map(r => ({ label: sizeLbl(r.k), v: r.units, tip: tipRows(sizeLbl(r.k), [['Units', n0(r.units)], ['Revenue', usd(r.rev)], ['Type', r.k ? (r.k >= 60 ? 'Double' : r.k <= 30 ? 'Floating · single' : 'Single') : 'Rolling Cart']]) })), { fmt: n0, colors: [C[0]] }))}
    ${card('By color', '', donut(grp('color', x => x.color || 'No color (cart)').sort((x, y) => y.units - x.units).map(r => ({ label: r.k, v: r.units, extra: [['Revenue', usd(r.rev)]] })), { center: n0(a.units), sub: 'units' }))}
    ${card('By category', 'Bathroom Vanity · Rolling Cart', donut(grp('cat').map(r => ({ label: r.k, v: r.rev, extra: [['Units', n0(r.units)]] })), { fmt: usd, center: usdK(a.rev), sub: 'revenue' }))}
    ${card('Tried &amp; True (review samples)', 'Not counted as sales · Wayfair pays only the 4% DDA back · cost charged to profit', ttL.length ? `<div class="grid g-kpi" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
        <div><div class="sub">Orders</div><b style="font-size:22px">${new Set(ttL.map(l => l.po)).size}</b></div><div><div class="sub">Units</div><b style="font-size:22px">${n0(sum(ttL, l => l.qty))}</b></div><div><div class="sub">Net cost</div><b style="font-size:22px">${usd(sum(ttPs, x => x.cogs + x.cg - x.net))}</b></div></div>
        ${table('tt', [{ k: 'date', l: 'Date', f: v => dLong(v) }, { k: 'po', l: 'PO' }, { k: 'part', l: 'SKU' }, { k: 'qty', l: 'Units', num: true }, { k: 'state', l: 'State' }], ttL, { def: { k: 'date', d: 'desc' } })}` : '<div class="empty">No Tried &amp; True orders in this period</div>')}
  </div>
  ${card('SKU performance', 'Click a column to sort', table('skus', [
    { k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'col', l: 'Collection' }, { k: 'size', l: 'Size', f: v => sizeLbl(v), sv: r => r.size || 0 }, { k: 'color', l: 'Color' }, { k: 'type', l: 'Type' },
    { k: 'units', l: 'Units', num: true, f: v => n0(v) }, { k: 'orders', l: 'Orders', num: true, f: v => n0(v) }, { k: 'rev', l: 'Revenue', num: true, f: v => usd(v) }, { k: 'net', l: 'Net Revenue', num: true, f: v => usd(v) }, { k: 'promoPct', l: 'Promo %', num: true, f: v => pct(v, 1) },
    { k: 'share', l: 'Share', num: true, f: v => `${pct(v, 1)}<span class="mini-bar" style="width:${Math.round(v * 60)}px"></span>` }], skuRows, { def: { k: 'rev', d: 'desc' }, foot: { part: 'Total', units: a.units, orders: a.orders, rev: a.rev, net: a.net, promoPct: a.rev ? a.promo / a.rev : 0, share: 1 } }))}
  ${card('Orders', `${n0(new Set(ordRows.map(x => x.po)).size)} orders in this period`, table('orders', [
    { k: 'date', l: 'Date', f: (v, r) => dLong(v) + (r.hour != null ? ` <span class="sub">${String(r.hour).padStart(2, '0')}:00 ET</span>` : '') }, { k: 'po', l: 'PO', f: (v, r) => `<b>${esc(v)}</b> ${r.tt ? '<span class="tag tt">Tried &amp; True</span>' : ''}${r.country === 'CA' ? ' <span class="tag ca">Canada</span>' : ''}${r.b2b ? ' <span class="tag">B2B</span>' : ''}` },
    { k: 'ch', l: 'Platform', f: v => v === 'wf' ? 'Wayfair' : 'Amazon' }, { k: 'part', l: 'SKU' }, { k: 'qty', l: 'Units', num: true }, { k: 'base', l: 'Base cost', num: true, f: v => usd(v, 2) }, { k: 'price', l: 'Paid', num: true, f: v => usd(v, 2) },
    { k: 'promo', l: 'Promo', num: true, f: (v, r) => r.ok ? pct(r.base ? 1 - r.price / r.base : 0) : '—' }, { k: 'state', l: 'State' }, { k: 'layer', l: 'PO layer' }, { k: 'status', l: 'Status', f: (v, r) => r.ok ? esc(v) : `<span class="tag bad">${esc(v)}</span>` }], ordRows, { def: { k: 'date', d: 'desc' } }))}`;
}

function viewProfit() {
  const [f, t] = range(), [pf, pt] = prevRange(), C = SER(), A = M.A;
  const cur = period(f, t), prev = period(pf, pt), a = cur.a, b = prev.a;
  const steps = [{ label: 'Revenue', v: a.rev, kind: 'total' }, { label: 'Promotion', v: a.promo }, { label: 'DDA 4%', v: a.dda }, { label: 'Fulfillment', v: a.cg }, { label: 'COGS (landed)', v: a.cogs }, { label: 'Tried & True', v: a.ttCost }, { label: 'Returns', v: a.returns }, { label: 'Incidents', v: a.incidents }, { label: 'Ad spend', v: a.ads }, { label: 'Profit', v: a.profit, kind: 'total' }]
    .filter(s => s.kind || Math.abs(s.v) > 0.005).map(s => ({ ...s, share: a.rev ? s.v / a.rev : null }));
  const dedBy = groupBy(cur.dd.list, d => d.part);
  const parts = new Set([...cur.all.map(x => x.part), ...cur.dd.list.map(d => d.part)]);
  const byPart = [...parts].map(part => { const ps = cur.all.filter(x => x.part === part), g = agg(ps), adsP = cur.ad.byPart[part] || 0, p = M.P[part] || {}, dl = dedBy.get(part) || [];
    const ret = sum(dl.filter(d => d.type === 'Return'), d => d.amount), inc = sum(dl.filter(d => d.type !== 'Return'), d => d.amount), profit = g.gp - ret - inc - adsP;
    return { part, col: p.col, layers: [...new Set(ps.map(x => x.layer))].join(', '), units: g.units, rev: g.rev, promo: g.promo, net: g.net, dda: g.dda, cg: g.cg, cgEst: ps.some(x => x.cgEst), cogs: g.cogs, unitCogs: g.units ? g.cogs / g.units : 0, tt: g.ttCost, ret, inc, ads: adsP, mkt: g.promo + adsP, profit, margin: g.rev ? profit / g.rev : null, perUnit: g.units ? profit / g.units : 0 }; });
  const soldParts = new Set(byPart.map(r => r.part)); const idle = sum(Object.entries(cur.ad.byPart).filter(([p]) => !soldParts.has(p) && passProd(p)), ([, v]) => v) + (prodFilterOn() || S.f.po.size ? 0 : cur.ad.unalloc);
  if (idle > 0.5) byPart.push({ part: 'Ads on SKUs with no sales', col: '', layers: '', units: 0, rev: 0, promo: 0, net: 0, dda: 0, cg: 0, cogs: 0, tt: 0, ret: 0, inc: 0, ads: idle, mkt: idle, profit: -idle, margin: null, perUnit: 0, idle: true });
  const byCol = [...groupBy(byPart.filter(r => r.col), r => r.col)].map(([k, rs]) => ({ k, rev: sum(rs, r => r.rev), profit: sum(rs, r => r.profit) }));
  const byType = [...groupBy(byPart.filter(r => r.col), r => (M.P[r.part] || {}).type)].map(([k, rs]) => ({ k, rev: sum(rs, r => r.rev), profit: sum(rs, r => r.profit) }));
  const fifo = []; for (const [part, L] of Object.entries(M.layers)) for (const l of L) if ((!S.f.po.size || S.f.po.has(l.po)) && passProd(part)) fifo.push({ part, po: l.po, recv: l.recv, qty: l.qty, sold: l.qty - l.left, left: l.left, fob: l.fob, sheet: l.sheet, unload: l.unload, cogs: l.cogs, value: l.left * l.cogs, st: l.qty ? (l.qty - l.left) / l.qty : 0 });
  const money = v => usd(v), m2 = v => usd(v, 2), CGa = M.CG.actual || {};
  return `${pageHead('Profit')}
  <div class="grid g-kpi">
    ${kpi('Revenue', usd(a.rev), `${delta(a.rev, b.rev)} ${vsPrev()}`)}
    ${kpi('NMV', usd(a.net), `after ${usd(a.promo)} promotion`, 'Net revenue = wholesale price paid by Wayfair')}
    ${kpi('Platform fees', usd(a.platform), `DDA 4% ${usd(a.dda)} · fulfillment ${usd(a.cg)}`, 'Verified in Partner Home: DDA 4% of the wholesale price on every order (Returns Management) + CastleGate Fulfillment fee per unit shipped (Accounts Payable invoice). Storage is free for the first 90 days.')}
    ${kpi('COGS (landed, FIFO)', usd(a.cogs), `${pct(a.rev ? a.cogs / a.rev : null, 1)} of revenue · FOB ${usd(a.fob)}`, 'PO cost sheet landed cost + CastleGate container unload per unit, consumed first-in-first-out by PO.')}
    ${kpi('Mkt Fee', usd(a.mkt), `${pct(a.mktPct, 1)} of revenue · promo ${usd(a.promo)} + ads ${usd(a.ads)}`, 'Promotion + Ad spend')}
    ${kpi('Returns & incidents', usd(a.returns + a.incidents), `${n0(a.returnUnits)} return${a.returnUnits === 1 ? '' : 's'} · incidents ${usd(a.incidents)}`, 'Actual Wayfair deductions. Returns are Wayfair-Managed: deduction = wholesale × (1 − 4% DDA) × 75% WMR rate.')}
    ${kpi('Profit', usd(a.profit), `${delta(a.profit, b.profit)} ${vsPrev()}`)}
    ${kpi('Profit Margin', pct(a.margin, 1), `${delta(a.margin, b.margin, { pp: true })} ${vsPrev()}`, 'Profit ÷ Revenue')}
  </div>
  ${card('Revenue to profit', 'Where each dollar of revenue goes in this period — hover for % of revenue', waterfall(steps, { h: 380 }), { cls: 'big-chart' })}
  ${card('Profit by SKU', 'COGS from the PO layer each unit came from · fulfillment from the CastleGate invoice (* = rate of the same carton class, not invoiced yet) · ads from the Wayfair SKU report', table('psku', [
    { k: 'part', l: 'SKU', f: (v, r) => r.idle ? `<i class="sub">${esc(v)}</i>` : skuCell(v) }, { k: 'units', l: 'Units', num: true, f: v => n0(v) }, { k: 'rev', l: 'Revenue', num: true, f: money },
    { k: 'profit', l: 'Profit', num: true, neg: true, f: v => `<b>${usd(v)}</b>` }, { k: 'margin', l: 'Margin', num: true, neg: true, f: v => pct(v, 1) }, { k: 'perUnit', l: 'Profit / unit', num: true, neg: true, f: m2 },
    { k: 'promo', l: 'Promotion', num: true, f: money }, { k: 'net', l: 'NMV', num: true, f: money }, { k: 'dda', l: 'DDA 4%', num: true, f: money }, { k: 'cg', l: 'Fulfillment', num: true, f: (v, r) => usd(v, 2) + (r.cgEst ? '*' : '') },
    { k: 'cogs', l: 'COGS', num: true, f: money }, { k: 'unitCogs', l: 'COGS / unit', num: true, f: m2 }, { k: 'tt', l: 'T&T cost', num: true, f: money }, { k: 'ret', l: 'Returns', num: true, f: money }, { k: 'inc', l: 'Incidents', num: true, f: money }, { k: 'ads', l: 'Ads', num: true, f: money }, { k: 'mkt', l: 'Mkt fee', num: true, f: money }, { k: 'layers', l: 'PO layer' }], byPart,
    { def: { k: 'profit', d: 'desc' }, foot: { part: 'Total', layers: '', units: a.units, rev: a.rev, promo: a.promo, net: a.net, dda: a.dda, cg: a.cg, cogs: a.cogs, unitCogs: a.units ? a.cogs / a.units : 0, tt: a.ttCost, ret: a.returns, inc: a.incidents, ads: a.ads, mkt: a.mkt, profit: a.profit, margin: a.margin, perUnit: a.units ? a.profit / a.units : 0 } }))}
  <div class="grid g-2">
    ${card('Profit margin by collection', 'Profit ÷ revenue · red = loss', hbars(byCol.filter(r => r.rev).sort((x, y) => y.profit / y.rev - x.profit / x.rev).map(r => ({ label: r.k, v: r.profit / r.rev, sub: usd(r.profit), color: colColor(r.k), extra: [['Revenue', usd(r.rev)], ['Profit', usd(r.profit)]] })), { fmt: v => pct(v, 1) }))}
    ${card('Profit by product type', '', hbars(byType.sort((x, y) => y.profit - x.profit).map(r => ({ label: r.k, v: r.profit, sub: pct(r.rev ? r.profit / r.rev : null), extra: [['Revenue', usd(r.rev)], ['Margin', pct(r.rev ? r.profit / r.rev : null, 1)]] })), { fmt: usd, color: C[2] }))}
  </div>
  ${cur.dd.list.length ? card('Wayfair deductions', 'Returns and incidents charged back in this period', table('ded', [{ k: 'date', l: 'Date', f: v => dLong(v) }, { k: 'po', l: 'PO' }, { k: 'part', l: 'SKU' }, { k: 'type', l: 'Type', f: v => `<span class="tag ${v === 'Return' ? '' : 'bad'}">${esc(v)}</span>` }, { k: 'reason', l: 'Reason' }, { k: 'amount', l: 'Amount', num: true, f: v => usd(v, 2) }, { k: 'note', l: 'Note' }], cur.dd.list, { def: { k: 'date', d: 'desc' } })) : ''}
  ${card('FIFO cost layers', 'Each PO shipment is a cost layer; units sell from the oldest layer first. All-time.', table('fifo', [
    { k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'po', l: 'PO' }, { k: 'recv', l: 'Received', f: v => dLong(v) }, { k: 'qty', l: 'Qty in', num: true }, { k: 'sold', l: 'Sold', num: true }, { k: 'left', l: 'Remaining', num: true }, { k: 'st', l: 'Sell-through', num: true, f: v => `${pct(v)}<span class="mini-bar" style="width:${Math.round(v * 50)}px"></span>` },
    { k: 'fob', l: 'FOB', num: true, f: m2 }, { k: 'sheet', l: 'Landed (sheet)', num: true, f: m2 }, { k: 'unload', l: 'Unload', num: true, f: m2 }, { k: 'cogs', l: 'COGS / unit', num: true, f: m2 }, { k: 'value', l: 'Stock value', num: true, f: money }], fifo, { def: { k: 'value', d: 'desc' } }))}
  ${card('How each cost is calculated', 'Every rate below was checked in Wayfair Partner Home on Nov 13, 2026', `<div class="assump">
      <div><span>Revenue</span><b>Base cost × units</b></div><div><span>NMV (net revenue)</span><b>Wholesale price paid</b></div><div><span>Promotion</span><b>Revenue − NMV</b></div><div><span>GMV</span><b>Revenue × 2</b></div>
      <div><span>DDA (Damage &amp; Defect Allowance)</span><b>${pct(A.dda, 1)} of wholesale paid</b></div><div><span>CastleGate fulfillment</span><b>Per unit by carton class</b></div><div><span>CastleGate storage</span><b>$0 for first 90 days</b></div><div><span>Container unload</span><b>Per unit, in COGS</b></div>
      <div><span>Returns (Wayfair-Managed)</span><b>Paid × (1 − DDA) × ${pct(A.wmr)}</b></div><div><span>Incidents</span><b>Actual deductions</b></div><div><span>Tried &amp; True</span><b>COGS + fulfillment − DDA back</b></div><div><span>Mkt fee</span><b>Promotion + ads</b></div></div>
      <p class="note"><b>Fulfillment per unit (Oct invoice 1695394):</b> ${Object.entries(CGa).map(([k, v]) => `${k} $${v.toFixed(2)}`).join(' · ')}. Storage after day 90 is charged daily from the CastleGate storage rate card — it starts on ${dLong(addDays(M.pos[0] && M.pos[0].recv || M.today, 90))} for the 1st Shipment. No co-op or other platform percentage appears on the CastleGate invoice or in Returns Management.</p>`)}`;
}

function viewCustomers() {
  const [f, t] = range(), [pf, pt] = prevRange(), C = SER();
  const cur = period(f, t), ps = cur.ps, a = cur.a;
  const st = {}; for (const x of ps) { const k = x.country === 'CA' ? 'CA-' + x.state : x.state; const s = st[k] = st[k] || { code: x.state, country: x.country, units: 0, rev: 0, net: 0, orders: new Set() }; s.units += x.qty; s.rev += x.rev; s.net += x.net; s.orders.add(x.po); }
  const rows = Object.entries(st).map(([k, s]) => { const info = s.country === 'CA' ? [CA_PROV[s.code] || s.code, 'Canada', '—'] : (STATES[s.code] || [s.code, '', '']); return { k, code: s.code, name: info[0], region: info[1], coast: info[2], country: s.country, units: s.units, rev: s.rev, net: s.net, orders: s.orders.size, share: a.rev ? s.rev / a.rev : 0 }; });
  const usStats = {}; for (const r of rows) if (r.country !== 'CA') usStats[r.code] = r;
  const coast = [...groupBy(rows, r => r.country === 'CA' ? 'Canada' : r.coast.replace(' (Gulf)', ''))].map(([k, rs]) => ({ label: k, v: sum(rs, r => r.rev), extra: [['Units', n0(sum(rs, r => r.units))], ['States', n0(rs.length)]] }));
  const region = [...groupBy(rows, r => r.region)].map(([k, rs]) => ({ label: k, v: sum(rs, r => r.rev), sub: n0(sum(rs, r => r.units)) + ' u' })).sort((x, y) => y.v - x.v);
  const timed = ps.filter(x => x.hour != null), hours = Array.from({ length: 24 }, (_, h) => timed.filter(x => x.hour === h)), dows = DOW.map((_, i) => timed.filter(x => x.dow === i));
  const ordersOf = arr => new Set(arr.map(x => x.po)).size;
  const peakH = hours.map((h, i) => [ordersOf(h), i]).sort((x, y) => y[0] - x[0])[0];
  const top = rows.filter(r => r.country !== 'CA').sort((x, y) => y.rev - x.rev)[0];
  const share = k => a.rev ? sum(rows.filter(r => r.coast === k), r => r.rev) / a.rev : null;
  const ca = rows.filter(r => r.country === 'CA'), b2b = ps.filter(x => x.b2b);
  if (!US) loadMap();
  return `${pageHead('Customers')}
  <div class="grid g-kpi k3">
    ${kpi('States reached', n0(Object.keys(usStats).length) + '<small>/ 50</small>', ca.length ? `+ ${ca.length} Canadian provinces` : 'US only')}
    ${kpi('Top state', top ? esc(top.code) : '—', top ? `${esc(top.name)} · ${usd(top.rev)}` : '')}
    ${kpi('East Coast share', pct(share('East Coast')), 'of revenue')}
    ${kpi('West Coast share', pct(share('West Coast')), 'of revenue')}
    ${kpi('Peak order hour', peakH && peakH[0] ? `${String(peakH[1]).padStart(2, '0')}:00<small>ET</small>` : '—', timed.length ? `${n0(peakH[0])} orders in that hour` : 'needs order timestamps')}
    ${kpi('B2B orders', n0(ordersOf(b2b)), `${pct(a.rev ? sum(b2b, x => x.rev) / a.rev : null)} of revenue · Wayfair Professional`)}
  </div>
  ${card('Where customers buy', 'Revenue by US state — darker = more revenue · hover a state for units and revenue', usMap(usStats))}
  <div class="grid g-21">
    ${card('States ranked', 'Region = US Census region · Coast = Atlantic (East) or Pacific (West) coastline', table('states', [
      { k: 'name', l: 'State', f: (v, r) => `<b>${esc(v)}</b> <span class="sub">${esc(r.code)}</span>` }, { k: 'region', l: 'Region' }, { k: 'coast', l: 'Coast', f: v => v === 'East Coast' || v === 'West Coast' ? `<span class="tag">${esc(v)}</span>` : esc(v) },
      { k: 'orders', l: 'Orders', num: true }, { k: 'units', l: 'Units', num: true }, { k: 'rev', l: 'Revenue', num: true, f: v => usd(v) }, { k: 'share', l: 'Share', num: true, f: v => `${pct(v, 1)}<span class="mini-bar" style="width:${Math.round(v * 80)}px"></span>` }], rows, { def: { k: 'rev', d: 'desc' } }))}
    <div class="grid">
      ${card('By coast', 'Share of revenue', hbars(coast.sort((x, y) => y.v - x.v).map(c => ({ ...c, sub: pct(a.rev ? c.v / a.rev : 0) })), { fmt: usd }))}
      ${card('By region', '', hbars(region, { fmt: usd }))}
    </div>
  </div>
  <div class="grid g-2">
    ${card('Orders by hour of day', 'US Eastern time (Wayfair order timestamp)', timed.length ? vbars(hours.map((h, i) => ({ label: String(i), v: ordersOf(h), tip: tipRows(`${String(i).padStart(2, '0')}:00–${String(i).padStart(2, '0')}:59 ET`, [['Orders', n0(ordersOf(h))], ['Units', n0(sum(h, x => x.qty))], ['Revenue', usd(sum(h, x => x.rev))]]) })), { fmt: n0, colors: [C[0]], showVals: true }) + '<p class="note">0 = midnight, 12 = noon, 20 = 8 pm Eastern.</p>' : '<div class="empty">Order timestamps arrive with the next daily sync.</div>')}
    ${card('Orders by day of week', 'US Eastern time', timed.length ? vbars(dows.map((d, i) => ({ label: DOW[i], v: ordersOf(d), tip: tipRows(DOW[i], [['Orders', n0(ordersOf(d))], ['Units', n0(sum(d, x => x.qty))], ['Revenue', usd(sum(d, x => x.rev))]]) })), { fmt: n0, colors: [C[2]] }) : '<div class="empty">Order timestamps arrive with the next daily sync.</div>')}
  </div>`;
}

function viewAds() {
  const [f, t] = range(), [pf, pt] = prevRange(), C = SER();
  const cur = period(f, t), prev = period(pf, pt), ad = cur.ad, pa = prev.ad, a = cur.a;
  const roas = ad.spend ? ad.sales / ad.spend : null, proas = pa.spend ? pa.sales / pa.spend : null;
  const days = daysOf(f, t), dd = days.map(d => ad.daily.get(d) || { spend: 0, sales: 0, clicks: 0, impr: 0 });
  const meta = new Map(((D.wf.ads && D.wf.ads.camps) || []).map(c => [c[0], c]));
  const camps = [...ad.camps.values()].map(c => { const m = meta.get(c.id) || []; return { ...c, name: m[1] || c.id, status: m[2], cap: m[5], ctr: c.impr ? c.clicks / c.impr : null, cpc: c.clicks ? c.spend / c.clicks : null, roas: c.spend ? c.sales / c.spend : null, acos: c.sales ? c.spend / c.sales : null }; });
  const listings = Object.entries(ad.byListing).map(([lid, x]) => { const kids = M.listingParts[lid] || []; const p = M.P[kids[0]] || {}; return { lid, name: (p.name || lid).replace(/ with .*/i, ''), col: p.col, ...x, roas: x.spend ? x.sales / x.spend : null, alloc: kids.filter(k => ad.byPart[k] > 0.005).map(k => `${k} ${usd(ad.byPart[k])}`).join(' · ') }; });
  const abk = adBuckets(cur, f, t, autoGran(f, t)), adTip = b => [['Ad spend', usd(b.spend, 2), C[0]], ['Ad sales', usd(b.sales), C[2]], ['ROAS', b.roas == null ? '—' : b.roas.toFixed(1) + '×'], ['ACoS', pct(b.acos, 1)], ['TACoS', b.tacos == null ? 'no sales' : pct(b.tacos, 1)], ['Clicks', n0(b.clicks)], ['CTR', pct(b.ctr, 2)], ['CPC', b.cpc == null ? '—' : usd(b.cpc, 2)], ['Ad orders', n0(b.orders)]];
  const sp = (k, c, dash) => ({ vals: abk.map(b => b[k]), color: C[c], dash });
  const amzNote = S.platform === 'amz' ? '<p class="note">Amazon Ads data starts once the Amazon Ads API application is approved (submitted Nov 13).</p>' : '';
  return `${pageHead('Advertising')}
  <div class="grid g-kpi">
    ${kpi('Ad Spend', usd(ad.spend, 0), `${delta(ad.spend, pa.spend, { invert: true })} ${vsPrev()}`, '', sp('spend', 0))}
    ${kpi('Ad Sales', usd(ad.sales), `${delta(ad.sales, pa.sales)} 14-day attributed, retail price`, 'Retail sales Wayfair attributes to ad clicks/views within 14 days.', sp('sales', 2))}
    ${kpi('ROAS', roas == null ? '—' : roas.toFixed(1) + '×', `${delta(roas, proas)} ${vsPrev()}`, 'Ad sales ÷ ad spend', sp('roas', 4, true))}
    ${kpi('ACoS', pct(ad.sales ? ad.spend / ad.sales : null, 1), 'Ad spend ÷ ad sales', '', sp('acos', 4, true))}
    ${kpi('TACoS', pct(a.rev ? ad.spend / a.rev : null, 1), `${delta(a.rev ? ad.spend / a.rev : null, prev.a.rev ? pa.spend / prev.a.rev : null, { pp: true, invert: true })} ${vsPrev()}`, 'Total ad spend ÷ total Revenue (base cost)', sp('tacos', 4, true))}
    ${kpi('Clicks', n0(ad.clicks), `CTR ${pct(ad.impr ? ad.clicks / ad.impr : null, 2)} · ${n0(ad.impr)} impressions`, '', sp('clicks', 1))}
    ${kpi('CPC', ad.clicks ? usd(ad.spend / ad.clicks, 2) : '—', `${delta(ad.clicks ? ad.spend / ad.clicks : null, pa.clicks ? pa.spend / pa.clicks : null, { invert: true })} ${vsPrev()}`, '', sp('cpc', 0))}
    ${kpi('Ad Orders', n0(ad.orders), `${n0(ad.units)} units attributed`, '', sp('orders', 3))}
  </div>
  ${amzNote}
  ${card('Spend, ad sales and efficiency', `Bars = ad spend · line = attributed ad sales · dashed = ${ADM[S.adm || 'tacos'][0]} · by ${autoGran(f, t)}`, combo3(abk, { bar: { k: 'spend', name: 'Ad spend', short: 'Spend', axis: usdK, lbl: v => usd(v), color: C[0] }, line: { k: 'sales', name: 'Ad sales (14-day)', short: 'Ad sales', axis: usdK, color: C[2] }, dash: { k: S.adm || 'tacos', name: ADM[S.adm || 'tacos'][0], fmt: ADM[S.adm || 'tacos'][1], color: C[4], min: ADM[S.adm || 'tacos'][2] }, tip: adTip }), { actions: `<div class="btn-row">${Object.entries(ADM).map(([k, [l]]) => `<button class="view-toggle" data-adm="${k}" aria-pressed="${(S.adm || 'tacos') === k}">${esc(l.split(' ')[0])}</button>`).join('')}</div>${granBtns()}`, cls: 'big-chart' })}
  <div class="grid g-2">
    ${card('Traffic', 'Bars = clicks · line = impressions · dashed = CTR', combo3(abk, { bar: { k: 'clicks', name: 'Clicks', axis: n0, color: C[1] }, line: { k: 'impr', name: 'Impressions', short: 'Impr.', axis: v => v >= 1000 ? nf1.format(v / 1000) + 'k' : n0(v), color: C[3] }, dash: { k: 'ctr', name: 'CTR', fmt: v => pct(v, 1), color: C[4], min: 0.002 }, tip: adTip }, { h: 320, w: CW('half') }))}
    ${card('Cost per click and conversion', 'Bars = ad orders · line = CPC · dashed = ROAS', combo3(abk, { bar: { k: 'orders', name: 'Ad orders', short: 'Orders', axis: n0, color: C[3] }, line: { k: 'cpc', name: 'CPC', axis: v => usd(v, 2), color: C[0] }, dash: { k: 'roas', name: 'ROAS', fmt: v => v.toFixed(1) + '×', color: C[4], min: 1 }, tip: adTip }, { h: 320, w: CW('half') }))}
  </div>
  ${card('Campaigns', '', table('camps', [{ k: 'name', l: 'Campaign', f: (v, r) => `<b>${esc(v)}</b><div class="sub">${esc(r.id)} · ${esc(r.status || '')}${r.cap ? ' · $' + r.cap + '/day cap' : ''}</div>` }, { k: 'spend', l: 'Spend', num: true, f: v => usd(v, 2) }, { k: 'impr', l: 'Impr.', num: true, f: v => n0(v) }, { k: 'clicks', l: 'Clicks', num: true, f: v => n0(v) }, { k: 'ctr', l: 'CTR', num: true, f: v => pct(v, 2) }, { k: 'cpc', l: 'CPC', num: true, f: v => v == null ? '—' : usd(v, 2) }, { k: 'orders', l: 'Orders', num: true }, { k: 'sales', l: 'Ad sales', num: true, f: v => usd(v) }, { k: 'roas', l: 'ROAS', num: true, f: v => v == null ? '—' : v.toFixed(1) + '×' }, { k: 'acos', l: 'ACoS', num: true, f: v => pct(v, 1) }], camps, { def: { k: 'spend', d: 'desc' } }))}
  ${card('Spend by listing → SKU', 'From the Wayfair SKU report; each listing\'s spend is split across its child SKUs by net revenue (equal split if the listing had no sales)', listings.length ? table('lst', [{ k: 'name', l: 'Listing', f: (v, r) => `<b>${esc(v)}</b><div class="sub">${esc(r.lid)}</div>` }, { k: 'spend', l: 'Spend', num: true, f: v => usd(v, 2) }, { k: 'clicks', l: 'Clicks', num: true, f: v => n0(v) }, { k: 'orders', l: 'Orders', num: true }, { k: 'sales', l: 'Ad sales', num: true, f: v => usd(v) }, { k: 'roas', l: 'ROAS', num: true, f: v => v == null ? '—' : v.toFixed(1) + '×' }, { k: 'alloc', l: 'Allocated to SKUs', nosort: true }], listings, { def: { k: 'spend', d: 'desc' } }) : '<div class="empty">SKU-level ad data arrives with the next daily sync.</div>')}`;
}

function viewQuality() {
  const I = D.incidents || { cases: [] }, C = SER(), st = D.incidentStats || {};
  const cases = I.cases.filter(c => passProd(c.part)).map(c => ({ ...c, p: M.P[c.part] || {} }));
  const shipped = {}; for (const l of M.lines) if (l.ok && l.ch === 'wf' && l.date <= I.asOf) shipped[l.part] = (shipped[l.part] || 0) + l.qty;
  const issueColor = k => ({ 'Damaged': C[0], 'Mis-information': C[1], 'Wrong size': C[2] })[k] || C[3];
  const byIssue = [...groupBy(cases, c => c.issue)].map(([k, cs]) => ({ label: k, v: cs.length, color: issueColor(k), extra: [['SKUs', [...new Set(cs.map(c => c.part))].join(', ')], ['Deducted', usd(sum(cs, c => c.deduction), 2)]] }));
  const bySku = [...groupBy(cases, c => c.part)].map(([k, cs]) => ({ part: k, n: cs.length, units: shipped[k] || 0, rate: shipped[k] ? cs.length / shipped[k] : null, issues: [...new Set(cs.map(c => c.issue))].join(' · '), ded: sum(cs, c => c.deduction), col: (M.P[k] || {}).col }));
  const dmg = cases.filter(c => c.issue === 'Damaged').length, ret = cases.filter(c => c.kind === 'Return').length, ded = sum(cases, c => c.deduction);
  const unitsAll = sum(Object.values(shipped));
  const tag = c => `<span class="tag issue" style="--c:${issueColor(c.issue)}">${esc(c.issue)}</span>`;
  const caseCard = c => `<article class="case glass">
      <header><div class="sku"><span class="dot" style="background:${colColor(c.p.col)}"></span><div><b>${esc(c.part)}</b><small>${esc((c.p.name || '').replace(/ with .*/i, ''))}${c.p.size ? ' · ' + esc(sizeLbl(c.p.size)) : ''}${c.p.color ? ' · ' + esc(c.p.color) : ''}</small></div></div>${tag(c)}</header>
      <h4>${esc(c.detail)}</h4>
      ${c.comment ? `<blockquote>“${esc(c.comment)}”</blockquote>` : '<p class="sub nocomment">Customer left no comment</p>'}
      <dl><div><dt>PO</dt><dd>${esc(c.po)}${c.tt ? ' <span class="tag tt">Tried &amp; True</span>' : ''}</dd></div><div><dt>Delivered</dt><dd>${dLong(c.delivered)}${c.state ? ' · ' + esc(c.state) : ''}</dd></div><div><dt>Photos</dt><dd>${c.photos || '—'}</dd></div><div><dt>Deducted</dt><dd class="${c.deduction ? 'neg' : ''}">${c.deduction ? usd(c.deduction, 2) : 'None'}</dd></div></dl>
    </article>`;
  return `${pageHead('Incidents &amp; Returns', `All cases since launch · from ${esc(I.source || 'Partner Home')} · checked ${dLong(I.asOf)} · refreshed every Thursday`)}
  <div class="grid g-kpi">
    ${kpi('Cases', n0(cases.length), `${n0(new Set(cases.map(c => c.part)).size)} SKUs affected`)}
    ${kpi('Damaged on arrival', n0(dmg), `${pct(unitsAll ? dmg / unitsAll : null, 1)} of ${n0(unitsAll)} units shipped`)}
    ${kpi('Returns', n0(ret), 'Wayfair-managed: refund × 96% × 75% deducted')}
    ${kpi('Deducted by Wayfair', usd(ded, 2), `Incident rate ${pct(st.incidentRate)} · replacement parts shipped ${pct(st.partsShipped)}`, 'Wayfair\'s own rates from the Incidents and Resolutions dashboard')}
  </div>
  ${dmg ? `<div class="alert crit"><span class="ic">!</span><div><b>${dmg} damage cases${cases.some(c => /sink/i.test(c.detail)) ? ' — including a broken sink top (KFFX)' : ''}</b><span>Replacement parts shipped is ${pct(st.partsShipped)}: when Wayfair asks for a replacement part and none is sent, the full order is refunded and deducted. Turning on replacement parts in Partner Home is the cheapest fix; also check the carton and corner protection for the sink top.</span></div></div>` : ''}
  <div class="grid g-2">
    ${card('By issue', 'Number of cases', donut(byIssue, { center: n0(cases.length), sub: 'cases' }))}
    ${card('By SKU', 'Cases ÷ units shipped to date', table('qsku', [{ k: 'part', l: 'SKU', f: (v, r) => `<span class="dot" style="background:${colColor(r.col)};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px"></span><b>${esc(v)}</b> <span class="sub">${esc(r.col || '')}</span>` }, { k: 'issues', l: 'Issue' }, { k: 'n', l: 'Cases', num: true }, { k: 'units', l: 'Shipped', num: true }, { k: 'rate', l: 'Rate', num: true, f: v => pct(v) }, { k: 'ded', l: 'Deducted', num: true, f: v => v ? usd(v, 2) : '—' }], bySku, { def: { k: 'rate', d: 'desc' } }))}
  </div>
  <h2 class="sec-title">What customers said</h2>
  <div class="cases">${cases.sort((x, y) => (y.deduction - x.deduction) || y.delivered.localeCompare(x.delivered)).map(caseCard).join('') || '<div class="empty">No cases for the current filters</div>'}</div>`;
}

function viewInventory() {
  const [f, t] = range();
  const inv = (D.wf.inv || []).filter(r => passProd(r[0]));
  const sold30 = {}; for (const x of M.pieces) if (x.ok && x.ch === 'wf' && x.date > addDays(M.today, -30)) sold30[x.part] = (sold30[x.part] || 0) + x.qty;
  const lastCogs = part => { const L = M.layers[part]; return L && L.length ? L[L.length - 1].cogs : 0; };
  const rows = inv.map(r => { const p = M.P[r[0]] || {}; const v = (sold30[r[0]] || 0) / 30; return { part: r[0], col: p.col, size: p.size, color: p.color, type: p.type, onHand: r[2] || 0, avail: r[3] || 0, sold30: sold30[r[0]] || 0, cover: v ? (r[2] || 0) / v : null, value: (r[2] || 0) * lastCogs(r[0]) }; });
  const shownRows = S.hideZero ? rows.filter(r => r.onHand > 0 || r.sold30 > 0) : rows;
  const tot = { onHand: sum(rows, r => r.onHand), avail: sum(rows, r => r.avail), value: sum(rows, r => r.value) };
  const v30 = sum(Object.entries(sold30).filter(([p]) => passProd(p)), ([, v]) => v) / 30;
  const posShown = M.pos.filter(p => !S.f.po.size || S.f.po.has(p.id));
  const openInb = (D.wf.inb || []).filter(x => x.status === 'OPEN');
  const inbUnits = sum(openInb, x => sum(x.items || [], i => i[1] || 0));
  const poCards = posShown.map(po => {
    const fi = freeInfo(po), inb = po.inb || {};
    const L = Object.entries(M.layers).flatMap(([part, ls]) => ls.filter(l => l.po === po.id).map(l => ({ part, ...l })));
    if (!fi) return card(esc(po.id), `${esc(po.whs || '')} · ${esc(inb.po || '')} · ${inb.status === 'OPEN' ? 'in transit' : 'no receiving date yet'}`, `<div class="grid g-kpi" style="gap:10px"><div class="kpi"><div class="lbl">ETA port</div><div class="val" style="font-size:22px">${inb.eta ? dLong(inb.eta) : '—'}</div></div><div class="kpi"><div class="lbl">Container</div><div class="val" style="font-size:18px">${esc(inb.container || '—')}</div></div><div class="kpi"><div class="lbl">Cost sheet</div><div class="val" style="font-size:18px">${(po.items || []).length ? 'On file' : 'Pending'}</div></div></div><p class="note">The 90 free storage days start at Receiving Start. ${(po.items || []).length ? '' : 'Send this PO\'s cost sheet (FOB per factory, freight, duty) so its units get their own landed cost.'}</p>`);
    const ms = inb.milestones || {}; const pctUsed = Math.max(0, Math.min(1, fi.used / 90));
    const stp = [['PO created', inb.created], ['Left origin', inb.loadAtd || ms.ATD], ['US port', inb.portAta || ms.ATA], ['Gated out', inb.gatedOut || ms.GATED_OUT_AT_DESTINATION_PORT], ['Receiving start', po.recv]];
    return `<section class="card glass cg-po"><div class="cg-top"><div><h3>${esc(po.id)} <span class="pill ${inb.status === 'COMPLETED' ? 'good' : 'info'}"><i></i>${esc(inb.status || 'Received')}</span></h3><p class="sub">${esc(po.whs)} · ${esc(inb.po || '')} · ${esc(inb.dest || '')} · ${esc(inb.container || '')}${po.factory ? ' · ' + esc(po.factory) : ''}</p></div>
      <div style="text-align:right"><div class="cg-days"><b>${Math.max(0, fi.left)}</b><span>free days left</span></div><span class="pill ${fi.left <= 14 ? 'crit' : fi.left <= 45 ? 'warn' : 'good'}"><i></i>Fees start ${dLong(fi.end)}</span></div></div>
      <div><div class="free-bar"><i style="width:${pctUsed * 100}%"></i></div><div class="legend-row" style="margin-top:6px"><span>Received ${dLong(po.recv)}</span><span>Day ${Math.min(90, fi.used)}/90</span><span>${dLong(fi.end)}</span></div></div>
      <div class="timeline">${stp.map(([l, d]) => `<div class="st ${d ? 'done' : ''}"><b>${l}</b>${d ? dLong(d) : '—'}</div>`).join('')}</div>
      <div class="grid g-kpi" style="gap:10px">
        <div><div class="sub">Received</div><b style="font-size:22px">${n0(fi.recvU)}</b></div><div><div class="sub">Sold (FIFO)</div><b style="font-size:22px">${n0(fi.sold)}</b></div><div><div class="sub">Remaining</div><b style="font-size:22px">${n0(fi.remain)}</b></div><div><div class="sub">Sell-through</div><b style="font-size:22px">${pct(fi.recvU ? fi.sold / fi.recvU : 0)}</b></div><div><div class="sub">Stock value (landed)</div><b style="font-size:22px">${usd(sum(L, l => l.left * l.cogs))}</b></div>
      </div>
      ${table('po-' + po.id, [{ k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'qty', l: 'Received', num: true }, { k: 'sold', l: 'Sold', num: true, sv: r => r.qty - r.left, f: (v, r) => n0(r.qty - r.left) }, { k: 'left', l: 'Remaining', num: true }, { k: 'st', l: 'Sell-through', num: true, sv: r => (r.qty - r.left) / r.qty, f: (v, r) => `${pct((r.qty - r.left) / r.qty)}<span class="mini-bar" style="width:${Math.round((r.qty - r.left) / r.qty * 50)}px"></span>` }, { k: 'fob', l: 'FOB', num: true, f: v => usd(v, 2) }, { k: 'cogs', l: 'Landed', num: true, f: v => usd(v, 2) }], L.filter(l => passProd(l.part)), { def: { k: 'left', d: 'desc' } })}
    </section>`;
  }).join('');
  return `${pageHead('Inventory &amp; POs', 'CastleGate stock today · PO cost layers · 90-day free storage countdown')}
  <div class="grid g-kpi k5">
    ${kpi('On hand', n0(tot.onHand) + '<small>units</small>', `${n0(rows.filter(r => r.onHand > 0).length)} of ${n0(rows.length)} SKUs in stock`)}
    ${kpi('Available', n0(tot.avail) + '<small>units</small>', 'Fulfillable at CastleGate')}
    ${kpi('Stock value', usd(tot.value), 'At latest landed cost')}
    ${kpi('Days of cover', v30 ? n0(tot.onHand / v30) : '—', `${nf1.format(v30 * 30)} units sold in the last 30 days`)}
    ${kpi('Inbound', n0(openInb.length) + `<small>${openInb.length === 1 ? 'shipment' : 'shipments'}</small>`, inbUnits ? n0(inbUnits) + ' units' : 'quantities pending cost sheet')}
  </div>
  ${poCards || '<div class="empty">No PO matches the PO filter</div>'}
  ${card('CastleGate inventory', 'Live from the Wayfair inventory API', table('inv', [{ k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'col', l: 'Collection' }, { k: 'size', l: 'Size', f: v => sizeLbl(v), sv: r => r.size || 0 }, { k: 'color', l: 'Color' }, { k: 'onHand', l: 'On hand', num: true }, { k: 'avail', l: 'Available', num: true }, { k: 'sold30', l: 'Sold 30d', num: true }, { k: 'cover', l: 'Days of cover', num: true, f: v => v == null ? '—' : n0(v) }, { k: 'value', l: 'Value', num: true, f: v => usd(v) }], shownRows, { def: { k: 'onHand', d: 'desc' }, foot: { part: 'Total', onHand: tot.onHand, avail: tot.avail, sold30: sum(rows, r => r.sold30), value: tot.value } }),
    { actions: `<button class="view-toggle" data-act="hideZero" aria-pressed="${S.hideZero}">${S.hideZero ? 'Show all SKUs' : 'Hide zero-stock SKUs'}</button>` })}`;
}

// ---------------- sidebar ----------------
function options(key) {
  const P = M.P, cnt = {}; for (const x of M.pieces) if (x.ok) { const v = key === 'po' ? x.layer : key === 'sku' ? x.part : key === 'size' ? String(x.size) : x[key]; cnt[v] = (cnt[v] || 0) + x.qty; }
  let vals;
  if (key === 'po') vals = [...new Set([...M.pos.map(p => p.id), ...Object.keys(cnt)])].filter(v => v && v !== '—');
  else if (key === 'sku') vals = Object.keys(P).sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0) || a.localeCompare(b));
  else if (key === 'size') vals = [...new Set(Object.values(P).map(p => String(p.size)))].sort((a, b) => (+a || 999) - (+b || 999));
  else vals = [...new Set(Object.values(P).map(p => p[key]).filter(Boolean))].sort();
  return vals.map(v => ({ v, label: key === 'size' ? (v === 'null' ? 'No size (cart)' : sizeLbl(v)) : key === 'sku' ? `${v} · ${(P[v] && P[v].col) || ''} ${P[v] && P[v].size ? sizeLbl(P[v].size) : ''} ${(P[v] && P[v].color) || ''}` : v, n: cnt[v] || 0 }));
}
function renderSidebar() {
  const [f, t] = range();
  const presets = [['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['mtd', 'MTD'], ['qtd', 'QTD'], ['ytd', 'YTD'], ['all', 'All']];
  const ms = (k, lbl) => { const sel = S.f[k], opts = options(k); const txt = sel.size ? (sel.size === 1 ? (k === 'size' ? sizeLbl([...sel][0]) : [...sel][0]) : sel.size + ' selected') : 'All';
    return `<details class="ms" data-ms="${k}"${S.open[k] ? ' open' : ''}><summary><span>${lbl}</span><em class="${sel.size ? '' : 'all'}">${esc(txt)}</em></summary><div class="ms-list">${sel.size ? `<button class="ms-clear" data-clear="${k}">Clear</button>` : ''}${opts.map(o => `<label><input type="checkbox" data-f="${k}" value="${esc(o.v)}"${sel.has(o.v) ? ' checked' : ''}><span>${esc(o.label)}</span><small>${o.n ? n0(o.n) : ''}</small></label>`).join('')}</div></details>`; };
  const nOn = FILTER_KEYS.reduce((s, [k]) => s + S.f[k].size, 0) + (S.platform !== 'all');
  $('#filterCount').textContent = nOn || '';
  $('#sidebar').innerHTML = `
    <div class="sb-head"><h2>Filters</h2><button class="link-btn" data-act="reset">Reset all</button></div>
    <div class="sb-sec"><span class="sb-lbl">Date range</span>
      <div class="chips">${presets.map(([k, l]) => `<button class="chip" data-preset="${k}" aria-pressed="${S.preset === k}">${l}</button>`).join('')}</div>
      <div class="dates"><input type="date" id="dFrom" value="${f}" max="${M.today}" aria-label="From"><input type="date" id="dTo" value="${t}" max="${M.today}" aria-label="To"></div>
      <label class="switch">Compare to previous period<input type="checkbox" id="cmp"${S.compare ? ' checked' : ''}></label>
      ${S.compare ? `<span class="range-note">vs <b>${dLong(prevRange()[0])} – ${dLong(prevRange()[1])}</b></span>` : ''}
    </div>
    <div class="sb-sec"><span class="sb-lbl">Platform</span><div class="seg">${[['all', 'All'], ['wf', 'Wayfair'], ['amz', 'Amazon']].map(([k, l]) => `<button data-plat="${k}" aria-pressed="${S.platform === k}">${l}</button>`).join('')}</div></div>
    <div class="sb-sec"><span class="sb-lbl">Product</span>${ms('col', 'Collection')}${ms('cat', 'Category')}${ms('type', 'Product type')}${ms('size', 'Size')}${ms('color', 'Color')}${ms('sku', 'SKU')}</div>
    <div class="sb-sec"><span class="sb-lbl">Shipment</span>${ms('po', 'PO')}</div>
`;
}

// ---------------- render & wiring ----------------
const VIEWS = { overview: viewOverview, sales: viewSales, profit: viewProfit, customers: viewCustomers, ads: viewAds, quality: viewQuality, inventory: viewInventory };
function render() {
  renderSidebar();
  const y = scrollY; $('#view').innerHTML = VIEWS[S.tab](); if (render.keep) scrollTo(0, y); render.keep = false;
}
const rerender = () => { render.keep = true; render(); };
function setTab(t) { S.tab = t; $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t)); try { history.replaceState(null, '', '#' + t); } catch (e) {} render(); scrollTo({ top: 0, behavior: 'smooth' }); }
$$('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
const sb = $('#sidebar');
sb.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.preset) { S.preset = b.dataset.preset; rerender(); }
  else if (b.dataset.plat) { S.platform = b.dataset.plat; rerender(); }
  else if (b.dataset.clear) { S.f[b.dataset.clear].clear(); rerender(); }
  else if (b.dataset.act === 'reset') { FILTER_KEYS.forEach(([k]) => S.f[k].clear()); S.platform = 'all'; S.incTT = false; S.preset = '30d'; S.compare = true; rerender(); }
});
sb.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.f) { const s = S.f[el.dataset.f]; el.checked ? s.add(el.value) : s.delete(el.value); S.open[el.dataset.f] = true; rerender(); }
  else if (el.id === 'dFrom' || el.id === 'dTo') { const f = $('#dFrom').value, t = $('#dTo').value; if (f && t) { S.preset = 'custom'; [S.from, S.to] = f <= t ? [f, t] : [t, f]; rerender(); } }
  else if (el.id === 'cmp') { S.compare = el.checked; rerender(); }
  else if (el.id === 'incTT') { S.incTT = el.checked; rerender(); }
});
sb.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.ms) S.open[d.dataset.ms] = d.open; }, true);
$('#view').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (th) { const id = th.closest('table').dataset.table, k = th.dataset.sort, cur = S.sort[id] || {}; S.sort[id] = { k, d: cur.k === k && cur.d === 'desc' ? 'asc' : 'desc' }; rerender(); return; }
  const g = e.target.closest('[data-gran]'); if (g) { S.gran = g.dataset.gran; rerender(); return; }
  const am = e.target.closest('[data-adm]'); if (am) { S.adm = am.dataset.adm; rerender(); return; }
  const go = e.target.closest('[data-goto]'); if (go) { setTab(go.dataset.goto); return; }
  const b = e.target.closest('[data-act]'); if (b) { if (b.dataset.act === 'kpiAll') S.kpiAll = !S.kpiAll; if (b.dataset.act === 'hideZero') S.hideZero = !S.hideZero; rerender(); return; }
  const c = e.target.closest('[data-unchip]'); if (c) { const k = c.dataset.unchip; if (k === 'platform') S.platform = 'all'; else if (k === 'tt') S.incTT = false; else S.f[k].delete(c.dataset.v); rerender(); }
});
const openFilters = on => { document.body.classList.toggle('filters-open', on); $('#filterBtn').setAttribute('aria-expanded', on); };
$('#filterBtn').onclick = () => openFilters(!document.body.classList.contains('filters-open'));
$('#scrim').onclick = () => openFilters(false);
// tooltips
const tip = $('#tip');
function showTip(el, x, y) { tip.innerHTML = el.getAttribute('data-tip'); tip.hidden = false; const w = tip.offsetWidth, h = tip.offsetHeight; let L = x + 14, T = y + 14; if (L + w > innerWidth - 8) L = x - w - 14; if (T + h > innerHeight - 8) T = y - h - 14; tip.style.left = Math.max(8, L) + 'px'; tip.style.top = Math.max(8, T) + 'px'; }
document.addEventListener('mousemove', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else tip.hidden = true; });
document.addEventListener('touchstart', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) { const t0 = e.touches[0]; showTip(el, t0.clientX, t0.clientY); } else tip.hidden = true; }, { passive: true });
addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
let rzT, lastW = innerWidth; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (D && Math.abs(innerWidth - lastW) > 30) { lastW = innerWidth; rerender(); } }, 200); });
$('#themeBtn').onclick = () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const nx = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; store.set('lg-theme', nx, true); if (D) rerender(); };
$('#logoutBtn').onclick = () => { store.del('lg-dk'); location.hash = ''; location.reload(); };
const th0 = store.get('lg-theme'); if (th0) document.documentElement.dataset.theme = th0;

function start(data, updated) {
  D = data; D.wf = D.wf || {}; D.meta = D.meta || {}; build();
  const u = new Date(updated || (D.meta.at * 1000) || Date.now());
  $('#updated').textContent = 'Updated ' + u.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Asia/Ho_Chi_Minh' }) + ' GMT+7';
  $('#login').hidden = true; $('#app').hidden = false;
  const h = location.hash.slice(1); setTab(VIEWS[h] ? h : 'overview');
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Decrypting…'; $('#loginErr').textContent = '';
  try { const { raw, data, updated } = await login($('#user').value, $('#pass').value); store.set('lg-dk', b64e(raw), $('#remember').checked); $('#pass').value = ''; start(data, updated); }
  catch (x) { $('#loginErr').textContent = x.message === 'bad' ? 'Wrong username or password' : x.message; }
  btn.disabled = false; btn.textContent = 'Sign in';
});
(async () => {
  const k = store.get('lg-dk');
  if (k) { try { const f = await fetchFile(); start(await openWith(f, b64d(k)), f.updated); return; } catch (e) { store.del('lg-dk'); } }
  $('#login').hidden = false; setTimeout(() => $('#user').focus(), 50);
})();
})();
