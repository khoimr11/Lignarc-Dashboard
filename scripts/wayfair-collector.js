/* Lignarc · Wayfair Partner Home collector
 * Run in a logged-in https://partners.wayfair.com tab:  await LGW.run()
 * Reads the pages' own (registered) GraphQL calls inside hidden same-origin iframes and replays
 * them with wider variables. No file is downloaded to disk. Customer names/addresses are dropped.
 */
(() => {
'use strict';
const SUP = '467016';
const BAD = /datadog|events\/single|conviva|toggle|nav-menu|layout|appcues|analytics|fullstory/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const L = m => { log.push(new Date().toISOString().slice(11, 19) + ' ' + m); };

// open a same-origin page in an iframe and record its network calls (+ request headers)
function hook(path, { ms = 20000, re = /graph|media_hub|download-center/, vis = false, until } = {}) {
  return new Promise(res => {
    const f = document.createElement('iframe');
    f.className = 'lgh';
    f.style.cssText = vis ? 'position:fixed;left:0;top:0;width:1440px;height:900px;opacity:.01;pointer-events:none;z-index:-1;border:0'
                          : 'position:fixed;left:-3000px;top:0;width:1440px;height:900px';
    const cap = []; let hooked = false; const t0 = Date.now();
    f.src = path; document.body.appendChild(f);
    const tick = () => {
      try {
        const w = f.contentWindow;
        if (!hooked && w && w.location.href.includes(path.split('?')[0]) && w.fetch) {
          const of = w.fetch;
          w.fetch = async function (u, o) {
            const url = typeof u === 'string' ? u : u.url;
            const r = await of.apply(this, arguments);
            if (re.test(url) && !BAD.test(url)) r.clone().text().then(t => cap.push({ url, m: (o && o.method) || 'GET', body: o && o.body, h: o && o.headers, resp: t }));
            return r;
          };
          const X = w.XMLHttpRequest.prototype, oo = X.open, os = X.send, sh = X.setRequestHeader;
          X.open = function (m, u) { this._u = u; this._m = m; this._h = []; return oo.apply(this, arguments); };
          X.setRequestHeader = function (k, v) { this._h.push([k, v]); return sh.apply(this, arguments); };
          X.send = function (b) { this.addEventListener('load', () => { if (re.test(this._u) && !BAD.test(this._u)) cap.push({ url: this._u, m: this._m, body: b, h: this._h, resp: typeof this.response === 'string' ? this.response : '' }); }); return os.apply(this, arguments); };
          // never let the iframe save files to disk
          hooked = true;
        }
      } catch (e) {}
      const done = until && hooked && until(cap, f);
      if (!done && Date.now() - t0 < ms) setTimeout(tick, hooked ? 400 : 15);
      else res({ f, cap, hooked });
    };
    tick();
  });
}
const opName = c => (String(c.body || '').match(/operationName"\s*:\s*"(\w+)/) || String(c.body || '').match(/query\s+(\w+)/) || [])[1];
const find = (cap, name) => cap.filter(c => opName(c) === name).pop();
const has = name => cap => cap.some(c => opName(c) === name);
function hdrs(c) { const h = c.h instanceof Headers ? [...c.h.entries()] : Array.isArray(c.h) ? c.h : Object.entries(c.h || {}); return h.filter(([k]) => !/content-length/i.test(k)); }
async function replay(c, vars) {
  const b = JSON.parse(c.body);
  if (vars) b.variables = typeof vars === 'function' ? vars(JSON.parse(JSON.stringify(b.variables || {}))) : vars;
  const r = await fetch(c.url, { method: 'POST', credentials: 'include', headers: hdrs(c), body: JSON.stringify(b) });
  const j = await r.json(); if (j.errors && !j.data) throw new Error(opName(c) + ': ' + JSON.stringify(j.errors).slice(0, 200)); return j.data;
}
const clear = () => document.querySelectorAll('iframe.lgh').forEach(f => f.remove());
function csv(t) { const rows = []; let r = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c.replace(/\r$/, '')); rows.push(r); r = []; c = ''; } else c += ch; } if (c || r.length) { r.push(c); rows.push(r); } return rows; }
const num = v => { const n = parseFloat(String(v).replace(/[$,]/g, '')); return isNaN(n) ? null : Math.round(n * 100) / 100; };
const day = s => s ? String(s).slice(0, 10) : null;
const mdy = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };

// ---------- inventory (CastleGate network) ----------
async function inventory() {
  const { cap } = await hook('/d/inventory/overview', { until: has('GetOverviewViewUIQuery'), re: /graph/ });
  const c = find(cap, 'GetOverviewViewUIQuery'); if (!c) throw new Error('inventory op not found');
  const d = await replay(c, v => ({ ...v, pageNumber: 1, pageSize: 200, partStatus: null }));
  return d.phiSupplierPartsInventoryUi.supplierParts.map(p => [p.supplierPartNumber, p.sku, p.castlegateNetworkInStock, p.castlegateNetworkAvailable, p.totalOnOrder, p.retailPrice, p.wholeSaleCost, p.agedUnits90Plus, p.next3monthForecast, p.purchasabilityStatus, p.partStatus, p.supplyStatus]);
}
// ---------- catalogue performance (Product Management) ----------
async function products() {
  const { cap } = await hook('/d/products/product-management/lists/performance', { until: has('fullAndPendingProductSearchV2'), re: /graph/ });
  const c = find(cap, 'fullAndPendingProductSearchV2'); if (!c) return [];
  let d; try { d = JSON.parse(c.resp).data; } catch (e) { return []; }
  const k = Object.keys(d).find(k => d[k] && d[k].numFound !== undefined) || Object.keys(d)[0];
  const arr = Object.values(d[k]).find(Array.isArray) || [];
  return arr.map(x => { const p = x.part || {}; return [p.partNumber, x.bestSku, x.revenue, x.unitsSold, x.skuImpressions, x.uniqueVisits, x.conversionRate, x.reviewsCount && x.reviewsCount.value, x.launchDate, x.productStatus && x.productStatus.displayText, p.thumbnail && p.thumbnail.imageId]; });
}
// ---------- CastleGate inbound POs ----------
async function inbound() {
  const { cap } = await hook('/d/manage-inbound-orders', { until: has('OrderListData'), re: /graph/ });
  const c = find(cap, 'OrderListData'); if (!c) throw new Error('inbound list op not found');
  const d = await replay(c, v => { v.paginate = { limit: 100, offset: 0 }; if (v.filter) delete v.filter.statuses; return v; });
  const root = Object.values(d).find(x => x && typeof x === 'object');
  const nodes = (root && (root.nodes || (root.edges || []).map(e => e.node))) || [];
  if (!nodes.length) return [];
  const det = await hook('/d/manage-inbound-orders/order/' + nodes[0].id, { until: has('OrderDetailsData'), re: /graph/ });
  const dc = find(det.cap, 'OrderDetailsData'); if (!dc) throw new Error('inbound detail op not found');
  const out = [];
  for (const n of nodes) {
    const io = (await replay(dc, { id: n.id })).inboundOrder;
    const ms = {};
    for (const s of io.shipments || []) for (const t of s.timeline || []) for (const a of t.attributes || []) ms[(t.descriptor || '') + ':' + a.type] = a.value;
    const items = new Map();
    for (const li of (io.orderLineItems && io.orderLineItems.nodes) || []) items.set(li.partNumber, [li.partNumber, li.plannedQuantity || 0, 0, 0]);
    for (const s of io.shipments || []) for (const li of s.shipmentOrderLineItems || []) { const it = items.get(li.partNumber) || [li.partNumber, 0, 0, 0]; it[2] += li.shippedQuantity || 0; it[3] += li.receivedQuantity || 0; items.set(li.partNumber, it); }
    const sh = (io.shipments || [])[0] || {};
    out.push({ id: io.displayId, po: io.purchaseOrderNumber, status: io.status, created: day(io.originalCreatedDate), ready: io.estimatedCargoReadyDate,
      dest: (io.shipperBookings && io.shipperBookings[0] && io.shipperBookings[0].destination && io.shipperBookings[0].destination.name) || null,
      eta: sh.estimatedArrivalDate || (sh.predictedETAToDestination && (sh.predictedETAToDestination.value || sh.predictedETAToDestination)) || null,
      loadAtd: ms['PLACE_OF_RECEIPT_AND_PORT_OF_LOADING:ATD'] || null, portAta: ms['PORT_OF_DISCHARGE:ATA'] || null,
      whAta: ms['DESTINATION:ATA'] || null, recvStart: ms['DESTINATION:RECEIVING_START'] || null, emptied: ms['DESTINATION:CONTAINER_EMPTIED_DATE'] || null,
      cbm: sh.totalShipmentVolume ? sh.totalShipmentVolume.value : null, container: sh.containerNumber || sh.friendlyName || null,
      items: [...items.values()] });
  }
  return out;
}
// ---------- CastleGate orders (export CSV, all orders last 18 months) ----------
async function orders() {
  const pg = await hook('/d/orders/castlegate/sc', { re: /graph/, until: has('CastleGateOrderListSingleChannel') });
  const doc = pg.f.contentDocument;
  const waitFor = async (fn, t = 15000) => { const t0 = Date.now(); let v; while (!(v = fn()) && Date.now() - t0 < t) await sleep(300); return v; };
  const link = await waitFor(() => doc.querySelector('[data-cypress-id=cg-export-toolbar-export-all]')); if (!link) throw new Error('Export All link not found');
  let dlg = null;
  for (let i = 0; i < 12 && !dlg; i++) { await sleep(2000); link.click(); dlg = await waitFor(() => doc.querySelector('[role=dialog]'), 1500); }
  if (!dlg) throw new Error('export dialog not found');
  await sleep(800);
  const radios = [...dlg.querySelectorAll('input[type=radio]')];
  const all = radios.find(r => /All Orders/i.test((r.closest('label') || r.parentElement.parentElement || {}).textContent || '')) || radios[0];
  if (all && !all.disabled) { all.click(); await sleep(400); }
  const btn = await waitFor(() => [...dlg.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export')); if (!btn) throw new Error('Export button not found');
  btn.click();
  let exportId = null;
  for (let i = 0; i < 30 && !exportId; i++) { await sleep(500); const c = pg.cap.find(c => /triggerExport/.test(c.resp)); if (c) exportId = JSON.parse(c.resp).data.soCastlegateOrders.triggerExport.exportId; }
  if (!exportId) throw new Error('export not queued');
  L('export ' + exportId);
  // the Download Center page calls api.wayfair.io with a bearer token: borrow it, then read our file directly (nothing is clicked or saved)
  const auth = c => hdrs(c).find(([k]) => /^authorization$/i.test(k));
  const dc = await hook('/d/download-center', { re: /wayfair\.io|download-center/, ms: 25000, until: cap => cap.some(auth) });
  const ac = dc.cap.find(auth); dc.f.remove();
  if (!ac) throw new Error('download-center token not found: ' + dc.cap.map(c => c.url.split('?')[0]).join(','));
  const AH = hdrs(ac).filter(([k]) => /^(authorization|accept|x-requested-with)$/i.test(k));
  let text = null;
  for (let attempt = 0; attempt < 18 && !text; attempt++) {
    await sleep(attempt ? 8000 : 4000);
    try { const r = await fetch('https://api.wayfair.io/download-center/file/' + exportId, { headers: AH }); if (r.ok) { const t = await r.text(); if (/^﻿?Supplier,/.test(t)) text = t.replace(/^﻿/, ''); } } catch (e) {}
  }
  if (!text) throw new Error('export file not ready');
  const R = csv(text.trim()); const H = R[0]; const ix = n => H.indexOf(n);
  const col = { oid: ix('Order ID'), ord: ix('Order #'), ret: ix('Retailer'), po: ix('PO Number'), pod: ix('PO Date'), ship: ix('Shipped Date'), st: ix('Order Status'), wh: ix('Warehouse Name'), state: ix('Ship To State'), country: ix('Country'), part: ix('Item Number'), sku: ix('SKU'), name: ix('Item Name'), opt: ix('Options'), qty: ix('Quantity'), price: ix('Wholesale Price'), b2b: ix('B2BOrder'), ch: ix('Sales Channel'), mustShip: ix('Must Ship By') };
  return R.slice(1).filter(r => r.length > 10).map(r => [r[col.po], r[col.ord], mdy(r[col.pod]), r[col.st], r[col.ret], r[col.state], r[col.country], r[col.part], r[col.sku], r[col.name], r[col.opt], num(r[col.qty]), num(r[col.price]), r[col.b2b], r[col.ch], mdy(r[col.ship]), r[col.wh]]);
}
// ---------- Advertising ----------
async function ads(from) {
  const { cap } = await hook('/d/advertising/campaign', { re: /media_hub/, ms: 60000, vis: true, until: cap => cap.some(c => opName(c) === 'GetCampaignInsightsQuery' && /campaignLayerIds":\[\d/.test(c.body)) && cap.filter(c => opName(c) === 'GetCampaignsQuery').some(c => c.resp.length > 400) });
  const camps = cap.filter(c => opName(c) === 'GetCampaignsQuery').sort((a, b) => b.resp.length - a.resp.length)[0];
  if (!camps) throw new Error('ads ops not captured: ' + cap.map(opName).join(','));
  const ins = cap.filter(c => opName(c) === 'GetCampaignInsightsQuery').find(c => /campaignLayerIds":\[\d/.test(c.body)) || find(cap, 'GetCampaignInsightsQuery');
  const wallet = find(cap, 'GetWalletSummaryQuery');
  const gc = JSON.parse(camps.resp).data.getCampaigns || {};
  const list = gc.campaigns || Object.values(gc).find(Array.isArray) || [];
  const C = list.map(x => { const m = x.campaignMetadata || {}; return [x.campaignKey.campaignLayerId, m.campaignName, m.statusId, m.startDate, m.endDate || null, m.dailyCap, m.campaignLayerTypeId, m.biddingStrategy]; });
  const to = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
  const daily = [];
  for (const c of C) {
    const d = await replay(ins, v => ({ ...v, campaignLayerIds: [c[0]], aggregationType: 'DAY', filters: { 0: { key: 'START_DATE', value: from }, 1: { key: 'END_DATE', value: to } } }));
    for (const x of d.getCampaignInsights || []) { const r = x.insightsRecord || {}; if (!(r.impressions || r.spend || r.clicks)) continue; daily.push([c[0], (r.keyAsString || '').slice(0, 10), r.impressions || 0, r.clicks || 0, r.spend || 0, r.attributedUnits || 0, r.attributedRetailSales || 0, r.attributedOrders || 0]); }
  }
  let w = null; try { const ws = JSON.parse(wallet.resp).data.getPartnerWalletSummary; w = { balance: ws.walletBalance ?? ws.balance ?? null, dailyCap: ws.dailyCap ?? null, raw: ws }; } catch (e) {}
  return { camps: C, daily, wallet: w };
}

async function step(name, fn, out) { try { out[name] = await fn(); L(name + ' ok ' + (Array.isArray(out[name]) ? out[name].length : '')); } catch (e) { out.err = out.err || {}; out.err[name] = String(e.message || e).slice(0, 200); L(name + ' FAIL ' + e.message); } clear(); }

window.LGW = {
  log,
  async run({ adsFrom = '2026-09-01', only } = {}) {
    if (!/partners\.wayfair\.com/.test(location.host)) throw new Error('Run on partners.wayfair.com');
    const out = { v: 1, src: 'wayfair', at: Math.floor(Date.now() / 1000) };
    const want = n => !only || only.includes(n);
    if (want('inv')) await step('inv', inventory, out);
    if (want('prod')) await step('prod', products, out);
    if (want('inb')) await step('inb', inbound, out);
    if (want('orders')) await step('orders', orders, out);
    if (want('ads')) await step('ads', () => ads(adsFrom), out);
    window.LGW.out = out;
    return JSON.stringify({ size: JSON.stringify(out).length, inv: (out.inv || []).length, prod: (out.prod || []).length, inb: (out.inb || []).length, orders: (out.orders || []).length, ads: out.ads ? out.ads.daily.length : 0, err: out.err || null });
  },
  part(i, n = 900) { const s = JSON.stringify(this.out); return s.slice(i * n, (i + 1) * n); },
  parts(n = 900) { return Math.ceil(JSON.stringify(this.out).length / n); }
};
return 'LGW ready';
})();
