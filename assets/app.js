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
const VN_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// Order day/time in GMT+7 — the same dates Partner Home shows (it displays in the viewer's local time, Vietnam)
const vnParts = iso => Object.fromEntries(VN_FMT.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
const vnDay = iso => { const p = vnParts(iso); return `${p.year}-${p.month}-${p.day}`; };
const vnTime = iso => { const p = vnParts(iso); return `${p.hour}:${p.minute}`; };
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
let M_cash = { deferred: 0, released: 0 };
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
    lines.push({ ch: 'wf', po: r[0], date: ts ? vnDay(ts) : r[2], ts, hour: hd ? hd.h : null, dow: hd ? hd.dow : null, status, ok: OK_STATUS(status), retailer: r[4] || 'Wayfair', state: r[5], country: r[6] || 'US', part: r[7], qty, price, base, b2b: /yes/i.test(r[13] || ''), tt: /tried/i.test(r[14] || '') || TT.has(r[0]) });
  }
  // Amazon (Seller Central, FBM shipped by CastleGate Multichannel): exact money from the SP-API Finances transactions
  const FIN = (D.amz && D.amz.fin) || [], finBy = {}, amzSvc = [];
  const leafSum = (lf, re) => Object.entries(lf || {}).reduce((a, [k, v]) => re.test(k) ? a + v : a, 0);
  for (const t of FIN) {
    const lf = t[9] || {}, date = vnDay(t[1]);
    if (t[2] === 'Shipment' && t[4]) {
      const o = finBy[t[4]] = finBy[t[4]] || { principal: 0, ship: 0, promo: 0, feeBase: 0, feeTax: 0, feeDisc: 0, other: 0, status: t[3], date };
      o.principal += leafSum(lf, /^ProductCharges\/.*Principal/); o.ship += leafSum(lf, /^ProductCharges\/.*Shipping/);
      o.promo -= leafSum(lf, /^PromoRebates\//);
      o.feeBase -= leafSum(lf, /^AmazonFees\/[^/]+\/Base$/); o.feeTax -= leafSum(lf, /^AmazonFees\/[^/]+\/Tax$/); o.feeDisc += leafSum(lf, /^AmazonFees\/[^/]+\/Promo$/);
      o.status = t[3];
    } else if (t[2] === 'Refund' && t[4]) {
      amzSvc.push({ date, kind: 'refund', order: t[4], sku: t[5], qty: t[6] || 0, amount: -t[7], lf });
    } else if (t[2] === 'ProductAdsPayment') {
      amzSvc.push({ date, kind: 'ads', amount: -t[7], base: -(lf.Base || 0), tax: -(lf.Tax || 0) });
    } else if (t[2] === 'ServiceFee') {
      const d = (t[8] || '').toLowerCase();
      amzSvc.push({ date, kind: /subscription/.test(d) ? 'subscription' : /coupon|promotion|deal|lightning/.test(d) ? 'promoFee' : 'serviceFee', desc: t[8], amount: -t[7] });
    } else if (!/^(DebtRecovery|Transfer|Disbursement|PaymentEvent)$/i.test(t[2])) {
      // anything else Amazon posts (shipping labels, A-to-z / chargebacks, adjustments, retrocharges…) is kept as an "other" charge or credit
      amzSvc.push({ date, kind: 'serviceFee', desc: `${t[2]}${t[8] ? ' · ' + t[8] : ''}${t[4] ? ' · ' + t[4] : ''}`, amount: -t[7] });
    }
  }
  const finOrders = Object.values(finBy).filter(o => o.principal > 0);
  M_cash = { deferred: sum(FIN.filter(t => t[3] === 'DEFERRED'), t => t[7]), released: sum(FIN.filter(t => t[3] === 'RELEASED' && !/^DebtRecovery$/.test(t[2])), t => t[7]) };
  // effective Amazon fee on net sales observed so far (used only for orders Amazon has not charged yet)
  A.amzFeeRate = finOrders.length ? sum(finOrders, o => o.feeBase + o.feeTax - o.feeDisc) / sum(finOrders, o => o.principal + o.ship - o.promo) : A.amazonFee;
  for (const r of (D.amz && D.amz.orders) || []) {
    const qty = +r[5] || 0, price = +r[6] || 0, fo = finBy[r[0]], ts = r[11] || null, hd = ts ? etHourDow(ts) : null;
    lines.push({ ch: 'amz', po: r[0], date: ts ? vnDay(ts) : r[1], ts, hour: hd ? hd.h : null, dow: hd ? hd.dow : null, status: r[2], ok: OK_STATUS(r[2]), retailer: 'Amazon', state: String(r[12] || '').toUpperCase(), country: r[13] || 'US', part: r[3], qty, price, base: price, b2b: r[14] === 'yes', tt: false,
      ship: fo ? fo.ship : (+r[10] || 0), promoAmt: fo ? fo.promo : (+r[9] || 0), promoIds: String(r[15] || ''), fin: fo || null });
  }
  lines.sort((a, b) => (a.ts || a.date + 'T12').localeCompare(b.ts || b.date + 'T12'));
  // split each order line into FIFO pieces (Tried & True units ship from the same stock, so they consume layers too)
  const pieces = [];
  const mk = (l, q, ly) => {
    const p = prod(l.part), wf = l.ch === 'wf';
    // Tried & True: Wayfair pays no wholesale — only the DDA amount comes back; units still cost COGS + fulfillment
    const base = { ...l, qty: q, layer: ly.po, unitCogs: ly.cogs, unitFob: ly.fob, cogs: ly.cogs * q, fob: ly.fob * q, col: p.col, cat: p.cat, type: p.type, size: p.size, color: p.color, name: p.name, fam: p.fam };
    if (!wf) {
      // Amazon seller: Revenue = GMV = item price × qty (+ shipping charged); Promotion = seller-funded promo rebates; NMV = net sales
      const share = l.qty ? q / l.qty : 1, rev = l.price * q + (l.ship || 0) * share, promo = (l.promoAmt || 0) * share, net = rev - promo, fo = l.fin;
      const fee = fo ? (fo.feeBase + fo.feeTax - fo.feeDisc) * share : net * A.amzFeeRate;
      return { ...base, rev, gmv: rev, net, promo, dda: 0, cg: 0, cgEst: false, amzFee: fee, amzFeeEst: !fo, amzRef: fo ? fo.feeBase * share : net * 0.15, amzRefTax: fo ? fo.feeTax * share : 0, amzRefDisc: fo ? fo.feeDisc * share : 0,
        mcf: A.amzMcf != null ? A.amzMcf * q : 0, mcfEst: A.amzMcf == null || !!A.amzMcfEst };
    }
    const rev = l.tt ? 0 : l.base * q, paid = l.price * q, net = l.tt ? (A.ttReimburseDDA ? paid * A.dda : 0) : paid;
    // Wayfair: Revenue = base cost we submit; GMV = Revenue × 2 (Wayfair's retail mark-up); NMV = wholesale actually paid
    return { ...base, rev, gmv: rev * 2, net, promo: l.tt ? 0 : rev - net, dda: !l.tt ? paid * A.dda : 0, cg: cgFee(l.part) * q, cgEst: !(CG.actual && CG.actual[l.part] != null), amzFee: 0, mcf: 0 };
  };
  for (const l of lines) {
    if (!l.ok) { pieces.push({ ...mk(l, l.qty, { po: '—', cogs: 0, fob: 0 }), rev: 0, gmv: 0, net: 0, promo: 0, cogs: 0, fob: 0, dda: 0, cg: 0, amzFee: 0, mcf: 0 }); continue; }
    let q = l.qty; const L = layers[l.part] || [];
    for (const ly of L) { if (q <= 0) break; if (ly.left <= 0) continue; const t = Math.min(q, ly.left); ly.left -= t; q -= t; pieces.push(mk(l, t, ly)); }
    if (q > 0) { const lc = lastCost(l.part); pieces.push(mk(l, q, { po: 'Unassigned', cogs: lc.cogs, fob: lc.fob })); }
  }
  const deds = (D.deductions || []).map(d => ({ ...d, ch: 'wf' }));
  const dates = lines.map(l => l.date).filter(Boolean).sort();
  M = { P, A, CG, cgFee, pos, layers, lines, pieces, deds, amzSvc, finBy, amzCash: M_cash, first: dates[0] || D.meta.today, today: [vnDay(new Date().toISOString()), (D.meta && D.meta.today) || ''].sort().pop() };
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
  const o = { units: 0, rev: 0, gmv: 0, net: 0, promo: 0, cogs: 0, fob: 0, dda: 0, cg: 0, amzFee: 0, amzFeeEst: 0, mcf: 0, ttUnits: 0, ttCost: 0, ttCogs: 0, ttCg: 0, ttBack: 0 }, orders = new Set(), ttOrders = new Set();
  for (const x of ps) {
    if (x.tt) { o.ttUnits += x.qty; o.ttCogs += x.cogs; o.ttCg += x.cg; o.ttBack += x.net; o.ttCost += x.cogs + x.cg - x.net; ttOrders.add(x.po); continue; }
    o.units += x.qty; o.rev += x.rev; o.gmv += x.gmv || 0; o.net += x.net; o.promo += x.promo; o.cogs += x.cogs; o.fob += x.fob; o.dda += x.dda; o.cg += x.cg; o.amzFee += x.amzFee; if (x.amzFeeEst) o.amzFeeEst += x.amzFee; o.mcf += x.mcf || 0; orders.add(x.po);
  }
  o.orders = orders.size; o.ttOrders = ttOrders.size; o.aov = o.orders ? o.rev / o.orders : 0;
  o.platform = o.dda + o.cg + o.amzFee + o.mcf;               // what the platforms take: Wayfair DDA 4% + CastleGate fulfillment · Amazon referral fee + CastleGate Multichannel
  o.gp = o.net - o.platform - o.cogs - o.ttCost;              // before returns, incidents and ads
  return o;
}
// Wayfair deductions for returns (WMR) and incidents, by deduction date
function deductions(f, t) {
  const amzRef = M.amzSvc.filter(x => x.kind === 'refund').map(x => ({ ch: 'amz', type: 'Return', part: x.sku, po: x.order, date: x.date, amount: x.amount, reason: 'Amazon refund' }));
  const ds = [...M.deds, ...amzRef].filter(d => (S.platform === 'all' || d.ch === S.platform) && d.date >= f && d.date <= t && passProd(d.part));
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
  if (S.platform !== 'wf' && !((D.amz && D.amz.ads && D.amz.ads.daily) || []).length) {
    // no Ads API yet: use what Amazon actually billed for Sponsored Products (Finances 'ProductAdsPayment', incl. tax) on the billing date
    for (const x of M.amzSvc) if (x.kind === 'ads' && x.date >= f && x.date <= t) { out.spend += x.amount; out.amzBilled = (out.amzBilled || 0) + x.amount; out.byPart['5C8N'] = (out.byPart['5C8N'] || 0) + x.amount;
      const d = out.daily.get(x.date) || { spend: 0, sales: 0, clicks: 0, impr: 0, orders: 0 }; d.spend += x.amount; out.daily.set(x.date, d); }
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
  // Amazon account-level fees hit the period when Amazon charges them; they count only when no product filter narrows the view
  const svc = S.platform === 'wf' || prodFilterOn() || S.f.po.size ? [] : M.amzSvc.filter(x => x.date >= f && x.date <= t);
  a.amzSub = sum(svc.filter(x => x.kind === 'subscription'), x => x.amount); a.amzPromoFee = sum(svc.filter(x => x.kind === 'promoFee'), x => x.amount); a.amzSvcOther = sum(svc.filter(x => x.kind === 'serviceFee'), x => x.amount);
  a.amzAccount = a.amzSub + a.amzPromoFee + a.amzSvcOther; a.platform += a.amzAccount; a.gp -= a.amzAccount;
  a.mkt = a.promo + a.ads; a.mktPct = a.rev ? a.mkt / a.rev : null;
  a.profit = a.gp - a.returns - a.incidents - a.ads; a.margin = a.rev ? a.profit / a.rev : null; a.tacos = a.rev ? a.ads / a.rev : null; a.costs = a.rev - a.profit;
  return { ps, all, a, ad, dd };
}
function chanPeriod(ch, f, t) { const keep = S.platform; S.platform = ch; try { return period(f, t); } finally { S.platform = keep; } }
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
// HTML heatmap: rows × cols, cell shade by value (single-hue ramp), value printed in the cell
function heatmap(rowKeys, colKeys, cell, { fmt = n0, rowLabel = k => k, colLabel = k => k, tip, color = 1 } = {}) {
  const vals = rowKeys.flatMap(r => colKeys.map(c => cell(r, c) || 0)), mx = Math.max(0, ...vals);
  if (!mx) return '<div class="empty">No data in this period</div>';
  const C = SER(), base = C[color];
  const td = (r, c) => { const v = cell(r, c) || 0, a = v ? 0.12 + 0.78 * v / mx : 0; return `<td class="hm" style="background:${v ? `color-mix(in srgb, ${base} ${Math.round(a * 100)}%, transparent)` : 'transparent'};color:${a > 0.55 ? '#fff' : 'var(--ink)'}" data-tip="${esc(tip ? tip(r, c, v) : tipRows(rowLabel(r) + ' · ' + colLabel(c), [['Value', fmt(v)]]))}">${v ? fmt(v) : '<span class="sub">·</span>'}</td>`; };
  return `<div class="tbl-wrap"><table class="heat"><thead><tr><th></th>${colKeys.map(c => `<th class="num">${esc(colLabel(c))}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${rowKeys.map(r => `<tr><td><b>${esc(rowLabel(r))}</b></td>${colKeys.map(c => td(r, c)).join('')}<td class="num"><b>${fmt(sum(colKeys, c => cell(r, c) || 0))}</b></td></tr>`).join('')}</tbody></table></div>`;
}
// 100% stacked horizontal bars: one row per group, segments per category
function stack100(groups, cats, val, { colorOf, fmt = n0 } = {}) {
  const C = SER(); if (!groups.length) return '<div class="empty">No data in this period</div>';
  const col = (c, i) => colorOf ? colorOf(c) : C[i % C.length];
  return `<div class="legend top">${cats.map((c, i) => `<span><i style="background:${col(c, i)}"></i>${esc(c)}</span>`).join('')}</div><div class="stack100">${groups.map(g => { const tot = sum(cats, c => val(g, c) || 0);
    return `<div class="row"><span>${esc(g)}</span><div class="tr">${cats.map((c, i) => { const v = val(g, c) || 0; if (!v) return ''; const w = v / tot * 100; return `<i style="width:${w}%;background:${col(c, i)}" data-tip="${esc(tipRows(g + ' · ' + c, [['Value', fmt(v)], ['Share', pct(v / tot, 1)]]))}">${w >= 12 ? pct(v / tot) : ''}</i>`; }).join('')}</div><b>${fmt(tot)}</b></div>`; }).join('')}</div>`;
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
const kpi = (label, val, meta = '', info = '', sp = null) => `<div class="kpi card glass"><div class="lbl"><span>${label}</span>${info ? `<span class="info" data-tip="${esc(`<b>${esc(label.replace(/<[^>]+>/g, ''))}</b><span style="color:var(--ink2)">${esc(info)}</span>`)}">i</span>` : ''}</div><div class="val">${val}</div>${sp ? spark(sp.vals, sp.color, sp.dash) : ''}<div class="meta">${meta}</div></div>`;
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
  // executive summary: the 5 things a BOD member should know about this period
  const ex = [], chW = S.platform === 'all' ? chanPeriod('wf', f, t).a : null, chA = S.platform === 'all' ? chanPeriod('amz', f, t).a : null;
  ex.push(`Revenue <b>${usd(a.rev)}</b> (${delta(a.rev, b.rev)}), profit <b>${usd(a.profit)}</b> at ${pct(a.margin, 1)} margin; % Mkt fee ${pct(a.mktPct, 1)}${gMkt != null ? ` vs plan ${pct(gMkt, 1)}` : ''}.`);
  if (goal) ex.push(`${MON[+ym.slice(5) - 1]} is <b>${mtd.rev >= pace ? 'ahead of' : 'behind'}</b> the revenue plan by ${usd(Math.abs(mtd.rev - pace))}; full-month projection ${usd(proj)} vs target ${usd(goal)} (${pct(goal ? proj / goal : null)}).`);
  if (chW && chA && chA.units) ex.push(`Wayfair earns <b>${usd(chW.profit)}</b> (${pct(chW.margin, 1)}); Amazon <b style="color:${chA.profit < 0 ? 'var(--crit-ink)' : 'inherit'}">${usd(chA.profit)}</b> (${pct(chA.margin, 1)}) on ${n0(chA.units)} units.`);
  { const bp = [...groupBy(cur.ps, x => x.part)].map(([k, xs]) => { const g = agg(xs); return [k, g.gp - (cur.ad.byPart[k] || 0), g.units]; }).sort((x, y) => y[1] - x[1]);
    if (bp.length) { const w = bp[bp.length - 1]; ex.push(`Best SKU <b>${esc(bp[0][0])}</b> (${usd(bp[0][1])} after ads)${w[1] < 0 ? `; weakest <b>${esc(w[0])}</b> loses ${usd(-w[1])}` : ''}.`); } }
  { const fi = M.pos.map(po => [po, freeInfo(po)]).filter(([, x]) => x && x.left > 0).sort((x, y) => x[1].left - y[1].left)[0]; if (fi) ex.push(`${esc(fi[0].id)}: <b>${fi[1].left} free-storage days</b> left, ${n0(fi[1].remain)} units still in stock.`); }
  return `${pageHead('Overview')}
  <section class="card glass insights"><div class="card-head"><div><h3>Executive summary</h3><p class="sub">${dLong(f)} – ${dLong(t)}</p></div></div><ul>${ex.map(x => `<li>${x}</li>`).join('')}</ul></section>
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
    ${kpi('Revenue', usd(a.rev), `${delta(a.rev, b.rev)} ${vsPrev()}${tgt ? ` · ${pct(a.rev / tgt)} of target` : ''}`, 'Wayfair: base cost we submit × units (before promotion) — same basis as the KPI "Rev" line. Amazon: our selling price × units (+ shipping charged), before promotions.')}
    ${kpi('NMV', usd(a.net), `${delta(a.net, b.net)} ${vsPrev()}`, 'Wayfair: the wholesale price Wayfair actually pays after promotion funding. Amazon: net sales after seller-funded coupons and promotions (sales tax excluded).')}
    ${kpi('Units Sold', n0(a.units), `${delta(a.units, b.units)} ${vsPrev()} · ${n0(a.orders)} orders`)}
    ${kpi('Profit', usd(a.profit), `${delta(a.profit, b.profit)} ${vsPrev()}`, 'NMV − platform fees (Wayfair: DDA 4% + CastleGate fulfillment · Amazon: referral fee, plan, coupon fees, Multichannel Pick & Ship) − COGS (FIFO by PO) − Tried & True cost − returns, refunds & incidents − ad spend.')}
    ${kpi('Profit Margin', pct(a.margin, 1), `${delta(a.margin, b.margin, { pp: true })} ${vsPrev()}`, 'Profit ÷ Revenue')}
    ${kpi('Mkt Fee', usd(a.mkt), `${delta(a.mkt, b.mkt, { invert: true })} ${vsPrev()}`, 'Promotion + Ad spend')}
    ${kpi('% Mkt Fee / Revenue', pct(a.mktPct, 1), `${delta(a.mktPct, b.mktPct, { pp: true, invert: true })} ${vsPrev()}`, 'Mkt Fee ÷ Revenue')}
    ${kpi('TACoS', pct(a.tacos, 1), `${delta(a.tacos, b.tacos, { pp: true, invert: true })} ${vsPrev()}`, 'Ad spend ÷ Revenue')}
  </div>
  ${card('Units, NMV and marketing cost', `Bars = units sold · line = NMV · dashed = % Mkt fee (promotion + ads) of revenue · by ${gran}`, combo(bk), { actions: granBtns(), cls: 'big-chart' })}
  ${S.platform === 'all' ? channelPnl(f, t) : ''}
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
// Channel P&L side by side — the BOD view of where money is made
function channelPnl(f, t) {
  const W = chanPeriod('wf', f, t).a, Z = chanPeriod('amz', f, t).a, T = period(f, t).a, C = SER();
  const r = (label, k, fmt = usd, opt = {}) => ({ label, w: typeof k === 'function' ? k(W) : W[k], z: typeof k === 'function' ? k(Z) : Z[k], t: typeof k === 'function' ? k(T) : T[k], fmt, ...opt });
  const rows = [r('Units sold', 'units', n0), r('Orders', 'orders', n0), r('Revenue', 'rev', usd, { b: 1 }), r('GMV (consumer spend)', 'gmv'), r('Promotion', 'promo', usd, { neg: 1 }), r('NMV', 'net', usd, { b: 1 }),
    r('Platform fees', 'platform', usd, { neg: 1 }), r('COGS (landed, FIFO)', 'cogs', usd, { neg: 1 }), r('Tried & True cost', 'ttCost', usd, { neg: 1 }), r('Returns, refunds & incidents', x => x.returns + x.incidents, usd, { neg: 1 }),
    r('Contribution before ads', x => x.profit + x.ads, usd, { b: 1 }), r('Ad spend', 'ads', usd, { neg: 1 }), r('Profit', 'profit', usd, { b: 1, sign: 1 }), r('Profit margin', 'margin', v => pct(v, 1), { sign: 1 }),
    r('Contribution margin before ads', x => x.rev ? (x.profit + x.ads) / x.rev : null, v => pct(v, 1)), r('% Mkt fee / revenue', 'mktPct', v => pct(v, 1)), r('TACoS', 'tacos', v => pct(v, 1)), r('Avg. order value', 'aov'), r('Revenue share', x => T.rev ? x.rev / T.rev : null, v => pct(v, 1))];
  const cell = (row, v) => `<td class="num${row.sign && v < 0 ? ' neg' : ''}">${row.b ? '<b>' : ''}${v == null || (typeof v === 'number' && !isFinite(v)) ? '—' : (row.neg && v ? '−' : '') + row.fmt(Math.abs(v) && row.neg ? Math.abs(v) : v)}${row.b ? '</b>' : ''}</td>`;
  return card('Channel P&L', 'Wayfair (CastleGate) vs Amazon (FBM via CastleGate Multichannel) for the selected period · same cost rules as the Profit tab', `<div class="tbl-wrap"><table class="tbl pnl-tbl"><thead><tr><th>Metric</th><th class="num"><i class="sw" style="background:${C[0]}"></i>Wayfair</th><th class="num"><i class="sw" style="background:${C[2]}"></i>Amazon</th><th class="num">Total</th></tr></thead><tbody>${rows.map(row => `<tr${row.b ? ' class="strong"' : ''}><td>${esc(row.label)}</td>${cell(row, row.w)}${cell(row, row.z)}${cell(row, row.t)}</tr>`).join('')}</tbody></table></div>`);
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
    ${kpi('Revenue', usd(a.rev), `${delta(a.rev, b.rev)} ${vsPrev()}`, 'Wayfair: base cost × units. Amazon: selling price × units (+ shipping charged).')}
    ${kpi('NMV', usd(a.net), `${delta(a.net, b.net)} ${vsPrev()}`, 'Wayfair: wholesale price paid. Amazon: net sales after promotions.')}
    ${kpi('Promotion', usd(a.promo), `${pct(a.rev ? a.promo / a.rev : null, 1)} of revenue · ${delta(a.promo, b.promo, { invert: true })}`, 'Revenue − NMV. Wayfair: promotion funding. Amazon: coupons, Buy X Get Y and other seller-funded rebates.')}
    ${kpi('GMV', usd(a.gmv), `${delta(a.gmv, b.gmv)} ${vsPrev()}`, 'Consumer spend. Wayfair: Revenue × 2 (Wayfair lists at about twice our base cost). Amazon: we are the retailer, so GMV = Revenue (listing price × units).')}
    ${kpi('Avg. Order Value', usd(a.aov), `${delta(a.aov, b.aov)} ${vsPrev()}`, 'Revenue ÷ orders')}
    ${kpi('Returns', n0(cur.a.returnUnits) + '<small>units</small>', `${usd(cur.a.returns)} deducted · ${n0(sum(bad, x => x.qty))} cancelled/rejected`)}
  </div>
  ${card('Units, NMV and marketing cost', `Bars = units sold · line = NMV · dashed = % Mkt fee of revenue · by ${autoGran(f, t)}`, combo(buckets(cur.ps, cur.ad, f, t, autoGran(f, t))), { actions: granBtns(), cls: 'big-chart' })}
  ${S.platform !== 'wf' ? amzTrafficCard(f, t) : ''}
  <div class="grid g-2">
    ${card('By collection', 'Share of revenue', donut(grp('col').map(r => ({ label: r.k, v: r.rev, color: colColor(r.k), extra: [['Units', n0(r.units)], ['Net revenue', usd(r.net)]] })), { fmt: usd, center: usdK(a.rev), sub: 'revenue' }))}
    ${card('By product type', 'Single · Double · Floating · Rolling Cart', donut(grp('type').sort((x, y) => y.rev - x.rev).map(r => ({ label: r.k, v: r.rev, extra: [['Units', n0(r.units)]] })), { fmt: usd, center: n0(a.units), sub: 'units' }))}
    ${card('By size', 'Units sold per vanity width', vbars(bySize.map(r => ({ label: sizeLbl(r.k), v: r.units, tip: tipRows(sizeLbl(r.k), [['Units', n0(r.units)], ['Revenue', usd(r.rev)], ['Type', r.k ? (r.k >= 60 ? 'Double' : r.k <= 30 ? 'Floating · single' : 'Single') : 'Rolling Cart']]) })), { fmt: n0, colors: [C[0]] }))}
    ${card('By color', '', donut(grp('color', x => x.color || 'No color (cart)').sort((x, y) => y.units - x.units).map(r => ({ label: r.k, v: r.units, extra: [['Revenue', usd(r.rev)]] })), { center: n0(a.units), sub: 'units' }))}
    ${card('By category', 'Bathroom Vanity · Rolling Cart', donut(grp('cat').map(r => ({ label: r.k, v: r.rev, extra: [['Units', n0(r.units)]] })), { fmt: usd, center: usdK(a.rev), sub: 'revenue' }))}
    ${card('Tried &amp; True (review samples) ' + chOnly('wf'), 'Not counted as sales · Wayfair pays only the 4% DDA back · cost charged to profit', ttL.length ? `<div class="grid g-kpi" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
        <div><div class="sub">Orders</div><b style="font-size:22px">${new Set(ttL.map(l => l.po)).size}</b></div><div><div class="sub">Units</div><b style="font-size:22px">${n0(sum(ttL, l => l.qty))}</b></div><div><div class="sub">Net cost</div><b style="font-size:22px">${usd(sum(ttPs, x => x.cogs + x.cg - x.net))}</b></div></div>
        ${table('tt', [{ k: 'date', l: 'Date', f: v => dLong(v) }, { k: 'po', l: 'PO' }, { k: 'part', l: 'SKU' }, { k: 'qty', l: 'Units', num: true }, { k: 'state', l: 'State' }], ttL, { def: { k: 'date', d: 'desc' } })}` : '<div class="empty">No Tried &amp; True orders in this period</div>')}
  </div>
  ${card('SKU performance', 'Click a column to sort', table('skus', [
    { k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'col', l: 'Collection' }, { k: 'size', l: 'Size', f: v => sizeLbl(v), sv: r => r.size || 0 }, { k: 'color', l: 'Color' }, { k: 'type', l: 'Type' },
    { k: 'units', l: 'Units', num: true, f: v => n0(v) }, { k: 'orders', l: 'Orders', num: true, f: v => n0(v) }, { k: 'rev', l: 'Revenue', num: true, f: v => usd(v) }, { k: 'net', l: 'Net Revenue', num: true, f: v => usd(v) }, { k: 'promoPct', l: 'Promo %', num: true, f: v => pct(v, 1) },
    { k: 'share', l: 'Share', num: true, f: v => `${pct(v, 1)}<span class="mini-bar" style="width:${Math.round(v * 60)}px"></span>` }], skuRows, { def: { k: 'rev', d: 'desc' }, foot: { part: 'Total', units: a.units, orders: a.orders, rev: a.rev, net: a.net, promoPct: a.rev ? a.promo / a.rev : 0, share: 1 } }))}
  ${card('Orders', `${n0(new Set(ordRows.map(x => x.po)).size)} orders in this period`, table('orders', [
    { k: 'date', l: 'Date', f: (v, r) => dLong(v) + (r.ts ? ` <span class="sub">${vnTime(r.ts)} GMT+7</span>` : '') }, { k: 'po', l: 'PO', f: (v, r) => `<b>${esc(v)}</b> ${r.tt ? '<span class="tag tt">Tried &amp; True</span>' : ''}${r.country === 'CA' ? ' <span class="tag ca">Canada</span>' : ''}${r.b2b ? ' <span class="tag">B2B</span>' : ''}` },
    { k: 'ch', l: 'Platform', f: v => v === 'wf' ? 'Wayfair' : 'Amazon' }, { k: 'part', l: 'SKU' }, { k: 'qty', l: 'Units', num: true }, { k: 'base', l: 'Base cost', num: true, f: v => usd(v, 2) }, { k: 'price', l: 'Paid', num: true, f: v => usd(v, 2) },
    { k: 'promo', l: 'Promo', num: true, f: (v, r) => r.ok ? pct(r.base ? 1 - r.price / r.base : 0) : '—' }, { k: 'state', l: 'State' }, { k: 'layer', l: 'PO layer' }, { k: 'status', l: 'Status', f: (v, r) => r.ok ? esc(v) : `<span class="tag bad">${esc(v)}</span>` }], ordRows, { def: { k: 'date', d: 'desc' } }))}`;
}

function viewProfit() {
  const [f, t] = range(), [pf, pt] = prevRange(), C = SER(), A = M.A;
  const cur = period(f, t), prev = period(pf, pt), a = cur.a, b = prev.a;
  const steps = [{ label: 'Revenue', v: a.rev, kind: 'total' }, { label: 'Promotion', v: a.promo }, { label: 'DDA 4%', v: a.dda }, { label: 'Fulfillment', v: a.cg }, { label: 'Amazon fees', v: a.amzFee + a.amzAccount }, { label: 'Multichannel', v: a.mcf }, { label: 'COGS (landed)', v: a.cogs }, { label: 'Tried & True', v: a.ttCost }, { label: 'Returns', v: a.returns }, { label: 'Incidents', v: a.incidents }, { label: 'Ad spend', v: a.ads }, { label: 'Profit', v: a.profit, kind: 'total' }]
    .filter(s => s.kind || Math.abs(s.v) > 0.005).map(s => ({ ...s, share: a.rev ? s.v / a.rev : null }));
  const dedBy = groupBy(cur.dd.list, d => d.part);
  const parts = new Set([...cur.all.map(x => x.part), ...cur.dd.list.map(d => d.part)]);
  const byPart = [...parts].map(part => { const ps = cur.all.filter(x => x.part === part), g = agg(ps), adsP = cur.ad.byPart[part] || 0, p = M.P[part] || {}, dl = dedBy.get(part) || [];
    const ret = sum(dl.filter(d => d.type === 'Return'), d => d.amount), inc = sum(dl.filter(d => d.type !== 'Return'), d => d.amount), profit = g.gp - ret - inc - adsP;
    return { part, col: p.col, layers: [...new Set(ps.map(x => x.layer))].join(', '), units: g.units, rev: g.rev, promo: g.promo, net: g.net, dda: g.dda, cg: g.cg, amz: g.amzFee + g.mcf, cgEst: ps.some(x => x.cgEst), cogs: g.cogs, unitCogs: g.units ? g.cogs / g.units : 0, tt: g.ttCost, ret, inc, ads: adsP, mkt: g.promo + adsP, profit, margin: g.rev ? profit / g.rev : null, perUnit: g.units ? profit / g.units : 0 }; });
  const soldParts = new Set(byPart.map(r => r.part)); const idle = sum(Object.entries(cur.ad.byPart).filter(([p]) => !soldParts.has(p) && passProd(p)), ([, v]) => v) + (prodFilterOn() || S.f.po.size ? 0 : cur.ad.unalloc);
  if (idle > 0.5) byPart.push({ part: 'Ads on SKUs with no sales', col: '', layers: '', units: 0, rev: 0, promo: 0, net: 0, dda: 0, cg: 0, cogs: 0, tt: 0, ret: 0, inc: 0, ads: idle, mkt: idle, profit: -idle, margin: null, perUnit: 0, idle: true });
  const byCol = [...groupBy(byPart.filter(r => r.col), r => r.col)].map(([k, rs]) => ({ k, rev: sum(rs, r => r.rev), profit: sum(rs, r => r.profit) }));
  const byType = [...groupBy(byPart.filter(r => r.col), r => (M.P[r.part] || {}).type)].map(([k, rs]) => ({ k, rev: sum(rs, r => r.rev), profit: sum(rs, r => r.profit) }));
  const fifo = []; for (const [part, L] of Object.entries(M.layers)) for (const l of L) if ((!S.f.po.size || S.f.po.has(l.po)) && passProd(part)) fifo.push({ part, po: l.po, recv: l.recv, qty: l.qty, sold: l.qty - l.left, left: l.left, fob: l.fob, sheet: l.sheet, unload: l.unload, cogs: l.cogs, value: l.left * l.cogs, st: l.qty ? (l.qty - l.left) / l.qty : 0 });
  const money = v => usd(v), m2 = v => usd(v, 2), CGa = M.CG.actual || {};
  return `${pageHead('Profit')}
  <div class="grid g-kpi">
    ${kpi('Revenue', usd(a.rev), `${delta(a.rev, b.rev)} ${vsPrev()}`)}
    ${kpi('NMV', usd(a.net), `after ${usd(a.promo)} promotion`, 'Wayfair: wholesale price paid. Amazon: net sales after seller-funded promotions (excl. sales tax, which Amazon collects and remits).')}
    ${kpi('Platform fees', usd(a.platform), [S.platform !== 'amz' ? `DDA 4% ${usd(a.dda)} · fulfillment ${usd(a.cg)}` : '', S.platform !== 'wf' ? `Amazon ${usd(a.amzFee + a.amzAccount)}${a.amzFeeEst > 0.5 ? '*' : ''}` : ''].filter(Boolean).join(' · '), 'Wayfair (verified in Partner Home): DDA 4% of wholesale + CastleGate fulfillment per unit. Amazon (SP-API Finances, exact): referral fee 15% + tax on the fee − Amazon referral-fee discount, plus account fees in the period (Professional plan $39.99 + tax/month, coupon & promotion fees). * includes an estimate for orders Amazon has not charged yet.')}
    ${kpi('COGS (landed, FIFO)', usd(a.cogs), `${pct(a.rev ? a.cogs / a.rev : null, 1)} of revenue · FOB ${usd(a.fob)}`, 'PO cost sheet landed cost + CastleGate container unload per unit, consumed first-in-first-out by PO.')}
    ${kpi('Mkt Fee', usd(a.mkt), `${pct(a.mktPct, 1)} of revenue · promo ${usd(a.promo)} + ads ${usd(a.ads)}`, 'Promotion + Ad spend')}
    ${kpi('Returns & incidents', usd(a.returns + a.incidents), `${n0(a.returnUnits)} return${a.returnUnits === 1 ? '' : 's'} · incidents ${usd(a.incidents)}`, 'Actual Wayfair deductions. Returns are Wayfair-Managed: deduction = wholesale × (1 − 4% DDA) × 75% WMR rate.')}
    ${kpi('Profit', usd(a.profit), `${delta(a.profit, b.profit)} ${vsPrev()}`)}
    ${kpi('Profit Margin', pct(a.margin, 1), `${delta(a.margin, b.margin, { pp: true })} ${vsPrev()}`, 'Profit ÷ Revenue')}
  </div>
  ${S.platform !== 'wf' ? `<div class="grid g-kpi k3">
    ${kpi('Amazon payouts on hold', usd(M.amzCash.deferred, 2), 'Deferred until ~2 weeks after delivery', 'Sum of Amazon transactions with status Deferred (order proceeds after fees).')}
    ${kpi('Amazon released (all time)', usd(M.amzCash.released, 2), 'Net of fees, ads and plan charges', 'Released transactions excluding balance top-ups charged to the card.')}
    ${kpi('Contribution before ads', usd(a.profit + a.ads), `${pct(a.rev ? (a.profit + a.ads) / a.rev : null, 1)} of revenue · break-even TACoS`, 'NMV − platform fees − COGS − T&T − returns. The ad budget this period could carry before profit turns negative.')}
  </div>` : `<div class="grid g-kpi k3">${kpi('Contribution before ads', usd(a.profit + a.ads), `${pct(a.rev ? (a.profit + a.ads) / a.rev : null, 1)} of revenue · break-even TACoS`, 'NMV − platform fees − COGS − T&T − returns.')}</div>`}
  ${card('Revenue to profit', 'Where each dollar of revenue goes in this period — hover for % of revenue', waterfall(steps, { h: 380 }), { cls: 'big-chart' })}
  ${card('Profit by SKU', 'COGS from the PO layer each unit came from · fulfillment from the CastleGate invoice (* = rate of the same carton class, not invoiced yet) · ads from the Wayfair SKU report', table('psku', [
    { k: 'part', l: 'SKU', f: (v, r) => r.idle ? `<i class="sub">${esc(v)}</i>` : skuCell(v) }, { k: 'units', l: 'Units', num: true, f: v => n0(v) }, { k: 'rev', l: 'Revenue', num: true, f: money },
    { k: 'profit', l: 'Profit', num: true, neg: true, f: v => `<b>${usd(v)}</b>` }, { k: 'margin', l: 'Margin', num: true, neg: true, f: v => pct(v, 1) }, { k: 'perUnit', l: 'Profit / unit', num: true, neg: true, f: m2 },
    { k: 'promo', l: 'Promotion', num: true, f: money }, { k: 'net', l: 'NMV', num: true, f: money }, { k: 'dda', l: 'DDA 4%', num: true, f: money }, { k: 'cg', l: 'Fulfillment', num: true, f: (v, r) => usd(v, 2) + (r.cgEst ? '*' : '') }, { k: 'amz', l: 'Amazon fees', num: true, f: m2 },
    { k: 'cogs', l: 'COGS', num: true, f: money }, { k: 'unitCogs', l: 'COGS / unit', num: true, f: m2 }, { k: 'tt', l: 'T&T cost', num: true, f: money }, { k: 'ret', l: 'Returns', num: true, f: money }, { k: 'inc', l: 'Incidents', num: true, f: money }, { k: 'ads', l: 'Ads', num: true, f: money }, { k: 'mkt', l: 'Mkt fee', num: true, f: money }, { k: 'layers', l: 'PO layer' }], byPart,
    { def: { k: 'profit', d: 'desc' }, foot: { part: 'Total', layers: '', units: a.units, rev: a.rev, promo: a.promo, net: a.net, dda: a.dda, cg: a.cg, amz: a.amzFee + a.mcf, cogs: a.cogs, unitCogs: a.units ? a.cogs / a.units : 0, tt: a.ttCost, ret: a.returns, inc: a.incidents, ads: a.ads, mkt: a.mkt, profit: a.profit, margin: a.margin, perUnit: a.units ? a.profit / a.units : 0 } }))}
  <div class="grid g-2">
    ${card('Profit margin by collection', 'Profit ÷ revenue · red = loss', hbars(byCol.filter(r => r.rev).sort((x, y) => y.profit / y.rev - x.profit / x.rev).map(r => ({ label: r.k, v: r.profit / r.rev, sub: usd(r.profit), color: colColor(r.k), extra: [['Revenue', usd(r.rev)], ['Profit', usd(r.profit)]] })), { fmt: v => pct(v, 1) }))}
    ${card('Profit by product type', '', hbars(byType.sort((x, y) => y.profit - x.profit).map(r => ({ label: r.k, v: r.profit, sub: pct(r.rev ? r.profit / r.rev : null), extra: [['Revenue', usd(r.rev)], ['Margin', pct(r.rev ? r.profit / r.rev : null, 1)]] })), { fmt: usd, color: C[2] }))}
  </div>
  ${unitEconomics(f, t)}
  ${S.platform !== 'wf' ? amzMoneyCard(f, t) : ''}
  ${costAudit()}
  ${cur.dd.list.length ? card('Deductions & refunds', 'Returns and incidents charged back in this period', table('ded', [{ k: 'date', l: 'Date', f: v => dLong(v) }, { k: 'po', l: 'PO' }, { k: 'part', l: 'SKU' }, { k: 'type', l: 'Type', f: v => `<span class="tag ${v === 'Return' ? '' : 'bad'}">${esc(v)}</span>` }, { k: 'reason', l: 'Reason' }, { k: 'amount', l: 'Amount', num: true, f: v => usd(v, 2) }, { k: 'note', l: 'Note' }], cur.dd.list, { def: { k: 'date', d: 'desc' } })) : ''}
  ${card('FIFO cost layers', 'Each PO shipment is a cost layer; units sell from the oldest layer first. All-time.', table('fifo', [
    { k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'po', l: 'PO' }, { k: 'recv', l: 'Received', f: v => dLong(v) }, { k: 'qty', l: 'Qty in', num: true }, { k: 'sold', l: 'Sold', num: true }, { k: 'left', l: 'Remaining', num: true }, { k: 'st', l: 'Sell-through', num: true, f: v => `${pct(v)}<span class="mini-bar" style="width:${Math.round(v * 50)}px"></span>` },
    { k: 'fob', l: 'FOB', num: true, f: m2 }, { k: 'sheet', l: 'Landed (sheet)', num: true, f: m2 }, { k: 'unload', l: 'Unload', num: true, f: m2 }, { k: 'cogs', l: 'COGS / unit', num: true, f: m2 }, { k: 'value', l: 'Stock value', num: true, f: money }], fifo, { def: { k: 'value', d: 'desc' } }))}
  ${card('How each cost is calculated', 'Wayfair rates checked in Partner Home (Nov 13) · Amazon fees read from Seller Central transactions (Nov 23)', `<div class="assump">
      <div><span>Revenue</span><b>Base cost × units</b></div><div><span>NMV (net revenue)</span><b>Wholesale price paid</b></div><div><span>Promotion</span><b>Revenue − NMV</b></div><div><span>GMV</span><b>Revenue × 2</b></div>
      <div><span>DDA (Damage &amp; Defect Allowance)</span><b>${pct(A.dda, 1)} of wholesale paid</b></div><div><span>CastleGate fulfillment</span><b>Per unit by carton class</b></div><div><span>CastleGate storage</span><b>$0 for first 90 days</b></div><div><span>Container unload</span><b>Per unit, in COGS</b></div>
      <div><span>Returns (Wayfair-Managed)</span><b>Paid × (1 − DDA) × ${pct(A.wmr)}</b></div><div><span>Incidents</span><b>Actual deductions</b></div><div><span>Tried &amp; True</span><b>COGS + fulfillment − DDA back</b></div><div><span>Mkt fee</span><b>Promotion + ads</b></div></div>
      <h4 class="assump-h">Amazon (Seller Central · FBM shipped by CastleGate Multichannel) — from the SP-API Finances transactions</h4>
      <div class="assump">
      <div><span>Revenue = GMV</span><b>Item price × units (+ shipping charged)</b></div><div><span>Promotion</span><b>Seller-funded rebates (coupon, Buy X Get Y)</b></div><div><span>NMV (net sales)</span><b>Revenue − Promotion</b></div><div><span>Sales tax</span><b>Excluded (Amazon remits it)</b></div>
      <div><span>Referral fee</span><b>15% of net sales + ~3.4% tax on the fee</b></div><div><span>Referral-fee discount</span><b>Amazon credits back ⅔ of the fee</b></div><div><span>Effective Amazon fee</span><b>${pct(A.amzFeeRate, 1)} of net sales</b></div><div><span>Professional plan</span><b>$39.99 + tax / month</b></div>
      <div><span>Coupon fee</span><b>$5 per coupon + 2.5% of coupon sales</b></div><div><span>Ads (until Ads API)</span><b>Amazon's billed ad charges</b></div><div><span>Refunds</span><b>Actual Amazon refund transactions</b></div><div><span>Multichannel (CastleGate Pick &amp; Ship)</span><b>${A.amzMcf != null ? usd(A.amzMcf, 2) + ' / unit' + (A.amzMcfEst ? ' (rate-card estimate)' : '') : 'Pending first Wayfair invoice'}</b></div></div>
      <p class="note"><b>Amazon, checked in Seller Central on Nov 23, 2026:</b> every Amazon order is shipped from CastleGate Cranbury via Wayfair Multichannel ("Pick &amp; Ship"), so its units come out of the same FIFO cost layers as Wayfair orders. Wayfair bills the Multichannel Pick &amp; Ship (pick + FedEx label on Wayfair's account) on the CastleGate invoice after the month closes. Until that invoice arrives the dashboard uses the CastleGate Rate Card: Standard-Small base $17.05 + $0.20 per lb above the first lb (5C8N ≈ 20 lb carton) = <b>${usd(A.amzMcf || 0, 2)} per unit</b>, before Nov–Dec peak and fuel surcharges. Amazon orders do <b>not</b> pay the Wayfair CastleGate fulfillment fee or DDA, and they never appear in the Wayfair order feed — so nothing is counted twice. Amazon holds order payments ~2 weeks after delivery (deferred) before releasing them.</p>
      <p class="note"><b>Fulfillment per unit (Oct invoice 1695394):</b> ${Object.entries(CGa).map(([k, v]) => `${k} $${v.toFixed(2)}`).join(' · ')}. Storage after day 90 is charged daily from the CastleGate storage rate card — it starts on ${dLong(addDays(M.pos[0] && M.pos[0].recv || M.today, 90))} for the 1st Shipment. No co-op or other platform percentage appears on the CastleGate invoice or in Returns Management.</p>`)}`;
}

// Unit economics per SKU and channel: what one unit really earns, and how much ad spend it can carry
function unitEconomics(f, t) {
  const rows = [];
  for (const ch of (S.platform === 'all' ? ['wf', 'amz'] : [S.platform])) {
    const cp = chanPeriod(ch, f, t);
    for (const [part, ps] of groupBy(cp.all.filter(x => !x.tt), x => x.part)) {
      const g = agg(ps), u = g.units; if (!u) continue; const ads = cp.ad.byPart[part] || 0, contrib = g.gp;
      rows.push({ ch, part, units: u, price: g.rev / u, net: g.net / u, fees: g.platform / u, cogs: g.cogs / u, contrib: contrib / u, cm: g.rev ? contrib / g.rev : null, ads: ads / u, profit: (contrib - ads) / u, beAcos: g.rev ? Math.max(0, contrib) / g.rev : null, tacos: g.rev ? ads / g.rev : null, est: ps.some(x => x.amzFeeEst || x.mcfEst || x.cgEst) });
    }
  }
  if (!rows.length) return '';
  const m2 = v => usd(v, 2), chTag = v => `<span class="tag ${v === 'amz' ? 'tt' : ''}">${v === 'amz' ? 'Amazon' : 'Wayfair'}</span>`;
  return card('Unit economics', 'Per unit sold in the period. Contribution = NMV − platform fees − COGS (before ads). Break-even TACoS = the most ad spend per $ of revenue the SKU can carry before it loses money.', table('unitec', [
    { k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'ch', l: 'Channel', f: chTag }, { k: 'units', l: 'Units', num: true }, { k: 'price', l: 'Revenue / unit', num: true, f: m2 }, { k: 'net', l: 'NMV / unit', num: true, f: m2 },
    { k: 'fees', l: 'Platform fees / unit', num: true, f: (v, r) => m2(v) + (r.est ? '*' : '') }, { k: 'cogs', l: 'COGS / unit', num: true, f: m2 }, { k: 'contrib', l: 'Contribution / unit', num: true, neg: true, f: v => `<b>${m2(v)}</b>` },
    { k: 'cm', l: 'Contribution %', num: true, neg: true, f: v => pct(v, 1) }, { k: 'ads', l: 'Ads / unit', num: true, f: m2 }, { k: 'profit', l: 'Profit / unit', num: true, neg: true, f: m2 },
    { k: 'beAcos', l: 'Break-even TACoS', num: true, f: v => pct(v, 1) }, { k: 'tacos', l: 'Actual TACoS', num: true, f: (v, r) => `<span style="color:${v != null && r.beAcos != null && v > r.beAcos ? 'var(--crit-ink)' : 'inherit'}">${pct(v, 1)}</span>` }], rows, { def: { k: 'units', d: 'desc' } })
    + '<p class="note">* includes an estimated fee (CastleGate rate of the same carton class, Amazon fee on orders not yet posted, or the Multichannel rate-card estimate). Red TACoS = ads cost more than the SKU earns.</p>');
}
// Every cost that can hit a Lignarc order, where it comes from, and how the dashboard avoids counting it twice
function costAudit() {
  const A = M.A, ex = '<span class="tag s st-exact">Exact</span>', rate = '<span class="tag s st-rate">Verified rate</span>', est = '<span class="tag s st-est">Estimate</span>', na = '<span class="tag s st-na">Not applicable</span>', pend = '<span class="tag s st-est">Not yet billed</span>';
  const R = (n, st, p) => `<div class="row"><b>${n}</b>${st}<p>${p}</p></div>`;
  return card('Cost coverage audit', 'Every cost that can hit a Wayfair or Amazon order — source, status, and the double-count guard', `<div class="audit">
    <h4 class="assump-h" style="margin-top:0">Wayfair (CastleGate)</h4>
    ${R('Promotion funding', ex, 'Base cost − wholesale actually paid, per order from the Wayfair order API.')}
    ${R('DDA 4%', rate, 'Damage &amp; Defect Allowance on wholesale paid (Returns Management, Nov 13). Tried &amp; True orders get it back as reimbursement.')}
    ${R('CastleGate fulfillment', rate, 'Per unit by carton class from invoice 1695394; unsold carton classes use the same-class rate (marked *). Wayfair orders only.')}
    ${R('Container unload', ex, 'Per unit from the CastleGate invoice, added to landed COGS (not counted again as a fee).')}
    ${R('Ocean freight / duty', ex, 'Inside the PO landed cost sheet (landed ≈ 2.1× FOB). CastleGate Transportation invoice 1551275 ($8,305) is the same freight, so it is <b>not</b> added again.')}
    ${R('Storage', M.pos.some(p => p.recv && diffDays(p.recv, M.today) > 90) ? est : na, `Free for 90 days. From day 91: $${(A.cgStorage || {})['91-120'] ?? 0.44} → $${(A.cgStorage || {})['121-180'] ?? 0.70} → $${(A.cgStorage || {})['181-270'] ?? 1.05} per cubic foot per month (Rate Card), first charges from ${dLong(addDays((M.pos[0] && M.pos[0].recv) || M.today, 90))}. Shown as a countdown on Inventory; added once invoiced.`)}
    ${R('Returns (WMR) &amp; incidents', ex, 'Actual Wayfair deductions (refund × 96% × 75% for returns; full refund for damage without replacement parts).')}
    ${R('Ads', ex, 'Wayfair Sponsored Products campaign report; per SKU from the SKU report.')}
    ${R('Co-op / marketing allowance', na, 'None on the CastleGate invoice or in Returns Management.')}
    <h4 class="assump-h">Amazon (Seller Central · FBM via Wayfair Multichannel)</h4>
    ${R('Referral fee', ex, `Per order from SP-API Finances: 15% + tax on the fee − Amazon's referral-fee discount (effective ${pct(A.amzFeeRate, 1)}). Orders not posted yet use that rate (marked *).`)}
    ${R('Coupons / Buy X Get Y', ex, 'Rebates per order (Promotion) + coupon/promotion fees when Amazon bills them (account charges).')}
    ${R('Professional plan', ex, '$39.99 + tax per month, on the billing date.')}
    ${R('Ads', (D.amz && D.amz.ads && (D.amz.ads.daily || []).length) ? ex : rate, (D.amz && D.amz.ads && (D.amz.ads.daily || []).length) ? 'Amazon Ads API daily report (billed charges then ignored to avoid double counting).' : 'Billed Sponsored Products charges incl. tax (Ads API pending). Switches to the daily Ads report automatically once connected — billed charges are then ignored.')}
    ${R('Multichannel Pick &amp; Ship', A.amzMcfEst ? est : ex, `Wayfair picks and ships Amazon orders on its FedEx account: ${usd(A.amzMcf || 0, 2)}/unit from the Rate Card until the CastleGate invoice arrives. Replaces both the Wayfair fulfillment fee and the Amazon shipping cost — there is no separate shipping charge.`)}
    ${R('Wayfair fulfillment fee / DDA on Amazon orders', na, 'Not charged: Amazon orders go through Multichannel only and are not in the Wayfair order feed (checked — no overlap).')}
    ${R('Amazon FBA fees, storage, inbound', na, 'FBM — no FBA inventory.')}
    ${R('Refunds, A-to-z, chargebacks, shipping labels', ex, 'Any refund or other charge Amazon posts is picked up automatically from the Finances feed.')}
    ${R('Sales tax', na, 'Collected and remitted by Amazon (marketplace facilitator) — excluded from revenue and costs.')}
    ${R('Payment provider / FX fees', est, 'Fees charged by the bank or payment service that receives Amazon/Wayfair payouts are not visible to the dashboard. Tell me the rate (e.g. 1% on Amazon payouts) to include it.')}
    <h4 class="assump-h">Shared</h4>
    ${R('COGS', ex, 'FIFO by PO across both channels — Amazon units come out of the same CastleGate cost layers, so every unit is costed once.')}
  </div>`);
}
// Amazon Sales & Traffic business report: sessions, page views, conversion, Buy Box
function amzTrafficCard(f, t) {
  const T = D.amz && D.amz.traffic; if (!T || !(T.byDate || []).length) return '';
  const C = SER(), rows = T.byDate.filter(r => r[0] >= f && r[0] <= t); if (!rows.length) return '';
  const [pf, pt] = prevRange(), prevRows = T.byDate.filter(r => r[0] >= pf && r[0] <= pt);
  const tot = rs => { const s = sum(rs, r => r[1]), pv = sum(rs, r => r[2]), u = sum(rs, r => r[3]), sales = sum(rs, r => r[4]), oi = sum(rs, r => r[5]); const bb = rs.filter(r => r[6] != null && r[1]); return { s, pv, u, sales, oi, conv: s ? oi / s : null, ucv: s ? u / s : null, bb: bb.length ? sum(bb, r => r[6] * r[1]) / sum(bb, r => r[1]) / 100 : null }; };
  const a = tot(rows), b = prevRows.length ? tot(prevRows) : null;
  const gran = autoGran(f, t), key = d => gran === 'month' ? d.slice(0, 7) : gran === 'week' ? addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7)) : d;
  const lbl = k => gran === 'month' ? mLabel(k) : gran === 'week' ? 'Wk ' + dShort(k) : dShort(k);
  const m = new Map([...new Set(daysOf(f, t).map(key))].map(k => [k, { label: lbl(k), tipLabel: gran === 'week' ? 'Week of ' + dLong(k) : dLong(k), s: 0, pv: 0, u: 0, oi: 0, sales: 0 }]));
  for (const r of rows) { const x = m.get(key(r[0])); if (x) { x.s += r[1]; x.pv += r[2]; x.u += r[3]; x.oi += r[5]; x.sales += r[4]; } }
  const bk = [...m.values()].map(x => ({ ...x, conv: x.s ? x.oi / x.s : null }));
  const chart = combo3(bk, { bar: { k: 's', name: 'Sessions', axis: n0, color: C[1] }, line: { k: 'pv', name: 'Page views', short: 'Views', axis: n0, color: C[3] }, dash: { k: 'conv', name: 'Conversion (orders ÷ sessions)', fmt: v => pct(v, 1), color: C[4], min: 0.02 },
    tip: x => [['Sessions', n0(x.s), C[1]], ['Page views', n0(x.pv), C[3]], ['Orders', n0(x.oi)], ['Units', n0(x.u)], ['Conversion', x.conv == null ? '—' : pct(x.conv, 1), C[4]], ['Ordered sales', usd(x.sales)]] }, { h: 340 });
  const d = (x, y, o) => b ? delta(x, y, o) + ' ' + vsPrev() : '';
  const RK = ((D.amz && D.amz.rank) || []).filter(r => r[1] === 'B0HJQQ3MY4'), last = RK[RK.length - 1];
  const rankStrip = last ? `<div class="grid g-kpi k3">
    ${kpi('Best Seller Rank', last[2] ? '#' + n0(last[2][1]) : '—', last[2] ? esc(last[2][0]) + (last[3] ? ` · #${n0(last[3][1])} in ${esc(last[3][0])}` : '') : '', 'Amazon Catalog API, refreshed every 6 hours. Lower is better.', RK.length > 1 ? { vals: RK.map(r => r[2] ? -r[2][1] : null), color: C[2] } : null)}
    ${kpi('Featured offer price', last[5] != null ? usd(last[5], 2) : '—', last[8] != null ? `lowest offer ${usd(last[8], 2)}` : '', 'Buy Box (featured offer) landed price from the Pricing API.')}
    ${kpi('Sellers on the listing', last[9] != null ? n0(last[9]) : '1', last[9] > 1 ? '<b style="color:var(--crit-ink)">Another seller is on your listing — check for hijackers</b>' : 'Only Lignarc (B2C + Business offer)', 'Distinct sellers with a new offer on B0HJQQ3MY4 (Pricing API). More than one = someone else is selling on your listing.')}
  </div>` : '';
  return `${rankStrip}<div class="grid g-kpi">
    ${kpi('Sessions', n0(a.s), d(a.s, b && b.s), 'Amazon Sales & Traffic report: unique visits to the listing (browser + app).', { vals: bk.map(x => x.s), color: C[1] })}
    ${kpi('Page views', n0(a.pv), d(a.pv, b && b.pv), '', { vals: bk.map(x => x.pv), color: C[3] })}
    ${kpi('Conversion', pct(a.conv, 1), `${b ? delta(a.conv, b.conv, { pp: true }) + ' ' + vsPrev() + ' · ' : ''}unit session ${pct(a.ucv, 1)}`, 'Order items ÷ sessions (Amazon calls units ÷ sessions "Unit Session Percentage").', { vals: bk.map(x => x.conv), color: C[4], dash: true })}
    ${kpi('Featured offer (Buy Box)', pct(a.bb, 1), 'Share of page views where Lignarc won the Buy Box', 'Session-weighted Buy Box percentage.')}
  </div>
  ${card('Amazon traffic & conversion ' + chOnly('amz'), `Bars = sessions · line = page views · dashed = conversion · Amazon Sales & Traffic report (Brand Analytics role), refreshed every sync · by ${gran}`, chart, { cls: 'big-chart' })}`;
}
// Amazon: every order's money flow, straight from the Finances transactions (estimate only until Amazon posts the order)
function amzMoneyCard(f, t) {
  const ls = M.lines.filter(l => l.ch === 'amz' && l.ok && l.date >= f && l.date <= t && passProd(l.part));
  const rows = ls.map(l => { const fo = l.fin, sales = l.price * l.qty + (l.ship || 0), promo = l.promoAmt || 0, net = sales - promo;
    const ref = fo ? fo.feeBase : net * 0.15, tax = fo ? fo.feeTax : null, disc = fo ? fo.feeDisc : null, fee = fo ? ref + tax - disc : net * M.A.amzFeeRate;
    return { po: l.po, date: l.date, part: l.part, qty: l.qty, sales, promo, net, ref, tax, disc, fee, payout: net - fee, status: fo ? (fo.status === 'DEFERRED' ? 'Deferred' : 'Released') : 'Not charged yet', est: !fo }; });
  const svc = M.amzSvc.filter(x => x.date >= f && x.date <= t && x.kind !== 'refund');
  const svcRows = svc.map(x => ({ date: x.date, what: x.kind === 'ads' ? 'Sponsored Products charge' : x.kind === 'subscription' ? 'Professional selling plan' : (x.desc || x.kind), amount: x.amount, detail: x.kind === 'ads' ? `${usd(x.base, 2)} + tax ${usd(x.tax, 2)}` : '' }));
  const m2 = v => v == null ? '—' : usd(v, 2);
  return card('Amazon money flow ' + chOnly('amz'), 'Per order from Seller Central transactions: sales → promotion → referral fee 15% + tax − Amazon discount → payout. Sales tax is collected and remitted by Amazon, so it is excluded.', table('amzflow', [
    { k: 'date', l: 'Date', f: v => dLong(v) }, { k: 'po', l: 'Order' }, { k: 'qty', l: 'Units', num: true }, { k: 'sales', l: 'Sales', num: true, f: m2 }, { k: 'promo', l: 'Promotion', num: true, f: m2 }, { k: 'net', l: 'Net sales', num: true, f: m2 },
    { k: 'ref', l: 'Referral 15%', num: true, f: (v, r) => m2(v) + (r.est ? '*' : '') }, { k: 'tax', l: 'Fee tax', num: true, f: m2 }, { k: 'disc', l: 'Fee discount', num: true, f: m2 }, { k: 'fee', l: 'Amazon fee', num: true, f: (v, r) => `<b>${m2(v)}</b>${r.est ? '*' : ''}` },
    { k: 'payout', l: 'Payout', num: true, f: m2 }, { k: 'status', l: 'Payment', f: v => `<span class="tag ${v === 'Released' ? '' : v === 'Deferred' ? 'tt' : 'bad'}">${esc(v)}</span>` }], rows,
    { def: { k: 'date', d: 'desc' }, foot: { date: '', po: 'Total', qty: sum(rows, r => r.qty), sales: sum(rows, r => r.sales), promo: sum(rows, r => r.promo), net: sum(rows, r => r.net), ref: sum(rows, r => r.ref), tax: null, disc: null, fee: sum(rows, r => r.fee), payout: sum(rows, r => r.payout), status: '' } })
    + (svcRows.length ? `<h4 class="assump-h">Account charges in this period</h4>` + table('amzsvc', [{ k: 'date', l: 'Date', f: v => dLong(v) }, { k: 'what', l: 'Charge' }, { k: 'detail', l: 'Detail' }, { k: 'amount', l: 'Amount', num: true, f: v => usd(v, 2) }], svcRows, { def: { k: 'date', d: 'desc' } }) : '')
    + `<p class="note">* Amazon has not posted this order yet: fee estimated at the ${pct(M.A.amzFeeRate, 1)} effective rate of posted orders. Deferred = Amazon holds the payment until ~2 weeks after delivery.</p>`);
}

function viewCustomers() {
  const [f, t] = range(), [pf, pt] = prevRange(), C = SER();
  const cur = period(f, t), ps = cur.ps, a = cur.a;
  const st = {}; for (const x of ps) { if (!x.state) continue; const k = x.country === 'CA' ? 'CA-' + x.state : x.state; const s = st[k] = st[k] || { code: x.state, country: x.country, units: 0, rev: 0, net: 0, wf: 0, amz: 0, orders: new Set() }; s.units += x.qty; s.rev += x.rev; s.net += x.net; s[x.ch] += x.rev; s.orders.add(x.po); }
  const rows = Object.entries(st).map(([k, s]) => { const info = s.country === 'CA' ? [CA_PROV[s.code] || s.code, 'Canada', '—'] : (STATES[s.code] || [s.code, '', '']); return { k, code: s.code, name: info[0], region: info[1], coast: info[2], country: s.country, units: s.units, rev: s.rev, net: s.net, wf: s.wf, amz: s.amz, orders: s.orders.size, share: a.rev ? s.rev / a.rev : 0 }; });
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
  // ---- customer portrait (BA view): who buys what, where, when ----
  const regionOf = x => x.country === 'CA' ? 'Canada' : ((STATES[x.state] || [])[1] || 'Unknown'), coastOf = x => x.country === 'CA' ? 'Canada' : (((STATES[x.state] || [])[2] || '').replace(' (Gulf)', '') || 'Inland');
  const orders = [...groupBy(ps, x => x.po)].map(([po, xs]) => ({ po, ch: xs[0].ch, state: xs[0].state, country: xs[0].country, region: regionOf(xs[0]), coast: coastOf(xs[0]), rev: sum(xs, x => x.rev), units: sum(xs, x => x.qty), b2b: xs[0].b2b, hour: xs[0].hour, dow: xs[0].dow }));
  const nOrd = orders.length, aov = nOrd ? sum(orders, o => o.rev) / nOrd : 0, upo = nOrd ? sum(orders, o => o.units) / nOrd : 0;
  const regions = [...new Set(ps.map(regionOf))].filter(r => r !== 'Unknown').sort((x, y) => sum(ps.filter(p => regionOf(p) === y), p => p.rev) - sum(ps.filter(p => regionOf(p) === x), p => p.rev));
  const types = [...new Set(ps.map(x => x.type || 'Other'))], cols = [...new Set(ps.map(x => x.col || 'Other'))], colorOf = x => x.color || 'White & Natural (cart)', colors = [...new Set(ps.map(colorOf))];
  const sizes = [...new Set(ps.map(x => sizeLbl(x.size)))].sort((a, b) => (parseFloat(a) || 999) - (parseFloat(b) || 999));
  const R = (fn) => { const m = {}; for (const x of ps) { const k = fn(x); m[k] = (m[k] || 0) + x.qty; } return m; };
  const by2 = (f1, f2, v = x => x.qty) => { const m = {}; for (const x of ps) { const k = f1(x) + '¦' + f2(x); m[k] = (m[k] || 0) + v(x); } return (a, b) => m[a + '¦' + b] || 0; };
  const topStates = rows.filter(r => r.country !== 'CA').sort((x, y) => y.rev - x.rev).slice(0, 10).map(r => r.code);
  const stCol = by2(x => x.state, x => x.col, x => x.rev), regType = by2(regionOf, x => x.type || 'Other'), regSize = by2(regionOf, x => sizeLbl(x.size)), regColor = by2(regionOf, colorOf), regTypeRev = by2(regionOf, x => x.type || 'Other', x => x.rev), regSizeRev = by2(regionOf, x => sizeLbl(x.size), x => x.rev);
  const hd = by2(x => x.dow, x => x.hour, () => 1);
  const bands = [[0, 100, '< $100'], [100, 300, '$100–300'], [300, 600, '$300–600'], [600, 1000, '$600–1k'], [1000, 1e9, '$1k+']];
  const bandRows = bands.map(([lo, hi, l]) => ({ label: l, v: orders.filter(o => o.rev >= lo && o.rev < hi).length, extra: [['Revenue', usd(sum(orders.filter(o => o.rev >= lo && o.rev < hi), o => o.rev))]] }));
  const chStats = ch => { const os = orders.filter(o => o.ch === ch), xs = ps.filter(x => x.ch === ch); if (!os.length) return null; const topP = [...groupBy(xs, x => x.part)].sort((a, b) => sum(b[1], x => x.qty) - sum(a[1], x => x.qty))[0];
    const topS = [...groupBy(os, o => o.state)].filter(([k]) => k).sort((a, b) => sum(b[1], o => o.rev) - sum(a[1], o => o.rev))[0];
    return { orders: os.length, aov: sum(os, o => o.rev) / os.length, upo: sum(os, o => o.units) / os.length, b2b: os.filter(o => o.b2b).length / os.length, topP: topP ? topP[0] : '—', topS: topS ? topS[0] : '—', east: sum(os.filter(o => o.coast === 'East Coast'), o => o.rev) / (sum(os, o => o.rev) || 1) }; };
  const cW = chStats('wf'), cA = chStats('amz');
  // auto insights
  const ins = [];
  const t5 = rows.filter(r => r.country !== 'CA').sort((x, y) => y.rev - x.rev).slice(0, 5);
  if (t5.length) ins.push(`<b>${pct(sum(t5, r => r.rev) / (a.rev || 1))}</b> of revenue comes from 5 states (${t5.map(r => r.code).join(', ')}) — ${t5[0].name} alone is ${pct(t5[0].share)}.`);
  const ec = share('East Coast'), wc = share('West Coast'); if (ec != null) ins.push(`East Coast buyers bring <b>${pct(ec)}</b> of revenue vs <b>${pct(wc)}</b> from the West Coast${ec > 0.4 ? ' — CastleGate Cranbury (NJ) is well placed for them' : ''}.`);
  for (const rg of regions.slice(0, 3)) { const tp = types.map(t => [t, regTypeRev(rg, t)]).sort((x, y) => y[1] - x[1])[0], sz = sizes.map(z => [z, regSizeRev(rg, z)]).sort((x, y) => y[1] - x[1])[0], tot = sum(types, t => regTypeRev(rg, t)); if (tp && tp[1]) ins.push(`<b>${esc(rg)}</b>: ${esc(tp[0])} brings ${pct(tp[1] / tot)} of the region's revenue; best-selling size by revenue ${esc(sz[0])} (${usd(sz[1])}).`); }
  const bigShare = sum(orders.filter(o => o.rev >= 600), o => o.rev) / (a.rev || 1); ins.push(`Orders of $600+ are ${pct(orders.filter(o => o.rev >= 600).length / (nOrd || 1))} of orders but <b>${pct(bigShare)}</b> of revenue — double vanities drive the business.`);
  if (cW && cA) ins.push(`Amazon buyers spend <b>${usd(cA.aov)}</b> per order vs <b>${usd(cW.aov)}</b> on Wayfair; Amazon top state ${esc(cA.topS)}, Wayfair top state ${esc(cW.topS)}.`);
  const pk = [...groupBy(orders.filter(o => o.dow != null), o => o.dow)].sort((x, y) => y[1].length - x[1].length)[0]; if (pk) ins.push(`Busiest day: <b>${DOW[pk[0]]}</b>${peakH && peakH[0] ? `, busiest hour ${String(peakH[1]).padStart(2, '0')}:00 ET` : ''} — schedule promotions and ad budget around it.`);
  return `${pageHead('Customers')}
  <div class="grid g-kpi k3">
    ${kpi('States reached', n0(Object.keys(usStats).length) + '<small>/ 50</small>', ca.length ? `+ ${ca.length} Canadian provinces` : 'US only')}
    ${kpi('Top state', top ? esc(top.code) : '—', top ? `${esc(top.name)} · ${usd(top.rev)}` : '')}
    ${kpi('East Coast share', pct(share('East Coast')), 'of revenue')}
    ${kpi('West Coast share', pct(share('West Coast')), 'of revenue')}
    ${kpi('Peak order hour', peakH && peakH[0] ? `${String(peakH[1]).padStart(2, '0')}:00<small>ET</small>` : '—', timed.length ? `${n0(peakH[0])} orders in that hour` : 'needs order timestamps')}
    ${kpi('B2B orders', n0(ordersOf(b2b)), `${pct(a.rev ? sum(b2b, x => x.rev) / a.rev : null)} of revenue · Wayfair Professional + Amazon Business`)}
  </div>
  <section class="card glass insights"><div class="card-head"><div><h3>Customer insights</h3><p class="sub">Generated from the orders in the selected period and filters</p></div></div><ul>${ins.map(t => `<li>${t}</li>`).join('')}</ul></section>
  <div class="grid g-kpi">
    ${kpi('Orders (buyers)', n0(nOrd), `${n0(a.units)} units · ${nf1.format(upo)} units / order`, 'Marketplaces do not share buyer identities, so each order = one buyer.')}
    ${kpi('Avg. order value', usd(aov), cW && cA ? `Wayfair ${usd(cW.aov)} · Amazon ${usd(cA.aov)}` : '')}
    ${kpi('Top-5 state share', pct(t5.length ? sum(t5, r => r.rev) / (a.rev || 1) : null), t5.map(r => r.code).join(' · '))}
    ${kpi('$600+ orders', pct(nOrd ? orders.filter(o => o.rev >= 600).length / nOrd : null), `${pct(bigShare)} of revenue`)}
  </div>
  ${card('Where customers buy', 'Revenue by US state — darker = more revenue · hover a state for units and revenue', usMap(usStats))}
  <div class="grid g-21">
    ${card('States ranked', 'Region = US Census region · Coast = Atlantic (East) or Pacific (West) coastline', table('states', [
      { k: 'name', l: 'State', f: (v, r) => `<b>${esc(v)}</b> <span class="sub">${esc(r.code)}</span>` }, { k: 'region', l: 'Region' }, { k: 'coast', l: 'Coast', f: v => v === 'East Coast' || v === 'West Coast' ? `<span class="tag">${esc(v)}</span>` : esc(v) },
      { k: 'orders', l: 'Orders', num: true }, { k: 'units', l: 'Units', num: true }, { k: 'rev', l: 'Revenue', num: true, f: v => usd(v) }, ...(S.platform === 'all' ? [{ k: 'wf', l: 'Wayfair', num: true, f: v => v ? usd(v) : '—' }, { k: 'amz', l: 'Amazon', num: true, f: v => v ? usd(v) : '—' }] : []), { k: 'share', l: 'Share', num: true, f: v => `${pct(v, 1)}<span class="mini-bar" style="width:${Math.round(v * 80)}px"></span>` }], rows, { def: { k: 'rev', d: 'desc' } }))}
    <div class="grid">
      ${card('By coast', 'Share of revenue', hbars(coast.sort((x, y) => y.v - x.v).map(c => ({ ...c, sub: pct(a.rev ? c.v / a.rev : 0) })), { fmt: usd }))}
      ${card('By region', '', hbars(region, { fmt: usd }))}
    </div>
  </div>
  <h2 class="sec-title">What customers buy, by region</h2>
  <div class="grid g-2">
    ${card('Product type by region', 'Units · share of each region', stack100(regions, types, (g, c) => regType(g, c)))}
    ${card('Size by region', 'Units', heatmap(regions, sizes, (r, c) => regSize(r, c), { color: 0 }))}
  </div>
  <div class="grid g-2">
    ${card('Collection by top state', 'Revenue · top 10 states', heatmap(topStates, cols, (r, c) => stCol(r, c), { fmt: usdK, rowLabel: k => k + ' · ' + ((STATES[k] || [])[0] || ''), color: 2 }))}
    ${card('Color by region', 'Units', heatmap(regions, colors, (r, c) => regColor(r, c), { color: 3 }))}
  </div>
  <div class="grid g-2">
    ${card('Order value bands', 'Number of orders by order value', hbars(bandRows, { fmt: n0 }))}
    ${cW || cA ? card('Wayfair vs Amazon buyers', '', `<div class="tbl-wrap"><table class="pnl-tbl"><thead><tr><th></th><th class="num">Wayfair</th><th class="num">Amazon</th></tr></thead><tbody>
      ${[['Orders', o => n0(o.orders)], ['Avg. order value', o => usd(o.aov)], ['Units / order', o => nf1.format(o.upo)], ['Top state', o => esc(o.topS)], ['Top SKU', o => esc(o.topP)], ['East Coast share', o => pct(o.east)], ['B2B share', o => pct(o.b2b)]].map(([l, f]) => `<tr><td>${l}</td><td class="num">${cW ? f(cW) : '—'}</td><td class="num">${cA ? f(cA) : '—'}</td></tr>`).join('')}</tbody></table></div>`) : ''}
  </div>
  ${card('When customers order', 'Orders by day and hour · US Eastern time', heatmap([0, 1, 2, 3, 4, 5, 6].filter(d => orders.some(o => o.dow === d)), Array.from({ length: 24 }, (_, h) => h).filter(h => h % 1 === 0), (d, h) => hd(d, h), { rowLabel: d => DOW[d], colLabel: h => String(h), color: 4 }))}
  ${reviewsSection()}
  </div>`;
}

// Ratings & reviews (Wayfair + Amazon) and Wayfair listing conversion
function reviewsSection() {
  const R = D.reviews; if (!R) return '';
  const C = SER(), plat = S.platform, Ls = Object.values(R.listings || {}).filter(l => (plat === 'all' || l.ch === plat) && (l.parts || []).some(passProd));
  const items = (R.items || []).filter(r => (plat === 'all' || r.ch === plat) && (!(r.parts || []).length || r.parts.some(passProd)));
  const rated = Ls.filter(l => l.count > 0), nRev = sum(Ls, l => l.count), avg = nRev ? sum(rated, l => l.rating * l.count) / nRev : null;
  const ch = v => `<span class="tag ${v === 'amz' ? 'tt' : ''}">${v === 'amz' ? 'Amazon' : 'Wayfair'}</span>`;
  const stars = n => `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(Math.round(n))}<i>${'★'.repeat(5 - Math.round(n))}</i></span>`;
  const soldBy = {}; for (const x of M.pieces) if (x.ok && !x.tt) soldBy[x.ch + ':' + x.part] = (soldBy[x.ch + ':' + x.part] || 0) + x.qty;
  const rows = Ls.map(l => ({ ...l, sold: sum(l.parts || [], p => soldBy[l.ch + ':' + p] || 0) })).map(l => ({ ...l, revRate: l.sold ? l.count / l.sold : null }));
  const pm = D.wfPm, pmRows = pm && plat !== 'amz' ? pm.rows.filter(r => passProd(r[0])).map(r => ({ part: r[0], rev: r[1], conv: r[2] })) : [];
  return `<h2 class="sec-title">Ratings &amp; reviews</h2>
  <div class="grid g-kpi">
    ${kpi('Average rating', avg != null ? nf1.format(avg) + '<small>/ 5</small>' : '—', `${n0(rated.length)} of ${n0(Ls.length)} listings rated`)}
    ${kpi('Reviews', n0(nRev), `${n0(items.filter(r => r.incentivized).length)} incentivized (Tried & True / Vine)`, 'Count of published reviews across Wayfair and Amazon listings.')}
    ${kpi('Review rate', pct(sum(rows, r => r.sold) ? nRev / sum(rows, r => r.sold) : null, 1), 'Reviews ÷ units sold (all time)', 'How many buyers leave a review — a typical rate is 1–3%.')}
    ${kpi('Low ratings (≤3★)', n0(items.filter(r => r.rating <= 3).length), items.some(r => r.rating <= 3) ? 'Read them below' : 'None so far')}
  </div>
  <div class="grid g-21">
    ${card('Listings', `Checked ${dLong(R.asOf)} · refreshed every Thursday`, table('revlist', [{ k: 'name', l: 'Listing', f: (v, r) => `<div class="sku"><div><b class="trunc" title="${esc(v)}">${esc(v)}</b><small>${esc(r.listing)}</small></div></div>` }, { k: 'ch', l: 'Channel', f: ch },
      { k: 'rating', l: 'Rating', num: true, f: v => v != null ? `${nf1.format(v)} ${stars(v)}` : '<span class="sub">no reviews</span>' }, { k: 'count', l: 'Reviews', num: true }, { k: 'sold', l: 'Units sold', num: true }, { k: 'revRate', l: 'Review rate', num: true, f: v => pct(v, 1) },
      { k: 'url', l: '', nosort: true, f: v => v ? `<a href="${esc(v)}" target="_blank" rel="noopener">Open ↗</a>` : '' }], rows, { def: { k: 'sold', d: 'desc' } }))}
    ${card('What customers wrote', items.length ? '' : 'No written reviews yet', items.length ? `<div class="reviews">${items.sort((x, y) => y.date.localeCompare(x.date)).map(r => `<article class="review">
        <header>${stars(r.rating)} ${ch(r.ch)} ${r.incentivized ? '<span class="tag tt">Incentivized</span>' : ''}<span class="sub">${dLong(r.date)}${r.state ? ' · ' + esc(r.state) : ''}</span></header>
        <div class="sub">${esc(((R.listings[r.ch + ':' + r.listing] || {}).name) || r.listing)}${r.variant ? ' · ' + esc(r.variant) : ''}${r.photos ? ` · ${r.photos} photos` : ''}</div>
        ${r.title ? `<h4>${esc(r.title)}</h4>` : ''}<blockquote>“${esc(r.text)}”</blockquote></article>`).join('')}</div>` : '<div class="empty">Amazon B0HJQQ3MY4 has 0 reviews; Wayfair has 1 so far.</div>')}
  </div>
  ${pmRows.length ? card('Wayfair listing conversion ' + chOnly('wf'), `Partner Home Product Management · ${esc(pm.window)} · checked ${dLong(pm.asOf)}`, table('pmconv', [{ k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'rev', l: 'Revenue (90d)', num: true, f: v => v == null ? '—' : usd(v) },
      { k: 'conv', l: 'Conversion rate', num: true, f: v => v == null ? '—' : `${pct(v, 1)}<span class="mini-bar" style="width:${Math.round(Math.min(1, v / 0.035) * 60)}px"></span>` }], pmRows, { def: { k: 'rev', d: 'desc' } })) : ''}`;
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
  const amzNote = S.platform === 'wf' ? '' : `<div class="alert info"><span class="ic">i</span><div><b>Channel coverage</b><span>Ad spend and TACoS include Amazon (ad charges Amazon billed to the account). Ad sales, ROAS, ACoS, clicks, impressions, CPC, ad orders and the campaign tables are <b>Wayfair only</b> until the Amazon Ads API application is approved — then Amazon campaigns appear here automatically.</span></div></div>`;
  return `${pageHead('Advertising')}
  <div class="grid g-kpi">
    ${kpi('Ad Spend', usd(ad.spend, 0), `${delta(ad.spend, pa.spend, { invert: true })} ${vsPrev()}`, '', sp('spend', 0))}
    ${kpi('Ad Sales <span class="tag only wf mini">WF</span>', usd(ad.sales), `${delta(ad.sales, pa.sales)} 14-day attributed, retail price`, 'Retail sales Wayfair attributes to ad clicks/views within 14 days.', sp('sales', 2))}
    ${kpi('ROAS <span class="tag only wf mini">WF</span>', roas == null ? '—' : roas.toFixed(1) + '×', `${delta(roas, proas)} ${vsPrev()}`, 'Ad sales ÷ ad spend', sp('roas', 4, true))}
    ${kpi('ACoS <span class="tag only wf mini">WF</span>', pct(ad.sales ? ad.spend / ad.sales : null, 1), 'Ad spend ÷ ad sales', '', sp('acos', 4, true))}
    ${kpi('TACoS', pct(a.rev ? ad.spend / a.rev : null, 1), `${delta(a.rev ? ad.spend / a.rev : null, prev.a.rev ? pa.spend / prev.a.rev : null, { pp: true, invert: true })} ${vsPrev()}`, 'Total ad spend ÷ total Revenue (base cost)', sp('tacos', 4, true))}
    ${kpi('Clicks <span class="tag only wf mini">WF</span>', n0(ad.clicks), `CTR ${pct(ad.impr ? ad.clicks / ad.impr : null, 2)} · ${n0(ad.impr)} impressions`, '', sp('clicks', 1))}
    ${kpi('CPC <span class="tag only wf mini">WF</span>', ad.clicks ? usd(ad.spend / ad.clicks, 2) : '—', `${delta(ad.clicks ? ad.spend / ad.clicks : null, pa.clicks ? pa.spend / pa.clicks : null, { invert: true })} ${vsPrev()}`, '', sp('cpc', 0))}
    ${kpi('Ad Orders <span class="tag only wf mini">WF</span>', n0(ad.orders), `${n0(ad.units)} units attributed`, '', sp('orders', 3))}
  </div>
  ${amzNote}
  ${card('Spend, ad sales and efficiency', `Bars = ad spend · line = attributed ad sales · dashed = ${ADM[S.adm || 'tacos'][0]} · by ${autoGran(f, t)}`, combo3(abk, { bar: { k: 'spend', name: 'Ad spend', short: 'Spend', axis: usdK, lbl: v => usd(v), color: C[0] }, line: { k: 'sales', name: 'Ad sales (14-day)', short: 'Ad sales', axis: usdK, color: C[2] }, dash: { k: S.adm || 'tacos', name: ADM[S.adm || 'tacos'][0], fmt: ADM[S.adm || 'tacos'][1], color: C[4], min: ADM[S.adm || 'tacos'][2] }, tip: adTip }), { actions: `<div class="btn-row">${Object.entries(ADM).map(([k, [l]]) => `<button class="view-toggle" data-adm="${k}" aria-pressed="${(S.adm || 'tacos') === k}">${esc(l.split(' ')[0])}</button>`).join('')}</div>${granBtns()}`, cls: 'big-chart' })}
  <div class="grid g-2">
    ${card('Traffic ' + chOnly('wf'), 'Bars = clicks · line = impressions · dashed = CTR', combo3(abk, { bar: { k: 'clicks', name: 'Clicks', axis: n0, color: C[1] }, line: { k: 'impr', name: 'Impressions', short: 'Impr.', axis: v => v >= 1000 ? nf1.format(v / 1000) + 'k' : n0(v), color: C[3] }, dash: { k: 'ctr', name: 'CTR', fmt: v => pct(v, 1), color: C[4], min: 0.002 }, tip: adTip }, { h: 320, w: CW('half') }))}
    ${card('Cost per click and conversion ' + chOnly('wf'), 'Bars = ad orders · line = CPC · dashed = ROAS', combo3(abk, { bar: { k: 'orders', name: 'Ad orders', short: 'Orders', axis: n0, color: C[3] }, line: { k: 'cpc', name: 'CPC', axis: v => usd(v, 2), color: C[0] }, dash: { k: 'roas', name: 'ROAS', fmt: v => v.toFixed(1) + '×', color: C[4], min: 1 }, tip: adTip }, { h: 320, w: CW('half') }))}
  </div>
  ${card('Campaigns ' + chOnly('wf'), '', table('camps', [{ k: 'name', l: 'Campaign', f: (v, r) => `<b>${esc(v)}</b><div class="sub">${esc(r.id)} · ${esc(r.status || '')}${r.cap ? ' · $' + r.cap + '/day cap' : ''}</div>` }, { k: 'spend', l: 'Spend', num: true, f: v => usd(v, 2) }, { k: 'impr', l: 'Impr.', num: true, f: v => n0(v) }, { k: 'clicks', l: 'Clicks', num: true, f: v => n0(v) }, { k: 'ctr', l: 'CTR', num: true, f: v => pct(v, 2) }, { k: 'cpc', l: 'CPC', num: true, f: v => v == null ? '—' : usd(v, 2) }, { k: 'orders', l: 'Orders', num: true }, { k: 'sales', l: 'Ad sales', num: true, f: v => usd(v) }, { k: 'roas', l: 'ROAS', num: true, f: v => v == null ? '—' : v.toFixed(1) + '×' }, { k: 'acos', l: 'ACoS', num: true, f: v => pct(v, 1) }], camps, { def: { k: 'spend', d: 'desc' } }))}
  ${card('Spend by listing → SKU ' + chOnly('wf'), 'From the Wayfair SKU report; each listing\'s spend is split across its child SKUs by net revenue (equal split if the listing had no sales)', listings.length ? table('lst', [{ k: 'name', l: 'Listing', f: (v, r) => `<b>${esc(v)}</b><div class="sub">${esc(r.lid)}</div>` }, { k: 'spend', l: 'Spend', num: true, f: v => usd(v, 2) }, { k: 'clicks', l: 'Clicks', num: true, f: v => n0(v) }, { k: 'orders', l: 'Orders', num: true }, { k: 'sales', l: 'Ad sales', num: true, f: v => usd(v) }, { k: 'roas', l: 'ROAS', num: true, f: v => v == null ? '—' : v.toFixed(1) + '×' }, { k: 'alloc', l: 'Allocated to SKUs', nosort: true }], listings, { def: { k: 'spend', d: 'desc' } }) : '<div class="empty">SKU-level ad data arrives with the next daily sync.</div>')}`;
}

// ================= Incidents & Returns: case verification =================
// Every case (Wayfair incident/return, Amazon return/A-to-z/SafeT) is checked against the order, the product data,
// the listings, the photo review and the policy (Wayfair DDA, Wayfair-Managed Returns, Amazon return rules).
// Each check produces a finding with an owner and an action; the case verdict is the strongest finding.
const VERDICT = { dispute: ['Dispute — raise a ticket', 'bad', 1], evidence: ['Ask for evidence', 'warn', 2], ours: ['Our fix', 'warn', 3], review: ['Needs review', '', 4], valid: ['Valid', 'good', 5] };
function amzReturnCases() {
  const R = (D.amz && D.amz.returns) || [];
  const cases = R.map(r => ({ ch: 'amz', po: r.order_id, rma: r.amazon_rma_id, part: r.merchant_sku, kind: /a-?to-?z|y/i.test(r.a_to_z_claim || '') && r.a_to_z_claim && r.a_to_z_claim !== 'N' ? 'A-to-z claim' : 'Return', issue: r.return_reason || 'Return', detail: [r.return_reason, r.return_type, r.resolution].filter(Boolean).join(' · '), comment: r.customer_comments || '', photos: 0,
    delivered: null, requested: (r.return_request_date || '').slice(0, 10), returnDelivered: (r.return_delivery_date || '').slice(0, 10), status: r.return_request_status, inPolicy: r.in_policy, label: r.label_type, labelCost: +r.label_cost || 0, labelPaidBy: r.label_to_be_paid_by, refunded: +r.refunded_amount || 0, orderAmt: +r.order_amount || 0, qty: +r.return_quantity || 1,
    safet: r.safet_claim_id ? { id: r.safet_claim_id, state: r.safet_claim_state, amt: +r.safet_claim_reimbursement_amount || 0 } : null, deduction: (+r.refunded_amount || 0) + ((/seller/i.test(r.label_to_be_paid_by || '') ? +r.label_cost : 0) || 0), review: { photo: 'none' } }));
  // refunds posted in Finances with no return request = concessions / A-to-z / refund-at-first-scan
  const seen = new Set(cases.map(c => c.po));
  for (const f of (D.amz && D.amz.fin) || []) { if (!/refund/i.test(f[2] || '') || seen.has(f[4])) continue; seen.add(f[4]);
    cases.push({ ch: 'amz', po: f[4], part: f[5], kind: 'Refund (no return)', issue: 'Refund', detail: f[8] || 'Refund posted in Seller Central', comment: '', photos: 0, requested: String(f[1]).slice(0, 10), refunded: Math.abs(+f[7] || 0), deduction: Math.abs(+f[7] || 0), review: { photo: 'none' } }); }
  return cases;
}
function verifyCase(c, ctx) {
  const F = [], add = (v, owner, text, action) => F.push({ v, owner, text, action });
  const P = M.P[c.part] || {}, wl = (D.wfListing || {}).listings || {}, L = wl[P.listing || P.fam] || {}, pol = (D.incidents || {}).policy || {};
  const line = M.lines.find(l => l.po === c.po && l.part === c.part), paid = line ? line.price * line.qty : null;
  const lst = (listingModel().cross || []).filter(x => x.part === c.part);
  const sameSku = ctx.cases.filter(x => x.part === c.part && x.ch === c.ch && /damag/i.test(x.issue));
  const days = c.delivered && line ? diffDays(line.date, c.delivered) : null;
  if (c.ch === 'wf') {
    const dmg = /damag|defect|broken/i.test(c.issue + ' ' + c.detail);
    if (c.review && c.review.photo === 'mismatch') add('dispute', 'Wayfair', 'Customer photos do not show this product. ' + (c.review.note || ''), `Dispute the ${usd(c.deduction, 2)} deduction: the photos show a different item. CastleGate picks and ships, so either the customer filed against the wrong order or the warehouse shipped another item — neither is a supplier cost.`);
    if (c.review && c.review.photo === 'listing-conflict') add('ours', 'Us', c.review.note, 'Fix the listing on both channels (images, hardware-finish attribute, description) so the next buyer gets what the page shows.');
    if (dmg && (c.photos || 0) === 0 && c.deduction > 0) add('evidence', 'Wayfair', `Deducted ${usd(c.deduction, 2)} with no photos on the case.`, 'Ask Wayfair for the damage photos / carrier report before accepting the charge.');
    if (dmg && pol.dda && c.deduction > 0 && !(c.review && c.review.photo === 'mismatch')) add(sameSku.length >= 3 ? 'review' : 'dispute', 'Wayfair', `Damage charged per incident although the account has a ${pct(pol.dda)} Damage & Defect Allowance. The DDA pays for freight damage and one-off defects reported within ${pol.incidentPeriodDays || 30} days.`, sameSku.length >= 3 ? `${c.part} has ${sameSku.length} damage cases — Wayfair can treat this as a recurring defect or insufficient packaging (outside the DDA). Ask for the reason code; meanwhile upgrade the packaging.` : 'Ask Wayfair for the deduction reason code; dispute unless they cite insufficient packaging or a recurring defect.');
    if (dmg && /drop|heard|carrier|box|transit|arriv/i.test(c.comment + ' ' + c.detail)) add('review', 'Carrier', 'The customer describes damage in transit (box / drop-off).', 'Freight damage → covered by the DDA; attach the customer\'s note to the dispute.');
    if (sameSku.length >= 2 && dmg) add('ours', 'Us', `${sameSku.length} damage cases on ${c.part} (${pct(((D.incidents || {}).portal || {}).parts ? (((D.incidents.portal.parts.find(p => p[0] === c.part)) || [])[2] || 0) : 0)} incident rate vs ${pct(((D.incidents || {}).portal || {}).classIncident)} class benchmark).`, /KFFX|UDD2|D9YA|Z9IT|K89O|KBKN/.test(c.part) ? 'Small-parcel vanity with a ceramic/stone top: add corner blocks and a top-board for the sink, and run a drop test before the next PO.' : 'Review carton strength, corner protection and fixing of the countertop for this SKU.');
    if (paid != null && c.deduction > paid * 1.02) add('dispute', 'Wayfair', `Deduction ${usd(c.deduction, 2)} is higher than the wholesale paid for this order (${usd(paid, 2)}).`, 'Dispute the excess above the wholesale amount.');
    if (days != null && days > (pol.incidentPeriodDays || 30)) add('review', 'Wayfair', `Reported ${days} days after the order — outside the ${pol.incidentPeriodDays || 30}-day incident period.`, 'Outside the DDA window it is a warranty claim; Wayfair should send a credit request rather than deduct.');
    if (/mis-?information|not as described|match/i.test(c.issue + ' ' + c.detail) && !(c.review && c.review.photo === 'listing-conflict')) {
      if ((L.notes || []).length || lst.length) add('ours', 'Us', `The listing has known inconsistencies: ${[...(L.notes || []), ...lst.map(x => `${x.field} Amazon "${x.amz}" vs Wayfair "${x.wf}"`)].join('; ')}.`, 'Correct the listing; the claim is probably valid.');
      else add('evidence', 'Customer', 'No inconsistency found in the listing data.', 'Ask Wayfair which detail did not match before accepting.');
    }
    if (/size|fit|dimension/i.test(c.issue + ' ' + c.detail)) {
      if ((L.reqMissing || []).some(x => /depth|width|height/i.test(x))) add('ours', 'Us', `"Wrong size" while the Wayfair listing is missing ${L.reqMissing.filter(x => /depth|width|height/i.test(x)).join(', ')} — size filters could not exclude this vanity.`, 'Fill the dimension attributes; the return itself is buyer remorse (handled under Wayfair-Managed Returns).');
      else add('valid', 'Customer', 'Buyer remorse — the listing dimensions are complete.', 'Nothing to dispute.');
    }
    if (c.kind === 'Return' && c.deduction > 0 && paid) { const exp = paid * 0.96 * 0.75; add(Math.abs(c.deduction - exp) / exp < 0.12 || Math.abs(c.deduction - paid * 0.75) / (paid * 0.75) < 0.05 ? 'valid' : 'review', 'Wayfair', `Return credit ${usd(c.deduction, 2)} vs ${usd(exp, 2)} expected under Wayfair-Managed Returns (paid ${usd(paid, 2)} × 96% × 75%).`, 'Matches the program terms unless flagged.'); }
    if (c.review && c.review.photo === 'pending' && c.photos) add('review', 'Us', c.review.note || `${c.photos} photos not yet reviewed.`, 'Open the case photos in Partner Home and compare them with the SKU images; the weekly check records the result.');
    if (/^u+$|^\.+$|^x+$/i.test((c.comment || '').trim())) add('evidence', 'Customer', `Meaningless comment ("${c.comment}") and ${c.photos ? c.photos + ' photos' : 'no photos'}.`, c.deduction ? 'Dispute: no usable description of the damage.' : 'Watch: if a deduction follows, dispute it.');
  } else {
    // Amazon
    if (c.kind === 'A-to-z claim') add('review', 'Amazon', 'A-to-z Guarantee claim.', 'Respond in Seller Central › Performance › A-to-z claims within 72 h; claims count against Order Defect Rate.');
    if (/not as described|inaccurate|different|wrong item/i.test(c.issue + ' ' + c.detail + ' ' + c.comment)) { if (lst.length) add('ours', 'Us', `"Not as described" while specs differ between channels: ${lst.map(x => x.field).join(', ')}.`, 'Align the listing with the spec sheet.'); else add('evidence', 'Customer', '"Not as described" — listing data is consistent.', 'If the item comes back used or different, file a SafeT claim.'); }
    if (/defect|damag|broken/i.test(c.issue + ' ' + c.detail)) add('review', 'Carrier', 'Damaged / defective on a Multichannel (CastleGate) shipment.', 'Ask the customer for photos; if transit damage, raise it with Wayfair Multichannel (Partner Home ticket) and keep Amazon\'s return label on the seller only if in policy.');
    if (c.refunded > 0 && !c.returnDelivered && c.requested && diffDays(c.requested, M.today) > 14) add('dispute', 'Amazon', `Refunded ${usd(c.refunded, 2)} but the item has not been returned after ${diffDays(c.requested, M.today)} days.`, 'File a SafeT claim (Seller Central › Orders › SafeT claims) for the refund on an unreturned item.');
    if (c.orderAmt && c.refunded > c.orderAmt * 1.01) add('dispute', 'Amazon', `Refund ${usd(c.refunded, 2)} exceeds the order amount ${usd(c.orderAmt, 2)}.`, 'Open a case with Selling Partner Support for the excess.');
    if (/n/i.test(c.inPolicy || '') ) add('dispute', 'Amazon', 'Return outside Amazon\'s return policy.', 'Decline or request reimbursement via SafeT if Amazon authorized it.');
    if (c.safet) add('review', 'Amazon', `SafeT claim ${c.safet.id} — ${c.safet.state}${c.safet.amt ? ', reimbursed ' + usd(c.safet.amt, 2) : ''}.`, 'Track until closed.');
    if (/seller/i.test(c.labelPaidBy || '') && c.labelCost) add('review', 'Us', `Return label ${usd(c.labelCost, 2)} paid by us.`, /customer|remorse|no longer|mistake|better price|ordered by/i.test(c.issue) ? 'Buyer-remorse return: the label should be charged to the customer — check the return settings.' : 'Expected for defect / not-as-described returns.');
    if (c.kind === 'Refund (no return)') add('review', 'Amazon', `Refund of ${usd(c.refunded, 2)} with no return request.`, 'Check whether it was an A-to-z, a concession or a refund-at-first-scan; reimbursement via SafeT may apply.');
  }
  if (!F.length) add('valid', c.ch === 'wf' ? 'Customer' : 'Customer', 'No conflict found with the product data, listing or policy.', 'No action.');
  const top = F.slice().sort((a, b) => VERDICT[a.v][2] - VERDICT[b.v][2])[0];
  const recover = top.v === 'dispute' || top.v === 'evidence' ? c.deduction || 0 : 0;
  return { findings: F, verdict: top.v, owner: top.owner, recover, paid, line };
}
function ticketText(c, V) {
  const P = M.P[c.part] || {};
  const reasons = V.findings.filter(f => f.v === 'dispute' || f.v === 'evidence').map(f => '- ' + f.text).join('\n');
  return c.ch === 'wf' ? `Subject: Deduction dispute — PO ${c.po} / Part ${c.part} (${usd(c.deduction, 2)})

Hello Wayfair team,

We would like to dispute the ${usd(c.deduction, 2)} deduction on PO ${c.po} (part ${c.part}, ${P.name || ''}${P.listing ? ', listing ' + P.listing : ''}), incident "${c.issue}" delivered ${dLong(c.delivered)}.

${reasons}

This order was fulfilled from CastleGate, and our account has a ${pct(((D.incidents || {}).policy || {}).dda || 0.04)} Damage & Defect Allowance covering freight damage and one-off defects. Please reverse the deduction or share the reason code and the evidence (photos, carrier report) supporting it.

Thank you,
Lignarc / VHG Living Furniture` : `Subject: Reimbursement request — order ${c.po}${c.rma ? ' / RMA ' + c.rma : ''}

Hello Selling Partner Support,

${reasons}

Please review and reimburse ${usd(V.recover || c.refunded || 0, 2)}.

Thank you,
Lignarc`;
}
function viewQuality() {
  const I = D.incidents || { cases: [] }, C = SER(), Pt = I.portal || {}, pol = I.policy || {};
  const all = [...(I.cases || []).map(c => ({ ch: 'wf', ...c })), ...amzReturnCases()].filter(c => (S.platform === 'all' || c.ch === S.platform) && passProd(c.part));
  const ctx = { cases: all };
  const cases = all.map(c => { const V = verifyCase(c, ctx); return { ...c, p: M.P[c.part] || {}, V }; });
  const issueColor = k => ({ 'Damaged': C[0], 'Mis-information': C[1], 'Wrong size': C[2] })[k] || C[3];
  const byIssue = [...groupBy(cases, c => c.issue)].map(([k, cs]) => ({ label: k, v: cs.length, color: issueColor(k), extra: [['SKUs', [...new Set(cs.map(c => c.part))].join(', ')], ['Deducted', usd(sum(cs, c => c.deduction || 0), 2)]] }));
  const ded = sum(cases, c => c.deduction || 0), disp = cases.filter(c => c.V.verdict === 'dispute' || c.V.verdict === 'evidence'), rec = sum(disp, c => c.V.recover);
  const ours = cases.filter(c => c.V.findings.some(f => f.owner === 'Us' && (f.v === 'ours')));
  const amzN = cases.filter(c => c.ch === 'amz').length;
  const vTag = v => `<span class="tag ${VERDICT[v][1]}">${VERDICT[v][0]}</span>`;
  const chT = ch => `<span class="tag ${ch === 'amz' ? 'tt' : ''}">${ch === 'amz' ? 'Amazon' : 'Wayfair'}</span>`;
  const ownerC = { Us: 'var(--warn)', Wayfair: 'var(--crit)', Amazon: 'var(--crit)', Carrier: 'var(--s4)', Customer: 'var(--good)' };
  const caseCard = c => `<article class="case glass v-${c.V.verdict}">
      <header><div class="sku">${(() => { const m = listingModel(), w = m.wf.find(x => x.part === c.part), a = m.amz.find(x => x.part === c.part); const src = (a && a.img) || (w && w.img); return src ? `<img class="lthumb" loading="lazy" src="${esc(src)}" data-alt="${esc(w && w.img && w.img !== src ? w.img : '')}" alt="">` : `<span class="dot" style="background:${colColor(c.p.col)}"></span>`; })()}<div><b>${esc(c.part)}</b> ${chT(c.ch)}<small>${esc((c.p.name || '').replace(/ with .*/i, ''))}${c.p.color ? ' · ' + esc(c.p.color) : ''}</small></div></div>${vTag(c.V.verdict)}</header>
      <h4><span class="tag issue" style="--c:${issueColor(c.issue)}">${esc(c.issue)}</span> ${esc(c.detail)}</h4>
      ${c.comment ? `<blockquote>“${esc(c.comment)}”</blockquote>` : '<p class="sub nocomment">Customer left no comment</p>'}
      <dl><div><dt>${c.ch === 'amz' ? 'Order' : 'PO'}</dt><dd>${esc(c.po)}${c.tt ? ' <span class="tag tt">Tried &amp; True</span>' : ''}</dd></div><div><dt>${c.ch === 'amz' ? 'Requested' : 'Delivered'}</dt><dd>${dLong(c.delivered || c.requested)}${c.state ? ' · ' + esc(c.state) : ''}</dd></div><div><dt>Photos</dt><dd>${c.photos || '—'}${c.review && c.review.photo && c.review.photo !== 'none' ? ` · <b>${esc({ match: 'match the SKU', mismatch: 'NOT this SKU', pending: 'not reviewed', 'listing-conflict': 'show a listing error' }[c.review.photo] || c.review.photo)}</b>` : ''}</dd></div><div><dt>${c.ch === 'amz' ? 'Refunded' : 'Deducted'}</dt><dd class="${c.deduction ? 'neg' : ''}">${c.deduction ? usd(c.deduction, 2) : 'None'}</dd></div>${c.V.paid != null ? `<div><dt>Wholesale paid</dt><dd>${usd(c.V.paid, 2)}</dd></div>` : ''}</dl>
      ${(() => { const files = c.media || ((D.incidentMedia || {})[c.po] || {}).files || []; return files.length ? `<div class="cphotos">${files.map((f, i) => `<a target="_blank" rel="noopener" title="Customer photo ${i + 1}"><img data-media="${esc(f)}" alt="Customer photo ${i + 1}"></a>`).join('')}</div>` : (c.photos ? `<p class="sub nocomment">${c.photos} customer photo${c.photos > 1 ? 's' : ''} in Partner Home — not synced yet</p>` : ''); })()}
      <ul class="findings">${c.V.findings.map(f => `<li class="f-${f.v}"><span class="own" style="--c:${ownerC[f.owner] || 'var(--axis)'}">${esc(f.owner)}</span><div><b>${esc(f.text)}</b><em>${esc(f.action)}</em></div></li>`).join('')}</ul>
      ${c.V.verdict === 'dispute' || c.V.verdict === 'evidence' ? `<details class="ticket"><summary>Ticket text to send ${c.ch === 'amz' ? 'Amazon' : 'Wayfair'}</summary><textarea readonly rows="12">${esc(ticketText(c, c.V))}</textarea><button type="button" class="btn-copy" data-copy>Copy</button></details>` : ''}
    </article>`;
  const parts = (Pt.parts || []).filter(p => passProd(p[0]) && S.platform !== 'amz').map(p => ({ part: p[0], listing: p[1], rate: p[2], n: p[3], delivered: p[4], brr: p[5], ret: p[6], parcel: p[8], last: p[9], ded: p[10], col: (M.P[p[0]] || {}).col }));
  return `${pageHead('Incidents &amp; Returns', `Wayfair cases from Partner Home (checked ${dLong(I.asOf)}, weekly) · Amazon returns, A-to-z and refunds via SP-API every hour · every case is checked against the order, product data, listing, photos and policy`)}
  <div class="grid g-kpi k3">
    ${kpi('Cases', n0(cases.length), `${n0(cases.filter(c => c.ch === 'wf').length)} Wayfair · ${n0(amzN)} Amazon`)}
    ${S.platform !== 'amz' ? kpi('Wayfair incident rate', pct(Pt.incidentRate), `class benchmark ${pct(Pt.classIncident)} · buyer-remorse returns ${pct(Pt.brrRate)} vs ${pct(Pt.classBrr)}`, 'Partner Home › Incidents and Resolutions Performance (rolling 6 months, by delivery date).') : kpi('Amazon returns', n0(amzN), 'merchant-fulfilled returns + refunds without return')}
    ${kpi('Deducted / refunded', usd(ded, 2), `${n0(cases.filter(c => c.deduction > 0).length)} cases with a charge`)}
    ${kpi('Recoverable — dispute', usd(rec, 2), `${n0(disp.length)} cases: raise a ticket`, 'Cases whose strongest finding is "Dispute" or "Ask for evidence".')}
    ${kpi('Our fixes', n0(ours.length), 'listing errors, packaging, missing dimensions')}
    ${S.platform !== 'amz' ? kpi('Replacement parts shipped', pct(Pt.partsShipped), `${n0(Pt.partsRequested || 0)} requested · DDA ${pct(pol.dda)}`, 'Unfulfilled replacement-part requests are charged outside the DDA.') : ''}
  </div>
  ${disp.length ? `<div class="alert crit"><span class="ic">!</span><div><b>${disp.length} case${disp.length > 1 ? 's' : ''} to dispute — ${usd(rec, 2)} recoverable</b><span>${disp.map(c => `${esc(c.part)} ${esc(c.po)} (${usd(c.deduction || 0, 2)}): ${esc(VERDICT[c.V.verdict][0].toLowerCase())}`).join(' · ')}. Each card below has the ticket text ready to copy.</span></div></div>` : ''}
  ${S.platform !== 'amz' && pol.dda ? `<div class="alert warn"><span class="ic">i</span><div><b>Damage &amp; Defect Allowance ${pct(pol.dda)} is active</b><span>${esc(pol.ddaCovers)}. Excluded: ${esc(pol.ddaExcludes)}. Per-incident damage deductions on top of the allowance need a reason code from Wayfair. <a href="${esc(pol.policyUrl)}" target="_blank" rel="noopener">Wayfair DDA policy</a></span></div></div>` : ''}
  ${amzN === 0 && S.platform !== 'wf' ? '<div class="alert info"><span class="ic">i</span><div><b>Amazon: no returns or refunds so far</b><span>Returns, A-to-z claims, SafeT claims and refunds sync hourly from the Amazon returns report and Finances; any new case appears here automatically with the same checks.</span></div></div>' : ''}
  <h2 class="sec-title">Cases and verdicts</h2>
  <div class="cases">${cases.sort((x, y) => VERDICT[x.V.verdict][2] - VERDICT[y.V.verdict][2] || (y.deduction || 0) - (x.deduction || 0)).map(caseCard).join('') || '<div class="empty">No cases for the current filters</div>'}</div>
  <div class="grid g-2">
    ${card('By issue', 'Number of cases (both channels)', donut(byIssue, { center: n0(cases.length), sub: 'cases' }))}
    ${card('Who is responsible', 'Owner of the strongest finding per case', hbars(Object.entries(cases.reduce((o, c) => (o[c.V.owner] = (o[c.V.owner] || 0) + 1, o), {})).map(([k, v]) => ({ label: k, v, color: ownerC[k] || C[3], extra: [['Deducted', usd(sum(cases.filter(c => c.V.owner === k), c => c.deduction || 0), 2)]] })), { fmt: n0 }))}
  </div>
  ${parts.length ? card('By SKU — Partner Home ' + chOnly('wf'), 'Incident rate vs the Vanities class benchmark (' + pct(Pt.classIncident) + '), deliveries in the last 6 months', table('qsku', [{ k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'listing', l: 'Listing' }, { k: 'parcel', l: 'Parcel' }, { k: 'delivered', l: 'Delivered', num: true }, { k: 'n', l: 'Incidents', num: true }, { k: 'rate', l: 'Incident rate', num: true, f: v => `<b style="color:${v > (Pt.classIncident || 0.1) ? 'var(--crit-ink)' : 'inherit'}">${pct(v)}</b>` }, { k: 'ret', l: 'Returns', num: true }, { k: 'brr', l: 'Return rate', num: true, f: v => pct(v) }, { k: 'ded', l: 'Deducted', num: true, f: v => v ? usd(v, 2) : '—' }, { k: 'last', l: 'Last delivery', f: v => dLong(v) }], parts, { def: { k: 'rate', d: 'desc' } })) : ''}
  <p class="note">Checks: photo review (does the photo show this SKU?), photo evidence for charged damage, DDA coverage (freight damage / one-off defects within ${pol.incidentPeriodDays || 30} days), recurring damage on the same SKU, deduction vs wholesale paid, listing conflicts and missing dimensions for "not as described" / "wrong size", Wayfair-Managed Returns credit, Amazon refunds on unreturned items (SafeT), out-of-policy returns, label cost and A-to-z claims. Photos are reviewed weekly (Wayfair's photo viewer is currently returning errors for new cases).</p>`;
}

function viewInventory() {
  const [f, t] = range();
  const inv = (D.wf.inv || []).filter(r => passProd(r[0]));
  const sold30 = {}; for (const x of M.pieces) if (x.ok && x.date > addDays(M.today, -30)) sold30[x.part] = (sold30[x.part] || 0) + x.qty;
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
  ${card('CastleGate inventory ' + chOnly('shared'), 'Live from the Wayfair inventory API', table('inv', [{ k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'col', l: 'Collection' }, { k: 'size', l: 'Size', f: v => sizeLbl(v), sv: r => r.size || 0 }, { k: 'color', l: 'Color' }, { k: 'onHand', l: 'On hand', num: true }, { k: 'avail', l: 'Available', num: true }, { k: 'sold30', l: 'Sold 30d', num: true }, { k: 'cover', l: 'Days of cover', num: true, f: v => v == null ? '—' : n0(v) }, { k: 'value', l: 'Value', num: true, f: v => usd(v) }], shownRows, { def: { k: 'onHand', d: 'desc' }, foot: { part: 'Total', onHand: tot.onHand, avail: tot.avail, sold30: sum(rows, r => r.sold30), value: tot.value } }),
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
// ================= Deals & Promotions =================
/* Deals & Promotions tab.
 * Sources: Amazon order items (PromotionIds per sale, SP-API), Wayfair order lines (wholesale paid vs base cost = funded discount)
 * + Wayfair sale event per PO line (supplier-order API, when available), and the promotion list captured weekly from
 * Seller Central › Manage Promotions and Partner Home › Promotions (data.promos). Every sale is attributed to one promotion:
 * Amazon by promotion ID, Wayfair by sale event (API) or else by the shortest event window that covers the order date. */
const PR_BANDS = [[0, 0.005, 'Full price'], [0.005, 0.15, '1–15%'], [0.15, 0.25, '15–25%'], [0.25, 0.35, '25–35%'], [0.35, 0.45, '35–45%'], [0.45, 1.01, '45%+']];
const PR_STATE = { live: ['Live', 'good'], upcoming: ['Upcoming', 'tt'], open: ['Open for submission', 'warn'], ended: ['Ended', ''] };
const chName = c => c === 'amz' ? 'Amazon' : c === 'wf' ? 'Wayfair' : 'All channels';

function promoModel() {
  if (promoModel.c && promoModel.c.M === M) return promoModel.c;
  const PD = D.promos || { items: [], calendar: [] }, today = M.today;
  const items = (PD.items || []).map(p => ({ ...p, optOut: /opt out/i.test(p.name), state: p.end < today ? 'ended' : p.start > today ? (/open/i.test(p.status || '') ? 'open' : 'upcoming') : 'live' }));
  const cal = (PD.calendar || []).map(c => ({ ...c, state: c.end < today ? 'ended' : c.start > today ? 'upcoming' : 'live' }));
  const saleBy = new Map((((D.wf && D.wf.sale) || []).filter(r => r[4])).map(r => [r[0] + '|' + r[1], r]));
  const byName = new Map(items.map(p => [p.name.toLowerCase(), p]));
  const wfEv = items.filter(p => p.ch === 'wf' && !p.optOut);
  const cover = d => wfEv.filter(p => d >= p.start && d <= p.end).sort((a, b) => diffDays(a.start, a.end) - diffDays(b.start, b.end));
  const contrib = x => x.net - x.dda - x.cg - x.amzFee - (x.mcf || 0) - x.cogs;
  // one row per order line (FIFO pieces added back together)
  const sales = [];
  for (const [, ps] of groupBy(M.pieces.filter(x => x.ok && !x.tt), x => x.ch + '|' + x.po + '|' + x.part)) {
    const l = ps[0], qty = sum(ps, x => x.qty), rev = sum(ps, x => x.rev), net = sum(ps, x => x.net), promo = sum(ps, x => x.promo);
    let pid = null, how = 'no promotion';
    if (l.ch === 'amz') {
      const ids = String(l.promoIds || '').split('|').filter(Boolean), hit = items.find(p => p.ch === 'amz' && p.match && ids.some(id => id.startsWith(p.match)));
      if (hit) { pid = hit.id; how = 'promotion ID on the Amazon order'; } else if (promo > 0.005) how = 'discount, promotion not identified';
    } else {
      const s = saleBy.get(l.po + '|' + l.part), named = s && byName.get(String(s[4]).toLowerCase());
      if (named) { pid = named.id; how = 'Wayfair sale event on the PO'; }
      else if (promo > 0.005) { const c = cover(l.date)[0]; if (c) { pid = c.id; how = 'event running on the order date'; } else how = 'discount outside any listed event'; }
    }
    sales.push({ ch: l.ch, po: l.po, part: l.part, date: l.date, dow: l.dow, qty, rev, net, promo, depth: rev ? promo / rev : 0, contrib: sum(ps, contrib), pid, how, ev: (saleBy.get(l.po + '|' + l.part) || [])[4] || '' });
  }
  // effective selling days of each promotion = days on which it was the promotion that sales were attributed to
  const effDays = p => { if (p.start > today) return 0; let n = 0; const end = p.end < today ? p.end : today;
    for (let d = p.start; d <= end; d = addDays(d, 1)) { if (p.ch === 'amz' || (cover(d)[0] || {}).id === p.id) n++; } return n; };
  const chFirst = ch => (sales.filter(s => s.ch === ch).map(s => s.date).sort()[0]) || today;
  const chAvg = {}; for (const ch of ['wf', 'amz']) { const n = diffDays(chFirst(ch), today) + 1; chAvg[ch] = n > 0 ? sum(sales.filter(s => s.ch === ch), s => s.qty) / n : 0; }
  for (const p of items) {
    const ss = sales.filter(s => s.pid === p.id), days = effDays(p), units = sum(ss, s => s.qty), rev = sum(ss, s => s.rev), promo = sum(ss, s => s.promo);
    p.s = { orders: new Set(ss.map(s => s.po)).size, units, rev, net: sum(ss, s => s.net), promo, contrib: sum(ss, s => s.contrib), depth: rev ? promo / rev : null, days, upd: days ? units / days : null, lift: days && chAvg[p.ch] ? (units / days) / chAvg[p.ch] - 1 : null, skus: [...new Set(ss.map(s => s.part))] };
  }
  // unit economics at any discount depth (next unit's FIFO landed cost)
  const nextCost = part => { const L = M.layers[part] || []; const ly = L.find(x => x.left > 0) || L[L.length - 1]; return ly ? ly.cogs : 0; };
  const amzPrice = part => { const r = sales.filter(s => s.ch === 'amz' && s.part === part && s.qty).sort((a, b) => b.date.localeCompare(a.date))[0]; return r ? r.rev / r.qty : 0; };
  const econ = (ch, part) => {
    const P = M.P[part] || {}, c = nextCost(part);
    if (ch === 'wf') { const b = P.base || 0; if (!b) return null; const f = M.cgFee(part), k = b * (1 - M.A.dda);
      return { ch, part, list: b, retail: P.retail || b * 2, cost: c, fee: f, be: 1 - (f + c) / k, safe: 1 - (f + c + 0.10 * b) / k, at: d => b * (1 - d) * (1 - M.A.dda) - f - c }; }
    const pr = amzPrice(part); if (!pr) return null; const r = M.A.amzFeeRate || 0.055, mcf = M.A.amzMcf || 0, k = pr * (1 - r);
    return { ch, part, list: pr, retail: pr, cost: c, fee: mcf, be: 1 - (mcf + c) / k, safe: 1 - (mcf + c + 0.10 * pr) / k, at: d => pr * (1 - d) * (1 - r) - mcf - c };
  };
  // stock, pace and free-storage clock per SKU (stock is shared by both channels)
  const inv = {}; for (const r of (D.wf && D.wf.inv) || []) inv[r[0]] = { onHand: +r[2] || 0, avail: +r[3] || 0 };
  const v30 = {}; for (const s of sales) if (s.date > addDays(today, -30)) v30[s.part] = (v30[s.part] || 0) + s.qty;
  const freeLeft = part => { const ly = (M.layers[part] || []).find(x => x.left > 0); if (!ly) return null; const po = M.pos.find(p => p.id === ly.po); const fi = po && freeInfo(po); return fi ? { po: po.id, left: fi.left, end: fi.end } : null; };
  const out = { M, items, cal, sales, chAvg, econ, inv, v30, freeLeft, today, at: PD.at, src: PD.src };
  promoModel.c = out; return out;
}

// ---------- charts ----------
function promoGantt(m) {
  const today = m.today, w = Math.max(CW('full'), 760), LW = Math.min(250, w * 0.3), R = 12, T = 34, RH = 26;
  const rows = [];
  const push = (label, sub, list, kind) => rows.push({ label, sub, list, kind });
  const amz = m.items.filter(p => p.ch === 'amz'), wf = m.items.filter(p => p.ch === 'wf').sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  if (S.platform !== 'wf') { for (const p of amz) push(p.name, p.type + ' · ' + (p.terms || ''), [p], 'promo'); }
  if (S.platform !== 'amz') for (const p of wf) push(p.name.replace(/^\[Opt Out\] /, '(opted out) '), p.type, [p], 'promo');
  for (const c of m.cal.filter(c => S.platform === 'all' || c.ch === 'all' || c.ch === S.platform)) push(c.name, chName(c.ch) + (c.confirmed ? ' · confirmed' : ' · expected'), [c], 'cal');
  if (!rows.length) return '<div class="empty">No promotions on file</div>';
  const starts = rows.flatMap(r => r.list.map(p => p.start)).sort();
  const x0 = [starts[0], addDays(today, -125)].sort().pop(), x1 = addDays(today, 95), span = diffDays(x0, x1);
  for (let i = rows.length - 1; i >= 0; i--) { const p = rows[i].list[0]; if (p.start > x1 || p.end < x0) rows.splice(i, 1); }
  const X = d => LW + (Math.max(0, Math.min(span, diffDays(x0, d))) / span) * (w - LW - R);
  const h = T + rows.length * RH + 8, C = SER();
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" class="gantt"><defs><pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="color-mix(in srgb, ${C[3]} 18%, transparent)"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C[3]}" stroke-width="2" stroke-opacity=".55"/></pattern></defs><g class="grid">`;
  for (let d = x0.slice(0, 8) + '01'; d <= x1; d = addDays(d.slice(0, 8) + '28', 4).slice(0, 8) + '01') { if (d < x0) continue; const x = X(d); s += `<line x1="${x}" x2="${x}" y1="${T - 8}" y2="${h - 4}"/><text x="${x + 4}" y="${T - 14}">${esc(new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }))}</text>`; }
  s += `</g>`;
  rows.forEach((r, i) => {
    const y = T + i * RH, p = r.list[0], cy = y + RH / 2;
    if (i % 2 === 0) s += `<rect x="0" y="${y}" width="${w}" height="${RH}" fill="var(--glass-thin)"/>`;
    s += `<text x="8" y="${cy + 4}" class="g-lbl">${esc(r.label.length > 38 ? r.label.slice(0, 37) + '…' : r.label)}</text>`;
    const xa = X(p.start), xb = Math.max(X(addDays(p.end, 1)), xa + 3), st = r.kind === 'cal' ? 'cal' : p.state;
    const fill = st === 'cal' ? 'url(#hatch)' : st === 'live' ? C[0] : st === 'ended' ? 'var(--axis)' : st === 'open' ? 'transparent' : C[1];
    const ps = p.s || {};
    const tipR = r.kind === 'cal' ? [['Channel', chName(p.ch)], ['Dates', dLong(p.start) + ' – ' + dLong(p.end)], ['Status', p.confirmed ? 'Confirmed' : 'Expected — date not announced yet'], ...(p.note ? [['Note', p.note]] : [])]
      : [['Channel', chName(p.ch)], ['Type', p.type], ['Dates', dLong(p.start) + ' – ' + dLong(p.end)], ['Status', (PR_STATE[p.state] || [p.status])[0]], ...(p.terms ? [['Terms', p.terms]] : []), ...(p.skuCount ? [['SKUs submitted', String(p.skuCount)]] : []), ...(p.recommended ? [['SKUs recommended by Wayfair', String(p.recommended)]] : []), ...(p.deadline ? [['Submission deadline', dLong(p.deadline)]] : []),
        ['Orders · units', `${n0(ps.orders || 0)} · ${n0(ps.units || 0)}`], ['Revenue', usd(ps.rev || 0)], ['Avg discount', pct(ps.depth, 1)], ['Contribution', usd(ps.contrib || 0)]];
    s += `<g data-tip="${esc(tipRows(p.name, tipR))}"><rect class="hit" x="${LW}" y="${y}" width="${w - LW}" height="${RH}"/><rect x="${xa}" y="${y + 6}" width="${xb - xa}" height="${RH - 12}" rx="5" fill="${fill}" ${st === 'open' ? `stroke="${C[1]}" stroke-width="1.6" stroke-dasharray="4 3"` : ''} ${st === 'ended' ? 'fill-opacity=".7"' : ''}/>`;
    if (p.deadline && p.deadline >= x0) { const xd = X(p.deadline); s += `<path d="M${xd},${cy - 6}l5,6l-5,6l-5,-6z" fill="${p.deadline < today ? 'var(--axis)' : 'var(--crit)'}"/>`; }
    for (const o of m.sales.filter(o => o.pid === p.id && o.date >= x0)) s += `<circle cx="${X(o.date) + 2}" cy="${cy}" r="${Math.min(7, 2.5 + o.qty)}" fill="var(--ink)" fill-opacity=".72" stroke="var(--glass-strong)" stroke-width="1.5"/>`;
    s += `</g>`;
  });
  const xt = X(today); s += `<line x1="${xt}" x2="${xt}" y1="${T - 8}" y2="${h - 4}" stroke="var(--crit)" stroke-width="1.5"/><text x="${xt + 4}" y="${h - 6}" class="g-today">Today</text></svg>`;
  const lg = [['Live', C[0]], ['Upcoming / submitted', C[1]], ['Ended', 'var(--axis)']];
  return `<div class="chart gantt-wrap">${s}</div><div class="legend">${lg.map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}<span><i style="background:transparent;border:1.5px dashed ${C[1]}"></i>Open for submission</span><span><i style="background:url(#hatch);background:color-mix(in srgb, ${C[3]} 30%, transparent)"></i>Retail calendar</span><span><i style="background:var(--crit);transform:rotate(45deg);border-radius:1px"></i>Submission deadline</span><span><i style="background:var(--ink);border-radius:50%"></i>Order (size = units)</span></div>`;
}

function promoDaily(m, f, t) {
  const w = CW('full'), h = 260, L = 40, R = 10, T = 14, B = 28, C = SER(), days = daysOf(f, t);
  const ss = m.sales.filter(s => s.date >= f && s.date <= t && (S.platform === 'all' || s.ch === S.platform) && passProd(s.part));
  const by = groupBy(ss, s => s.date), wfU = d => sum((by.get(d) || []).filter(s => s.ch === 'wf'), s => s.qty), amU = d => sum((by.get(d) || []).filter(s => s.ch === 'amz'), s => s.qty);
  const mx = nice(Math.max(1, ...days.map(d => wfU(d) + amU(d))), 3), cw = w - L - R, ch = h - T - B, band = cw / days.length, bw = Math.max(2, Math.min(18, band * 0.7));
  const y = v => T + ch - v / mx.max * ch, X = d => L + diffDays(f, d) * band;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><g class="grid">`;
  for (let v = 0; v <= mx.max + 1e-9; v += mx.step) s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  s += `</g>`;
  // shaded windows: short events (≤ 7 days) and confirmed retail events
  const wins = [...m.items.filter(p => !p.optOut && diffDays(p.start, p.end) <= 6 && (S.platform === 'all' || p.ch === S.platform)), ...m.cal.filter(c => c.confirmed && (S.platform === 'all' || c.ch === 'all' || c.ch === S.platform))];
  for (const p of wins) { if (p.end < f || p.start > t) continue; const a = X(p.start < f ? f : p.start), b = X(addDays(p.end > t ? t : p.end, 1));
    s += `<g data-tip="${esc(tipRows(p.name, [['Dates', dLong(p.start) + ' – ' + dLong(p.end)], ['Channel', chName(p.ch)]]))}"><rect x="${a}" y="${T}" width="${b - a}" height="${ch}" fill="color-mix(in srgb, ${C[1]} 14%, transparent)"/></g>`; }
  days.forEach(d => { const a = wfU(d), b = amU(d), x = X(d) + (band - bw) / 2, lst = by.get(d) || [];
    if (!a && !b) return;
    s += `<g data-tip="${esc(tipRows(dLong(d), [['Wayfair units', n0(a), C[0]], ['Amazon units', n0(b), C[2]], ['Avg discount', pct(sum(lst, s => s.promo) / (sum(lst, s => s.rev) || 1), 1)], ['Promotions', [...new Set(lst.map(s => (m.items.find(p => p.id === s.pid) || {}).name).filter(Boolean))].join(', ') || '—']]))}"><rect class="hit" x="${X(d)}" y="${T}" width="${band}" height="${ch}"/>`;
    if (a) s += `<path d="${rr(x, y(a), bw, y(0) - y(a), 3)}" fill="${C[0]}"/>`;
    if (b) s += `<path d="${rr(x, y(a + b), bw, y(a) - y(a + b) - (a ? 2 : 0), 3)}" fill="${C[2]}"/>`;
    s += `</g>`; });
  const step = Math.ceil(days.length / Math.max(2, Math.floor(cw / 70)));
  days.forEach((d, i) => { if (i % step === 0) s += `<text x="${X(d) + band / 2}" y="${h - 8}" text-anchor="middle" class="g-axis">${esc(dShort(d))}</text>`; });
  s += `<line class="axis" x1="${L}" x2="${w - R}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  return `<div class="chart">${s}</div><div class="legend"><span><i style="background:${C[0]}"></i>Wayfair units</span><span><i style="background:${C[2]}"></i>Amazon units</span><span><i style="background:color-mix(in srgb, ${C[1]} 30%, transparent)"></i>Short event / Black Friday window</span></div>`;
}

function promoScatter(m, ss) {
  if (!ss.length) return '<div class="empty">No sales</div>';
  const w = CW('half'), h = 300, L = 56, R = 12, T = 14, B = 34, C = SER();
  const ys = ss.map(s => s.qty ? s.contrib / s.qty : 0), lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), pad = (hi - lo) * 0.1 || 10;
  const xmax = Math.max(0.5, Math.ceil(Math.max(...ss.map(s => s.depth)) * 10 + 0.5) / 10), y0 = lo - pad, y1 = hi + pad;
  const X = d => L + d / xmax * (w - L - R), Y = v => T + (y1 - v) / (y1 - y0) * (h - T - B);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><g class="grid">`;
  for (let d = 0; d <= xmax + 1e-9; d += 0.1) s += `<line x1="${X(d)}" x2="${X(d)}" y1="${T}" y2="${h - B}"/><text x="${X(d)}" y="${h - B + 16}" text-anchor="middle">${Math.round(d * 100)}%</text>`;
  const st = nice((y1 - y0), 4).step; for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) s += `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${esc(usd(v))}</text>`;
  s += `</g><line x1="${L}" x2="${w - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--crit)" stroke-dasharray="4 3"/><text x="${w - R}" y="${Y(0) - 5}" text-anchor="end" class="g-axis" style="fill:var(--crit-ink)">break-even</text>`;
  for (const o of ss) { const v = o.qty ? o.contrib / o.qty : 0, P = m.items.find(p => p.id === o.pid);
    s += `<circle cx="${X(o.depth)}" cy="${Y(v)}" r="${Math.min(9, 4 + o.qty)}" fill="${o.ch === 'amz' ? C[2] : C[0]}" fill-opacity=".8" stroke="var(--glass-strong)" stroke-width="2" data-tip="${esc(tipRows(o.part + ' · ' + dLong(o.date), [['Channel', chName(o.ch)], ['Discount', pct(o.depth, 1)], ['Units', n0(o.qty)], ['Net / unit', usd(o.net / (o.qty || 1), 2)], ['Contribution / unit', usd(v, 2)], ['Promotion', P ? P.name : '—'], ['Matched by', o.how]]))}"/>`; }
  s += `<text x="${(L + w - R) / 2}" y="${h - 4}" text-anchor="middle" class="g-axis">Discount off list price</text></svg>`;
  return `<div class="chart">${s}</div><div class="legend"><span><i style="background:${C[0]}"></i>Wayfair order</span><span><i style="background:${C[2]}"></i>Amazon order</span><span>Dot size = units · y = contribution per unit after fees and landed cost (before ads)</span></div>`;
}

// ---------- recommendations ----------
function promoPlan(m) {
  const today = m.today, plan = [], ins = [];
  const C = (ch, part) => m.econ(ch, part);
  const wfParts = Object.keys(M.P).filter(k => M.P[k].base && passProd(k));
  const cover = part => { const v = (m.v30[part] || 0) / 30, st = (m.inv[part] || {}).onHand || 0; return { st, v, days: v ? st / v : (st ? Infinity : 0) }; };
  const shortWf = m.items.filter(p => p.ch === 'wf' && !p.optOut && p.state === 'ended' && diffDays(p.start, p.end) <= 6);
  const longWf = m.items.filter(p => p.ch === 'wf' && !p.optOut && diffDays(p.start, p.end) > 30 && p.s.days);
  const upd = L => { const d = sum(L, p => p.s.days); return d ? sum(L, p => p.s.units) / d : 0; };
  const shortUpd = upd(shortWf), longUpd = upd(longWf);
  const wfShortSales = m.sales.filter(s => s.ch === 'wf' && shortWf.some(p => p.id === s.pid));
  const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
  const evDepth = med(wfShortSales.map(s => s.depth)) ?? 0.3;
  if (shortUpd && longUpd) ins.push(`Short Wayfair events (2–5 days) sell <b>${shortUpd.toFixed(2)} units/day</b> vs <b>${longUpd.toFixed(2)}</b> on the always-on events — ${shortUpd > longUpd ? `${(shortUpd / longUpd).toFixed(1)}× more. Join every short event you qualify for.` : 'no better, so deep short events are not worth their margin.'}`);
  // 1) Wayfair events open for submission
  for (const ev of m.items.filter(p => p.ch === 'wf' && p.state === 'open' && S.platform !== 'amz')) {
    const go = [], skip = [];
    for (const part of wfParts) { const e = C('wf', part), cv = cover(part); if (!e || !cv.st) continue; (e.at(evDepth) > 0 ? go : skip).push({ part, e, cv }); }
    go.sort((a, b) => b.e.at(evDepth) - a.e.at(evDepth));
    const days = diffDays(ev.start, ev.end) + 1, estU = shortUpd * days, avgC = go.length ? sum(go, g => g.e.at(evDepth)) / go.length : 0, dl = diffDays(today, ev.deadline);
    plan.push({ pri: dl <= 7 ? 1 : 2, when: `Submit by ${dLong(ev.deadline)} (${dl} days) · runs ${dLong(ev.start)} – ${dLong(ev.end)}`, ch: 'wf', action: `Join "${ev.name}"`, skus: go.slice(0, 12).map(g => g.part), depth: `≤ ${pct(evDepth)}`,
      why: `Wayfair recommends ${ev.recommended || 'some'} SKUs. At ${pct(evDepth)} off (your median in past short events) these ${go.length} in-stock SKUs still earn money.${skip.length ? ` Keep out ${skip.map(g => g.part).join(', ')} — loses money at that depth (break-even ${skip.map(g => pct(Math.max(0, g.e.be))).join(', ')}).` : ''}`,
      impact: `≈ ${n0(Math.max(1, estU))} unit${Math.round(estU) > 1 ? 's' : ''} · ${usd(Math.max(1, estU) * avgC)} contribution` });
  }
  // 2) depth above break-even on live / upcoming promotions
  const live = m.items.filter(p => p.state === 'live' || p.state === 'upcoming');
  const deep = {};
  for (const s of m.sales.filter(s => s.date > addDays(today, -21) && s.pid)) { const e = C(s.ch, s.part); if (e && s.depth > e.be + 0.005) { const k = s.ch + '|' + s.part; (deep[k] = deep[k] || { ch: s.ch, part: s.part, e, n: 0, loss: 0, d: [] }); deep[k].n += s.qty; deep[k].loss += s.contrib; deep[k].d.push(s.depth); } }
  for (const g of Object.values(deep)) {
    if (S.platform !== 'all' && g.ch !== S.platform) continue;
    if (g.ch === 'amz' && m.items.some(p => p.ch === 'amz' && p.state === 'live' && diffDays(today, p.end) <= 14 && (p.skus || []).includes(g.part))) continue;
    const evs = live.filter(p => p.ch === g.ch && (p.ch === 'wf' || (p.skus || []).includes(g.part))).map(p => p.name);
    plan.push({ pri: 1, when: 'Now', ch: g.ch, action: g.ch === 'amz' ? `Reduce the Amazon discount on ${g.part}` : `Cap the funded discount on ${g.part}`, skus: [g.part], depth: `≤ ${pct(Math.max(0, g.e.safe))} (break-even ${pct(Math.max(0, g.e.be))})`,
      why: `Sold ${n0(g.n)} units in the last 3 weeks at ${pct(Math.min(...g.d))}–${pct(Math.max(...g.d))} off, above break-even: ${usd(Math.abs(g.loss))} of contribution lost. ${g.ch === 'wf' ? `In Partner Home › Promotions › ${evs.slice(0, 2).join(' / ') || 'the event'} › Manage Products, lower its discount or remove it.` : 'Coupons stack with Buy X Get Y; keep the combined discount under break-even or raise the list price.'}`,
      impact: `Stops ≈ ${usd(-g.loss / Math.max(1, g.n))} loss per unit` });
  }
  // 3) Amazon coupon / promotion ending soon
  for (const p of m.items.filter(p => p.ch === 'amz' && p.state === 'live' && diffDays(today, p.end) <= 14 && S.platform !== 'wf')) {
    const part = (p.skus || [])[0], e = part && C('amz', part); if (!e) continue;
    const safe = Math.max(0, Math.floor(e.safe * 20) / 20), atCur = e.at(p.disc || 0);
    plan.push({ pri: 2, when: `Before ${dLong(p.end)}`, ch: 'amz', action: atCur < 0 ? `Don't renew "${p.name}" at ${pct(p.disc)}` : `Renew "${p.name}" for the holidays`, skus: [part], depth: safe >= 0.05 ? `Coupon ${pct(safe)}` : 'No coupon',
      why: `${(() => { const L = m.sales.filter(x => x.pid === p.id); return L.length ? `${n0(sum(L, x => x.qty))} units sold with it so far (${usd(sum(L, x => x.contrib))} contribution). ` : ''; })()}At ${pct(p.disc)} off each unit ${atCur < 0 ? 'loses' : 'earns'} ${usd(Math.abs(atCur), 2)} after referral fee, Multichannel fulfillment and landed cost (+$5 + 2.5% coupon fee). ${safe >= 0.05 ? `A ${pct(safe)} coupon keeps ~10% margin` : 'Even a 5% coupon would not leave a 10% margin — rely on ads/visibility instead of discount'}${(m.items.find(x => x.id === 'amz-bxgy') || {}).state === 'live' ? '; "buy 2 save 15%" runs until 31 Dec for multi-unit orders.' : '.'}`,
      impact: `${usd(e.at(safe), 2)} per unit at ${pct(safe)}` });
  }
  // 4) free-storage clock: clear stock before CastleGate storage fees start
  const lots = {};
  for (const part of wfParts) { const fl = m.freeLeft(part), cv = cover(part); if (!fl || fl.left > 75 || fl.left < 0) continue; const left = cv.st - cv.v * fl.left; if (left < 1) continue; (lots[fl.po] = lots[fl.po] || { fl, parts: [] }).parts.push({ part, left, cv, e: C('wf', part) }); }
  for (const { fl, parts } of Object.values(lots)) {
    parts.sort((a, b) => b.left - a.left); const ok = parts.filter(x => x.e && x.e.safe > 0.15);
    if (S.platform === 'amz') continue;
    plan.push({ pri: fl.left <= 30 ? 1 : 2, when: `Before ${dLong(fl.end)} (${fl.left} free days left on ${fl.po})`, ch: 'wf', action: 'Clearance push on slow stock', skus: ok.slice(0, 8).map(x => x.part), depth: ok.length ? `${pct(Math.min(...ok.map(x => Math.max(0, x.e.safe))))}–${pct(Math.max(...ok.map(x => Math.max(0, x.e.safe))))} (per-SKU safe max)` : '—',
      why: `At the current pace about ${n0(sum(parts, x => x.left))} units will still be in CastleGate when storage fees start (from day 91: $0.44/ft³/month, rising to $1.40 after 9 months). Use a "72 Hour Clearout"/Clearance event or a deeper Cyber Month price on these SKUs only.`,
      impact: `Moves up to ${n0(sum(ok.slice(0, 8), x => x.left))} units before fees` });
  }
  // 5) do not discount SKUs that are about to run out
  const lowCover = wfParts.filter(part => { const cv = cover(part); return cv.st > 0 && cv.days < 21; });
  if (lowCover.length && S.platform !== 'amz') plan.push({ pri: 3, when: 'Now', ch: 'wf', action: 'Take low-stock SKUs out of deep events', skus: lowCover, depth: 'Full price / shallow', why: `Under 3 weeks of stock at the current pace — discounting only sells out faster at lower margin.`, impact: 'Protects margin on the last units' });
  // 6) retail calendar ahead
  for (const c of m.cal.filter(c => c.state === 'upcoming' && diffDays(today, c.start) <= 100 && (S.platform === 'all' || c.ch === 'all' || c.ch === S.platform))) {
    const a = /shipping/i.test(c.name) ? ['Push ads, not discounts', 'Last delivery-by-Christmas window: raise ad budgets on in-stock SKUs and keep current promotions; deeper discounts after this week mostly win January deliveries.']
      : /clearance|after-christmas/i.test(c.name) ? ['Clear aged and slow stock', 'Customers expect clearance pricing; use it for SKUs with the most stock cover and the shortest free-storage clock, not best sellers.']
      : /prime day/i.test(c.name) ? ['Plan a Prime-exclusive discount', 'Needs a 30-day price history and inventory; set the list price now so the deal price is credible.']
      : ['Prepare the event', 'Submit when Wayfair opens it (usually 3–5 weeks ahead) with SKUs that stay above break-even at ~30% off.'];
    plan.push({ pri: 3, when: `${dLong(c.start)} – ${dLong(c.end)}${c.confirmed ? '' : ' (expected)'}`, ch: c.ch, action: `${c.name}: ${a[0]}`, skus: [], depth: '—', why: a[1], impact: '' });
  }
  plan.sort((a, b) => a.pri - b.pri);
  return { plan, ins, evDepth, shortUpd, longUpd };
}

function viewPromos() {
  const m = promoModel(), [f, t] = range(), today = m.today;
  const passCh = x => S.platform === 'all' || x.ch === S.platform || x.ch === 'all';
  const all = m.sales.filter(s => passCh(s) && passProd(s.part)), cur = all.filter(s => s.date >= f && s.date <= t);
  const [pf, pt] = prevRange(), prev = all.filter(s => s.date >= pf && s.date <= pt);
  const tot = L => ({ rev: sum(L, s => s.rev), promo: sum(L, s => s.promo), units: sum(L, s => s.qty), onPromo: sum(L.filter(s => s.promo > 0.005), s => s.rev), c: sum(L, s => s.contrib), cPromo: sum(L.filter(s => s.promo > 0.005), s => s.contrib), uPromo: sum(L.filter(s => s.promo > 0.005), s => s.qty) });
  const a = tot(cur), b = tot(prev), items = m.items.filter(passCh);
  const liveN = items.filter(p => p.state === 'live' && !p.optOut), upN = items.filter(p => p.state === 'upcoming' || p.state === 'open'), nextDl = items.filter(p => p.deadline && p.deadline >= today).sort((x, y) => x.deadline.localeCompare(y.deadline))[0];
  const per = period(f, t), promoFees = per.a.amzPromoFee || 0;
  const pl = promoPlan(m);
  // insights
  const ins = [...pl.ins];
  const bandOf = d => PR_BANDS.find(([lo, hi]) => d >= lo && d < hi)[2];
  const byBand = groupBy(all, s => bandOf(s.depth));
  const bandRows = PR_BANDS.map(([, , l]) => { const L = byBand.get(l) || []; const u = sum(L, s => s.qty); return { l, u, orders: L.length, c: u ? sum(L, s => s.contrib) / u : null, rev: sum(L, s => s.rev) }; });
  const topBand = [...bandRows].sort((x, y) => y.u - x.u)[0];
  if (topBand && topBand.u) ins.push(`Most units sold at <b>${topBand.l} off</b> (${n0(topBand.u)} of ${n0(sum(bandRows, r => r.u))} units), earning ${usd(topBand.c, 2)} per unit. ${(() => { const best = bandRows.filter(r => r.u >= 2 && r.c != null).sort((x, y) => y.c * y.u - x.c * x.u)[0]; return best && best.l !== topBand.l ? `The most total contribution came from <b>${best.l}</b> (${usd(best.c * best.u)}).` : ''; })()}`);
  const evDone = items.filter(p => p.s && p.s.days && !p.optOut && p.ch !== 'all');
  const bestEv = [...evDone].filter(p => p.s.units).sort((x, y) => y.s.upd - x.s.upd)[0]; if (bestEv) ins.push(`Best promotion by pace: <b>${esc(bestEv.name)}</b> — ${bestEv.s.upd.toFixed(2)} units/day${bestEv.s.lift != null ? ` (${bestEv.s.lift >= 0 ? '+' : ''}${pct(bestEv.s.lift)} vs the channel's average day)` : ''}, ${usd(bestEv.s.contrib)} contribution.`);
  const losers = evDone.filter(p => p.s.contrib < -0.5); if (losers.length) ins.push(`${losers.length} promotion${losers.length > 1 ? 's' : ''} lost money after fees and landed cost: ${losers.map(p => `<b>${esc(p.name)}</b> (${usd(p.s.contrib)})`).join(', ')}.`);
  const dead = items.filter(p => p.ch === 'wf' && !p.optOut && p.state !== 'open' && p.s.days >= 2 && !p.s.units); if (dead.length) ins.push(`${dead.length} Wayfair events had no attributed sale (${dead.map(p => esc(p.name.replace(/ - .*$/, ''))).join(', ')}) — overlapping events split the same traffic; the discount, not the event count, drives demand.`);
  const amzS = all.filter(s => s.ch === 'amz'); if (amzS.length && S.platform !== 'wf') { const used = amzS.filter(s => s.pid); ins.push(`Amazon: ${used.length} of ${amzS.length} orders used a promotion (${amzS.filter(s => s.pid === 'amz-coupon25').length} coupon, ${amzS.filter(s => s.pid === 'amz-bxgy').length} buy-2-save-15%). Seller Central still shows 0 coupon redemptions — its report lags the order data.`); }
  const noSale = Object.keys(M.P).filter(k => M.P[k].base && passProd(k) && !all.some(s => s.part === k) && (m.inv[k] || {}).onHand > 0); if (noSale.length && S.platform !== 'amz') ins.push(`${noSale.length} in-stock SKUs never sold despite being in every event (${noSale.slice(0, 8).join(', ')}${noSale.length > 8 ? '…' : ''}) — check content, reviews and retail price before adding more discount.`);
  ins.push(`Sample size: ${n0(all.length)} order lines since ${dLong(m.sales.map(s => s.date).sort()[0] || today)} — treat price-response readings as directional until there are more orders.`);

  // ladder per SKU × channel
  const ladder = [];
  for (const [k, L] of groupBy(all, s => s.ch + '|' + s.part)) { const [ch, part] = k.split('|'), e = m.econ(ch, part); if (!e) continue; const ds = L.map(s => s.depth).sort((x, y) => x - y), last = [...L].sort((x, y) => y.date.localeCompare(x.date))[0];
    ladder.push({ part, ch, list: e.list, cust: ch === 'wf' ? e.retail * (1 - last.depth) : e.list * (1 - last.depth), cost: e.cost + e.fee, units: sum(L, s => s.qty), dmin: ds[0], dmed: ds[Math.floor(ds.length / 2)], dmax: ds[ds.length - 1], last: last.depth, be: e.be, safe: e.safe, cpu: sum(L, s => s.contrib) / (sum(L, s => s.qty) || 1), stock: (m.inv[part] || {}).onHand || 0 }); }
  for (const part of Object.keys(M.P)) if (M.P[part].base && passProd(part) && S.platform !== 'amz' && !ladder.some(r => r.part === part && r.ch === 'wf')) { const e = m.econ('wf', part); if (e) ladder.push({ part, ch: 'wf', list: e.list, cust: null, cost: e.cost + e.fee, units: 0, dmin: null, dmed: null, dmax: null, last: null, be: e.be, safe: e.safe, cpu: null, stock: (m.inv[part] || {}).onHand || 0 }); }
  const stTag = r => r.dmed == null ? '<span class="tag">No sales</span>' : r.last > r.be + 0.005 ? '<span class="tag bad">Over break-even</span>' : r.last > r.safe ? '<span class="tag warn">Thin margin</span>' : '<span class="tag good">Healthy</span>';
  const chTag = v => `<span class="tag ${v === 'amz' ? 'tt' : ''}">${chName(v)}</span>`;

  // promotion performance table
  const perf = items.filter(p => p.s).map(p => ({ ...p, ...p.s, period: p.start, stateL: (PR_STATE[p.state] || [p.status])[0], cpu: p.s.units ? p.s.contrib / p.s.units : null }));
  const stCell = (v, r) => `<span class="tag ${(PR_STATE[r.state] || [])[1] || ''}">${esc(v)}</span>`;
  const dlAlert = items.filter(p => p.state === 'open' && p.deadline).map(p => `<div class="alert ${diffDays(today, p.deadline) <= 7 ? 'crit' : 'warn'}"><span class="ic">⏱</span><div><b>${esc(p.name)}: submission closes ${dLong(p.deadline)} (${diffDays(today, p.deadline)} days)</b><span>Runs ${dLong(p.start)} – ${dLong(p.end)} · Wayfair recommends ${p.recommended || '—'} of your SKUs · Partner Home › Promotions.</span></div></div>`).join('');

  const planRows = pl.plan.map((r, i) => ({ ...r, i, skuTxt: r.skus.join(', ') }));
  return `${pageHead('Deals &amp; Promotions', `${rangeText()} · promotion list as of ${dLong(m.at || today)} (Seller Central + Partner Home, refreshed weekly) · sales matched to promotions automatically every 15 minutes`)}
  <div class="grid g-kpi k3">
    ${kpi('Live promotions', n0(liveN.length), `${liveN.filter(p => p.ch === 'wf').length} Wayfair · ${liveN.filter(p => p.ch === 'amz').length} Amazon`, 'Promotions running today (Amazon coupons, Buy X Get Y; Wayfair sale events you are submitted to).')}
    ${kpi('Upcoming', n0(upN.length), nextDl ? `next deadline <b>${dLong(nextDl.deadline)}</b> · ${esc(nextDl.name.replace(/ - .*$/, ''))}` : 'no open deadlines', 'Submitted events not started yet + events open for submission.')}
    ${kpi('Sales on promotion', pct(a.rev ? a.onPromo / a.rev : null), `${usd(a.onPromo)} of ${usd(a.rev)} revenue · ${n0(a.uPromo)} units`, 'Share of revenue from order lines that carried a discount.')}
    ${kpi('Avg discount', pct(a.rev ? a.promo / a.rev : null, 1), `${delta(a.rev ? a.promo / a.rev : 0, b.rev ? b.promo / b.rev : 0, { invert: true, pp: true })} ${vsPrev()}`, 'Promotion $ ÷ revenue at list price (Wayfair: base cost; Amazon: selling price).')}
    ${kpi('Promotion cost', usd(a.promo + promoFees), `discounts ${usd(a.promo)}${promoFees ? ` + Amazon promo fees ${usd(promoFees)}` : ''}`, 'Seller-funded discounts plus coupon / promotion fees Amazon has billed in the period.')}
    ${kpi('Contribution on promo sales', usd(a.cPromo), `${pct(a.onPromo ? a.cPromo / a.onPromo : null, 1)} of promo revenue · ${usd(a.uPromo ? a.cPromo / a.uPromo : 0, 2)}/unit`, 'NMV − platform fees − Multichannel − landed COGS on discounted sales, before ads.')}
  </div>
  ${dlAlert}
  ${card('Suggested promotion plan', 'Generated from your order history, unit costs, stock cover, the free-storage clock and the event calendar. Recalculated on every data sync.', planRows.length ? `<div class="plan">${planRows.map(r => `<div class="plan-row p${r.pri}"><div class="plan-when"><span class="tag ${r.pri === 1 ? 'bad' : r.pri === 2 ? 'warn' : ''}">${r.pri === 1 ? 'Do now' : r.pri === 2 ? 'This month' : 'Plan ahead'}</span><small>${esc(r.when)}</small></div><div class="plan-body"><b>${esc(r.action)}</b> ${chTag(r.ch)}<p>${r.why}</p>${r.skus.length ? `<div class="plan-skus">${r.skus.map(k => `<span>${esc(k)}</span>`).join('')}</div>` : ''}</div><div class="plan-num"><small>Depth</small><b>${esc(r.depth)}</b>${r.impact ? `<small>Expected</small><b>${esc(r.impact)}</b>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">Nothing to do right now</div>')}
  <section class="card glass insights"><div class="card-head"><div><h3>Insights</h3><p class="sub">What the promotion history says</p></div></div><ul>${ins.map(x => `<li>${x}</li>`).join('')}</ul></section>
  ${card('Promotion calendar', 'Past, live and upcoming promotions on both channels, with each order placed on the promotion it was sold under. Hover a bar for terms and results.', promoGantt(m), { cls: 'big-chart' })}
  ${card('Daily units and promotion windows', 'Selected period · shaded = short events and Amazon Black Friday Week', promoDaily(m, f, t))}
  <div class="grid g-2">
    ${card('Which discount sells', 'Units sold at each discount depth, and what each unit earned there (all history)', vbars(bandRows.map(r => ({ label: r.l, v: r.u, tip: tipRows(r.l + ' off', [['Units', n0(r.u)], ['Order lines', n0(r.orders)], ['Revenue', usd(r.rev)], ['Contribution / unit', r.c == null ? '—' : usd(r.c, 2)]]) })), { h: 210 }) + hbars(bandRows.filter(r => r.u).map(r => ({ label: r.l, v: r.c || 0, sub: ' / unit', tip: tipRows(r.l + ' off', [['Contribution / unit', usd(r.c, 2)], ['Units', n0(r.u)]]) })), { fmt: v => usd(v, 0), color: SER()[3] }))}
    ${card('Discount vs profit per order', 'Every order line: how deep the discount was and what the unit earned', promoScatter(m, all))}
  </div>
  ${card('Promotion performance', 'Units/day uses the days a promotion was the one sales were attributed to (overlapping Wayfair events: the shortest wins). Lift = units/day vs the channel average day.', table('promoperf', [
    { k: 'name', l: 'Promotion', f: (v, r) => `<b>${esc(v)}</b><small class="sub" style="display:block">${esc(r.type)}${r.terms ? ' · ' + esc(r.terms) : ''}</small>` }, { k: 'ch', l: 'Channel', f: chTag },
    { k: 'period', l: 'Dates', f: (v, r) => `${dShort(r.start)} – ${dShort(r.end)}` }, { k: 'stateL', l: 'Status', f: stCell }, { k: 'orders', l: 'Orders', num: true, f: n0 }, { k: 'units', l: 'Units', num: true, f: n0 },
    { k: 'rev', l: 'Revenue', num: true, f: v => usd(v) }, { k: 'promo', l: 'Discount $', num: true, f: v => usd(v) }, { k: 'depth', l: 'Avg depth', num: true, f: v => pct(v, 1) },
    { k: 'upd', l: 'Units / day', num: true, f: v => v == null ? '—' : v.toFixed(2) }, { k: 'lift', l: 'Lift', num: true, neg: true, f: v => v == null ? '—' : (v >= 0 ? '+' : '') + pct(v) },
    { k: 'contrib', l: 'Contribution', num: true, neg: true, f: v => usd(v) }, { k: 'cpu', l: 'Per unit', num: true, neg: true, f: v => v == null ? '—' : usd(v, 2) }], perf, { def: { k: 'period', d: 'desc' } }))}
  ${card('Discount ladder by SKU', 'How deep each SKU can go. Break-even = discount at which a unit stops covering fees and landed cost; Safe max keeps 10% of list price as contribution (room for ads). Customer price for Wayfair ≈ retail × (1 − discount).', table('promoladder', [
    { k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'ch', l: 'Channel', f: chTag }, { k: 'list', l: 'List / base', num: true, f: v => usd(v, 2) }, { k: 'cust', l: 'Customer price (last)', num: true, f: v => v == null ? '—' : usd(v, 2) },
    { k: 'cost', l: 'Cost / unit', num: true, f: v => usd(v, 2) }, { k: 'units', l: 'Units', num: true, f: n0 }, { k: 'dmed', l: 'Depth sold (min · med · max)', num: true, f: (v, r) => v == null ? '—' : `${pct(r.dmin)} · <b>${pct(v)}</b> · ${pct(r.dmax)}` },
    { k: 'last', l: 'Last depth', num: true, f: v => pct(v) }, { k: 'be', l: 'Break-even', num: true, f: v => `<b>${pct(Math.max(0, v))}</b>` }, { k: 'safe', l: 'Safe max', num: true, f: v => pct(Math.max(0, v)) },
    { k: 'cpu', l: 'Contribution / unit', num: true, neg: true, f: v => v == null ? '—' : usd(v, 2) }, { k: 'stock', l: 'Stock', num: true, f: n0 }, { k: 'st', l: 'Status', f: (v, r) => stTag(r) }], ladder, { def: { k: 'units', d: 'desc' } }))}
  <p class="note">How sales are matched: Amazon — promotion IDs on each order item (coupon "PLM-…", Buy X Get Y "Percent Off …"). Wayfair — the sale event on the purchase order when the API returns it, otherwise the shortest event running on the order date; the discount itself is exact (base cost − wholesale paid). Contribution is before ads.</p>`;
}

// ================= Listings & Product Management =================
// Wayfair: Partner Home Product Management (weekly capture → data.wfListing). Amazon: SP-API Listings Items + Product Type
// Definitions + A+ Content, every 6 hours (data.amz.listings). Each listing is scored on a furniture-category checklist.
const WF_IMG = (p, s = 300) => { if (!p) return null; const q = String(p).split('/'), h = q.length === 3 ? q.shift() : '00000000'; return `https://assets.wfcdn.com/im/${h}/resize-h${s}-w${s}%5Ecompr-r85/${q.join('/')}/basic_demo.jpg`; };
const AMZ_IMG = (u, s = 300) => u ? u.replace(/\._[^/]*_\.jpg$/, '.jpg').replace(/\.jpg$/, `._AC_SL${s}_.jpg`) : null;
const SMALL_W = new Set(['a', 'an', 'and', 'or', 'with', 'for', 'of', 'the', 'in', 'on', 'to', 'by', 'x']);
const titleCaseOk = s => !String(s || '').split(/\s+/).some(w => /^[a-z]/.test(w) && !SMALL_W.has(w.toLowerCase()));
function scoreOf(checks) { const k = checks.filter(c => c.ok !== null && c.max), mx = sum(k, c => c.max); return mx ? Math.round(sum(k, c => c.pts) / mx * 100) : null; }
function listingModel() {
  if (listingModel.c && listingModel.c.M === M) return listingModel.c;
  const WL = D.wfListing || { listings: {}, parts: [] }, AL = (D.amz && D.amz.listings) || { rows: [], aplus: [], req: {} };
  const aplusBy = {}; for (const a of AL.aplus || []) for (const asin of a.asins || []) (aplusBy[asin] = aplusBy[asin] || []).push(a);
  const rv = (D.reviews && D.reviews.listings) || {};
  const inv = {}; for (const r of (D.wf && D.wf.inv) || []) inv[r[0]] = +r[2] || 0;
  const amzRows = AL.rows || [], amzBy = new Map(amzRows.map(r => [r.sku, r]));
  const wf = (WL.parts || []).map(p => {
    const [part, status, rev90, units90, conv, launch, listing, visits, impr, imprPct, rating, reviews, img] = p, L = (WL.listings || {})[listing] || {};
    const ck = [
      { k: 'title', g: 'Content', label: 'Product name (Title Case)', max: 10, ok: !!L.name && L.name.length >= 25 && L.name.length <= 150 && titleCaseOk(L.name), detail: L.name ? `${L.name.length} characters${titleCaseOk(L.name) ? '' : ' · not Title Case'}` : 'not captured' },
      { k: 'bullets', g: 'Content', label: 'Feature bullets (8+)', max: 15, pts: L.bullets >= 8 ? 15 : L.bullets >= 6 ? 10 : L.bullets ? 5 : 0, detail: `${L.bullets ?? '—'} bullets` },
      { k: 'desc', g: 'Content', label: 'Description (700+ chars)', max: 10, pts: L.desc >= 700 ? 10 : L.desc >= 450 ? 6 : L.desc ? 3 : 0, detail: `${L.desc ?? '—'} characters` },
      { k: 'imgs', g: 'Media', label: 'Images (12+)', max: 15, ok: L.imgs == null ? null : undefined, pts: L.imgs >= 12 ? 15 : L.imgs >= 8 ? 10 : 4, detail: L.imgs == null ? 'not captured yet' : `${L.imgs} images · ${L.env ?? '?'} lifestyle · ${L.silo ?? '?'} silo · ${L.info ?? '?'} dimension/feature` },
      { k: 'life', g: 'Media', label: 'Lifestyle images (3+)', max: 5, ok: L.env == null ? null : L.env >= 3, detail: L.env == null ? 'not captured yet' : `${L.env} lifestyle` },
      { k: 'video', g: 'Media', label: 'Product video', max: 10, ok: L.video == null ? null : L.video > 0, detail: L.video ? `${L.video} video` : 'no video on the listing' },
      { k: 'req', g: 'Data', label: 'Required attributes', max: 15, pts: Math.max(0, 15 - 5 * (L.reqMissing || []).length), detail: (L.reqMissing || []).length ? 'Empty: ' + L.reqMissing.join(', ') : `all ${L.reqFilled || ''} filled` },
      { k: 'attrw', g: 'Data', label: 'No attribute warnings', max: 5, ok: !L.attrWarn, detail: L.attrWarn ? `${L.attrWarn} attribute warning${L.attrWarn > 1 ? 's' : ''} in Partner Home` : 'none' },
      { k: 'portal', g: 'Data', label: 'No problems / warnings', max: 5, ok: !sum(L.pwo || [0, 0, 0]), detail: `Problems ${(L.pwo || [])[0] ?? 0} · Warnings ${(L.pwo || [])[1] ?? 0} · Opportunities ${(L.pwo || [])[2] ?? 0}` },
      { k: 'reviews', g: 'Social proof', label: 'Reviews (5+, 4★+)', max: 10, pts: reviews >= 5 && rating >= 4 ? 10 : reviews >= 1 && rating >= 4 ? 5 : 0, detail: reviews ? `${reviews} review · ${rating}★` : 'no reviews yet' }];
    for (const c of ck) { if (c.pts == null) c.pts = c.ok ? c.max : 0; if (c.ok === undefined) c.ok = c.pts >= c.max; }
    return { ch: 'wf', part, listing, status, live: status === 'Live', name: L.name, rev90, units90, conv, visits, impr, imprPct, rating, reviews, launch, img: WF_IMG(img), imgL: WF_IMG(img, 800), L, checks: ck, score: scoreOf(ck), stock: inv[part] ?? null, notes: L.notes || [] };
  });
  const amz = amzRows.filter(r => r.level !== 'parent').map(r => {
    const ap = (aplusBy[r.asin] || []).filter(a => a.status === 'APPROVED'), R = rv['amz:' + r.asin] || {}, err = r.issues.filter(i => i[0] === 'ERROR').length, warn = r.issues.filter(i => i[0] === 'WARNING').length;
    const buy = r.status.includes('BUYABLE'), nb = r.bullets.length;
    const ck = [
      { k: 'title', g: 'Content', label: 'Title (80–200 chars, brand first)', max: 10, ok: !!r.name && r.name.length >= 80 && r.name.length <= 200 && /^lignarc/i.test(r.name), detail: r.name ? `${r.name.length} characters` : 'missing' },
      { k: 'bullets', g: 'Content', label: '5 bullets, 150+ chars each', max: 15, pts: nb >= 5 && r.bullets.every(x => x >= 150) ? 15 : nb >= 5 ? 10 : nb * 2, detail: `${nb} bullets${nb ? ' · shortest ' + Math.min(...r.bullets) + ' chars' : ''}` },
      { k: 'desc', g: 'Content', label: 'Description (500+ chars or A+)', max: 5, ok: r.desc >= 500 || ap.length > 0, detail: `${r.desc} characters` },
      { k: 'kw', g: 'Content', label: 'Search terms 150–249 bytes', max: 5, pts: r.kw >= 150 && r.kw <= 249 ? 5 : r.kw > 249 ? 1 : r.kw ? 2 : 0, detail: r.kw > 249 ? `${r.kw} bytes — over 249, Amazon ignores the field` : `${r.kw} bytes` },
      { k: 'imgs', g: 'Media', label: 'Images (7+)', max: 15, pts: r.imgs.length >= 7 ? 15 : r.imgs.length >= 5 ? 9 : 4, detail: `${r.imgs.length} images` },
      { k: 'video', g: 'Media', label: 'Product video', max: 10, ok: (D.amz && D.amz.videos) ? (D.amz.videos[r.asin] || 0) > 0 : null, detail: (D.amz && D.amz.videos) ? ((D.amz.videos[r.asin] || 0) + ' video(s) — Seller Central, weekly check') : 'not exposed by the API — filled by the weekly Seller Central check' },
      { k: 'aplus', g: 'Media', label: 'A+ content (approved)', max: 10, ok: ap.length > 0, detail: ap.length ? ap.map(a => a.name).join(', ') : 'no A+ module on this ASIN' },
      { k: 'req', g: 'Data', label: 'Required attributes', max: 10, pts: Math.max(0, 10 - 4 * r.missing.length), detail: r.missing.length ? 'Missing: ' + r.missing.join(', ') : 'all present' },
      { k: 'issues', g: 'Data', label: 'No listing issues', max: 10, pts: err ? 0 : warn ? 5 : 10, detail: r.issues.length ? `${err} error · ${warn} warning` : 'none' },
      { k: 'buy', g: 'Data', label: 'Buyable with stock', max: 5, ok: buy && (r.qty || 0) > 0, detail: `${buy ? 'Buyable' : 'Not buyable (' + r.status.join(', ').toLowerCase() + ')'} · qty ${r.qty ?? 0}` },
      { k: 'reviews', g: 'Social proof', label: 'Reviews (5+, 4★+)', max: 5, pts: R.count >= 5 && R.rating >= 4 ? 5 : R.count ? 2 : 0, detail: R.count ? `${R.count} reviews · ${R.rating}★` : 'no reviews yet' }];
    for (const c of ck) { if (c.pts == null) c.pts = c.ok ? c.max : 0; if (c.ok === undefined) c.ok = c.pts >= c.max; }
    return { ch: 'amz', part: r.sku, asin: r.asin, pt: r.pt, live: buy, status: r.status, name: r.name, r, img: AMZ_IMG(r.imgs[0] || r.thumb), gallery: r.imgs.map(u => AMZ_IMG(u, 160)), aplus: ap, checks: ck, score: scoreOf(ck), err, warn, stock: inv[r.sku] ?? null, parent: r.parent };
  });
  // cross-channel consistency for SKUs on both
  const cross = [];
  for (const a of amz) { const w = wf.find(x => x.part === a.part); if (!w) continue; const L = w.L, r = a.r;
    if (r.assembly === false && L.assembly && !/^no assembly/i.test(L.assembly)) cross.push({ part: a.part, field: 'Assembly', amz: 'No assembly required', wf: L.assembly });
    if (r.weight && L.weight && Math.abs(r.weight - L.weight) / L.weight > 0.15) cross.push({ part: a.part, field: 'Product weight', amz: r.weight + ' lb', wf: L.weight + ' lb' });
  }
  const out = { M, wf, amz, cross, aplus: AL.aplus || [], req: AL.req || {}, at: AL.at, wfAt: WL.asOf, err: AL.err, hist: (D.amz && D.amz.listingHist) || {}, parents: amzRows.filter(r => r.level === 'parent') };
  listingModel.c = out; return out;
}
const scoreColor = v => v == null ? 'var(--axis)' : v >= 80 ? 'var(--good)' : v >= 60 ? 'var(--warn)' : 'var(--crit)';
const scoreCell = v => v == null ? '<span class="sub">—</span>' : `<div class="score"><b style="color:${v >= 80 ? 'var(--good-ink)' : v >= 60 ? 'var(--ink)' : 'var(--crit-ink)'}">${v}</b><i><s style="width:${v}%;background:${scoreColor(v)}"></s></i></div>`;
const chOnly = ch => `<span class="tag only ${ch}">${ch === 'amz' ? 'Amazon only' : ch === 'wf' ? 'Wayfair only' : 'Shared stock · both channels'}</span>`;

function viewListings() {
  const m = listingModel(), showWf = S.platform !== 'amz', showAmz = S.platform !== 'wf';
  const wf = m.wf.filter(x => passProd(x.part)), amz = m.amz.filter(x => passProd(x.part) || !M.P[x.part]);
  const avg = L => { const v = L.map(x => x.score).filter(v => v != null); return v.length ? Math.round(sum(v) / v.length) : null; };
  const wfLive = wf.filter(x => x.live), amzBuy = amz.filter(x => x.live), amzDisc = amz.filter(x => !x.live);
  const amzErr = sum(amz, x => x.err), amzWarn = sum(amz, x => x.warn), wfAttrW = sum(Object.values((D.wfListing || {}).listings || {}), l => l.attrWarn || 0);
  const wfReq = sum(Object.values((D.wfListing || {}).listings || {}), l => (l.reqMissing || []).length), amzReq = sum(amz, x => x.r.missing.length);
  const asinsBuy = new Set(amzBuy.map(x => x.asin)), aplusAsins = new Set(m.aplus.filter(a => a.status === 'APPROVED').flatMap(a => a.asins));
  const visits = sum(wf, x => x.visits || 0), units = sum(wf, x => x.units90 || 0);
  const tr = (D.amz && D.amz.traffic) || {};
  // ---------- action list ----------
  const acts = [];
  const A = (pri, ch, title, body, skus = []) => acts.push({ pri, ch, title, body, skus });
  if (showAmz) {
    const byIssue = {}; for (const x of amz) for (const i of x.r.issues) { const k = i[1] + '|' + i[0]; (byIssue[k] = byIssue[k] || { sev: i[0], code: i[1], msg: i[2], attrs: i[3], skus: [] }).skus.push(x.part); }
    for (const p of m.parents) for (const i of p.issues) { const k = i[1] + '|' + i[0]; (byIssue[k] = byIssue[k] || { sev: i[0], code: i[1], msg: i[2], attrs: i[3], skus: [] }).skus.push(p.sku + ' (parent)'); }
    for (const g of Object.values(byIssue)) A(g.sev === 'ERROR' ? 1 : 2, 'amz', `Amazon ${g.sev.toLowerCase()} ${g.code} on ${g.skus.length} listing${g.skus.length > 1 ? 's' : ''}`, esc(g.msg) + (/maximum allowed value.*width/i.test(g.msg) ? ' <b>Root cause: the vanities are listed under product type CABINET (max width 42"). Re-list them as BATHROOM_VANITY so dimensions validate and they appear in the right browse node.</b>' : ''), g.skus);
    const stocked = amzDisc.filter(x => (x.stock || 0) > 0);
    if (stocked.length) A(1, 'amz', `${stocked.length} Amazon listings are not buyable although CastleGate has stock`, `Status only DISCOVERABLE (no active offer / quantity 0 on Amazon) — customers can see but not buy them. If Amazon is a target channel for these, add quantity on the Multichannel shipping template; check the Multichannel cost per unit on 300-lb vanities first.`, stocked.map(x => x.part));
    const noAp = amzBuy.filter(x => !x.aplus.length); if (noAp.length) A(2, 'amz', `${noAp.length} buyable ASIN${noAp.length > 1 ? 's' : ''} without A+`, 'A+ typically lifts conversion 3–10% on furniture; publish a module (comparison chart + room shots).', noAp.map(x => x.part));
    const kwOver = amz.filter(x => x.r.kw > 249); if (kwOver.length) A(2, 'amz', `Search terms over 249 bytes on ${kwOver.length} listing${kwOver.length > 1 ? 's' : ''}`, 'Amazon ignores the whole backend keyword field when it is over 249 bytes — trim it.', kwOver.map(x => x.part));
    const fewImg = amzBuy.filter(x => x.r.imgs.length < 7); if (fewImg.length) A(2, 'amz', 'Buyable listings with fewer than 7 images', 'Add dimension, lifestyle and detail shots up to 7–9 images.', fewImg.map(x => x.part));
    A(3, 'amz', 'Videos and Brand Store are not visible through the API', 'Checked weekly in Seller Central (Manage videos, Stores › Insights). A 30–60 s video and a Store page linked from the brand byline are standard for furniture brands.', []);
  }
  if (showWf) {
    const wl = (D.wfListing || {}).listings || {};
    const reqL = Object.entries(wl).filter(([, l]) => (l.reqMissing || []).length);
    if (reqL.length) A(1, 'wf', `${reqL.length} Wayfair listings have empty required attributes`, `Empty: ${[...new Set(reqL.flatMap(([, l]) => l.reqMissing))].join(', ')}. Required fields drive filters (depth, glass, power) — a vanity with no depth value drops out of "fits my space" filtering. Fill them in Partner Home › Product Management › Attributes.`, reqL.map(([k]) => k));
    const aw = Object.entries(wl).filter(([, l]) => l.attrWarn); if (aw.length) A(2, 'wf', `Attribute warnings on ${aw.length} Wayfair listings`, 'Partner Home flags at least one attribute value on each; open Attributes and resolve the yellow warning.', aw.map(([k]) => k));
    A(1, 'wf', 'No product video on any Wayfair listing', 'Video is one of the strongest conversion levers for large furniture (scale, drawers, soft-close). Upload via Partner Home › Upload Media.', Object.keys(wl));
    const lowB = Object.entries(wl).filter(([, l]) => l.bullets < 8); if (lowB.length) A(2, 'wf', `${lowB.length} listings with fewer than 8 feature bullets`, 'Wayfair shows up to 10; add material, dimensions, assembly, care and warranty bullets.', lowB.map(([k]) => k));
    const tc = Object.entries(wl).filter(([, l]) => l.name && !titleCaseOk(l.name)); if (tc.length) A(2, 'wf', 'Product names not in Title Case', tc.map(([, l]) => `"${esc(l.name)}"`).join(' · '), tc.map(([k]) => k));
    for (const [k, l] of Object.entries(wl)) for (const n of l.notes || []) if (!/Title Case|bullets/.test(n)) A(2, 'wf', `${k}: content mismatch`, esc(n), [k]);
    const hiT = wf.filter(x => x.visits >= 300 && x.conv != null && x.conv < 0.006); if (hiT.length) A(1, 'wf', 'High traffic, low conversion', `${hiT.map(x => `${x.part} (${n0(x.visits)} visits, ${pct(x.conv, 1)})`).join(', ')} — traffic is there; price, reviews and images are the gap. Get Tried & True reviews and add lifestyle + scale images first.`, hiT.map(x => x.part));
    const noV = wf.filter(x => x.live && !x.visits && (x.stock || 0) > 0); if (noV.length) A(2, 'wf', `${noV.length} live variants with no visits in 90 days`, 'Wayfair shows the lead variant; these colors/sizes get no traffic of their own. Check variant swatches and consider giving each its own lead image.', noV.map(x => x.part));
  }
  if (m.cross.length && S.platform === 'all') A(1, 'all', `${m.cross.length} values differ between Wayfair and Amazon`, [...groupBy(m.cross, c => c.field)].map(([f, L]) => `<b>${esc(f)}</b> on ${L.length} SKUs (e.g. ${esc(L[0].part)}: Amazon "${esc(L[0].amz)}" vs Wayfair "${esc(L[0].wf)}")`).join(' · ') + '. Conflicting specs drive "not as described" returns and damage claims on heavy items — align both listings to the spec sheet. Full list in "Same SKU, different specs" below.', [...new Set(m.cross.map(c => c.part))]);
  acts.sort((x, y) => x.pri - y.pri);
  // ---------- SKU matrix (one row per SKU across channels) ----------
  const parts = [...new Set([...(showWf ? wf.map(x => x.part) : []), ...(showAmz ? amz.map(x => x.part) : [])])];
  const rows = parts.map(part => { const w = wf.find(x => x.part === part), a = amz.find(x => x.part === part), p = M.P[part] || {};
    return { part, col: p.col || (a ? 'Amazon' : ''), img: (a && a.img) || (w && w.img), w, a, wScore: w ? w.score : null, aScore: a ? a.score : null, visits: w ? w.visits : null, conv: w ? w.conv : null, rev90: w ? w.rev90 : null, stock: (w || a || {}).stock ?? null,
      imgsW: w ? w.L.imgs : null, imgsA: a ? a.r.imgs.length : null, issues: (a ? a.r.issues.length : 0) + (w ? (w.L.attrWarn || 0) : 0), req: (a ? a.r.missing.length : 0) + (w ? (w.L.reqMissing || []).length : 0) }; });
  const chip = (ok, txt) => `<span class="tag ${ok ? 'good' : ok === false ? 'bad' : ''}">${txt}</span>`;
  const matrix = `<div class="tbl-wrap"><table class="lst"><thead><tr><th></th><th>SKU</th>${showWf ? '<th class="num">Wayfair score</th>' : ''}${showAmz ? '<th class="num">Amazon score</th>' : ''}<th>Channels</th><th class="num">Images</th><th>Video · rich content</th><th class="num">Req. missing</th><th class="num">Issues</th>${showWf ? '<th class="num">Visits 90d</th><th class="num">Conv.</th><th class="num">Wayfair rev. 90d</th>' : ''}<th class="num">Stock</th></tr></thead><tbody>${rows.sort((x, y) => (y.rev90 || 0) - (x.rev90 || 0) || (x.wScore ?? x.aScore ?? 0) - (y.wScore ?? y.aScore ?? 0)).map(r => `<tr>
    <td>${r.img ? `<img class="lthumb" loading="lazy" src="${esc(r.img)}" data-alt="${esc(r.w && r.w.img && r.w.img !== r.img ? r.w.img : '')}" alt="">` : '<span class="lthumb ph"></span>'}</td>
    <td>${skuCell(r.part)}</td>${showWf ? `<td class="num">${r.w ? scoreCell(r.wScore) : '<span class="sub">not on Wayfair</span>'}</td>` : ''}${showAmz ? `<td class="num">${r.a ? scoreCell(r.aScore) : '<span class="sub">not on Amazon</span>'}</td>` : ''}
    <td>${r.w ? chip(r.w.live, 'Wayfair ' + (r.w.live ? 'live' : esc(r.w.status))) : ''} ${r.a ? chip(r.a.live, 'Amazon ' + (r.a.live ? 'buyable' : 'not buyable')) : ''}</td>
    <td class="num">${[r.imgsW != null ? 'WF ' + r.imgsW : r.w ? 'WF ?' : '', r.imgsA != null ? 'AMZ ' + r.imgsA : ''].filter(Boolean).join(' · ')}</td>
    <td>${r.w ? chip(false, 'WF no video') : ''} ${r.a ? chip(r.a.aplus.length > 0, r.a.aplus.length ? 'A+' : 'no A+') : ''}</td>
    <td class="num">${r.req ? `<b style="color:var(--crit-ink)">${r.req}</b>` : '0'}</td><td class="num">${r.issues ? `<b style="color:var(--crit-ink)">${r.issues}</b>` : '0'}</td>
    ${showWf ? `<td class="num">${r.visits ? n0(r.visits) : '—'}</td><td class="num">${r.conv != null && r.visits ? pct(r.conv, 1) : '—'}</td><td class="num">${r.rev90 ? usd(r.rev90) : '—'}</td>` : ''}<td class="num">${r.stock != null ? n0(r.stock) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  // ---------- checklist heatmap ----------
  const heat = (L, ch) => { if (!L.length) return '<div class="empty">No listings</div>'; const keys = L[0].checks.map(c => c.k);
    return `<div class="tbl-wrap"><table class="heat chk"><thead><tr><th></th>${L[0].checks.map(c => `<th title="${esc(c.label)}">${esc(c.label.replace(/ \(.*\)$/, ''))}</th>`).join('')}<th class="num">Score</th></tr></thead><tbody>${L.slice().sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).map(x => `<tr><td><b>${esc(x.part)}</b>${ch === 'wf' ? `<small class="sub" style="display:block">${esc(x.listing)}</small>` : ''}</td>${keys.map(k => { const c = x.checks.find(z => z.k === k); const st = c.ok === null ? 'na' : c.ok ? 'ok' : c.pts > 0 ? 'part' : 'bad';
      return `<td class="ck ${st}" data-tip="${esc(tipRows(x.part + ' · ' + c.label, [['Status', st === 'ok' ? 'Pass' : st === 'part' ? `Partial (${c.pts}/${c.max})` : st === 'na' ? 'Not verifiable via API' : 'Fail'], ['Detail', c.detail]]))}">${st === 'ok' ? '✓' : st === 'part' ? '½' : st === 'na' ? '?' : '✕'}</td>`; }).join('')}<td class="num">${scoreCell(x.score)}</td></tr>`).join('')}</tbody></table></div>`; };
  // ---------- traffic vs conversion (Wayfair) ----------
  const quad = (() => { const L = wf.filter(x => x.visits > 0); if (!L.length) return '<div class="empty">No traffic data</div>';
    const w = CW('half'), h = 300, Lp = 50, R = 14, T = 14, B = 34, C = SER(), xm = Math.max(...L.map(x => x.visits)) * 1.1, ym = Math.max(0.035, ...L.map(x => x.conv || 0)) * 1.15;
    const X = v => Lp + v / xm * (w - Lp - R), Y = v => T + (1 - v / ym) * (h - T - B), avgC = units / (visits || 1);
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img"><g class="grid">`;
    for (let i = 0; i <= 4; i++) { const v = ym * i / 4; s += `<line x1="${Lp}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${Lp - 6}" y="${Y(v) + 4}" text-anchor="end">${pct(v, 1)}</text>`; }
    for (let i = 0; i <= 4; i++) { const v = xm * i / 4; s += `<text x="${X(v)}" y="${h - B + 16}" text-anchor="middle">${n0(v)}</text>`; }
    s += `</g><line x1="${Lp}" x2="${w - R}" y1="${Y(avgC)}" y2="${Y(avgC)}" stroke="var(--muted)" stroke-dasharray="4 3"/><text x="${w - R}" y="${Y(avgC) - 5}" text-anchor="end" class="g-axis">avg ${pct(avgC, 1)}</text>`;
    s += `<text x="${w - R - 4}" y="${T + 12}" text-anchor="end" class="g-axis">Scale: winners</text><text x="${w - R - 4}" y="${h - B - 6}" text-anchor="end" class="g-axis" style="fill:var(--crit-ink)">Fix content / price</text><text x="${Lp + 6}" y="${T + 12}" class="g-axis">Needs traffic (ads)</text>`;
    for (const x of L) s += `<circle cx="${X(x.visits)}" cy="${Y(x.conv || 0)}" r="${Math.min(16, 5 + Math.sqrt(x.rev90 || 0) / 8)}" fill="${colColor((M.P[x.part] || {}).col)}" fill-opacity=".75" stroke="var(--glass-strong)" stroke-width="2" data-tip="${esc(tipRows(x.part + ' · ' + (x.name || ''), [['Visits (90d)', n0(x.visits)], ['Conversion', pct(x.conv, 1)], ['Units', n0(x.units90)], ['Revenue (90d)', usd(x.rev90)], ['Listing score', String(x.score)]]))}"/><text x="${X(x.visits) + 9}" y="${Y(x.conv || 0) + 4}" class="g-axis">${esc(x.part)}</text>`;
    return `<div class="chart">${s}<text/></svg></div><p class="note">x = unique visits, y = conversion, bubble = revenue (90 days, Partner Home). Dashed = average conversion.</p>`; })();
  // ---------- listing detail drawers ----------
  const imgOf = x => { const a = m.amz.find(z => z.part === x.part); return (a && a.img) || x.img; };
  const det = x => `<details class="ldet" data-ld="${esc(x.ch + x.part)}"${S.open['ld' + x.ch + x.part] ? ' open' : ''}><summary>${imgOf(x) ? `<img class="lthumb" loading="lazy" src="${esc(imgOf(x))}" data-alt="${esc(x.img && x.img !== imgOf(x) ? x.img : '')}" alt="">` : ''}<div><b>${esc(x.part)}</b> <span class="tag ${x.ch === 'amz' ? 'tt' : ''}">${x.ch === 'amz' ? 'Amazon' : 'Wayfair'}</span><small>${esc((x.name || '').slice(0, 110))}</small></div>${scoreCell(x.score)}</summary>
    <div class="ldet-body">${x.ch === 'amz' && x.gallery.length ? `<div class="gallery">${x.gallery.map(u => `<img loading="lazy" src="${esc(u)}" alt="">`).join('')}</div>` : x.imgL ? `<div class="gallery"><img loading="lazy" src="${esc(x.imgL)}" alt="" style="height:160px"></div>` : ''}
    <ul class="checks">${x.checks.map(c => `<li class="${c.ok === null ? 'na' : c.ok ? 'ok' : c.pts > 0 ? 'part' : 'bad'}"><span>${c.ok === null ? '?' : c.ok ? '✓' : c.pts > 0 ? '½' : '✕'}</span><b>${esc(c.label)}</b><em>${esc(c.detail)}</em></li>`).join('')}</ul>
    ${x.ch === 'amz' ? `<p class="note">ASIN ${esc(x.asin)} · product type ${esc(x.pt)} · ${esc(x.status.join(', '))} · price ${x.r.price != null ? usd(x.r.price, 2) : '—'}${x.r.list ? ' (list ' + usd(x.r.list, 2) + ')' : ''} · B2B ${x.r.b2b != null ? usd(x.r.b2b, 2) : '—'} · qty ${x.r.qty ?? 0} · ${x.r.dims ? `${x.r.dims.join(' × ')} in` : 'no dimensions'} · ${x.r.weight ?? '—'} lb${x.r.issues.length ? '<br>' + x.r.issues.map(i => `<b>${esc(i[0])} ${esc(i[1])}</b>: ${esc(i[2])}`).join('<br>') : ''}</p>` : `<p class="note">Listing ${esc(x.listing)} · launched ${dLong(x.launch)} · ${esc(x.L.cls || '')} · assembly: ${esc(x.L.assembly || '—')} · hardware: ${esc(x.L.hw || '—')} · ${x.L.weight ?? '—'} lb · live on ${x.L.stores || 0} stores (wayfair.com / .ca, B2C + B2B)${(x.notes || []).length ? '<br>' + x.notes.map(esc).join('<br>') : ''}</p>`}</div></details>`;
  const hist = Object.entries(m.hist).sort();
  return `${pageHead('Listings &amp; Product Management', `Amazon listings via SP-API every 6 h (last ${m.at ? dLong(new Date(m.at * 1000).toISOString()) : '—'}) · Wayfair from Partner Home Product Management, refreshed weekly (last ${dLong(m.wfAt)}) · ${S.platform === 'all' ? 'both channels' : chName(S.platform) + ' only'}`)}
  <div class="grid g-kpi k3">
    ${showWf ? kpi('Wayfair listings', `${n0(wfLive.length)}<small> / ${n0(wf.length)} live</small>`, `${n0(new Set(wf.map(x => x.listing)).size)} listings · on wayfair.com + .ca (B2C & B2B)`, 'Variants (part numbers) live on Wayfair.') : ''}
    ${showAmz ? kpi('Amazon listings', `${n0(amzBuy.length)}<small> / ${n0(amz.length)} buyable</small>`, `${n0(amzDisc.length)} discoverable only · ${n0(m.parents.length)} parent listings`, 'Child + standalone SKUs. Buyable = active offer with quantity.') : ''}
    ${kpi('Listing quality score', [showWf ? `WF ${avg(wf) ?? '—'}` : '', showAmz ? `AMZ ${avg(amz) ?? '—'}` : ''].filter(Boolean).join(' · '), 'Out of 100 · furniture checklist (content, media, data, reviews)', 'Weighted checklist per channel; items that cannot be verified are left out of the score.')}
    ${kpi('Portal issues', n0((showAmz ? amzErr + amzWarn : 0) + (showWf ? wfAttrW : 0)), [showAmz ? `Amazon ${amzErr} errors · ${amzWarn} warnings` : '', showWf ? `Wayfair ${wfAttrW} attribute warnings · 0 problems` : ''].filter(Boolean).join(' · '), 'Amazon: Listings API issues (what Seller Central shows as Fix Your Products). Wayfair: Partner Home problems, warnings and attribute warnings.')}
    ${kpi('Required fields empty', n0((showWf ? wfReq : 0) + (showAmz ? amzReq : 0)), [showWf ? `Wayfair ${wfReq} (across ${Object.values((D.wfListing || {}).listings || {}).filter(l => (l.reqMissing || []).length).length} listings)` : '', showAmz ? `Amazon ${amzReq}` : ''].filter(Boolean).join(' · '), 'Wayfair: attributes marked * with no value. Amazon: required attributes of the product type schema that the listing does not have.')}
    ${kpi('Rich content', [showAmz ? `A+ ${pct(asinsBuy.size ? [...asinsBuy].filter(a => aplusAsins.has(a)).length / asinsBuy.size : null)}` : '', showWf ? 'WF video 0%' : ''].filter(Boolean).join(' · '), [showAmz ? `${m.aplus.length} A+ documents · ${aplusAsins.size} ASINs covered` : '', showWf ? 'no video on any Wayfair listing' : ''].filter(Boolean).join(' · '), 'Amazon A+ coverage of buyable ASINs (A+ Content API). Wayfair video from Partner Home media.')}
  </div>
  ${card('Fix list', 'Every issue the portals report or the checklist finds, most urgent first', acts.length ? `<div class="plan">${acts.map(r => `<div class="plan-row p${r.pri}"><div class="plan-when"><span class="tag ${r.pri === 1 ? 'bad' : r.pri === 2 ? 'warn' : ''}">${r.pri === 1 ? 'Fix now' : r.pri === 2 ? 'Improve' : 'Check'}</span>${r.ch === 'all' ? '<small>Both channels</small>' : `<small>${chName(r.ch)}</small>`}</div><div class="plan-body"><b>${esc(r.title)}</b><p>${r.body}</p>${r.skus.length ? `<div class="plan-skus">${r.skus.slice(0, 16).map(k => `<span>${esc(k)}</span>`).join('')}${r.skus.length > 16 ? `<span>+${r.skus.length - 16}</span>` : ''}</div>` : ''}</div><div class="plan-num"></div></div>`).join('')}</div>` : '<div class="empty">Nothing to fix</div>')}
  ${card('Listing scorecard', 'One row per SKU across both channels · scores out of 100 · sorted by Wayfair revenue', matrix)}
  <div class="grid g-2">
    ${showWf ? card('Traffic vs conversion ' + chOnly('wf'), 'Which listings need content work vs more traffic (Wayfair publishes visits per SKU; Amazon sessions are in Sales › Amazon traffic)', quad) : ''}
    ${card('Average score by collection', 'Lowest first — where content work pays off most', hbars([...groupBy([...(showWf ? wf : []), ...(showAmz ? amz : [])], x => ((M.P[x.part] || {}).col || 'Other') + ' · ' + (x.ch === 'amz' ? 'Amazon' : 'Wayfair'))].map(([k, L]) => ({ label: k, v: avg(L) || 0, color: SER()[k.includes('Amazon') ? 2 : 0], extra: [['Listings', String(L.length)]] })).sort((a, b) => a.v - b.v), { fmt: v => String(v) }))}
  </div>
  ${showWf ? card('Wayfair content checklist ' + chOnly('wf'), 'Each variant against the Wayfair furniture checklist · hover a cell for details · ? = not captured yet', heat(wf, 'wf')) : ''}
  ${showAmz ? card('Amazon content checklist ' + chOnly('amz'), 'Each SKU against the Amazon furniture checklist (A+ and issues from the API) · ? = not exposed by the API', heat(amz, 'amz')) : ''}
  ${m.cross.length && S.platform === 'all' ? card('Same SKU, different specs', 'Values that disagree between the Wayfair and Amazon listings', table('lcross', [{ k: 'part', l: 'SKU', f: v => skuCell(v) }, { k: 'field', l: 'Field' }, { k: 'wf', l: 'Wayfair' }, { k: 'amz', l: 'Amazon' }], m.cross)) : ''}
  ${showAmz && m.aplus.length ? card('Amazon A+ content ' + chOnly('amz'), 'A+ documents and the ASINs they cover', table('laplus', [{ k: 'name', l: 'Document', f: v => `<b>${esc(v)}</b>` }, { k: 'status', l: 'Status', f: v => `<span class="tag ${v === 'APPROVED' ? 'good' : 'warn'}">${esc(v)}</span>` }, { k: 'badges', l: 'Type', f: v => esc((v || []).join(', ').toLowerCase() || 'standard') }, { k: 'n', l: 'ASINs', num: true }, { k: 'updated', l: 'Updated', f: v => dLong(v) }], m.aplus.map(a => ({ ...a, n: a.asins.length })), { def: { k: 'updated', d: 'desc' } })) : ''}
  ${showAmz ? card('Amazon Brand Store ' + chOnly('amz'), 'Not available through any Amazon API', ((st) => st ? `<div class="grid g-kpi">${kpi('Store', st.published ? 'Published' : 'Not published', 'as of ' + dLong(st.asOf))}${kpi('Pages', n0(st.pages || 0))}${kpi('Visits (7 days)', n0(st.visits7d || 0))}${kpi('Store sales (7 days)', usd(st.sales7d || 0))}</div>` : '')((D.amz || {}).store) + '<p class="note" style="margin:0">Store pages, Store traffic and Store sales are only in Seller Central › Stores — recorded by the weekly check (published, page count, visits, sales). Store pages should only feature buyable ASINs: today only 5C8N is buyable on Amazon.</p>') : ''}
  <h2 class="sec-title">Listing details</h2>
  <div class="ldets">${[...(showWf ? wf : []), ...(showAmz ? amz : [])].sort((a, b) => a.part.localeCompare(b.part) || a.ch.localeCompare(b.ch)).map(det).join('')}</div>
  <p class="note">Scoring: Wayfair — name 10, bullets 15, description 10, images 15, lifestyle images 5, video 10, required attributes 15, attribute warnings 5, portal issues 5, reviews 10. Amazon — title 10, bullets 15, description 5, search terms 5, images 15, video 10 (manual), A+ 10, required attributes 10, issues 10, buyable 5, reviews 5. Unverifiable items are excluded.</p>`;
}

const VIEWS = { overview: viewOverview, sales: viewSales, profit: viewProfit, customers: viewCustomers, promos: viewPromos, listings: viewListings, ads: viewAds, quality: viewQuality, inventory: viewInventory };
function render() {
  renderSidebar();
  const y = scrollY; $('#view').innerHTML = VIEWS[S.tab](); if (render.keep) scrollTo(0, y); render.keep = false; loadMedia();
}
// customer photos: data/media/<name>.enc.json, AES-GCM with the data key, decrypted in the browser only
const MEDIA = new Map();
async function mediaUrl(name) {
  if (MEDIA.has(name)) return MEDIA.get(name);
  const p = (async () => { const f = await (await fetch('data/media/' + name + '.enc.json', { cache: 'force-cache' })).json(); const k = await crypto.subtle.importKey('raw', LIVE.raw, 'AES-GCM', false, ['decrypt']);
    return URL.createObjectURL(new Blob([await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(f.iv) }, k, b64d(f.ct))], { type: 'image/jpeg' })); })();
  MEDIA.set(name, p); p.catch(() => MEDIA.delete(name)); return p;
}
function loadMedia() { if (!LIVE || !LIVE.raw) return; $$('#view img[data-media]').forEach(async im => { try { const u = await mediaUrl(im.dataset.media); im.src = u; const a = im.closest('a'); if (a) a.href = u; } catch (e) { im.classList.add('err'); } }); }
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
$('#view').addEventListener('error', e => { const i = e.target; if (i.tagName === 'IMG' && i.dataset.alt && i.src !== i.dataset.alt) { i.src = i.dataset.alt; i.dataset.alt = ''; } else if (i.tagName === 'IMG' && i.classList.contains('lthumb')) i.style.visibility = 'hidden'; }, true);
$('#view').addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.ld) S.open['ld' + d.dataset.ld] = d.open; }, true);
$('#view').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (th) { const id = th.closest('table').dataset.table, k = th.dataset.sort, cur = S.sort[id] || {}; S.sort[id] = { k, d: cur.k === k && cur.d === 'desc' ? 'asc' : 'desc' }; rerender(); return; }
  const g = e.target.closest('[data-gran]'); if (g) { S.gran = g.dataset.gran; rerender(); return; }
  const am = e.target.closest('[data-adm]'); if (am) { S.adm = am.dataset.adm; rerender(); return; }
  const cp = e.target.closest('[data-copy]'); if (cp) { const t = cp.parentElement.querySelector('textarea'); try { navigator.clipboard.writeText(t.value); cp.textContent = 'Copied'; } catch (er) { t.select(); } return; }
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

let LIVE = null;
const stamp = updated => { const u = new Date(updated || (D.meta.at * 1000) || Date.now()); $('#updated').textContent = 'Updated ' + u.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Asia/Ho_Chi_Minh' }) + ' GMT+7 · live'; };
function start(data, updated, raw) {
  D = data; D.wf = D.wf || {}; D.meta = D.meta || {}; build(); stamp(updated);
  $('#login').hidden = true; $('#app').hidden = false;
  const h = location.hash.slice(1); setTab(VIEWS[h] ? h : 'overview');
  LIVE = { raw, updated };
}
// Live mode: the data file changes whenever the 15-minute API sync finds something new — poll it (no login, no cost) and redraw in place
async function livePoll() {
  if (!LIVE || !LIVE.raw || document.hidden) return;
  try {
    const f = await fetchFile(); if (!f.updated || f.updated === LIVE.updated) return;
    const data = await openWith(f, LIVE.raw), y = scrollY; D = data; D.wf = D.wf || {}; D.meta = D.meta || {}; build(); LIVE.updated = f.updated; stamp(f.updated); render(); scrollTo(0, y);
    const t = document.createElement('div'); t.className = 'live-toast'; t.textContent = 'New data loaded'; document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  } catch (e) {}
}
setInterval(livePoll, 120000); document.addEventListener('visibilitychange', () => { if (!document.hidden) livePoll(); });
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Decrypting…'; $('#loginErr').textContent = '';
  try { const { raw, data, updated } = await login($('#user').value, $('#pass').value); store.set('lg-dk', b64e(raw), $('#remember').checked); $('#pass').value = ''; start(data, updated, raw); }
  catch (x) { $('#loginErr').textContent = x.message === 'bad' ? 'Wrong username or password' : x.message; }
  btn.disabled = false; btn.textContent = 'Sign in';
});
(async () => {
  const k = store.get('lg-dk');
  if (k) { try { const f = await fetchFile(); start(await openWith(f, b64d(k)), f.updated, b64d(k)); return; } catch (e) { store.del('lg-dk'); } }
  $('#login').hidden = false; setTimeout(() => $('#user').focus(), 50);
})();
})();
