/* Lignarc Commerce Dashboard
 * Static app: decrypts data/lignarc.enc.json in the browser after login, then renders.
 * Revenue = Wayfair wholesale price × qty (what Wayfair pays Lignarc) — same basis as the KPI "Rev" line.
 */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DATA_URL = 'data/lignarc.enc.json';
const FREE_DAYS = 90;
const DDA = 0.025, COOP = 0.10;            // per COGS sheet: DDA 2.5% + Co-op 10% of wholesale revenue
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
async function fetchFile() { const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('Không tải được dữ liệu (' + r.status + ')'); return r.json(); }
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
const usdK = v => Math.abs(v) >= 1e6 ? '$' + nf1.format(v / 1e6) + 'M' : Math.abs(v) >= 1e4 ? '$' + nf1.format(v / 1e3) + 'k' : usd(v);
const pct = (v, d = 0) => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%';
const n0 = v => nf0.format(v || 0);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VNM = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];
const dShort = s => { const [y, m, d] = s.split('-'); return +d + '/' + +m; };
const dLong = s => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const mLabel = ym => { const [y, m] = ym.split('-'); return VNM[+m - 1] + '/' + y.slice(2); };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const sum = (a, f = x => x) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const groupBy = (a, f) => { const m = new Map(); for (const x of a) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SER = () => [cssv('--s1'), cssv('--s2'), cssv('--s3'), cssv('--s4'), cssv('--s5')];

// ---------------- state ----------------
let D = null;            // decrypted data
let M = null;            // derived model
const S = { tab: 'overview', period: '30', channel: 'all', incTT: false, kpiAll: false, invAll: false };

// ---------------- model ----------------
const OK_STATUS = s => !/cancel|reject|void/i.test(s || '');
const CAT_RULES = [[/cart/i, 'Utility Cart'], [/wall[- ]mounted|floating/i, 'Wall-Mounted Vanity'], [/double/i, 'Double Vanity'], [/vanity/i, 'Single Vanity'], [/nightstand|bedside/i, 'Nightstand'], [/bed\b/i, 'Bed']];
function buildModel() {
  const P = D.products || {};
  // enrich product master from Wayfair (inventory API names/options and order export rows)
  const enrich = (part, name, opt) => { if (!part) return; const p = P[part] = P[part] || { col: 'Khác', size: '—', color: '—', cat: '—' };
    if (name && !p.name) p.name = name;
    const c = String(opt || '').match(/Colou?r[^:]*:\s*([^,;]+)/i); if (c && (!p.color || p.color === '—')) p.color = c[1].trim();
    if (name) { const r = CAT_RULES.find(([re]) => re.test(name)); if (r) p.cat = r[1]; }
    if (name) { const m = name.match(/\b(Calix|Zena|Caroline|Vestra|Kathryn|Vivian)\b/i); if (m) p.col = ({ kathryn: 'Calix', vivian: 'Zena' })[m[1].toLowerCase()] || m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); }
    if (name) { const z = name.match(/(\d{2})\s*(?:''|"|”|in\b|inch)/i); if (z) p.size = z[1] + '"'; } };
  for (const r of (D.wf && D.wf.inv) || []) enrich(r[0], r[12], r[13]);
  for (const r of (D.wf && D.wf.orders) || []) enrich(r[7], r[9], r[10]);
  const famOf = part => (P[part] && P[part].fam) || null;
  const prod = part => P[part] || { col: 'Khác', size: '—', color: '—', cat: 'Khác', name: part };
  const cogsOf = part => { const p = P[part]; if (p && p.cogs) return p.cogs; const f = famOf(part); const s = Object.values(P).find(x => x.fam === f && x.cogs); return s ? s.cogs : 0; };
  // Wayfair CastleGate orders (export rows)
  // [po, orderNo, date, status, retailer, state, country, part, sku, name, options, qty, wholesale, b2b, channel, shipped, warehouse]
  const SOV = (D.wf && D.wf.statusOv) || {};
  const wfo = ((D.wf && D.wf.orders) || []).map(r0 => { const r = SOV[r0[0]] ? Object.assign([...r0], { 3: SOV[r0[0]] }) : r0;
    const tt = /tried/i.test(r[14] || '') || ((D.wf && D.wf.ttPOs) || []).includes(r[0]); const qty = +r[11] || 0, rev = (+r[12] || 0) * qty, part = r[7];
    const cogs = cogsOf(part) * qty;
    return { ch: 'wf', po: r[0], no: r[1], date: r[2], status: r[3], retailer: r[4], state: r[5], country: r[6], part, sku: r[8], name: r[9], opt: r[10], qty, price: +r[12] || 0, rev,
      b2b: /yes/i.test(r[13] || ''), salesCh: r[14] || '', tt, shipped: r[15], wh: r[16], ok: OK_STATUS(r[3]), cogs, gp: rev - cogs - rev * (DDA + COOP) };
  });
  // Amazon orders: [id, date, status, sku, asin, qty, price, title]
  const amo = ((D.amz && D.amz.orders) || []).map(r => ({ ch: 'amz', po: r[0], no: r[0], date: r[1], status: r[2], part: r[3], sku: r[3], asin: r[4], qty: +r[5] || 0, price: +r[6] || 0, rev: (+r[6] || 0) * (+r[5] || 0), name: r[7], tt: false, ok: OK_STATUS(r[2]), retailer: 'Amazon.com', cogs: cogsOf(r[3]) * (+r[5] || 0), gp: 0 }));
  amo.forEach(o => { o.gp = o.rev - o.cogs; });
  const today = (D.meta && D.meta.today) || new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  // Wayfair ads daily: [campId, date, impr, clicks, spend, units, sales, orders]
  const camps = new Map(((D.wf && D.wf.ads && D.wf.ads.camps) || []).map(c => [c[0], { id: c[0], name: c[1], status: c[2], start: c[3], cap: c[5] }]));
  const wfAds = ((D.wf && D.wf.ads && D.wf.ads.daily) || []).map(r => ({ ch: 'wf', camp: r[0], date: r[1], impr: r[2], clicks: r[3], spend: r[4], units: r[5], sales: r[6], orders: r[7] }));
  // Amazon ads daily (account): [date, impr, clicks, spend, sales, orders]
  const amAds = ((D.amz && D.amz.ads && D.amz.ads.daily) || []).map(r => ({ ch: 'amz', camp: 'amz', date: r[0], impr: r[1] || 0, clicks: r[2] || 0, spend: r[3] || 0, sales: r[4] || 0, orders: r[5] || 0, units: r[5] || 0 }));
  M = { P, prod, cogsOf, famOf, wfo, amo, orders: wfo.concat(amo).sort((a, b) => (b.date || '').localeCompare(a.date || '')), today, camps, wfAds, amAds };
}
function range() {
  const t = M.today; let from;
  if (S.period === '7') from = addDays(t, -6); else if (S.period === '30') from = addDays(t, -29);
  else if (S.period === 'mtd') from = t.slice(0, 8) + '01';
  else if (S.period === 'qtd') { const m = +t.slice(5, 7); from = t.slice(0, 5) + String(m - (m - 1) % 3).padStart(2, '0') + '-01'; }
  else from = '2000-01-01';
  return { from, to: t, days: diffDays(from, t) + 1 };
}
function prevRange(r) { if (S.period === 'all') return null; const len = r.days; return { from: addDays(r.from, -len), to: addDays(r.from, -1) }; }
const inR = (d, r) => d && d >= r.from && d <= r.to;
function ordersIn(r, opt = {}) {
  return M.orders.filter(o => inR(o.date, r) && (S.channel === 'all' || o.ch === S.channel) && (opt.all || o.ok) && (opt.tt ?? S.incTT ? true : !o.tt));
}
function adsIn(r) { return (S.channel === 'amz' ? [] : M.wfAds).concat(S.channel === 'wf' ? [] : M.amAds).filter(a => inR(a.date, r)); }
function agg(os) { const rev = sum(os, o => o.rev), units = sum(os, o => o.qty), cogs = sum(os, o => o.cogs), gp = sum(os, o => o.gp); const ords = new Set(os.map(o => o.po)).size; return { rev, units, ords, cogs, gp, aov: ords ? rev / ords : 0, gpm: rev ? gp / rev : null }; }
function deltaHtml(cur, prev, invert) { if (prev == null) return ''; if (!prev) return '<span class="delta">kỳ trước chưa có số</span>'; const d = (cur - prev) / Math.abs(prev); const up = d >= 0; const good = invert ? !up : up; return `<span class="delta ${good ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}%</span>`; }

// ---------------- charts (SVG, hover tooltips) ----------------
const tip = $('#tip');
function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; const x = (e.touches ? e.touches[0] : e).clientX, y = (e.touches ? e.touches[0] : e).clientY; const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, x + 14)) + 'px'; tip.style.top = Math.max(8, y - h - 12) + 'px'; }
function hideTip() { tip.hidden = true; }
document.addEventListener('scroll', hideTip, { passive: true });
const ticks = (max, n = 4) => { if (max <= 0) return [0, 1]; const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), s = [1, 2, 2.5, 5, 10].find(m => m * p >= raw) * p; const out = []; for (let v = 0; v <= max + s * .001; v += s) out.push(v); if (out[out.length - 1] < max) out.push(out[out.length - 1] + s); return out; };
function rr(x, y, w, h, r) { r = Math.min(r, w / 2, Math.abs(h)); if (h <= 0) return ''; return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }

/* bars: {labels, series:[{name,color,values,dash?, type:'bar'|'line'}], fmt, height} — one y-axis only */
function barChart(el, cfg) {
  const W = Math.max(320, el.clientWidth || 600), H = cfg.height || 240, pl = 46, pr = 10, pt = 12, pb = 26;
  const iw = W - pl - pr, ih = H - pt - pb, n = cfg.labels.length;
  const bars = cfg.series.filter(s => s.type !== 'line'), lines = cfg.series.filter(s => s.type === 'line');
  const max = Math.max(1, ...cfg.series.flatMap(s => s.values.map(v => v || 0)));
  const T = ticks(max), top = T[T.length - 1], y = v => pt + ih - (v / top) * ih;
  const bw = iw / n, gap = Math.min(10, bw * .25), inner = bw - gap, each = Math.min(48, Math.max(2, (inner - 2 * (bars.length - 1)) / Math.max(1, bars.length))), off = (inner - (each * bars.length + 2 * (bars.length - 1))) / 2;
  let g = `<g class="grid">${T.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${cfg.fmtAxis ? cfg.fmtAxis(t) : t}</text>`).join('')}</g>`;
  const every = Math.ceil(n / Math.floor(iw / 46));
  g += cfg.labels.map((l, i) => i % every ? '' : `<text x="${pl + bw * i + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`).join('');
  bars.forEach((s, si) => s.values.forEach((v, i) => { if (!v) return; const x = pl + bw * i + gap / 2 + off + si * (each + 2), yy = y(v); g += `<path d="${rr(x, yy, each, pt + ih - yy, 4)}" fill="${s.color}" ${s.opacity ? `opacity="${s.opacity}"` : ''}/>`; }));
  lines.forEach(s => { const pts = s.values.map((v, i) => v == null ? null : [pl + bw * i + bw / 2, y(v)]); let d = '', pen = false; pts.forEach(p => { if (!p) { pen = false; return; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); pen = true; });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`; pts.forEach(p => { if (p && n <= 31) g += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}" stroke="var(--glass-strong)" stroke-width="1.5"/>`; }); });
  g += `<line class="axis" x1="${pl}" x2="${W - pr}" y1="${pt + ih}" y2="${pt + ih}"/>`;
  g += cfg.labels.map((l, i) => `<rect class="hit" data-i="${i}" x="${pl + bw * i}" y="${pt}" width="${bw}" height="${ih}"/>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.aria || '')}">${g}</svg>`;
  const f = cfg.fmt || (v => n0(v));
  $$('.hit', el).forEach(r => { const i = +r.dataset.i; const h = e => showTip(e, `<b>${esc(cfg.tipLabels ? cfg.tipLabels[i] : cfg.labels[i])}</b>` + cfg.series.map(s => `<div><span><i style="background:${s.color}"></i>${esc(s.name)}</span><span>${s.values[i] == null ? '—' : f(s.values[i])}</span></div>`).join('') + (cfg.extraTip ? cfg.extraTip(i) : ''));
    r.addEventListener('mousemove', h); r.addEventListener('touchstart', h, { passive: true }); r.addEventListener('mouseleave', hideTip); });
}
function donut(el, items, fmt = n0, total) {
  const C = SER(), tot = total ?? sum(items, x => x.v); const R = 62, r = 42, cx = 75, cy = 75;
  let a0 = -Math.PI / 2, paths = '';
  const gapA = items.length > 1 ? 0.025 : 0;
  items.forEach((it, i) => { const frac = tot ? it.v / tot : 0; if (frac <= 0) return; const a1 = a0 + frac * Math.PI * 2; const s = a0 + gapA / 2, e = Math.max(s + 0.001, a1 - gapA / 2); const big = e - s > Math.PI ? 1 : 0;
    const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [x1, y1] = p(R, s), [x2, y2] = p(R, e), [x3, y3] = p(r, e), [x4, y4] = p(r, s);
    paths += frac >= .9999 ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${it.color || C[i % C.length]}" stroke-width="${R - r}" data-i="${i}" class="seg"/>`
      : `<path class="seg" data-i="${i}" d="M${x1},${y1}A${R},${R} 0 ${big} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${big} 0 ${x4},${y4}Z" fill="${it.color || C[i % C.length]}"/>`; a0 = a1; });
  el.innerHTML = `<div class="donut-wrap"><svg viewBox="0 0 150 150" role="img">${paths}<text x="75" y="72" text-anchor="middle" class="lbl-strong" style="font-size:17px">${esc(items.centerTop || fmt(tot))}</text><text x="75" y="90" text-anchor="middle">${esc(items.centerSub || 'tổng')}</text></svg>
    <div class="donut-list">${items.map((it, i) => `<div><i style="background:${it.color || C[i % C.length]}"></i><span>${esc(it.k)}</span><b>${fmt(it.v)}</b><small>${tot ? pct(it.v / tot) : '—'}</small></div>`).join('') || '<div class="empty">Chưa có dữ liệu</div>'}</div></div>`;
  $$('.seg', el).forEach(p => { const it = items[+p.dataset.i]; const h = e => showTip(e, `<b>${esc(it.k)}</b><div><span>Giá trị</span><span>${fmt(it.v)}</span></div><div><span>Tỷ trọng</span><span>${pct(it.v / tot, 1)}</span></div>` + (it.extra || ''));
    p.addEventListener('mousemove', h); p.addEventListener('touchstart', h, { passive: true }); p.addEventListener('mouseleave', hideTip); });
}
function ring(frac, label, color) {
  const R = 70, c = 2 * Math.PI * R, f = Math.max(0, Math.min(1, frac || 0)), over = (frac || 0) > 1;
  return `<svg class="ring" viewBox="0 0 168 168" role="img" aria-label="${esc(label)}"><circle cx="84" cy="84" r="${R}" fill="none" stroke="var(--grid)" stroke-width="14"/>
  <circle cx="84" cy="84" r="${R}" fill="none" stroke="${color || 'url(#rg)'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 84 84)" style="transition:stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)"/>
  <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fc6d1"/><stop offset="1" stop-color="#664139"/></linearGradient></defs>
  <text x="84" y="84" text-anchor="middle" style="font:700 30px var(--font);fill:var(--ink);letter-spacing:-.03em">${frac == null ? '—' : Math.round(frac * 100) + '%'}</text>
  <text x="84" y="106" text-anchor="middle" style="font:600 12px var(--font);fill:var(--muted)">${esc(label)}${over ? ' ✓' : ''}</text></svg>`;
}
function hbars(items, fmt = n0, color) { const max = Math.max(1, ...items.map(i => i.v)); const C = SER();
  return `<div class="hbar">${items.map((it, i) => `<div class="row"><span title="${esc(it.k)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.k)}</span><div class="tr"><i style="width:${(it.v / max * 100).toFixed(1)}%;background:${it.color || color || C[0]}"></i></div><b>${fmt(it.v)}</b></div>`).join('') || '<div class="empty">Chưa có dữ liệu</div>'}</div>`; }
const card = (title, sub, body, extra = '') => `<section class="card glass">${title ? `<div class="card-head"><div><h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${extra}</div>` : ''}${body}</section>`;
const kpi = (lbl, val, meta = '', right = '', bar) => `<section class="card glass kpi"><div class="lbl"><span>${lbl}</span>${right}</div><div class="val">${val}</div><div class="meta">${meta}</div>${bar != null ? `<div class="bar-track"><i style="width:${Math.min(100, bar * 100).toFixed(1)}%"></i></div>` : ''}</section>`;
const dayList = r => { const out = []; for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d); return out; };

// ---------------- CastleGate free-storage model (FIFO by received date) ----------------
function cgModel() {
  const man = (D.wf && D.wf.inbItems) || {};
  const recvMan = (D.wf && D.wf.inbRecv) || {};
  const inb = ((D.wf && D.wf.inb) || []).filter(p => !/cancel/i.test(p.status)).map(p => ({ ...p, recvStart: p.recvStart || recvMan[p.id] || null, items: (p.items && p.items.length) ? p.items : (man[p.id] || man[p.po] || []) }));
  const received = inb.filter(p => p.recvStart).sort((a, b) => a.recvStart.localeCompare(b.recvStart));
  const inv = new Map(((D.wf && D.wf.inv) || []).map(r => [r[0], { part: r[0], fam: r[1], inStock: Math.max(0, r[2] || 0), avail: Math.max(0, r[3] || 0), onOrder: r[4] || 0, retail: r[5], wholesale: r[6], aged: r[7] || 0, n3m: r[8] || 0, purch: r[9], status: r[10], supply: r[11] }]));
  const t = M.today, from30 = addDays(t, -29);
  const sold30 = new Map(); M.wfo.filter(o => o.ok && inR(o.date, { from: from30, to: t })).forEach(o => sold30.set(o.part, (sold30.get(o.part) || 0) + o.qty));
  // FIFO: on-hand belongs to newest receipts first; oldest receipt is consumed first
  const pos = received.map(p => { const recv = p.recvStart.slice(0, 10), freeEnd = addDays(recv, FREE_DAYS); return { ...p, recv, freeEnd, daysLeft: diffDays(t, freeEnd), elapsed: diffDays(recv, t), lines: [] }; });
  const parts = new Set(pos.flatMap(p => p.items.map(i => i[0])));
  for (const part of parts) {
    let onHand = (inv.get(part) || {}).inStock || 0;
    const newestFirst = pos.filter(p => p.items.some(i => i[0] === part && i[3] > 0)).sort((a, b) => b.recv.localeCompare(a.recv));
    for (const p of newestFirst) { const rec = p.items.find(i => i[0] === part)[3]; const left = Math.min(rec, onHand); onHand -= left;
      const v = (sold30.get(part) || 0) / 30; const proj = Math.max(0, left - v * Math.max(0, p.daysLeft));
      p.lines.push({ part, received: rec, left, sold: rec - left, vel: v, need: p.daysLeft > 0 ? left / p.daysLeft : null, projLeft: proj, cogs: M.cogsOf(part) }); }
  }
  pos.forEach(p => { p.lines.sort((a, b) => b.projLeft * b.cogs - a.projLeft * a.cogs); p.recvUnits = sum(p.lines, l => l.received); p.left = sum(p.lines, l => l.left); p.projLeft = sum(p.lines, l => l.projLeft); p.projVal = sum(p.lines, l => l.projLeft * l.cogs); });
  const open = inb.filter(p => !p.recvStart);
  return { pos, open, inv, sold30, all: inb };
}

// ---------------- views ----------------
function viewOverview() {
  const r = range(), pr = prevRange(r);
  const cur = agg(ordersIn(r)), prev = pr ? agg(ordersIn(pr)) : null;
  const ads = adsIn(r), spend = sum(ads, a => a.spend), adSales = sum(ads, a => a.sales);
  const pAds = pr ? sum(adsIn(pr), a => a.spend) : null;
  const k = D.kpi || { months: [] }; const ym = M.today.slice(0, 7); const ki = k.months.indexOf(ym);
  const mtd = agg(ordersIn({ from: ym + '-01', to: M.today }));
  const target = ki >= 0 ? k.rev[ki] : null, dim = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), dayN = +M.today.slice(8, 10);
  const paceTarget = target ? target * dayN / dim : null, runRate = mtd.rev / dayN * dim;
  const cg = cgModel(); const first = cg.pos[0];
  const ttAll = M.wfo.filter(o => o.tt && o.ok);
  // alerts
  const al = [];
  if (first) { const cls = first.daysLeft <= 14 ? 'crit' : first.daysLeft <= 30 ? 'warn' : 'info';
    al.push(`<div class="alert ${cls}"><span class="ic">⏳</span><div><b>CastleGate ${esc(first.id)}: còn ${first.daysLeft} ngày miễn phí lưu kho (đến ${dLong(first.freeEnd)})</b><span>Còn ${n0(first.left)}/${n0(first.recvUnits)} sản phẩm của lô này trong kho. Với tốc độ bán 30 ngày gần nhất, dự kiến còn ~${n0(first.projLeft)} sản phẩm (giá vốn ~${usd(first.projVal)}) khi hết hạn miễn phí.</span></div></div>`); }
  const amzBad = ((D.amz && D.amz.ads && D.amz.ads.camps) || []).filter(c => /PAYMENT/i.test(c[3] || ''));
  if (amzBad.length) al.push(`<div class="alert crit"><span class="ic">!</span><div><b>Amazon Ads: ${amzBad.length} chiến dịch đang dừng vì lỗi thanh toán</b><span>Trạng thái "Advertiser payment failure" — cập nhật phương thức thanh toán trong Amazon Ads &gt; Billing để quảng cáo chạy lại.</span></div></div>`);
  const oos = [...cg.inv.values()].filter(x => x.status === 'ACTIVE' && x.purch === 'PURCHASABLE' && x.avail <= 0);
  const stockNoBuy = [...cg.inv.values()].filter(x => x.inStock > 0 && x.purch != null && x.purch !== 'PURCHASABLE');
  if (stockNoBuy.length) al.push(`<div class="alert warn"><span class="ic">!</span><div><b>${stockNoBuy.length} SKU có hàng trong kho nhưng đang "Unpurchasable"</b><span>${stockNoBuy.map(x => esc(x.part) + ' (' + x.inStock + ')').join(', ')} — khách không mua được dù còn tồn.</span></div></div>`);
  if (oos.length) al.push(`<div class="alert warn"><span class="ic">!</span><div><b>${oos.length} SKU đang bán nhưng hết hàng khả dụng</b><span>${oos.map(x => esc(x.part)).join(', ')}</span></div></div>`);
  if (ttAll.length) al.push(`<div class="alert info"><span class="ic">★</span><div><b>${ttAll.length} đơn Tried &amp; True (review for free sample)</b><span>Đã tách khỏi doanh thu bán hàng${S.incTT ? ' — hiện đang được cộng vào số liệu theo lựa chọn bộ lọc' : ''}. Giá trị: ${usd(sum(ttAll, o => o.rev))}.</span></div></div>`);
  const tacos = cur.rev ? spend / cur.rev : null;
  return `
  <section class="card glass hero">
    ${ring(target ? mtd.rev / target : null, 'KPI ' + mLabel(ym))}
    <div>
      <h2>Doanh thu tháng ${mLabel(ym)} · so với KPI</h2>
      <div class="big">${usd(mtd.rev)} <span class="of">/ ${target ? usd(target) : 'chưa có KPI'}</span></div>
      <div class="line">${target ? `Theo tiến độ ngày ${dayN}/${dim}: cần ${usd(paceTarget)} · ${mtd.rev >= paceTarget ? '<span class="delta up">vượt tiến độ ' + usd(mtd.rev - paceTarget) + '</span>' : '<span class="delta down">thiếu ' + usd(paceTarget - mtd.rev) + '</span>'} · Dự phóng cả tháng ${usd(runRate)}` : ''}</div>
      <div class="hero-stats">
        <div><b>${n0(mtd.units)}${ki >= 0 ? ' / ' + n0(k.unit[ki]) : ''}</b><span>Sản phẩm bán / KPI</span></div>
        <div><b>${n0(mtd.ords)}</b><span>Đơn hàng</span></div>
        <div><b>${pct(mtd.gpm)}</b><span>Biên LN gộp ước tính${ki >= 0 ? ' · KPI ' + pct(k.gp[ki] / k.rev[ki]) : ''}</span></div>
        <div><b>${usd(sum(adsIn({ from: ym + '-01', to: M.today }), a => a.spend))}${ki >= 0 ? ' / ' + usd(k.ads[ki]) : ''}</b><span>Chi phí Ads / KPI</span></div>
      </div>
    </div>
  </section>
  <div class="grid g-kpi">
    ${kpi('Doanh thu', usd(cur.rev), (pr ? deltaHtml(cur.rev, prev.rev) + (prev.rev ? ' so với kỳ trước' : '') : 'toàn bộ'), '<span class="pill muted">' + r.days + 'n</span>')}
    ${kpi('Sản phẩm bán', n0(cur.units), pr ? deltaHtml(cur.units, prev.units) + (prev.units ? ' so với kỳ trước' : '') : '')}
    ${kpi('Đơn hàng', n0(cur.ords), 'Giá trị TB/đơn ' + usd(cur.aov))}
    ${kpi('Lợi nhuận gộp ước tính', usd(cur.gp), 'Biên ' + pct(cur.gpm) + ' · sau giá vốn DDP, DDA 2,5%, Co-op 10%')}
    ${kpi('Chi phí quảng cáo', usd(spend), (pr ? deltaHtml(spend, pAds, true) + ' · ' : '') + 'TACoS ' + pct(tacos, 1))}
    ${kpi('ROAS (giá bán lẻ)', adSales && spend ? nf1.format(adSales / spend) + '×' : '—', 'Doanh số lẻ từ Ads ' + usd(adSales))}
  </div>
  <div class="grid g-21">
    ${card('Doanh thu thực tế so với KPI theo tháng', 'Cột: doanh thu thực (giá Wayfair trả) · Đường đứt: KPI "Rev" sheet Cashflow 26+27', '<div class="chart" id="cKpi"></div><div class="legend"><span><i style="background:var(--s1)"></i>Thực tế</span><span><i class="dash" style="color:var(--s2)"></i>KPI</span></div>', '<div style="display:flex;gap:6px"><button class="view-toggle" id="kpiRange">' + (S.kpiAll ? 'Gần đây' : 'Cả lộ trình') + '</button><button class="view-toggle" data-toggle="kpiTbl">Bảng</button></div>')}
    ${card('Cảnh báo & việc cần làm', '', `<div class="alerts">${al.join('') || '<div class="empty">Không có cảnh báo</div>'}</div>`)}
  </div>
  <div class="card glass" id="kpiTbl" hidden></div>
  <div class="grid g-2">
    ${card('Doanh thu theo ngày', 'Trong khoảng thời gian đã chọn', '<div class="chart" id="cDaily"></div>')}
    ${card('Doanh thu theo Collection', 'Calix (Kathryn) · Zena (Vivian) · Caroline · Vestra', '<div class="chart" id="cColl"></div>')}
  </div>`;
}
function afterOverview() {
  const k = D.kpi || { months: [] };
  const byM = groupBy(M.orders.filter(o => o.ok && (S.incTT || !o.tt) && (S.channel === 'all' || o.ch === S.channel)), o => o.date.slice(0, 7));
  const allM = k.months.length ? k.months : [...byM.keys()].sort();
  const curM = M.today.slice(0, 7), ci = Math.max(0, allM.indexOf(curM));
  const months = S.kpiAll ? allM : allM.slice(0, Math.max(ci + 3, 4));
  $('#kpiRange').onclick = () => { S.kpiAll = !S.kpiAll; render(); };
  const act = months.map(m => m <= M.today.slice(0, 7) ? sum(byM.get(m) || [], o => o.rev) : null);
  barChart($('#cKpi'), { labels: months.map(mLabel), series: [{ name: 'Thực tế', color: cssv('--s1'), values: act }, { name: 'KPI', color: cssv('--s2'), values: (k.rev || []).slice(0, months.length), type: 'line', dash: true }], fmt: v => usd(v), fmtAxis: usdK, height: 260,
    extraTip: i => act[i] != null && k.rev && k.rev[i] ? `<div><span>Đạt</span><span>${pct(act[i] / k.rev[i])}</span></div>` : '' });
  $('#kpiTbl').innerHTML = `<div class="card-head"><div><h3>KPI theo tháng (Cashflow 26+27)</h3></div></div><div class="tbl-wrap"><table><thead><tr><th>Tháng</th><th class="num">Units KPI</th><th class="num">Units thực</th><th class="num">Rev KPI</th><th class="num">Rev thực</th><th class="num">% đạt</th><th class="num">Ads KPI</th><th class="num">GP KPI</th></tr></thead><tbody>${allM.map((m, i) => { const os = byM.get(m) || []; const a = sum(os, o => o.rev); return `<tr><td>${mLabel(m)}</td><td class="num">${n0(k.unit[i])}</td><td class="num">${m <= M.today.slice(0, 7) ? n0(sum(os, o => o.qty)) : '—'}</td><td class="num">${usd(k.rev[i])}</td><td class="num">${m <= M.today.slice(0, 7) ? usd(a) : '—'}</td><td class="num">${m <= M.today.slice(0, 7) && k.rev[i] ? pct(a / k.rev[i]) : '—'}</td><td class="num">${usd(k.ads[i])}</td><td class="num">${usd(k.gp[i])}</td></tr>`; }).join('')}</tbody></table></div>`;
  const r = range(), days = S.period === 'all' ? dayList({ from: (M.orders[M.orders.length - 1] || {}).date || M.today, to: M.today }) : dayList(r);
  const os = ordersIn(r.from < '2001' ? { from: days[0], to: M.today } : r), bd = groupBy(os, o => o.date);
  barChart($('#cDaily'), { labels: days.map(dShort), tipLabels: days.map(dLong), series: [{ name: 'Doanh thu', color: cssv('--s1'), values: days.map(d => sum(bd.get(d) || [], o => o.rev)) }], fmt: v => usd(v), fmtAxis: usdK,
    extraTip: i => { const x = bd.get(days[i]) || []; return `<div><span>Sản phẩm</span><span>${n0(sum(x, o => o.qty))}</span></div>`; } });
  const byC = groupBy(os, o => M.prod(o.part).col);
  donut($('#cColl'), [...byC].map(([k, v]) => ({ k, v: sum(v, o => o.rev), extra: `<div><span>Sản phẩm</span><span>${n0(sum(v, o => o.qty))}</span></div>` })).sort((a, b) => b.v - a.v), v => usd(v));
}

function viewCastleGate() {
  const cg = cgModel(); const C = SER();
  const poCards = cg.pos.map(p => {
    const cls = p.daysLeft <= 14 ? 'crit' : p.daysLeft <= 30 ? 'warn' : 'good';
    const st = [['Tạo PO', p.created], ['Rời cảng VN', p.loadAtd], ['Cập cảng Mỹ', p.portAta], ['Đến kho', p.whAta], ['Bắt đầu nhận', p.recvStart]];
    const frac = Math.min(1, Math.max(0, p.elapsed / FREE_DAYS));
    return `<section class="card glass cg-po">
      <div class="cg-top"><div><h3>${esc(p.id)} <span class="pill info"><i></i>${esc(p.status)}</span></h3><p class="sub">${esc(p.po || '')} · ${esc(p.dest || '')} · ${p.cbm ? nf1.format(p.cbm) + ' CBM' : ''} ${p.container ? '· ' + esc(p.container) : ''}</p></div>
        <div style="text-align:right"><div class="cg-days"><b>${Math.max(0, p.daysLeft)}</b><span>ngày miễn phí còn lại</span></div><span class="pill ${cls}"><i></i>Hết miễn phí ${dLong(p.freeEnd)}</span></div></div>
      <div><div class="free-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div><div class="legend-row"><span>Nhận ${dLong(p.recv)}</span><span>Ngày ${Math.min(p.elapsed, 999)}/${FREE_DAYS}</span><span>${dLong(p.freeEnd)}</span></div></div>
      <div class="timeline">${st.map(([l, d]) => `<div class="st ${d ? 'done' : ''}"><b>${l}</b>${d ? dLong(d) : '—'}</div>`).join('')}</div>
      <div class="grid g-kpi" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        ${kpi('Đã nhận', n0(p.recvUnits), 'sản phẩm')}${kpi('Đã bán (FIFO)', n0(p.recvUnits - p.left), pct((p.recvUnits - p.left) / p.recvUnits) + ' sell-through', '', (p.recvUnits - p.left) / p.recvUnits)}
        ${kpi('Còn trong kho', n0(p.left), 'giá vốn ' + usd(sum(p.lines, l => l.left * l.cogs)))}${kpi('Dự kiến tồn khi hết hạn', n0(p.projLeft), 'giá vốn ~' + usd(p.projVal) + ' sẽ bắt đầu tính phí kho')}
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>SKU</th><th class="num">Nhận</th><th class="num">Đã bán</th><th class="num">Còn</th><th class="num">Bán/ngày (30n)</th><th class="num">Cần bán/ngày</th><th class="num">Dự kiến còn</th><th>Đánh giá</th></tr></thead><tbody>
      ${p.lines.map(l => { const pr = M.prod(l.part); const risk = l.left === 0 ? ['good', 'Đã bán hết'] : l.projLeft <= 0.5 ? ['good', 'Kịp bán hết'] : l.projLeft / l.left > .5 ? ['crit', 'Cần đẩy mạnh'] : ['warn', 'Theo dõi'];
        return `<tr><td><div class="sku"><span class="dot" style="background:${colColor(pr.col)}"></span><div><b>${esc(l.part)}</b><small>${esc(pr.col)} ${esc(pr.size)} · ${esc(pr.color)}</small></div></div></td><td class="num">${l.received}</td><td class="num">${l.sold}</td><td class="num"><b>${l.left}</b></td><td class="num">${l.vel ? l.vel.toFixed(2) : '0'}</td><td class="num">${l.need == null ? '—' : l.need.toFixed(2)}</td><td class="num">${Math.round(l.projLeft)}</td><td><span class="pill ${risk[0]}"><i></i>${risk[1]}</span></td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="note">Giả định FIFO: hàng nhập trước được bán trước. "Cần bán/ngày" = số còn lại ÷ số ngày miễn phí còn lại. "Dự kiến còn" dùng tốc độ bán 30 ngày gần nhất.</p>
    </section>`; }).join('');
  const openCards = cg.open.map(p => `<div class="alert info"><span class="ic">⛴</span><div><b>${esc(p.id)} · ${esc(p.status)} · ${n0(sum(p.items, i => i[1]))} sản phẩm kế hoạch</b><span>${esc(p.po || '')} · tạo ${dLong(p.created)} · hàng sẵn sàng ${dLong(p.ready)} · đến ${esc(p.dest || '—')}${p.eta ? ' · ETA ' + dLong(p.eta) : ''}. Khi nhận vào kho sẽ có thêm 90 ngày miễn phí cho lô này.</span><div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${p.items.filter(i => i[1]).map(i => `<span class="tag">${esc(i[0])} × ${i[1]}</span>`).join('')}</div></div></div>`).join('');
  const invAll = [...cg.inv.values()].filter(x => x.status === 'ACTIVE' || x.inStock > 0);
  const inv = invAll.filter(x => S.invAll || x.inStock > 0 || x.onOrder > 0 || (cg.sold30.get(x.part) || 0) > 0).sort((a, b) => b.inStock - a.inStock || a.part.localeCompare(b.part));
  const totIn = sum(invAll, x => x.inStock), totVal = sum(invAll, x => x.inStock * M.cogsOf(x.part)), totRetail = sum(invAll, x => x.inStock * (x.wholesale || 0));
  return `
  <h2 class="section-title">CastleGate · PO nhập kho &amp; 90 ngày miễn phí lưu kho</h2>
  <p class="section-sub">Ngày vào kho lấy theo mốc "Receiving Start" của Wayfair; hạn miễn phí = ngày nhận + 90 ngày.</p>
  ${poCards || card('', '', '<div class="empty">Chưa có lô nào đã nhận vào kho</div>')}
  ${openCards ? card('PO đang trên đường / chờ nhận', '', `<div class="alerts">${openCards}</div>`) : ''}
  <h2 class="section-title">Tồn kho thực tế (CastleGate)</h2>
  <div class="grid g-kpi">
    ${kpi('Tồn kho', n0(totIn), 'sản phẩm trong mạng lưới CastleGate')}
    ${kpi('Giá trị tồn (giá vốn)', usd(totVal), 'theo COGS DDP')}
    ${kpi('Giá trị tồn (giá bán Wayfair)', usd(totRetail), 'wholesale')}
    ${kpi('SKU có hàng', n0(invAll.filter(x => x.inStock > 0).length) + '<small>/ ' + invAll.length + '</small>', 'SKU đang hoạt động')}
  </div>
  <div class="grid g-12">
    ${card('Tồn kho theo Collection', '', '<div class="chart" id="cInvCol"></div>')}
    ${card('Chi tiết tồn kho theo SKU', 'Days of cover = tồn khả dụng ÷ tốc độ bán 30 ngày', `<div class="tbl-wrap"><table><thead><tr><th>SKU</th><th class="num">Trong kho</th><th class="num">Khả dụng</th><th class="num">Đang về</th><th class="num">Bán 30n</th><th class="num">Days of cover</th><th class="num">Tồn &gt;90n</th><th class="num">Dự báo 3T</th><th>Trạng thái</th></tr></thead><tbody>
      ${inv.map(x => { const pr = M.prod(x.part), s30 = cg.sold30.get(x.part) || 0, doc = s30 ? x.avail / (s30 / 30) : null;
        return `<tr><td><div class="sku"><span class="dot" style="background:${colColor(pr.col)}"></span><div><b>${esc(x.part)}</b><small>${esc(pr.col)} ${esc(pr.size)} · ${esc(pr.color)}</small></div></div></td><td class="num"><b>${x.inStock}</b></td><td class="num">${x.avail}</td><td class="num">${x.onOrder || 0}</td><td class="num">${s30}</td><td class="num">${doc == null ? '—' : Math.round(doc) + 'n'}</td><td class="num">${x.aged || 0}</td><td class="num">${x.n3m || 0}</td><td>${x.purch == null ? (x.inStock > 0 ? '<span class="pill good"><i></i>Có hàng</span>' : '<span class="pill muted"><i></i>Hết hàng</span>') : x.purch === 'PURCHASABLE' ? '<span class="pill good"><i></i>Đang bán</span>' : '<span class="pill crit"><i></i>Không mua được</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>`, `<button class="view-toggle" id="invAll">${S.invAll ? 'Ẩn SKU tồn 0' : 'Hiện tất cả ' + invAll.length + ' SKU'}</button>`)}
  </div>`;
}
const COLL_ORDER = ['Calix', 'Zena', 'Caroline', 'Vestra', 'Khác'];
function colColor(c) { const i = COLL_ORDER.indexOf(c); return SER()[i < 0 ? 4 : i]; }
function afterCastleGate() {
  const ib = $('#invAll'); if (ib) ib.onclick = () => { S.invAll = !S.invAll; render(); };
  const cg = cgModel(); const byC = new Map();
  for (const x of cg.inv.values()) { if (!x.inStock) continue; const c = M.prod(x.part).col; byC.set(c, (byC.get(c) || 0) + x.inStock); }
  const el = $('#cInvCol'); if (el) donut(el, [...byC].map(([k, v]) => ({ k, v, color: colColor(k) })).sort((a, b) => COLL_ORDER.indexOf(a.k) - COLL_ORDER.indexOf(b.k)), n0);
}

function viewSales() {
  const r = range(); const os = ordersIn(r), a = agg(os); const ttO = ordersIn(r, { tt: true }).filter(o => o.tt);
  const rows = ordersIn(r, { all: true, tt: true });
  return `
  <div class="grid g-kpi">
    ${kpi('Doanh thu', usd(a.rev), n0(a.ords) + ' đơn · ' + n0(a.units) + ' sản phẩm')}
    ${kpi('Giá trị TB/đơn', usd(a.aov), 'wholesale')}
    ${kpi('Lợi nhuận gộp ước tính', usd(a.gp), 'Biên ' + pct(a.gpm))}
    ${kpi('Tried &amp; True', n0(ttO.length) + '<small>đơn</small>', usd(sum(ttO, o => o.rev)) + ' · chương trình review mẫu miễn phí')}
  </div>
  <div class="grid g-2">
    ${card('Theo Collection', 'Doanh thu', '<div class="chart" id="sCol"></div>')}
    ${card('Theo Category', 'Doanh thu', '<div class="chart" id="sCat"></div>')}
    ${card('Theo kích thước (Size)', 'Sản phẩm bán', '<div id="sSize"></div>')}
    ${card('Theo màu (Color)', 'Sản phẩm bán', '<div class="chart" id="sColor"></div>')}
  </div>
  <div class="grid g-21">
    ${card('Hiệu quả từng SKU', 'Xếp theo doanh thu trong kỳ', `<div class="tbl-wrap"><table><thead><tr><th>SKU</th><th>Collection</th><th>Size</th><th>Màu</th><th>Category</th><th class="num">SL</th><th class="num">Doanh thu</th><th class="num">Giá TB</th><th class="num">LN gộp</th><th class="num">Biên</th></tr></thead><tbody id="skuBody"></tbody></table></div>`)}
    ${card('Theo bang (Mỹ/Canada)', 'Sản phẩm bán', '<div id="sState"></div>')}
  </div>
  ${card('Danh sách đơn hàng', 'Đơn có nhãn <span class="tag tt">Tried &amp; True</span> là đơn của chương trình review for free sample (cột Sales Channel)', `<div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Kênh</th><th>PO</th><th>SKU</th><th>Sản phẩm</th><th class="num">SL</th><th class="num">Giá</th><th>Trạng thái</th><th>Bang</th><th>Ghi chú</th></tr></thead><tbody>
    ${rows.map(o => { const pr = M.prod(o.part); return `<tr><td>${dLong(o.date)}</td><td>${o.ch === 'wf' ? (o.retailer || 'Wayfair') : 'Amazon'}</td><td>${esc(o.po)}</td><td><b>${esc(o.part)}</b></td><td><small>${esc(pr.col)} ${esc(pr.size)} · ${esc(pr.color)}</small></td><td class="num">${o.qty}</td><td class="num">${usd(o.price, 2)}</td><td>${o.ok ? esc(o.status) : '<span class="pill crit"><i></i>' + esc(o.status) + '</span>'}</td><td>${esc(o.state || '')}</td><td>${o.tt ? '<span class="tag tt">Tried &amp; True</span> ' : ''}${o.retailer === 'Wayfair.ca' ? '<span class="tag ca">Canada</span> ' : ''}${o.b2b ? '<span class="tag">B2B</span>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">Không có đơn trong kỳ</td></tr>'}
  </tbody></table></div>`)}`;
}
function afterSales() {
  const r = range(), os = ordersIn(r);
  const by = f => [...groupBy(os, f)].map(([k, v]) => ({ k, v: sum(v, o => o.rev), u: sum(v, o => o.qty) }));
  donut($('#sCol'), by(o => M.prod(o.part).col).map(x => ({ ...x, color: colColor(x.k) })).sort((a, b) => b.v - a.v), v => usd(v));
  donut($('#sCat'), by(o => M.prod(o.part).cat).sort((a, b) => b.v - a.v), v => usd(v));
  const sizes = by(o => { const p = M.prod(o.part); return p.col + ' ' + p.size; }).sort((a, b) => b.u - a.u);
  $('#sSize').innerHTML = hbars(sizes.map(x => ({ k: x.k, v: x.u, color: colColor(x.k.split(' ')[0]) })), n0);
  donut($('#sColor'), by(o => M.prod(o.part).color).map(x => ({ k: x.k, v: x.u })).sort((a, b) => b.v - a.v), n0);
  const st = [...groupBy(os, o => (o.state || '—') + (o.retailer === 'Wayfair.ca' ? ' (CA)' : ''))].map(([k, v]) => ({ k, v: sum(v, o => o.qty) })).sort((a, b) => b.v - a.v).slice(0, 12);
  $('#sState').innerHTML = hbars(st, n0, cssv('--s1'));
  const sk = [...groupBy(os, o => o.part)].map(([k, v]) => ({ part: k, p: M.prod(k), u: sum(v, o => o.qty), rev: sum(v, o => o.rev), gp: sum(v, o => o.gp) })).sort((a, b) => b.rev - a.rev);
  $('#skuBody').innerHTML = sk.map(x => `<tr><td><div class="sku"><span class="dot" style="background:${colColor(x.p.col)}"></span><b>${esc(x.part)}</b></div></td><td>${esc(x.p.col)}</td><td>${esc(x.p.size)}</td><td>${esc(x.p.color)}</td><td>${esc(x.p.cat)}</td><td class="num">${x.u}</td><td class="num"><b>${usd(x.rev)}</b></td><td class="num">${usd(x.rev / x.u, 2)}</td><td class="num">${usd(x.gp)}</td><td class="num">${pct(x.rev ? x.gp / x.rev : null)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">Không có dữ liệu</td></tr>';
}

function viewAds() {
  const r = range(), pr = prevRange(r);
  const wf = M.wfAds.filter(a => inR(a.date, r)), am = M.amAds.filter(a => inR(a.date, r));
  const s = x => ({ spend: sum(x, a => a.spend), sales: sum(x, a => a.sales), clicks: sum(x, a => a.clicks), impr: sum(x, a => a.impr), orders: sum(x, a => a.orders) });
  const W = s(wf), A = s(am), rev = agg(ordersIn(r)).rev;
  const wallet = D.wf && D.wf.ads && D.wf.ads.wallet;
  const amC = (D.amz && D.amz.ads && D.amz.ads.camps) || [];
  const byCamp = [...groupBy(wf, a => a.camp)].map(([id, x]) => ({ id, c: M.camps.get(id) || { name: id }, ...s(x) })).sort((a, b) => b.spend - a.spend);
  return `
  <div class="grid g-kpi">
    ${kpi('Chi phí Ads Wayfair', usd(W.spend, 2), 'Ví còn ' + (wallet && wallet.balance != null ? usd(wallet.balance, 2) : '—'))}
    ${kpi('ROAS Wayfair', W.spend ? nf1.format(W.sales / W.spend) + '×' : '—', 'Doanh số lẻ quy cho Ads ' + usd(W.sales))}
    ${kpi('CPC · CTR', W.clicks ? usd(W.spend / W.clicks, 2) : '—', 'CTR ' + pct(W.impr ? W.clicks / W.impr : null, 2) + ' · ' + n0(W.clicks) + ' click')}
    ${kpi('TACoS', pct(rev ? (W.spend + A.spend) / rev : null, 1), 'Tổng Ads ÷ doanh thu (wholesale)')}
    ${kpi('Chi phí Ads Amazon', usd(A.spend, 2), n0(A.clicks) + ' click · ' + n0(A.orders) + ' đơn')}
  </div>
  <div class="grid g-2">
    ${card('Chi phí quảng cáo theo ngày', 'Wayfair và Amazon', '<div class="chart" id="aSpend"></div><div class="legend"><span><i style="background:var(--s1)"></i>Wayfair</span><span><i style="background:var(--s2)"></i>Amazon</span></div>')}
    ${card('Doanh số lẻ quy cho Ads (Wayfair)', 'Attributed retail sales, cửa sổ 14 ngày', '<div class="chart" id="aSales"></div>')}
  </div>
  ${card('Chiến dịch Wayfair', '', `<div class="tbl-wrap"><table><thead><tr><th>Chiến dịch</th><th>Bắt đầu</th><th class="num">Ngân sách/ngày</th><th class="num">Hiển thị</th><th class="num">Click</th><th class="num">CTR</th><th class="num">CPC</th><th class="num">Chi phí</th><th class="num">Đơn</th><th class="num">Doanh số lẻ</th><th class="num">ROAS</th></tr></thead><tbody>
    ${byCamp.map(x => `<tr><td><b>${esc(x.c.name)}</b></td><td>${dLong(x.c.start)}</td><td class="num">${x.c.cap ? usd(x.c.cap) : '—'}</td><td class="num">${n0(x.impr)}</td><td class="num">${n0(x.clicks)}</td><td class="num">${pct(x.impr ? x.clicks / x.impr : null, 2)}</td><td class="num">${x.clicks ? usd(x.spend / x.clicks, 2) : '—'}</td><td class="num"><b>${usd(x.spend, 2)}</b></td><td class="num">${n0(x.orders)}</td><td class="num">${usd(x.sales)}</td><td class="num">${x.spend ? nf1.format(x.sales / x.spend) + '×' : '—'}</td></tr>`).join('') || '<tr><td colspan="11" class="empty">Không có dữ liệu</td></tr>'}
  </tbody></table></div>`)}
  ${card('Chiến dịch Amazon (Sponsored Products)', '30 ngày gần nhất theo Amazon Ads', `<div class="tbl-wrap"><table><thead><tr><th>Chiến dịch</th><th>Trạng thái</th><th>Bắt đầu</th><th class="num">Ngân sách/ngày</th><th class="num">Click</th><th class="num">Chi phí</th><th class="num">Doanh số</th><th class="num">Đơn</th></tr></thead><tbody>
    ${amC.map(c => `<tr><td><b>${esc(c[1])}</b></td><td>${/PAYMENT/i.test(c[3] || '') ? '<span class="pill crit"><i></i>Lỗi thanh toán</span>' : '<span class="pill muted"><i></i>' + esc(c[3] || c[2]) + '</span>'}</td><td>${dLong(c[4])}</td><td class="num">${usd(c[5] || 0)}</td><td class="num">${n0(c[7])}</td><td class="num">${usd(c[8] || 0, 2)}</td><td class="num">${usd(c[9] || 0)}</td><td class="num">${n0(c[10])}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Chưa có dữ liệu Amazon Ads</td></tr>'}
  </tbody></table></div>`)}`;
}
function afterAds() {
  const r = range(); const first = [...M.wfAds, ...M.amAds].map(a => a.date).sort()[0] || M.today;
  const days = dayList(S.period === 'all' ? { from: first, to: M.today } : r);
  const w = groupBy(M.wfAds, a => a.date), a = groupBy(M.amAds, x => x.date);
  barChart($('#aSpend'), { labels: days.map(dShort), tipLabels: days.map(dLong), series: [{ name: 'Wayfair', color: cssv('--s1'), values: days.map(d => sum(w.get(d) || [], x => x.spend)) }, { name: 'Amazon', color: cssv('--s2'), values: days.map(d => sum(a.get(d) || [], x => x.spend)) }], fmt: v => usd(v, 2), fmtAxis: v => '$' + v });
  barChart($('#aSales'), { labels: days.map(dShort), tipLabels: days.map(dLong), series: [{ name: 'Doanh số lẻ', color: cssv('--s3'), values: days.map(d => sum(w.get(d) || [], x => x.sales)) }], fmt: v => usd(v), fmtAxis: usdK,
    extraTip: i => { const x = w.get(days[i]) || [], sp = sum(x, y => y.spend), sl = sum(x, y => y.sales); return `<div><span>Chi phí</span><span>${usd(sp, 2)}</span></div><div><span>ROAS</span><span>${sp ? nf1.format(sl / sp) + '×' : '—'}</span></div>`; } });
}

function viewAmazon() {
  const o = M.amo; const ok = o.filter(x => x.ok), A = agg(ok);
  const amC = (D.amz && D.amz.ads && D.amz.ads.camps) || []; const spend = sum(amC, c => c[8] || 0);
  return `
  <div class="grid g-kpi">
    ${kpi('Đơn Amazon (365 ngày)', n0(o.length), n0(ok.length) + ' hợp lệ · ' + n0(o.length - ok.length) + ' hủy')}
    ${kpi('Doanh thu Amazon', usd(A.rev), 'FBM')}
    ${kpi('Chi phí Ads Amazon (30n)', usd(spend, 2), amC.length + ' chiến dịch')}
    ${kpi('Doanh số từ Ads', usd(sum(amC, c => c[9] || 0)), 'ACoS ' + (sum(amC, c => c[9] || 0) ? pct(spend / sum(amC, c => c[9] || 0)) : '—'))}
  </div>
  ${card('Đơn hàng Amazon', 'Seller Central · Manage Orders', `<div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Order ID</th><th>SKU</th><th>ASIN</th><th>Sản phẩm</th><th class="num">SL</th><th class="num">Giá</th><th>Trạng thái</th></tr></thead><tbody>
    ${o.map(x => `<tr><td>${dLong(x.date)}</td><td>${esc(x.po)}</td><td><b>${esc(x.sku)}</b></td><td>${esc(x.asin)}</td><td>${esc((x.name || '').slice(0, 48))}</td><td class="num">${x.qty}</td><td class="num">${x.price ? usd(x.price, 2) : '—'}</td><td>${x.ok ? esc(x.status) : '<span class="pill crit"><i></i>' + esc(x.status) + '</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Chưa có đơn</td></tr>'}
  </tbody></table></div>`)}
  <p class="note">Amazon đang bán theo hình thức FBM. Số đơn lấy từ Seller Central (365 ngày); chi phí quảng cáo lấy từ Amazon Ads (Sponsored Products).</p>`;
}

const VIEWS = { overview: [viewOverview, afterOverview], castlegate: [viewCastleGate, afterCastleGate], sales: [viewSales, afterSales], ads: [viewAds, afterAds], amazon: [viewAmazon, () => {}] };
function render() {
  const [v, after] = VIEWS[S.tab];
  const noData = !((D.wf && (D.wf.inv || D.wf.orders)) || (D.amz && (D.amz.orders || D.amz.ads)));
  $('#view').innerHTML = (noData ? `<section class="card glass"><div class="alert info"><span class="ic">⟳</span><div><b>Đang chờ kết nối API Wayfair &amp; Amazon</b><span>Dashboard đã sẵn sàng; số liệu bán hàng, tồn kho và quảng cáo sẽ tự hiện sau lần đồng bộ API đầu tiên (chạy tự động mỗi ngày 14:23). KPI và giá vốn đã có.</span></div></div></section>` : '') + v(); after();
  $$('[data-toggle]').forEach(b => b.onclick = () => { const t = $('#' + b.dataset.toggle); t.hidden = !t.hidden; b.textContent = t.hidden ? 'Bảng' : 'Ẩn bảng'; });
  $('#filters').style.display = S.tab === 'amazon' ? 'none' : '';
}

// ---------------- wiring ----------------
function setTab(t) { S.tab = t; $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t)); try { history.replaceState(null, '', '#' + t); } catch (e) {} render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
$$('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$$('#period button').forEach(b => b.onclick = () => { S.period = b.dataset.p; $$('#period button').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); });
$$('#channel button').forEach(b => b.onclick = () => { S.channel = b.dataset.c; $$('#channel button').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); });
$('#incTT').onchange = e => { S.incTT = e.target.checked; render(); };
$('#themeBtn').onclick = () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const nx = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; store.set('lg-theme', nx, true); if (D) render(); };
$('#logoutBtn').onclick = () => { store.del('lg-dk'); location.hash = ''; location.reload(); };
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => D && render(), 180); });
const th = store.get('lg-theme'); if (th) document.documentElement.dataset.theme = th;

function start(data, updated) {
  D = data; buildModel();
  const u = new Date(updated || (D.meta && D.meta.at * 1000) || Date.now());
  $('#updated').textContent = 'Cập nhật ' + u.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  $('#login').hidden = true; $('#app').hidden = false;
  const h = location.hash.slice(1); setTab(VIEWS[h] ? h : 'overview');
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Đang giải mã…'; $('#loginErr').textContent = '';
  try { const { raw, data, updated } = await login($('#user').value, $('#pass').value); store.set('lg-dk', b64e(raw), $('#remember').checked); $('#pass').value = ''; start(data, updated); }
  catch (x) { $('#loginErr').textContent = x.message === 'bad' ? 'Tài khoản hoặc mật khẩu không đúng' : x.message; }
  btn.disabled = false; btn.textContent = 'Đăng nhập';
});
(async () => {
  const k = store.get('lg-dk');
  if (k) { try { const f = await fetchFile(); start(await openWith(f, b64d(k)), f.updated); return; } catch (e) { store.del('lg-dk'); } }
  $('#login').hidden = false; setTimeout(() => $('#user').focus(), 50);
})();
})();
