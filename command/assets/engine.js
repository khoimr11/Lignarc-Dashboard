/* LF Command Center — data models for both channels + rule engine + task ledger.
 * Pure functions (no DOM) so the same file runs in the browser and in Node tests.
 *   CCE.modelGlobal(lignarcData)  → Wayfair/Amazon model (same formulas as the Lignarc dashboard)
 *   CCE.modelLocal(lfData, plan)  → Shopee model (same formulas as the Kệ 3 tầng dashboard)
 *   CCE.detect(G, L, ctx)         → issues & opportunities, each with owner, severity, next steps, auto-close condition
 *   CCE.ledger(events, issues, …) → tasks, escalation, recurrence, staff scorecards
 */
(function (root) {
'use strict';
const DAY = 86400, TZ = 7 * 3600;
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const isoAdd = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const daysIn = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
const vnISO = sec => new Date((sec + TZ) * 1000).toISOString().slice(0, 10);
const nowSec = () => Math.floor(Date.now() / 1000);
const todayVN = () => vnISO(nowSec());
const OK_STATUS = s => !/cancel|reject|void/i.test(s || '');

/* ============================== GLOBAL (Lignarc) ============================== */
function modelGlobal(D, opt = {}) {
  D = D || {}; const W = D.wf || {}, P = D.products || {};
  for (const p of Object.values(P)) if (p.color === 'Walnut') p.color = 'Dark Oak';
  const A = Object.assign({ dda: 0.04, wmr: 0.75, ttReimburseDDA: true, amazonFee: 0.15 }, D.assump || {});
  const CG = D.cgFees || {}, cgFee = part => (CG.actual && CG.actual[part] != null) ? CG.actual[part] : ((CG.est && CG.est[part]) || 0);
  const inbById = new Map((W.inb || []).map(x => [x.id, x]));
  const recvOf = po => (W.inbRecv && W.inbRecv[po.whs]) || po.recv || (inbById.get(po.whs) && (inbById.get(po.whs).recvStart || inbById.get(po.whs).gatedOut)) || null;
  const pos = (D.pos || []).map(p => ({ ...p, recv: recvOf(p) ? String(recvOf(p)).slice(0, 10) : null, inb: inbById.get(p.whs) || null })).sort((a, b) => (a.recv || '9999').localeCompare(b.recv || '9999'));
  const layers = {};
  for (const po of pos) for (const [part, qty, fob, cogs] of po.items || []) { const un = (po.unload && po.unload[part]) || 0; (layers[part] = layers[part] || []).push({ po: po.id, qty, left: qty, fob, cogs: cogs + un, recv: po.recv }); }
  const lastCost = part => { const L = layers[part]; if (L && L.length) return L[L.length - 1]; const fam = P[part] && P[part].fam; for (const k in layers) if (P[k] && P[k].fam === fam) return layers[k][layers[k].length - 1]; return { cogs: 0, fob: 0 }; };
  const prod = part => P[part] || { col: 'Other', name: part, base: 0 };
  const SOV = W.statusOv || {}, TT = new Set(W.ttPOs || []);
  const lines = [];
  for (const r of W.orders || []) {
    const status = SOV[r[0]] || r[3], p = prod(r[7]), qty = +r[11] || 0, price = +r[12] || 0;
    lines.push({ ch: 'wf', po: r[0], date: r[2], ts: r[17] || null, status, ok: OK_STATUS(status), part: r[7], qty, price, base: p.base || price, tt: /tried/i.test(r[14] || '') || TT.has(r[0]) });
  }
  for (const r of (D.amz && D.amz.orders) || []) { const qty = +r[5] || 0, price = +r[6] || 0; lines.push({ ch: 'amz', po: r[0], date: r[1], status: r[2], ok: OK_STATUS(r[2]), part: r[3], qty, price, base: price, tt: false }); }
  lines.sort((a, b) => String(a.ts || a.date + 'T12').localeCompare(String(b.ts || b.date + 'T12')));
  const pieces = [];
  const mk = (l, q, ly) => { const wf = l.ch === 'wf', rev = l.tt ? 0 : l.base * q, paid = l.price * q, net = l.tt ? (A.ttReimburseDDA ? paid * A.dda : 0) : paid;
    return { ...l, qty: q, layer: ly.po, rev, net, promo: l.tt ? 0 : rev - net, cogs: ly.cogs * q, dda: wf && !l.tt ? paid * A.dda : 0, cg: wf ? cgFee(l.part) * q : 0, amzFee: wf ? 0 : net * A.amazonFee }; };
  for (const l of lines) {
    if (!l.ok) continue;
    let q = l.qty; const L = layers[l.part] || [];
    if (l.ch === 'wf') for (const ly of L) { if (q <= 0) break; if (ly.left <= 0) continue; const t = Math.min(q, ly.left); ly.left -= t; q -= t; pieces.push(mk(l, t, ly)); }
    if (q > 0) { const lc = lastCost(l.part); pieces.push(mk(l, q, { po: 'Unassigned', cogs: lc.cogs, fob: lc.fob })); }
  }
  const deds = D.deductions || [];
  const today = (D.meta && D.meta.today) || opt.today || todayVN();
  const adDaily = (W.ads && W.ads.daily) || [], amzAd = (D.amz && D.amz.ads && D.amz.ads.daily) || [];
  function period(f, t) {
    const ps = pieces.filter(x => x.date >= f && x.date <= t), o = { units: 0, rev: 0, net: 0, promo: 0, cogs: 0, dda: 0, cg: 0, amzFee: 0, ttUnits: 0, ttCost: 0 }, orders = new Set();
    for (const x of ps) { if (x.tt) { o.ttUnits += x.qty; o.ttCost += x.cogs + x.cg - x.net; continue; } o.units += x.qty; o.rev += x.rev; o.net += x.net; o.promo += x.promo; o.cogs += x.cogs; o.dda += x.dda; o.cg += x.cg; o.amzFee += x.amzFee; orders.add(x.po); }
    o.orders = orders.size; o.platform = o.dda + o.cg + o.amzFee;
    const dd = deds.filter(d => d.date >= f && d.date <= t);
    o.returns = sum(dd.filter(d => d.type === 'Return'), d => d.amount); o.incidents = sum(dd.filter(d => d.type !== 'Return'), d => d.amount);
    o.ads = sum(adDaily.filter(r => r[1] >= f && r[1] <= t), r => r[4]) + sum(amzAd.filter(r => r[0] >= f && r[0] <= t), r => r[3]);
    o.adSales = sum(adDaily.filter(r => r[1] >= f && r[1] <= t), r => r[6]) + sum(amzAd.filter(r => r[0] >= f && r[0] <= t), r => r[4]);
    o.mkt = o.promo + o.ads; o.mktPct = o.rev ? o.mkt / o.rev : null;
    o.profit = o.net - o.platform - o.cogs - o.ttCost - o.returns - o.incidents - o.ads; o.margin = o.rev ? o.profit / o.rev : null; o.tacos = o.rev ? o.ads / o.rev : null;
    o.acos = o.adSales ? o.ads / o.adSales : null; o.roas = o.ads ? o.adSales / o.ads : null;
    return o;
  }
  const ym = today.slice(0, 7), dIn = daysIn(ym), dNow = +today.slice(8, 10), ms = ym + '-01';
  const K = D.kpi || null, ki = K && K.months ? K.months.indexOf(ym) : -1;
  const tgt = { rev: ki >= 0 ? K.rev[ki] : 0, unit: ki >= 0 && K.unit ? K.unit[ki] : 0, profit: ki >= 0 && K.profit ? K.profit[ki] : 0, mkt: ki >= 0 && K.mkt ? K.mkt[ki] : 0 };
  const mtd = period(ms, today), l7 = period(isoAdd(today, -6), today), p7 = period(isoAdd(today, -13), isoAdd(today, -7)), l30 = period(isoAdd(today, -29), today), p30 = period(isoAdd(today, -59), isoAdd(today, -30));
  const months = (K && K.months || []).map((m, i) => ({ m, tgt: K.rev[i] || 0, tgtUnit: K.unit ? K.unit[i] : 0, act: period(m + '-01', m + '-' + String(daysIn(m)).padStart(2, '0')) }));
  // inventory & weeks of cover (CastleGate)
  const sold30 = {}, sold14 = {}, lastSale = {};
  for (const x of pieces) if (x.ch === 'wf') { if (x.date > isoAdd(today, -30)) sold30[x.part] = (sold30[x.part] || 0) + x.qty; if (x.date > isoAdd(today, -14)) sold14[x.part] = (sold14[x.part] || 0) + x.qty; if (!lastSale[x.part] || x.date > lastSale[x.part]) lastSale[x.part] = x.date; }
  const inv = (W.inv || []).map(r => { const v = (sold30[r[0]] || 0) / 30; return { part: r[0], name: (P[r[0]] || {}).name || r[0], col: (P[r[0]] || {}).col || '', onHand: r[2] || 0, avail: r[3] || 0, sold30: sold30[r[0]] || 0, sold14: sold14[r[0]] || 0, coverDays: v ? (r[2] || 0) / v : null, lastSale: lastSale[r[0]] || null, unitCost: lastCost(r[0]).cogs || 0 }; });
  // 90-day free storage clock per received PO, with units still on hand from that PO (FIFO layers)
  const storage = pos.filter(p => p.recv).map(p => { const end = isoAdd(p.recv, 90), left = isoDiff(today, end); const units = sum(Object.values(layers).flat().filter(l => l.po === p.id), l => l.left); return { po: p.id, recv: p.recv, end, daysLeft: left, units }; });
  const inbound = pos.filter(p => !p.recv).map(p => ({ po: p.id, eta: p.inb && p.inb.eta || null, status: p.inb && p.inb.status || '' }));
  // ads by campaign, last 7 days
  const camps = {}; for (const r of adDaily) if (r[1] > isoAdd(today, -7)) { const c = camps[r[0]] = camps[r[0]] || { id: r[0], name: (W.ads && W.ads.names && W.ads.names[r[0]]) || r[0], spend: 0, clicks: 0, impr: 0, orders: 0, sales: 0 }; c.spend += r[4]; c.clicks += r[3]; c.impr += r[2]; c.orders += r[7]; c.sales += r[6]; }
  const I = D.incidents || { cases: [] }, IS = D.incidentStats || {};
  const cases = (I.cases || []).map(c => ({ ...c, caseNo: c.caseNo || c.case || c.cs || '', date: c.date || c.opened || c.delivered || I.asOf || today })).map(c => ({ ...c, key: [c.po, c.issue || c.kind || '', c.delivered || c.date].join('|') }));
  const tt30 = pieces.filter(x => x.tt && x.date > isoAdd(today, -30));
  return { ch: 'global', cur: 'USD', today, updatedAt: D.meta && D.meta.at ? new Date(D.meta.at * 1000).toISOString() : (opt.updated || null),
    mtd, l7, p7, l30, p30, tgt, ym, dIn, dNow, pace: tgt.rev * dNow / dIn, proj: dNow ? mtd.rev / dNow * dIn : 0, paceUnit: tgt.unit * dNow / dIn, projUnit: dNow ? mtd.units / dNow * dIn : 0,
    months, inv, storage, inbound, camps: Object.values(camps), cases, incAsOf: I.asOf || null, incStats: IS, deds, tt30: { orders: new Set(tt30.map(x => x.po)).size, cost: sum(tt30, x => x.cogs + x.cg - x.net) },
    pieces30: pieces.filter(x => !x.tt && x.ch === 'wf' && x.date > isoAdd(today, -30)), adDays3: adDaily.length ? sum(adDaily.filter(r => r[1] > isoAdd(today, -3)), r => r[4]) : null,
    amzLive: !!((D.amz && D.amz.orders && D.amz.orders.length) || amzAd.length), period };
}

/* ============================== LOCAL (Shopee kệ 3 tầng) ============================== */
const LOCAL_PLAN = {
  start: '2026-11', listPrice: 700000, floorPrice: 315000, netPerUnit: 189051, netRate: 0.6002, rent: 20000000, stock0: 2700,
  months: ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05'],
  units: [95, 300, 555, 333, 400, 480, 537],
  endStock: [2605, 2305, 1750, 1417, 1017, 537, 0],
  feePct: { fixed: 0.1319, tx: 0.06, vxtra: 0.052, aff: 0.10, ads: 0.04 }, piship: 5052
};
function modelLocal(d, plan = LOCAL_PLAN, opt = {}) {
  d = d || {}; const now = opt.now || nowSec(), today = vnISO(now);
  const LIST = {}; (d.products || []).forEach(p => { LIST[p[4]] = { list: p[5], promo: p[6], stock: p[7], name: p[2], model: p[3] }; });
  const orders = (d.orders || []).map(r => {
    const o = { sn: r[0], t: r[1], st: r[2], s: r[3] || '', q: r[4] || 0, v: r[5] || 0, paid: r[6] || 0, m: r[7] || '', p: r[8] || 0, prov: r[9] || '', fx: r[11] || 0, sv: r[12] || 0, pi: r[13] || 0, tx: r[14] || 0, sh: r[15] || 0, inc: r[17], sku: r[18] || '', ret: !!r[19], sb: r[22] || 0, sf: r[23] || 0, ss: r[24] || 0, tp: r[30] || null, td: r[31] || null };
    o.date = vnISO(o.t); o.cx = /hủy/i.test(o.s) || o.st === 5;
    o.cls = o.cx ? 'cx' : /trả hàng|hoàn tiền/i.test(o.s) ? 'cx' : /^Đã giao$|hoàn thành/i.test(o.s) ? 'ok' : /ĐVVC|đang giao|vận chuyển/i.test(o.s) ? 'ship' : 'wait';
    o.fee = o.fx + o.sv + o.tx + o.pi; o.prodNet = o.v - o.sh - o.fee; return o;
  }).sort((a, b) => b.t - a.t);
  const ads = (d.ads || []).map(r => ({ date: vnISO(r[0]), imp: r[1] || 0, clk: r[2] || 0, cost: r[3] || 0, ord: r[4] || 0, gmv: r[5] || 0 }));
  const ledger = (d.ledger || []).map(r => ({ date: vnISO(r[0]), kind: r[1], amt: r[2] || 0 })).sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'spend') - (b.kind === 'spend'));
  // same free/paid split as the Kệ 3 tầng dashboard: spend uses Shopee free credits first, then paid top-ups
  const split = {}; let fb = 0, pb = 0;
  for (const e of ledger) { if (e.kind === 'free') fb += e.amt; else if (e.kind === 'paid') pb += e.amt; else if (e.kind === 'spend') { let f = Math.min(e.amt, Math.max(0, fb)), p = e.amt - f; if (p > 0 && p < 5 && pb < 5) { f += p; p = 0; } fb -= f; pb -= p; const x = split[e.date] || (split[e.date] = { free: 0, paid: 0 }); x.free += f; x.paid += p; } }
  ads.forEach(a => { const x = split[a.date]; a.paid = x && (x.free + x.paid) ? a.cost * x.paid / (x.free + x.paid) : a.cost; });
  const reviews = (d.reviews || []).map(r => ({ t: r[0], date: vnISO(r[0]), star: r[1], text: r[2] || '', media: r[3] || 0, sn: r[4], replied: !!r[5], rt: r[6] || 0 }));
  const pr = d.promo || {};
  const fs = (pr.fs || []).map(f => ({ id: f[0], a: f[1], b: f[1] + f[2], price: f[3], stock: f[4] }));
  const vch = (pr.vch || []).map(v => ({ id: v[0], name: v[1], code: v[2], a: v[3], b: v[4], lim: v[9], used: v[10] }));
  const disc = (pr.disc || []).map(x => ({ id: x[0], kind: x[1], name: x[2], a: x[3], b: x[4], price: x[5] }));
  orders.forEach(o => { o.fs = !!fs.find(x => o.t >= x.a && o.t < x.b && Math.abs(x.price - o.p) < 1); });
  function period(f, t) {
    const os = orders.filter(o => o.date >= f && o.date <= t), ok = os.filter(o => !o.cx), ad = ads.filter(a => a.date >= f && a.date <= t);
    const nmv = sum(ok, o => o.v), units = sum(ok, o => o.q), fee = sum(ok, o => o.fee), sh = sum(ok, o => o.sh), prodNet = sum(ok, o => o.prodNet);
    const paidTop = sum(ledger.filter(e => e.kind === 'paid' && e.date >= f && e.date <= t), e => e.amt);
    const adCost = sum(ad, a => a.cost), adOrd = sum(ad, a => a.ord), adGmv = sum(ad, a => a.gmv);
    const adPaid = sum(ad, a => a.paid);
    return { orders: ok.length, all: os.length, cx: os.filter(o => o.cx).length, ret: ok.filter(o => o.ret).length, nmv, units, fee, sh, prodNet, net: nmv - fee - sh - adPaid, adPaid,
      unitNet: units ? prodNet / units : 0, asp: units ? nmv / units : 0, take: nmv ? fee / nmv : null, cxRate: os.length ? os.filter(o => o.cx).length / os.length : null, retRate: ok.length ? ok.filter(o => o.ret).length / ok.length : null,
      fsShare: nmv ? sum(ok.filter(o => o.fs), o => o.v) / nmv : null, adCost, adOrd, adGmv, roas: adCost ? adGmv / adCost : null, paidTop };
  }
  const ym = today.slice(0, 7), dIn = daysIn(ym), dNow = +today.slice(8, 10), mi = plan.months.indexOf(ym);
  const tgtUnits = mi >= 0 ? plan.units[mi] : 0, mtd = period(ym + '-01', today);
  const months = plan.months.map((m, i) => ({ m, tgt: plan.units[i], tgtNmv: plan.units[i] * plan.floorPrice, act: period(m + '-01', m + '-' + String(daysIn(m)).padStart(2, '0')), endStock: plan.endStock[i] }));
  const soldSince = sum(orders.filter(o => !o.cx && o.date >= plan.start + '-01'), o => o.q);
  // planned cumulative units to date (linear within the current month)
  let planCum = 0; for (let i = 0; i < plan.months.length; i++) { if (plan.months[i] < ym) planCum += plan.units[i]; else if (plan.months[i] === ym) planCum += plan.units[i] * dNow / dIn; }
  const stock = Object.values(LIST).reduce((s, p) => s + (p.stock || 0), 0);
  const u14 = sum(orders.filter(o => !o.cx && o.date > isoAdd(today, -14)), o => o.q) / 14;
  return { ch: 'local', cur: 'VND', today, now, updatedAt: d.meta && d.meta.at ? new Date(d.meta.at * 1000).toISOString() : (opt.updated || null), plan,
    orders, reviews, ads, ledger, fs, vch, disc, products: LIST, period,
    mtd, l7: period(isoAdd(today, -6), today), p7: period(isoAdd(today, -13), isoAdd(today, -7)), l30: period(isoAdd(today, -29), today), p30: period(isoAdd(today, -59), isoAdd(today, -30)),
    ym, dIn, dNow, tgtUnits, paceUnits: tgtUnits * dNow / dIn, projUnits: dNow ? mtd.units / dNow * dIn : 0, months,
    soldSince, planCum, whStock: plan.stock0 - soldSince, shopStock: stock, coverDays: u14 ? stock / u14 : null, rentPerUnit: mtd.units ? plan.rent * Math.min(1, dNow / dIn) / mtd.units : null };
}

/* ============================== RULE ENGINE ============================== */
const SEV = ['P3', 'P2', 'P1', 'P0'], SLA = { P0: 1, P1: 3, P2: 7, P3: null }, W8 = { P0: 1000, P1: 300, P2: 60, P3: 10 };
const bump = s => SEV[Math.min(3, SEV.indexOf(s) + 1)];
function detect(G, L, ctx = {}) {
  const out = [], fx = ctx.fx || 26300, nowS = ctx.now || nowSec(), today = todayVN();
  const add = (o) => { o.key = o.rule + (o.subject ? '|' + o.subject : ''); o.impactVnd = Math.round(o.impactVnd || 0); o.score = W8[o.sev] + Math.log10(1 + o.impactVnd / 1e5) * 25 + Math.min(30, (o.age || 0) * 3) + (o.kind === 'opportunity' ? -20 : 0); out.push(o); };
  const ageFrom = iso => iso ? Math.max(0, isoDiff(String(iso).slice(0, 10), today)) : null;
  const hoursSince = iso => iso ? (Date.now() - Date.parse(iso)) / 36e5 : Infinity;

  // ---------- system: data pipelines ----------
  if (ctx.globalErr) add({ rule: 'X-DATA-G', channel: 'system', owner: 'manager', sev: 'P0', title: 'Không đọc được dữ liệu dash Lignarc', detail: ctx.globalErr, steps: ['Mở dash Lignarc kiểm tra đăng nhập', 'Kiểm tra GitHub Actions "Daily API sync"'], closeWhen: 'Command Center đọc lại được dữ liệu Lignarc' });
  if (ctx.localErr) add({ rule: 'X-DATA-L', channel: 'system', owner: 'manager', sev: 'P0', title: 'Không đọc được dữ liệu dash Kệ 3 tầng', detail: ctx.localErr, steps: ['Mở dash Kệ 3 tầng kiểm tra đăng nhập', 'Kiểm tra scheduled task "LF B2C dashboard sync"'], closeWhen: 'Command Center đọc lại được dữ liệu Shopee' });
  if (G && G.updatedAt && hoursSince(G.updatedAt) > 26) add({ rule: 'G-DATA-STALE', channel: 'system', owner: 'manager', sev: 'P0', title: `Dữ liệu Lignarc chưa cập nhật ${Math.round(hoursSince(G.updatedAt))} giờ`, detail: 'Sync API hằng ngày 14:23 không chạy hoặc lỗi. Mọi cảnh báo Global bên dưới có thể đã cũ.', steps: ['Mở GitHub › Actions › Daily API sync, xem lần chạy gần nhất', 'Chạy lại thủ công (Run workflow)', 'Nếu lỗi token Wayfair: gia hạn client secret'], closeWhen: 'Dữ liệu Lignarc mới hơn 26 giờ', age: Math.floor(hoursSince(G.updatedAt) / 24) });
  if (L && L.updatedAt && hoursSince(L.updatedAt) > 26) add({ rule: 'L-DATA-STALE', channel: 'system', owner: 'manager', sev: 'P0', title: `Dữ liệu Shopee chưa cập nhật ${Math.round(hoursSince(L.updatedAt))} giờ`, detail: 'Sync Chrome 15:41 không chạy (máy tắt, Chrome chưa đăng nhập Seller Centre hoặc task lỗi).', steps: ['Bật máy DESKTOP-1OVCR6U, mở Chrome đăng nhập banhang.shopee.vn', 'Chạy lại scheduled task "LF B2C dashboard sync"', 'Kiểm tra trang sync.html còn key/token'], closeWhen: 'Dữ liệu Shopee mới hơn 26 giờ', age: Math.floor(hoursSince(L.updatedAt) / 24) });

  // ---------- GLOBAL ----------
  if (G) {
    const o = { channel: 'global', owner: 'trang' }, usd = v => '$' + Math.round(v).toLocaleString('en-US');
    // pace vs Cashflow target
    if (G.tgt.rev && G.dNow >= 5) {
      const r = G.mtd.rev / G.pace, gap = G.tgt.rev - G.proj;
      if (r < 0.9) add({ ...o, rule: 'G-PACE', sev: r < 0.75 ? 'P0' : 'P1', title: `Doanh thu MTD đạt ${(r * 100).toFixed(0)}% tiến độ target`, detail: `MTD ${usd(G.mtd.rev)} / tiến độ ${usd(G.pace)} · dự phóng cuối tháng ${usd(G.proj)} vs target ${usd(G.tgt.rev)} (thiếu ${usd(Math.max(0, gap))}).`, metric: r, impactVnd: Math.max(0, gap) * fx,
        steps: ['Lập kế hoạch bù doanh thu đến cuối tháng theo SKU (SKU nào, bao nhiêu đơn/ngày)', 'Đăng ký Wayfair promotion / tăng ngân sách campaign có ROAS ≥ 3', 'Kiểm tra listing top-traffic: giá, tồn, ảnh, review'], closeWhen: 'Doanh thu MTD ≥ 90% tiến độ target' });
    }
    if (G.tgt.unit && G.dNow >= 5 && G.mtd.units / G.paceUnit < 0.9) add({ ...o, rule: 'G-UNIT-PACE', sev: 'P2', title: `Sản lượng MTD ${G.mtd.units} / tiến độ ${Math.round(G.paceUnit)} units`, detail: `Target tháng ${G.tgt.unit} units, dự phóng ${Math.round(G.projUnit)}.`, steps: ['Rà SKU bán chậm so với kế hoạch Cashflow', 'Đẩy quảng cáo SKU còn tồn nhiều'], closeWhen: 'Sản lượng ≥ 90% tiến độ' });
    // profitability (last 30 days)
    const m = G.l30.margin;
    if (G.l30.rev > 0 && m != null && m < 0.15) add({ ...o, rule: 'G-MARGIN-LOW', sev: m < 0 ? 'P0' : 'P1', title: `Biên lợi nhuận 30 ngày chỉ ${(m * 100).toFixed(1)}%`, detail: `Revenue ${usd(G.l30.rev)} · Profit ${usd(G.l30.profit)} · Promotion ${usd(G.l30.promo)} · Ads ${usd(G.l30.ads)} · Returns+Incidents ${usd(G.l30.returns + G.l30.incidents)}.`, impactVnd: Math.max(0, G.l30.rev * 0.15 - G.l30.profit) * fx,
      steps: ['Bóc tách SKU lỗ trong tab Profit của dash Lignarc', 'Giảm promotion trên SKU margin âm; dừng campaign ACoS > 40%', 'Xử lý gốc rễ incident (đóng gói) để giảm deduction'], closeWhen: 'Margin 30 ngày ≥ 15%' });
    const mk = G.l30.mktPct, mkT = G.tgt.mkt && G.tgt.rev ? G.tgt.mkt / G.tgt.rev : 0.25;
    if (G.l30.rev > 0 && mk != null && mk > mkT + 0.03) add({ ...o, rule: 'G-MKT-OVER', sev: mk > mkT + 0.10 ? 'P1' : 'P2', title: `% Mkt fee ${(mk * 100).toFixed(1)}% vượt kế hoạch ${(mkT * 100).toFixed(0)}%`, detail: `Promotion ${usd(G.l30.promo)} + Ads ${usd(G.l30.ads)} trên revenue ${usd(G.l30.rev)} (30 ngày).`, impactVnd: (mk - mkT) * G.l30.rev * fx,
      steps: ['Rà các promotion Wayfair đang chạy, tắt chương trình không hiệu quả', 'Cắt campaign ROAS < 2', 'Báo cáo % Mkt theo SKU cho chị trước thứ 6'], closeWhen: `% Mkt fee ≤ ${(mkT * 100 + 3).toFixed(0)}%` });
    // incidents & returns
    const asOfAge = G.incAsOf ? isoDiff(G.incAsOf, G.today) : 99;
    if (asOfAge > 8) add({ ...o, rule: 'G-INC-CHECK', sev: 'P1', title: `Chưa kiểm tra Incidents & Returns ${asOfAge >= 99 ? '' : asOfAge + ' ngày'}`, detail: 'Không có API cho incident/return/deduction — phải kiểm tra Partner Home hằng tuần (thứ 5).', steps: ['Mở Partner Home › Incidents and Resolutions › Customer Incidents and Returns', 'Cập nhật case mới vào dash (task "Lignarc weekly incidents check")', 'Kiểm tra trang Deductions / Accounts Receivable'], closeWhen: 'Dữ liệu incident được cập nhật ≤ 8 ngày', age: asOfAge >= 99 ? null : asOfAge });
    for (const c of G.cases) {
      const handled = c.resolved || (c.status && /resolved|closed|done|đã xử lý/i.test(c.status));
      if (handled || isoDiff(String(c.date).slice(0, 10), G.today) > 90) continue;
      const isRet = c.kind === 'Return' || /return/i.test(c.issue || ''), age = ageFrom(c.date);
      add({ ...o, rule: isRet ? 'G-RET-NEW' : 'G-INC-NEW', subject: c.caseNo || c.key, sev: (c.deduction || 0) > 150 || /sink|broken|vỡ/i.test((c.detail || '') + (c.comment || '')) ? 'P0' : 'P1',
        title: `${isRet ? 'Return' : 'Incident ' + (c.issue || '')} · ${c.po} · ${c.part}`, detail: `${c.detail || ''}${c.comment ? ' — “' + c.comment + '”' : ''}${c.photos ? ' · ' + c.photos + ' ảnh' : ''}${c.deduction ? ' · trừ ' + usd(c.deduction) : ' · chưa trừ tiền'}`, since: c.date, age,
        impactVnd: (c.deduction || 0) * fx,
        steps: isRet ? ['Đọc lý do return, đối chiếu mô tả/kích thước trên listing', 'Nếu lý do do listing (sai size): sửa title/bullet/ảnh kích thước', 'Đối soát deduction = wholesale × 96% × 75%'] : ['Xem ảnh/video khách gửi, xác định lỗi đóng gói hay vận chuyển', 'Bật/gửi replacement part thay vì để Wayfair refund toàn bộ', 'Nếu lỗi vận chuyển: mở dispute deduction kèm bằng chứng; báo nhà máy cải tiến carton'],
        closeWhen: 'evidence: hướng xử lý case (replacement part / dispute / sửa listing) được chị duyệt' });
    }
    const ir = G.incStats.incidentRate, brr = G.incStats.brr != null ? G.incStats.brr : G.incStats.returnRate;
    if (ir != null && ir > 0.03) add({ ...o, rule: 'G-INC-RATE', sev: ir > 0.05 ? 'P0' : 'P1', title: `Incident rate ${(ir * 100).toFixed(0)}% (ngưỡng 3%)`, detail: `Replacement parts shipped ${G.incStats.partsShipped != null ? (G.incStats.partsShipped * 100).toFixed(0) + '%' : 'n/a'}. Tỉ lệ cao làm Wayfair giảm hiển thị và tăng deduction.`,
      steps: ['Phân tích incident theo SKU, tìm SKU/carton lỗi lặp lại', 'Bật replacement parts trong Partner Home', 'Gửi nhà máy yêu cầu tăng góc bảo vệ / drop test cho lô sau'], closeWhen: 'Incident rate ≤ 3%' });
    if (brr != null && brr > 0.05) add({ ...o, rule: 'G-BRR-HIGH', sev: 'P1', title: `Return rate ${(brr * 100).toFixed(1)}% (ngưỡng 5%)`, steps: ['Rà lý do return', 'Bổ sung thông số kích thước rõ ràng trên listing'], closeWhen: 'Return rate ≤ 5%' });
    // CastleGate 90-day free storage clock
    for (const s of G.storage) if (s.units > 0 && s.daysLeft <= 30) add({ ...o, rule: 'G-CG-STORAGE', subject: s.po, sev: s.daysLeft <= 14 ? 'P0' : 'P1', title: `${s.po}: còn ${s.daysLeft} ngày lưu kho miễn phí · ${s.units} units`, detail: `Nhận hàng ${s.recv}, hết miễn phí ${s.end}. Sau mốc này CastleGate tính phí lưu kho hằng ngày.`,
      steps: ['Lập kế hoạch xả tồn của PO này: promotion, ads, multichannel Amazon', 'Ước tính phí lưu kho nếu không bán hết', 'Đề xuất giá clearance cho SKU bán chậm'], closeWhen: 'Tồn của PO = 0 hoặc đã qua mốc và có kế hoạch được duyệt' });
    // stock-out & dead stock
    for (const r of G.inv) {
      if (r.sold30 >= 3 && r.coverDays != null && r.coverDays < 70) add({ ...o, rule: 'G-OOS-RISK', subject: r.part, sev: r.coverDays < 42 ? 'P0' : 'P1', kind: 'opportunity', title: `${r.part} chỉ còn ${Math.round(r.coverDays)} ngày bán (${r.onHand} units)`, detail: `Bán ${r.sold30} units/30 ngày. Lead time PO ~10 tuần → cần đặt hàng bổ sung.`, impactVnd: r.sold30 * 2 * (G.l30.units ? G.l30.rev / G.l30.units : 0) * fx,
        steps: ['Kiểm tra CBM lô tiếp theo với nhà máy', 'Đề xuất số lượng reorder theo tốc độ bán', 'Giảm ads SKU này nếu sắp hết để tránh OOS'], closeWhen: 'Có PO inbound cho SKU hoặc cover ≥ 70 ngày' });
      if (r.onHand > 0 && !r.sold14) add({ ...o, rule: 'G-DEAD-SKU', subject: r.part, sev: 'P1', title: `${r.part}: ${r.onHand} units tồn, 14 ngày không bán`, detail: `Bán gần nhất: ${r.lastSale || 'chưa từng'}. Vốn đọng ~${usd(r.onHand * r.unitCost)}.`, impactVnd: r.onHand * r.unitCost * 0.1 * fx,
        steps: ['Kiểm tra listing còn hiển thị / bị suppress không', 'Chạy campaign riêng hoặc promotion cho SKU', 'Xem giá cạnh tranh trên Wayfair'], closeWhen: 'SKU có đơn trong 14 ngày gần nhất' });
    }
    // ads waste
    for (const c of G.camps) {
      if (c.spend >= 50 && !c.orders) add({ ...o, rule: 'G-ADS-WASTE', subject: c.id, sev: c.spend >= 100 ? 'P1' : 'P2', title: `Campaign ${c.name}: chi ${usd(c.spend)} 7 ngày, 0 đơn`, detail: `${c.clicks} clicks · ${c.impr} impressions.`, impactVnd: c.spend * fx,
        steps: ['Giảm bid / tạm dừng campaign', 'Kiểm tra keyword/placement tốn tiền', 'Chuyển ngân sách sang campaign có ROAS ≥ 3'], closeWhen: 'Campaign có đơn hoặc chi 7 ngày < $50' });
      else if (c.spend >= 30 && c.sales && c.spend / c.sales > 0.3) add({ ...o, rule: 'G-ADS-ACOS', subject: c.id, sev: 'P1', title: `Campaign ${c.name}: ACoS ${(c.spend / c.sales * 100).toFixed(0)}%`, impactVnd: (c.spend - c.sales * 0.25) * fx, steps: ['Hạ bid các SKU ACoS cao', 'Đặt ACoS mục tiêu ≤ 25%'], closeWhen: 'ACoS 7 ngày ≤ 30%' });
    }
    if (G.l7.ads >= 100 && G.l7.roas != null && G.l7.roas < 3) add({ ...o, rule: 'G-ADS-ROAS-LOW', sev: 'P1', title: `ROAS 7 ngày chỉ ${G.l7.roas.toFixed(2)}`, detail: `Chi $${G.l7.ads.toFixed(0)} · ad sales $${G.l7.adSales.toFixed(0)}.`, impactVnd: (G.l7.ads - G.l7.adSales / 3) * fx, steps: ['Rà toàn bộ campaign, tắt campaign ROAS < 1.5', 'Dồn ngân sách cho SKU bán tốt'], closeWhen: 'ROAS 7 ngày ≥ 3' });
    // sales slowdown week over week
    if (G.p7.rev > 300 && G.l7.rev < G.p7.rev * 0.6) add({ ...o, rule: 'G-WOW', sev: 'P1', title: `Doanh thu 7 ngày giảm ${((1 - G.l7.rev / G.p7.rev) * 100).toFixed(0)}% so với tuần trước`, detail: `${usd(G.l7.rev)} vs ${usd(G.p7.rev)}.`, impactVnd: (G.p7.rev - G.l7.rev) * fx, steps: ['Kiểm tra listing bị suppress / hết hàng / mất Buy box', 'Kiểm tra giá có bị Wayfair đổi không', 'Kiểm tra campaign bị dừng'], closeWhen: 'Doanh thu 7 ngày ≥ 60% tuần trước' });
    if (!G.amzLive) add({ ...o, rule: 'G-AMZ-API-PENDING', sev: 'P3', title: 'Amazon chưa có dữ liệu (SP-API/Ads API đang chờ duyệt)', steps: ['Theo dõi email duyệt SP-API & Ads API', 'Khi duyệt: nhập secrets vào GitHub'], closeWhen: 'Có dữ liệu Amazon trong dash' });
    if (G.tt30.orders) add({ ...o, rule: 'G-TT-FOLLOW', sev: 'P3', title: `${G.tt30.orders} đơn Tried & True 30 ngày · chi phí $${G.tt30.cost.toFixed(0)}`, steps: ['Theo dõi review nhận được từ T&T', 'Báo cáo review rating sau 30 ngày'], closeWhen: 'evidence: link review T&T' });
    // --- added from the Director playbook ---
    if (!G.tgt.rev) add({ ...o, owner: 'manager', rule: 'X-TARGET-MISSING', subject: 'global', sev: 'P1', title: `Chưa có target Global tháng ${G.ym} trong Cashflow 26+27`, steps: ['Bổ sung target tháng vào sheet Cashflow 26+27', 'Sync lại dash Lignarc'], closeWhen: 'Có target tháng hiện tại' });
    if (G.tgt.profit && G.dNow >= 7) { const pp = G.mtd.profit / G.dNow * G.dIn; if (pp < G.tgt.profit * 0.9) add({ ...o, rule: 'G-PROFIT-PACE', sev: 'P1', title: `Lợi nhuận dự phóng ${usd(pp)} < 90% target ${usd(G.tgt.profit)}`, impactVnd: (G.tgt.profit - pp) * fx, steps: ['Bóc tách chi phí ăn vào lợi nhuận (promotion, ads, deduction)', 'Đề xuất 3 hành động tăng lợi nhuận trong tháng'], closeWhen: 'Lợi nhuận dự phóng ≥ 90% target' }); }
    if (G.l7.rev > 0 && G.l7.tacos > 0.12) add({ ...o, rule: 'G-TACOS-HIGH', sev: 'P1', title: `TACoS 7 ngày ${(G.l7.tacos * 100).toFixed(1)}% (ngưỡng 12%)`, impactVnd: (G.l7.tacos - 0.12) * G.l7.rev * fx, steps: ['Hạ bid campaign chi nhiều, ít đơn', 'Tập trung ngân sách vào SKU có review tốt'], closeWhen: 'TACoS 7 ngày ≤ 12%' });
    const sku30 = {}; for (const x of (G.pieces30 || [])) { const k = sku30[x.part] = sku30[x.part] || { units: 0, gp: 0 }; k.units += x.qty; k.gp += x.net - x.dda - x.cg - x.amzFee - x.cogs; }
    for (const [part, k] of Object.entries(sku30)) if (k.units >= 3 && k.gp < 0) add({ ...o, rule: 'G-SKU-NEG-PROFIT', subject: part, sev: 'P1', title: `${part} lỗ ${usd(-k.gp)} trong 30 ngày (trước ads)`, detail: `${k.units} units. Giá bán sau promotion không bù được COGS + phí.`, impactVnd: -k.gp * fx, steps: ['Kiểm tra promotion đang áp cho SKU', 'Đề xuất giá mới đảm bảo GPM', 'Cân nhắc dừng ads cho SKU này'], closeWhen: 'SKU có lợi nhuận gộp 30 ngày ≥ 0' });
    const bySkuType = {}; for (const c of G.cases) if (c.date > isoAdd(G.today, -30)) { const k = c.part + '|' + c.issue; bySkuType[k] = (bySkuType[k] || 0) + 1; }
    for (const [k, n] of Object.entries(bySkuType)) if (n >= 3) add({ ...o, rule: 'G-INC-REPEAT-SKU', subject: k, sev: 'P1', title: `${k.split('|')[0]}: ${n} case "${k.split('|')[1]}" trong 30 ngày`, steps: ['Tìm nguyên nhân gốc (đóng gói, linh kiện, mô tả)', 'Gửi nhà máy CAPA cho lô sau', 'Tạm giảm ads SKU đến khi xử lý'], closeWhen: 'evidence: báo cáo nguyên nhân gốc + CAPA' });
    for (const c of G.cases) if (/mis-?information/i.test(c.issue || '') && !c.resolved && !(c.status && /resolved|closed/i.test(c.status)) && isoDiff(String(c.date).slice(0, 10), G.today) <= 90) add({ ...o, rule: 'G-INC-MISINFO', subject: c.caseNo || c.key, sev: 'P1', title: `Case sai thông tin sản phẩm · ${c.part}`, detail: c.comment || c.detail || '', since: c.date, age: ageFrom(c.date), steps: ['Đối chiếu thông tin listing với sản phẩm thực tế', 'Cập nhật thông số/ảnh trên Wayfair', 'Gửi link listing đã sửa'], closeWhen: 'evidence: link listing đã cập nhật sau ngày case' });
    const d30 = G.deds.filter(d => d.date > isoAdd(G.today, -30)), dSum = sum(d30, d => d.amount);
    for (const d of G.deds) if (d.amount >= 200 && d.date > isoAdd(G.today, -45)) add({ ...o, rule: 'G-DED-LARGE', subject: [d.po, d.date, d.type, d.amount].join('|'), sev: 'P0', title: `Khấu trừ lớn ${usd(d.amount)} · ${d.po} · ${d.type}`, detail: d.reason || '', since: d.date, age: ageFrom(d.date), impactVnd: d.amount * fx, steps: ['Đối chiếu khoản trừ với case incident/return', 'Mở dispute kèm ảnh/video nếu không do lỗi shop', 'Ghi kết quả dispute'], closeWhen: 'evidence: mã dispute hoặc xác nhận khoản trừ đúng' });
    if (G.l30.net > 0 && dSum > G.l30.net * 0.02) add({ ...o, rule: 'G-DED-RATE', sev: 'P1', title: `Deduction 30 ngày ${usd(dSum)} = ${(dSum / G.l30.net * 100).toFixed(1)}% NMV (ngưỡng 2%)`, impactVnd: dSum * fx, steps: ['Tổng hợp nguyên nhân khấu trừ', 'Dispute các khoản có bằng chứng'], closeWhen: 'Deduction 30 ngày ≤ 2% NMV' });
    const lot1 = G.storage[0]; if (lot1 && lot1.units > 0 && lot1.daysLeft > 30 && lot1.daysLeft <= 45) add({ ...o, rule: 'G-CG-FEE-START', subject: lot1.po, sev: 'P2', title: `Chuẩn bị phí lưu kho ${lot1.po} từ ${lot1.end}`, detail: `${lot1.units} units còn lại.`, steps: ['Lập kế hoạch xả tồn trước mốc tính phí', 'Ước tính chi phí lưu kho/tháng'], closeWhen: 'Có kế hoạch xả tồn được duyệt' });
    for (const r of G.inv) {
      if (r.onHand === 0 && r.sold30 > 0 && !G.inbound.length) add({ ...o, rule: 'G-OOS', subject: r.part, sev: 'P0', title: `${r.part} đã hết hàng CastleGate (bán ${r.sold30}/30 ngày)`, impactVnd: r.sold30 * (G.l30.units ? G.l30.rev / G.l30.units : 0) * fx, steps: ['Kiểm tra lịch PO kế tiếp', 'Tắt ads SKU hết hàng', 'Cân nhắc chuyển tồn từ SKU tương tự'], closeWhen: 'SKU có tồn hoặc có PO inbound' });
      if (r.onHand >= 20 && r.coverDays != null && r.coverDays > 182) add({ ...o, rule: 'G-OVERSTOCK', subject: r.part, sev: 'P2', title: `${r.part}: tồn ${r.onHand} units ≈ ${Math.round(r.coverDays / 7)} tuần bán`, impactVnd: r.onHand * r.unitCost * 0.05 * fx, steps: ['Tăng ads/promotion cho SKU', 'Không đặt thêm trong lô tiếp theo'], closeWhen: 'Cover ≤ 26 tuần' });
    }
    const sp3 = (G.adDays3 != null) ? G.adDays3 : null;
    if (sp3 === 0 && G.tgt.mkt > 0) add({ ...o, rule: 'G-ADS-STOPPED', sev: 'P1', title: 'Wayfair Ads không chi tiêu 3 ngày gần nhất', steps: ['Kiểm tra campaign bị dừng/hết ngân sách', 'Kiểm tra phương thức thanh toán Ads'], closeWhen: 'Ads có chi tiêu trở lại' });
    for (const c of G.camps) if (c.spend > 0 && c.sales / c.spend >= 6 && c.orders >= 3) add({ ...o, rule: 'G-OPP-SCALE-ADS', subject: c.id, sev: 'P2', kind: 'opportunity', title: `Campaign ${c.name} ROAS ${(c.sales / c.spend).toFixed(1)} — nên tăng ngân sách`, impactVnd: c.sales * 0.3 * fx, steps: ['Tăng ngân sách 20–30%', 'Theo dõi ROAS 7 ngày sau tăng'], closeWhen: 'evidence: ảnh chụp ngân sách mới' });
  }

  // ---------- LOCAL ----------
  if (L) {
    const o = { channel: 'local', owner: 'phu' }, vnd = v => Math.round(v).toLocaleString('vi-VN') + '₫', P = L.plan, hNow = nowS;
    if (L.tgtUnits && L.dNow >= 5) {
      const r = L.mtd.units / L.paceUnits, gap = L.tgtUnits - L.projUnits;
      if (r < 0.9) add({ ...o, rule: 'L-PACE', sev: r < 0.75 ? 'P0' : 'P1', title: `Sản lượng MTD ${L.mtd.units}/${Math.round(L.paceUnits)} pcs (${(r * 100).toFixed(0)}% tiến độ)`, detail: `Target tháng ${L.tgtUnits} pcs · dự phóng ${Math.round(L.projUnits)} pcs · cần ${Math.max(0, Math.ceil((L.tgtUnits - L.mtd.units) / Math.max(1, L.dIn - L.dNow + 1)))} pcs/ngày còn lại.`, impactVnd: Math.max(0, gap) * P.netPerUnit,
        steps: ['Đăng ký thêm khung Flash Sale tuần này', 'Bật/tăng Shopee Ads cho kệ 3 tầng (ngân sách ≤ 4% NMV)', 'Mở Affiliate (KOC) 10% hoa hồng theo kế hoạch'], closeWhen: 'Sản lượng MTD ≥ 90% tiến độ' });
    }
    const below = L.orders.filter(x => !x.cx && x.q && x.v / x.q < P.floorPrice && x.date > isoAdd(L.today, -14));
    if (below.length) add({ ...o, rule: 'L-BELOW-FLOOR', sev: 'P0', title: `${below.length} đơn bán dưới giá sàn ${vnd(P.floorPrice)}`, detail: below.slice(0, 5).map(x => `${x.sn} · ${vnd(x.v / x.q)}`).join(' · '), since: below[below.length - 1].date, age: ageFrom(below[below.length - 1].date), impactVnd: sum(below, x => (P.floorPrice * x.q - x.v)),
      steps: ['Kiểm tra giá Flash Sale/khuyến mãi đang cài', 'Sửa giá về ≥ 315.000₫ ngay', 'Giải trình nguyên nhân cài sai giá'], closeWhen: 'Không còn đơn mới dưới giá sàn trong 14 ngày' });
    if (L.l30.units >= 5 && L.l30.unitNet < P.netPerUnit) add({ ...o, rule: 'L-NET-UNIT-LOW', sev: L.l30.unitNet < P.netPerUnit * 0.9 ? 'P1' : 'P2', title: `Thực thu/sp ${vnd(L.l30.unitNet)} < target ${vnd(P.netPerUnit)}`, detail: `30 ngày: giá bán TB ${vnd(L.l30.asp)} · phí sàn ${(L.l30.take * 100).toFixed(1)}% · voucher shop ${vnd(L.l30.sh)}.`, impactVnd: (P.netPerUnit - L.l30.unitNet) * L.l30.units,
      steps: ['Rà voucher shop đang chạy, giảm mức voucher', 'Kiểm tra phí cố định/dịch vụ có đúng gói không', 'Nâng giá FS lên mức đảm bảo thực thu ≥ 189.051₫'], closeWhen: 'Thực thu/sp 30 ngày ≥ 189.051₫' });
    const unconf = L.orders.filter(x => x.cls === 'wait' && /xác nhận/i.test(x.s) && hNow - x.t > 12 * 3600);
    if (unconf.length) add({ ...o, rule: 'L-ORD-UNCONFIRMED', sev: unconf.some(x => hNow - x.t > 24 * 3600) ? 'P0' : 'P1', title: `${unconf.length} đơn chờ xác nhận quá 12h`, detail: unconf.slice(0, 6).map(x => `${x.sn} (${Math.floor((hNow - x.t) / 3600)}h)`).join(' · '), since: unconf[unconf.length - 1].date, age: ageFrom(unconf[unconf.length - 1].date),
      steps: ['Xác nhận đơn ngay trên Seller Centre', 'Nếu hết hàng/không giao được: liên hệ khách trước khi hủy', 'Giải trình lý do chậm xác nhận'], closeWhen: 'Không còn đơn chờ xác nhận > 12h' });
    const notPicked = L.orders.filter(x => x.cls === 'wait' && !/xác nhận/i.test(x.s) && hNow - x.t > 24 * 3600);
    if (notPicked.length) add({ ...o, rule: 'L-ORD-NOT-PICKED', sev: notPicked.some(x => hNow - x.t > 48 * 3600) ? 'P0' : 'P1', title: `${notPicked.length} đơn chưa bàn giao vận chuyển quá 24h`, detail: notPicked.slice(0, 6).map(x => `${x.sn} (${Math.floor((hNow - x.t) / 3600)}h · ${x.s})`).join(' · '), since: notPicked[notPicked.length - 1].date, age: ageFrom(notPicked[notPicked.length - 1].date),
      steps: ['Đóng gói & in phiếu, gọi đơn vị vận chuyển lấy hàng', 'Hàng cồng kềnh: xác nhận lịch lấy với shipper', 'Báo cáo lý do để tránh điểm phạt Sao Quả Tạ'], closeWhen: 'Không còn đơn chờ lấy hàng > 24h' });
    const late = L.orders.filter(x => x.cls === 'ship' && x.tp && hNow - x.tp > 7 * DAY);
    if (late.length) add({ ...o, rule: 'L-ORD-LATE-DELIVERY', sev: 'P2', title: `${late.length} đơn đang giao quá 7 ngày`, detail: late.slice(0, 6).map(x => x.sn).join(' · '), steps: ['Tra hành trình trên đơn vị vận chuyển', 'Chủ động nhắn khách cập nhật tình trạng', 'Khiếu nại ĐVVC nếu thất lạc'], closeWhen: 'Không còn đơn giao > 7 ngày' });
    const cx7 = L.orders.filter(x => x.cx && x.date > isoAdd(L.today, -7));
    if (cx7.length && L.l7.cxRate > 0.05) add({ ...o, rule: 'L-CANCEL-RATE', sev: L.l7.all >= 10 && L.l7.cxRate > 0.10 ? 'P0' : L.l7.cxRate > 0.05 ? 'P1' : 'P2', title: `${cx7.length} đơn hủy trong 7 ngày (${(L.l7.cxRate * 100).toFixed(0)}%)`, detail: cx7.slice(0, 6).map(x => x.sn).join(' · '), since: cx7[cx7.length - 1].date, steps: ['Phân loại lý do hủy (người mua/người bán/hệ thống)', 'Nếu do shop: khắc phục ngay (hết hàng, giao chậm)', 'Gọi lại khách hủy do phí ship'], closeWhen: 'Tỉ lệ hủy 7 ngày ≤ 5%' });
    const ret = L.orders.filter(x => x.ret && x.date > isoAdd(L.today, -30));
    for (const x of ret) add({ ...o, rule: 'L-RETURN-NEW', subject: x.sn, sev: 'P1', title: `Đơn trả hàng/hoàn tiền ${x.sn}`, detail: `${x.s} · ${vnd(x.v)}`, since: x.date, age: ageFrom(x.date), impactVnd: x.v, steps: ['Đọc lý do trả hàng & bằng chứng của khách', 'Phản hồi/khiếu nại Shopee trong hạn nếu lỗi không do shop', 'Ghi nhận lỗi sản phẩm để cải tiến'], closeWhen: 'evidence: kết quả xử lý yêu cầu trả hàng' });
    for (const r of L.reviews) {
      const h = (hNow - r.t) / 3600;
      if (!r.replied && r.star <= 3 && h > 24) add({ ...o, rule: 'L-REV-NEG-UNREPLIED', subject: r.sn, sev: 'P1', title: `Đánh giá ${r.star}★ chưa phản hồi ${Math.floor(h / 24)} ngày`, detail: r.text ? '“' + r.text.slice(0, 140) + '”' : 'Không có nội dung', since: r.date, age: ageFrom(r.date), steps: ['Phản hồi lịch sự, nhận trách nhiệm, đưa hướng xử lý', 'Liên hệ khách qua chat để hỗ trợ đổi/hoàn', 'Ghi nhận nguyên nhân (đóng gói/lắp ráp/giao hàng)'], closeWhen: 'Shopee ghi nhận đánh giá đã được phản hồi' });
      else if (!r.replied && h > 72 && r.date > isoAdd(L.today, -30)) add({ ...o, rule: 'L-REV-UNREPLIED-72H', subject: r.sn, sev: 'P3', title: `Đánh giá ${r.star}★ chưa phản hồi`, since: r.date, age: ageFrom(r.date), steps: ['Phản hồi cảm ơn khách'], closeWhen: 'Đánh giá đã phản hồi' });
    }
    const r30 = L.reviews.filter(r => r.date > isoAdd(L.today, -30)), avg = r30.length ? sum(r30, r => r.star) / r30.length : null;
    if (avg != null && r30.length >= 3 && avg < 4.7) add({ ...o, rule: 'L-RATING-DROP', sev: avg < 4.5 ? 'P1' : 'P2', title: `Rating 30 ngày ${avg.toFixed(2)}★`, steps: ['Tổng hợp nguyên nhân đánh giá thấp', 'Cải thiện hướng dẫn lắp ráp / đóng gói'], closeWhen: 'Rating 30 ngày ≥ 4.7★' });
    const nextFs = L.fs.filter(f => f.b > hNow && f.a < hNow + 7 * DAY);
    if (!nextFs.length) add({ ...o, rule: 'L-FS-NONE', sev: 'P1', title: 'Không có khung Flash Sale nào trong 7 ngày tới', detail: `Flash Sale chiếm ${L.l30.fsShare != null ? (L.l30.fsShare * 100).toFixed(0) : '–'}% NMV 30 ngày.`, impactVnd: L.l30.fsShare ? L.l30.nmv / 30 * 7 * L.l30.fsShare * P.netRate : 0, steps: ['Đăng ký Flash Sale của shop cho 7 ngày tới (khung giờ có đơn nhiều nhất)', 'Giá FS ≥ 315.000₫', 'Đăng ký Flash Sale Shopee (campaign sàn) nếu đủ điều kiện'], closeWhen: 'Có ít nhất 1 khung Flash Sale trong 7 ngày tới' });
    for (const v of L.vch) {
      if (v.b < hNow) continue;
      if (v.b - hNow < 3 * DAY) add({ ...o, rule: 'L-VOUCHER-ENDING', subject: v.id, sev: 'P2', title: `Voucher ${v.code || v.name} hết hạn trong ${Math.ceil((v.b - hNow) / DAY)} ngày`, steps: ['Quyết định gia hạn hay tạo voucher mới', 'Kiểm tra hiệu quả voucher (lượt dùng/NMV)'], closeWhen: 'Voucher mới được tạo hoặc quyết định dừng' });
      else if (v.lim && v.used / v.lim >= 0.9) add({ ...o, rule: 'L-VOUCHER-USEDUP', subject: v.id, sev: 'P2', title: `Voucher ${v.code || v.name} đã dùng ${v.used}/${v.lim} lượt`, steps: ['Tăng lượt sử dụng hoặc tạo voucher mới'], closeWhen: 'Voucher còn > 10% lượt' });
    }
    if (L.coverDays != null && L.coverDays < 7) add({ ...o, rule: 'L-STOCK-LOW', sev: L.coverDays < 3 ? 'P0' : 'P1', title: `Tồn kho Shopee chỉ đủ ${L.coverDays.toFixed(1)} ngày bán (${L.shopStock} pcs)`, steps: ['Cập nhật tồn kho Shopee từ kho Suối Nghệ', 'Kiểm tra số lượng thực tế tại kho'], closeWhen: 'Tồn Shopee ≥ 7 ngày bán' });
    if (L.planCum >= 20 && L.soldSince < L.planCum * 0.85) add({ ...o, rule: 'L-WH-BURN', sev: L.soldSince < L.planCum * 0.7 ? 'P1' : 'P2', title: `Giải phóng kho Suối Nghệ chậm: bán ${L.soldSince}/${Math.round(L.planCum)} pcs theo kế hoạch`, detail: `Tồn kho ước tính ${L.whStock}/${P.stock0} pcs · thuê kho 20 triệu/tháng${L.rentPerUnit ? ' ≈ ' + vnd(L.rentPerUnit) + '/pcs bán tháng này' : ''}.`, impactVnd: (L.planCum - L.soldSince) * P.netPerUnit * 0.2,
      steps: ['Lập kế hoạch tăng tốc bán (FS, Ads, Affiliate) có số cụ thể', 'Xem xét kênh bán thêm (TikTok Shop, Lazada, B2B)', 'Báo cáo kế hoạch tồn cuối tháng'], closeWhen: 'Sản lượng luỹ kế ≥ 85% kế hoạch' });
    if (L.l7.adPaid > 1000 && !L.l7.adOrd) add({ ...o, rule: 'L-ADS-WALLET-PAID', sev: 'P1', title: `Chi ${vnd(L.l7.adPaid)} tiền nạp cho Ads 7 ngày nhưng 0 đơn từ Ads`, impactVnd: L.l7.adPaid, steps: ['Tạm dừng nhóm quảng cáo không ra đơn', 'Tối ưu từ khoá / giá thầu', 'Đặt ROAS mục tiêu ≥ 8'], closeWhen: 'Có đơn từ Ads hoặc ngừng chi tiền nạp' });
    if (L.l7.adCost > 50000 && L.l7.roas != null && L.l7.roas < 8) add({ ...o, rule: 'L-ADS-ACOS', sev: 'P1', title: `ROAS Shopee Ads 7 ngày ${L.l7.roas.toFixed(1)} (mục tiêu ≥ 8)`, detail: `Chi phí Ads ${(L.l7.nmv ? L.l7.adCost / L.l7.nmv * 100 : 0).toFixed(1)}% NMV (kế hoạch 4%).`, steps: ['Tối ưu từ khoá', 'Hạ giá thầu'], closeWhen: 'ROAS ≥ 8' });
    if (L.p7.nmv > 0 && L.l7.nmv < L.p7.nmv * 0.6) add({ ...o, rule: 'L-WOW', sev: 'P1', title: `NMV 7 ngày giảm ${((1 - L.l7.nmv / L.p7.nmv) * 100).toFixed(0)}% so với tuần trước`, detail: `${vnd(L.l7.nmv)} vs ${vnd(L.p7.nmv)}.`, impactVnd: (L.p7.nmv - L.l7.nmv) * P.netRate, steps: ['Kiểm tra sản phẩm còn hiển thị / bị khoá', 'Kiểm tra Flash Sale, voucher đã hết', 'So giá đối thủ'], closeWhen: 'NMV 7 ngày ≥ 60% tuần trước' });
    if (L.l30.orders >= 10 && L.l30.take > 0.30) add({ ...o, rule: 'L-FEE-DRIFT', sev: 'P2', title: `Phí sàn ${(L.l30.take * 100).toFixed(1)}% NMV (cao)`, steps: ['Đối chiếu gói Voucher Xtra / Freeship Xtra có còn hiệu quả', 'Kiểm tra phí cố định theo ngành hàng'], closeWhen: 'Phí sàn ≤ 30% NMV' });
    // --- added from the Director playbook ---
    for (const f of L.fs) if (f.b > hNow && f.price < P.floorPrice) add({ ...o, rule: 'L-FS-PRICE', subject: f.id, sev: 'P0', title: `Khung Flash Sale ${new Date((f.a + TZ) * 1000).toISOString().slice(5, 16).replace('T', ' ')} đặt giá ${vnd(f.price)} < sàn`, steps: ['Sửa giá Flash Sale ≥ 315.000₫ hoặc xoá khung', 'Giải trình người cài giá'], closeWhen: 'Không còn khung FS dưới giá sàn' });
    const discLive = L.disc.some(x => x.a <= hNow && x.b > hNow), fsLive = L.fs.some(x => x.a <= hNow && x.b > hNow);
    const promoPrice = Object.values(L.products).some(p => p.promo && p.list && p.promo < p.list);
    if (L.disc.length + L.fs.length && !discLive && !fsLive && !promoPrice) add({ ...o, rule: 'L-DISCOUNT-NONE', sev: 'P1', title: 'Sản phẩm không có giá khuyến mãi (khách đang thấy 700.000₫)', steps: ['Tạo chương trình giảm giá của shop', 'Đảm bảo giá sau giảm ≥ 315.000₫'], closeWhen: 'Có shop discount hoặc FS đang chạy' });
    const defect = L.reviews.filter(r => r.date > isoAdd(L.today, -7) && /gãy|lỗi|thiếu ốc|thiếu linh kiện|móp|lung lay|bánh xe|vỡ|cong/i.test(r.text));
    if (defect.length >= 2) add({ ...o, rule: 'L-REV-DEFECT', sev: 'P1', title: `${defect.length} đánh giá 7 ngày phản ánh lỗi sản phẩm`, detail: defect.slice(0, 3).map(r => '“' + r.text.slice(0, 80) + '”').join(' · '), steps: ['Tổng hợp lỗi theo loại (linh kiện, đóng gói, bánh xe)', 'Kiểm tra lô hàng tại kho Suối Nghệ', 'Bổ sung hướng dẫn lắp / linh kiện dự phòng trong hộp'], closeWhen: 'evidence: báo cáo nguyên nhân + biện pháp' });
    for (const [sku, p] of Object.entries(L.products)) if (p.list && p.list !== P.listPrice) add({ ...o, rule: 'L-PRICE-CHANGE', subject: sku, sev: 'P2', title: `Giá niêm yết ${sku || 'SP'} là ${vnd(p.list)} (kế hoạch ${vnd(P.listPrice)})`, steps: ['Xác nhận thay đổi giá có được duyệt không', 'Đưa giá về kế hoạch nếu chưa duyệt'], closeWhen: 'Giá niêm yết = 700.000₫ hoặc chị duyệt' });
    const a3 = L.ads.filter(a => a.date > isoAdd(L.today, -3));
    if (sum(a3, a => a.cost) >= 300000 && !sum(a3, a => a.ord)) add({ ...o, rule: 'L-ADS-ZERO-ORDER', sev: 'P1', title: `Ads chi ${vnd(sum(a3, a => a.cost))} 3 ngày, 0 đơn`, impactVnd: sum(a3, a => a.cost), steps: ['Tạm dừng nhóm quảng cáo', 'Rà từ khoá tốn tiền'], closeWhen: 'Có đơn từ Ads hoặc chi 3 ngày < 300.000₫' });
    if (L.tgtUnits && L.dNow >= 3) { const u3 = sum(L.orders.filter(x => !x.cx && x.date > isoAdd(L.today, -3)), x => x.q); if (u3 >= 2 * (L.tgtUnits / L.dIn * 3) && L.l7.unitNet >= P.netPerUnit) add({ ...o, rule: 'L-OPP-SURGE', sev: 'P2', kind: 'opportunity', title: `Đơn tăng mạnh: ${u3} pcs 3 ngày (gấp đôi kế hoạch)`, steps: ['Tăng ngân sách Ads khi đang có đà', 'Đảm bảo tồn Shopee đủ', 'Đăng ký thêm khung FS'], closeWhen: 'evidence: hành động đã làm' }); }
    if (L.projUnits > 0 && L.dNow >= 7 && P.rent / L.projUnits > 70000) add({ ...o, owner: 'manager', rule: 'L-RENT-PER-UNIT', sev: 'P2', title: `Chi phí thuê kho ≈ ${vnd(P.rent / L.projUnits)}/kệ tháng này`, detail: '20 triệu/tháng ÷ sản lượng dự phóng. Ngưỡng 70.000₫/kệ.', steps: ['Xem phương án thu hẹp diện tích thuê', 'Đẩy kênh B2B/kênh mới để tăng sản lượng'], closeWhen: 'Chi phí thuê ≤ 70.000₫/kệ' });
    if (!L.tgtUnits) add({ ...o, owner: 'manager', rule: 'X-TARGET-MISSING', subject: 'local', sev: 'P1', title: `Chưa có target Shopee tháng ${L.ym}`, steps: ['Bổ sung target tháng vào kế hoạch kệ 3 tầng'], closeWhen: 'Có target tháng hiện tại' });
  }
  // event-type issues (cases, returns, deductions, evidence-closed) disappear once the manager approved the task for that exact key
  const closed = ctx.closedKeys || new Set();
  for (let k = out.length - 1; k >= 0; k--) { const i = out[k]; if (closed.has(i.key) && (String(i.closeWhen || '').startsWith('evidence') || i.subject)) out.splice(k, 1); }
  // escalate overdue / recurring issues using the ledger hints passed in ctx
  for (const i of out) { i.age = i.age != null ? i.age : null; i.sla = SLA[i.sev]; i.kind = i.kind || 'issue'; }
  return out.sort((a, b) => b.score - a.score);
}

/* ============================== LEDGER (tasks, escalation, scorecards) ============================== */
const OWNERS = { trang: { name: 'Nguyễn Thị Thuỳ Trang', short: 'Thuỳ Trang', channel: 'global' }, phu: { name: 'Nguyễn Đình Phú', short: 'Đình Phú', channel: 'local' }, manager: { name: 'Uyên Nhi', short: 'Chị Nhi', channel: '' } };
function ledger(events, issues, snaps = [], opt = {}) {
  const today = opt.today || todayVN(), byKey = new Map(issues.map(i => [i.key, i]));
  const tasks = new Map(), acks = new Map();
  for (const e of [...events].sort((a, b) => a.id - b.id)) {
    const d = e.data || {};
    if (e.op === 'assign') { tasks.set(d.taskId, { ...d, id: d.taskId, state: 'open', assignedAt: e.ts, history: [e], reminds: 0, warns: 0, reopen: 0, progress: [] }); continue; }
    if (e.op === 'ack' && String(e.ref).indexOf('T-') !== 0) { if (!acks.has(e.ref)) acks.set(e.ref, e.ts); continue; }
    const t = tasks.get(e.ref); if (!t) continue; t.history.push(e);
    if ((e.op === 'ack' || e.op === 'progress' || e.op === 'done') && e.role !== 'manager' && !acks.has(t.issueKey)) acks.set(t.issueKey, e.ts);
    if (e.op === 'ack') { t.ackAt = t.ackAt || e.ts; if (t.state === 'open') t.state = 'doing'; }
    else if (e.op === 'progress') { t.state = t.state === 'open' ? 'doing' : t.state; t.progress.push(e); }
    else if (e.op === 'done') { t.state = 'review'; t.doneAt = e.ts; t.evidence = d.link || t.evidence; t.doneNote = d.note; }
    else if (e.op === 'approve') { t.state = 'closed'; t.closedAt = e.ts; t.closeHow = d.how || 'manager'; }
    else if (e.op === 'dismiss') { t.state = 'closed'; t.closedAt = e.ts; t.closeHow = 'dismissed'; t.dismissReason = d.reason; }
    else if (e.op === 'reopen') { t.state = 'open'; t.reopen++; t.closedAt = null; }
    else if (e.op === 'deadline') t.due = d.due;
    else if (e.op === 'remind') t.reminds++;
    else if (e.op === 'warn') t.warns++;
    else if (e.op === 'praise') t.praised = true;
  }
  const list = [...tasks.values()];
  for (const t of list) {
    const live = byKey.get(t.issueKey);
    t.live = live || null;
    t.dataResolved = !live && !String(t.closeWhen || '').startsWith('evidence');   // the rule no longer fires → data says it is fixed
    t.overdue = t.state !== 'closed' && t.due && t.due < today && !(t.state === 'review' && t.doneAt && String(t.doneAt).slice(0, 10) <= t.due);
    t.daysOver = t.overdue ? isoDiff(t.due, today) : 0;
    t.effSev = t.overdue ? bump(t.sev) : t.sev;
    const same = x => String(t.issueKey || '').includes('|') ? x.issueKey === t.issueKey : x.ruleId === t.ruleId;
    const prior = list.filter(x => x !== t && x.owner === t.owner && same(x) && x.closeHow !== 'dismissed' && x.assignedAt < t.assignedAt && isoDiff(String(x.assignedAt).slice(0, 10), String(t.assignedAt).slice(0, 10)) <= 30);
    t.recurrence = prior.length + 1;
    t.flag = t.recurrence >= 3 ? 'warning' : t.recurrence === 2 ? 'remind' : (t.daysOver >= 2 ? 'remind' : null);
  }
  // first-seen per issue from daily snapshots (for metric issues without a source timestamp)
  const firstSeen = {};
  for (const s of [...snaps].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))) for (const k of (s.keys || [])) if (!firstSeen[k]) firstSeen[k] = String(s.ts).slice(0, 10);
  for (const i of issues) {
    if (i.age == null && firstSeen[i.key]) i.age = isoDiff(firstSeen[i.key], today);
    i.task = list.find(t => t.issueKey === i.key && t.state !== 'closed') || null;
    i.ackAt = acks.get(i.key) || (i.task && i.task.ackAt) || null;
    // "miss báo cáo": serious issue older than 24h that the owner never acknowledged before the system/manager caught it
    i.missReport = (i.sev === 'P0' || i.sev === 'P1') && i.owner !== 'manager' && (i.age || 0) >= 1 && !i.ackAt;
    const overdueSla = i.sla != null && (i.age || 0) > i.sla && !i.task;
    i.effSev = overdueSla ? bump(i.sev) : i.sev; i.slaBreached = overdueSla;
  }
  // scorecards
  const cards = {};
  for (const id of ['trang', 'phu']) {
    const ts = list.filter(t => t.owner === id), closed = ts.filter(t => t.state === 'closed' && t.closeHow !== 'dismissed');
    const onTime = closed.filter(t => !t.due || String(t.doneAt || t.closedAt).slice(0, 10) <= t.due);
    const iss = issues.filter(i => i.owner === id);
    const cycle = closed.filter(t => t.closedAt).map(t => (Date.parse(t.closedAt) - Date.parse(t.assignedAt)) / 864e5);
    cards[id] = { ...OWNERS[id], id, assigned: ts.length, open: ts.filter(t => t.state !== 'closed').length, review: ts.filter(t => t.state === 'review').length, overdue: ts.filter(t => t.overdue).length,
      closed: closed.length, onTimeRate: closed.length ? onTime.length / closed.length : null, avgDays: cycle.length ? cycle.reduce((s, x) => s + x, 0) / cycle.length : null,
      reopen: sum(ts, t => t.reopen), reminds: sum(ts, t => t.reminds), warns: sum(ts, t => t.warns), recurring: ts.filter(t => t.recurrence >= 2).length,
      openIssues: iss.length, p0: iss.filter(i => i.effSev === 'P0').length, p1: iss.filter(i => i.effSev === 'P1').length, missReport: iss.filter(i => i.missReport).length, unassigned: iss.filter(i => !i.task && i.kind === 'issue').length };
    const c = cards[id];
    // 100-point accountability score: penalties for overdue, misses, recurrences, reopen; bonus for on-time
    c.score = Math.max(0, Math.round(100 - c.overdue * 8 - c.missReport * 6 - c.recurring * 5 - c.reopen * 4 - c.p0 * 5 - c.warns * 10 + (c.onTimeRate != null ? (c.onTimeRate - 0.8) * 30 : 0)));
  }
  return { tasks: list, cards, firstSeen };
}

/* ============================== ROUTINES (recurring duties) ============================== */
// verify: 'rule:<id>' → done when that rule is NOT firing; 'evidence' → needs a link approved by the manager
const ROUTINES = [
  { id: 'R-G-INC', owner: 'trang', title: 'Kiểm tra Incidents, Returns & Deductions trên Partner Home', cadence: 'weekly', due: 'Thứ 5', verify: 'rule:G-INC-CHECK' },
  { id: 'R-G-CONTENT', owner: 'trang', title: 'Waymore / Premium A+ content: hoàn thành ít nhất 1 listing', cadence: 'weekly', due: 'Thứ 6', verify: 'evidence' },
  { id: 'R-G-ADS', owner: 'trang', title: 'Tối ưu quảng cáo Wayfair (bid, tắt campaign 0 đơn)', cadence: 'weekly', due: 'Thứ 2', verify: 'rule:G-ADS-WASTE' },
  { id: 'R-G-REPORT', owner: 'trang', title: 'Báo cáo tuần Global: doanh thu vs target, margin, tồn kho, incident', cadence: 'weekly', due: 'Thứ 6', verify: 'evidence' },
  { id: 'R-G-STOCK', owner: 'trang', title: 'Rà tồn kho CastleGate & đồng hồ 90 ngày, đề xuất reorder', cadence: 'monthly', due: 'Ngày 5', verify: 'rule:G-CG-STORAGE' },
  { id: 'R-L-ORDER', owner: 'phu', title: 'Xác nhận & bàn giao toàn bộ đơn trước 11:00', cadence: 'daily', due: '11:00', verify: 'rule:L-ORD-UNCONFIRMED' },
  { id: 'R-L-REVIEW', owner: 'phu', title: 'Phản hồi 100% đánh giá trong 24h', cadence: 'daily', due: '17:00', verify: 'rule:L-REV-NEG-UNREPLIED' },
  { id: 'R-L-FS', owner: 'phu', title: 'Đăng ký Flash Sale cho tuần kế tiếp', cadence: 'weekly', due: 'Thứ 4', verify: 'rule:L-FS-NONE' },
  { id: 'R-L-PRICE', owner: 'phu', title: 'Kiểm tra giá bán, voucher, không bán dưới 315.000₫', cadence: 'weekly', due: 'Thứ 2', verify: 'rule:L-BELOW-FLOOR' },
  { id: 'R-L-STOCK', owner: 'phu', title: 'Đối chiếu tồn kho Shopee với kho Suối Nghệ', cadence: 'weekly', due: 'Thứ 6', verify: 'evidence' },
  { id: 'R-L-REPORT', owner: 'phu', title: 'Báo cáo tuần Local: sản lượng vs target, thực thu/sp, kế hoạch tuần sau', cadence: 'weekly', due: 'Thứ 6', verify: 'evidence' }
];
function periodKey(cadence, iso) { if (cadence === 'daily') return iso; if (cadence === 'monthly') return iso.slice(0, 7); const d = new Date(iso + 'T00:00:00Z'), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return 'W' + d.toISOString().slice(0, 10); }
function routines(defs, issues, events, today = todayVN()) {
  const firing = new Set(issues.map(i => i.rule));
  return defs.map(r => {
    const pk = periodKey(r.cadence, today), ref = 'R:' + r.id + ':' + pk;
    const evs = events.filter(e => e.ref === ref);
    const sub = evs.filter(e => e.op === 'done' || e.op === 'progress').pop(), ok = evs.find(e => e.op === 'approve');
    let status;
    if (r.verify.startsWith('rule:')) status = firing.has(r.verify.slice(5)) ? 'fail' : 'ok';
    else status = ok ? 'ok' : sub ? 'review' : 'pending';
    return { ...r, period: pk, ref, status, evidence: sub && sub.data && sub.data.link, submittedAt: sub && sub.ts };
  });
}

const api = { modelGlobal, modelLocal, detect, ledger, routines, ROUTINES, LOCAL_PLAN, OWNERS, SLA, SEV, bump, isoAdd, isoDiff, todayVN, vnISO, periodKey };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CCE = api;
})(typeof window !== 'undefined' ? window : globalThis);
