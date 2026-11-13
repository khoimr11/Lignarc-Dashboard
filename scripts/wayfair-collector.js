/* Lignarc · Wayfair Partner Home collector (v2 — no hidden iframes)
 *
 * Wayfair only accepts GraphQL operations registered by its own pages, so this script records the
 * exact requests the pages make (LGW.record(), stored in this browser's localStorage) and replays them
 * later with wider variables. Nothing is downloaded to disk; customer names/addresses are dropped.
 *
 * Daily run:
 *   on LGW.INB_PAGE (an inbound order detail page):  await LGW.inbound()   -> CastleGate inbound POs
 *   on any partners.wayfair.com page: await LGW.collect()   -> inventory, catalogue, ads; queues the orders export
 *   go to /d/download-center, load script again, then:
 *   await LGW.grabExport()         -> reads the queued CastleGate orders CSV in-page
 *   LGW.send()  + click the centred button once  -> hands everything to sync.html
 *
 * If collect() reports missing ops, record them once:  LGW.record() on the page, then interact
 * (see LGW.HOWTO) so the page fires the request, then LGW.saved() to check.
 */
(() => {
'use strict';
const OPS_KEY = 'lgw-ops', OUT_KEY = 'lgw-out';
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = []; const L = m => { log.push(new Date().toISOString().slice(11, 19) + ' ' + m); };
const opName = b => (String(b || '').match(/operationName"\s*:\s*"(\w+)/) || String(b || '').match(/(?:query|mutation)\s+(\w+)/) || [])[1];
const hdrList = h => (h instanceof Headers ? [...h.entries()] : Array.isArray(h) ? h : Object.entries(h || {})).filter(([k]) => !/content-length|x-parent-txid/i.test(k));
const WANT = /GetOverviewViewUIQuery|fullAndPendingProductSearchV2|TriggerCgOrderExport|GetCampaignsQuery|GetCampaignInsightsQuery|GetWalletSummaryQuery/;
const HOWTO = {
  GetOverviewViewUIQuery: '/d/inventory/overview → click a column header (e.g. In Stock) to sort',
  fullAndPendingProductSearchV2: '/d/products/product-management/lists/performance → click a column header to sort',
    TriggerCgOrderExport: '/d/orders/castlegate/sc → Export All → Export (queues a CSV in Download Center)',
  GetCampaignsQuery: '/d/advertising/campaign → change Date Range',
  GetCampaignInsightsQuery: '/d/advertising/campaign → change Date Range',
  GetWalletSummaryQuery: '/d/advertising/campaign (fires on load; optional)'
};
// ---- recorder: keeps the latest request of each wanted operation (url, body, headers) ----
function record() {
  if (window.__lgwRec) return 'recording';
  window.__lgwRec = true;
  const save = (url, method, body, h) => { const n = opName(body); if (!n || !WANT.test(n)) return; const ops = ls.get(OPS_KEY) || {};
    // keep the insights call that targets campaigns (has campaignLayerIds) in preference
    if (n === 'GetCampaignInsightsQuery' && ops[n] && /campaignLayerIds":\[\d/.test(ops[n].body) && !/campaignLayerIds":\[\d/.test(body)) return;
    ops[n] = { url, method: method || 'POST', body: String(body), h: hdrList(h), at: Date.now() }; ls.set(OPS_KEY, ops); L('recorded ' + n); };
  const of = window.fetch;
  window.fetch = function (u, o) { try { save(typeof u === 'string' ? u : u.url, o && o.method, o && o.body, o && o.headers); } catch (e) {} return of.apply(this, arguments); };
  const X = XMLHttpRequest.prototype, oo = X.open, os = X.send, sh = X.setRequestHeader;
  X.open = function (m, u) { this.__u = u; this.__m = m; this.__h = []; return oo.apply(this, arguments); };
  X.setRequestHeader = function (k, v) { (this.__h = this.__h || []).push([k, v]); return sh.apply(this, arguments); };
  X.send = function (b) { try { save(this.__u, this.__m, b, this.__h); } catch (e) {} return os.apply(this, arguments); };
  return 'recording';
}
async function replay(name, vars) {
  const op = (ls.get(OPS_KEY) || {})[name]; if (!op) throw new Error('missing op ' + name + ' — ' + HOWTO[name]);
  const b = JSON.parse(op.body);
  if (vars) b.variables = typeof vars === 'function' ? vars(JSON.parse(JSON.stringify(b.variables || {}))) : vars;
  const r = await fetch(op.url, { method: 'POST', credentials: 'include', headers: op.h, body: JSON.stringify(b) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { throw new Error(name + ' HTTP ' + r.status + ' ' + t.slice(0, 120)); }
  if ((j.errors && !j.data) || !r.ok) throw new Error(name + ': ' + JSON.stringify(j.errors || j).slice(0, 200) + ' — re-record: ' + HOWTO[name]);
  return j.data;
}
const day = s => s ? String(s).slice(0, 10) : null;
const mdy = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const num = v => { const n = parseFloat(String(v).replace(/[$,]/g, '')); return isNaN(n) ? null : Math.round(n * 100) / 100; };
function csv(t) { const rows = []; let r = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c.replace(/\r$/, '')); rows.push(r); r = []; c = ''; } else c += ch; } if (c || r.length) { r.push(c); rows.push(r); } return rows; }

async function inventory() {
  const d = await replay('GetOverviewViewUIQuery', v => ({ ...v, pageNumber: 1, pageSize: 200, partStatus: null }));
  return d.phiSupplierPartsInventoryUi.supplierParts.map(p => [p.supplierPartNumber, p.sku, p.castlegateNetworkInStock, p.castlegateNetworkAvailable, p.totalOnOrder, p.retailPrice, p.wholeSaleCost, p.agedUnits90Plus, p.next3monthForecast, p.purchasabilityStatus, p.partStatus, p.supplyStatus]);
}
async function products() {
  const d = await replay('fullAndPendingProductSearchV2', v => { const s = JSON.stringify(v); return JSON.parse(s.replace(/"(pageSize|rows|limit|perPage)":\d+/g, '"$1":200').replace(/"(page|pageNumber)":\d+/g, '"$1":1')); });
  const k = Object.keys(d).find(k => d[k] && d[k].numFound !== undefined) || Object.keys(d)[0];
  const arr = Object.values(d[k]).find(Array.isArray) || [];
  return arr.map(x => { const p = x.part || {}; return [p.partNumber, x.bestSku, x.revenue, x.unitsSold, x.skuImpressions, x.uniqueVisits, x.conversionRate, x.reviewsCount && x.reviewsCount.value, x.launchDate, x.productStatus && x.productStatus.displayText]; });
}
// Inbound POs: run on any inbound order detail page (its Apollo client holds both registered queries)
const INB_PAGE = '/d/manage-inbound-orders/order/Q2dmT3JkZXI6NTA1MjMz';
async function inbound() {
  const ac = window.__APOLLO_CLIENT__; const docs = {};
  if (ac) for (const q of ac.queryManager.queries.values()) if (q.document && q.document.definitions[0].name) docs[q.document.definitions[0].name.value] = q;
  if (!docs.OrderListData || !docs.OrderDetailsData) throw new Error('open ' + INB_PAGE + ' (an inbound order detail page) and run LGW.inbound() there');
  const q = (name, vars) => ac.query({ query: docs[name].document, variables: vars, fetchPolicy: 'network-only' }).then(r => r.data);
  const lv = JSON.parse(JSON.stringify(docs.OrderListData.observableQuery.variables || {})); lv.paginate = { limit: 100, offset: 0 }; lv.filter = {};
  const d = await q('OrderListData', lv);
  const root = Object.values(d).find(x => x && typeof x === 'object'); const nodes = (root && (root.nodes || (root.edges || []).map(e => e.node))) || [];
  const out = [];
  for (const n of nodes) {
    if (/CANCEL/i.test(n.status || '')) { out.push({ id: n.displayId, status: n.status, created: day(n.originalCreatedDate), items: [] }); continue; }
    const io = (await q('OrderDetailsData', { id: n.id })).inboundOrder; const ms = {};
    for (const s of io.shipments || []) for (const t of s.timeline || []) for (const a of t.attributes || []) ms[(t.descriptor || '') + ':' + a.type] = a.value;
    const items = new Map();
    for (const li of (io.orderLineItems && io.orderLineItems.nodes) || []) items.set(li.partNumber, [li.partNumber, li.plannedQuantity || 0, 0, 0]);
    for (const s of io.shipments || []) for (const li of s.shipmentOrderLineItems || []) { const it = items.get(li.partNumber) || [li.partNumber, 0, 0, 0]; it[2] += li.shippedQuantity || 0; it[3] += li.receivedQuantity || 0; items.set(li.partNumber, it); }
    const sh = (io.shipments || [])[0] || {}, bk = (io.shipperBookings || [])[0] || {};
    out.push({ id: io.displayId, po: io.purchaseOrderNumber, status: io.status, created: day(io.originalCreatedDate), ready: io.estimatedCargoReadyDate, dest: (bk.destination && bk.destination.name) || null,
      eta: sh.estimatedArrivalDate || null, loadAtd: ms['PLACE_OF_RECEIPT_AND_PORT_OF_LOADING:ATD'] || null, portAta: ms['PORT_OF_DISCHARGE:ATA'] || null,
      whAta: ms['DESTINATION:ATA'] || null, recvStart: ms['DESTINATION:RECEIVING_START'] || null, emptied: ms['DESTINATION:CONTAINER_EMPTIED_DATE'] || null,
      cbm: sh.totalShipmentVolume ? sh.totalShipmentVolume.value : null, container: sh.containerNumber || sh.friendlyName || null, items: [...items.values()] });
  }
  return out;
}
async function ads(from) {
  const cd = await replay('GetCampaignsQuery'); const gc = cd.getCampaigns || {}; const list = gc.campaigns || Object.values(gc).find(Array.isArray) || [];
  const C = list.map(x => { const m = x.campaignMetadata || {}; return [x.campaignKey.campaignLayerId, m.campaignName, m.statusId, m.startDate, m.endDate || null, m.dailyCap, m.campaignLayerTypeId, m.biddingStrategy]; });
  const to = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); const daily = [];
  for (const c of C) {
    const d = await replay('GetCampaignInsightsQuery', v => ({ ...v, campaignLayerIds: [c[0]], aggregationType: 'DAY', filters: { 0: { key: 'START_DATE', value: from }, 1: { key: 'END_DATE', value: to } } }));
    for (const x of d.getCampaignInsights || []) { const r = x.insightsRecord || {}; if (!(r.impressions || r.spend || r.clicks)) continue; daily.push([c[0], (r.keyAsString || '').slice(0, 10), r.impressions || 0, r.clicks || 0, r.spend || 0, r.attributedUnits || 0, r.attributedRetailSales || 0, r.attributedOrders || 0]); }
  }
  let wallet = null; try { const w = (await replay('GetWalletSummaryQuery')).getPartnerWalletSummary; wallet = { balance: w.walletBalance ?? w.balance ?? w.availableBalance ?? null, dailyCap: w.dailyCap ?? null, raw: w }; } catch (e) {}
  return { camps: C, daily, wallet };
}
async function queueExport() {
  const d = await replay('TriggerCgOrderExport', v => { if (v.input) { v.input.exportAll = true; v.input.selected = []; } return v; });
  const t = d.soCastlegateOrders.triggerExport; if (!t.success) throw new Error('export not queued: ' + t.message); return t.exportId;
}
function parseOrders(text) {
  const R = csv(text.replace(/^﻿/, '').trim()); const H = R[0]; const ix = n => H.indexOf(n);
  const col = { ord: ix('Order #'), ret: ix('Retailer'), po: ix('PO Number'), pod: ix('PO Date'), ship: ix('Shipped Date'), st: ix('Order Status'), wh: ix('Warehouse Name'), state: ix('Ship To State'), country: ix('Country'), part: ix('Item Number'), sku: ix('SKU'), name: ix('Item Name'), opt: ix('Options'), qty: ix('Quantity'), price: ix('Wholesale Price'), b2b: ix('B2BOrder'), ch: ix('Sales Channel') };
  if (col.po < 0 || col.part < 0) throw new Error('unexpected export columns');
  return R.slice(1).filter(r => r.length > 10).map(r => [r[col.po], r[col.ord], mdy(r[col.pod]), r[col.st], r[col.ret], r[col.state], r[col.country], r[col.part], r[col.sku], r[col.name], r[col.opt], num(r[col.qty]), num(r[col.price]), r[col.b2b], r[col.ch], mdy(r[col.ship]), r[col.wh]]);
}
// On /d/download-center: click the newest completed CastleGate export and read the file response in-page
async function grabExport() {
  if (!/download-center/.test(location.pathname)) throw new Error('open /d/download-center first');
  const out = ls.get(OUT_KEY) || {}; let text = null;
  const of = window.fetch;
  window.fetch = async function (u, o) { const url = typeof u === 'string' ? u : u.url; const r = await of.apply(this, arguments); if (/download-center\/file/.test(url)) { try { const t = await r.clone().text(); if (/Supplier,|Order ID/.test(t.slice(0, 400))) text = t; } catch (e) {} } return r; };
  // keep the file in memory: neutralise the save-to-disk step on this page only
  const oCreate = URL.createObjectURL; URL.createObjectURL = () => 'about:blank#lg-kept-in-memory';
  const aClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download || /^blob:|about:blank#lg/.test(this.href)) return; return aClick.apply(this, arguments); };
  try {
    for (let i = 0; i < 30 && !text; i++) {
      const row = [...document.querySelectorAll('table tbody tr')].find(r => /CastleGate_SC_Export/.test(r.textContent));
      if (row && /Complete/i.test(row.textContent)) { const b = row.querySelector('button, a'); if (b) b.click(); for (let k = 0; k < 20 && !text; k++) await sleep(500); }
      else { await sleep(6000); const btn = [...document.querySelectorAll('button')].find(b => /^Apply$/i.test(b.textContent.trim())); if (btn && !btn.disabled) btn.click(); else if (i % 3 === 2) { location.reload(); return 'reloading — load the script again and call grabExport()'; } }
    }
  } finally { window.fetch = of; URL.createObjectURL = oCreate; HTMLAnchorElement.prototype.click = aClick; }
  if (!text) throw new Error('export file not ready yet — wait a minute and run grabExport() again');
  out.orders = parseOrders(text); out.at = Math.floor(Date.now() / 1000); ls.set(OUT_KEY, out); L('orders ' + out.orders.length);
  return JSON.stringify({ orders: out.orders.length, tt: out.orders.filter(r => /tried/i.test(r[14] || '')).length });
}
async function collect({ adsFrom = '2026-09-01' } = {}) {
  if (!/partners\.wayfair\.com/.test(location.host)) throw new Error('Run on partners.wayfair.com');
  const out = { v: 2, src: 'wayfair', at: Math.floor(Date.now() / 1000) }, err = {};
  const step = async (k, fn) => { try { out[k] = await fn(); L(k + ' ok'); } catch (e) { err[k] = String(e.message || e).slice(0, 240); L(k + ' FAIL ' + err[k]); } };
  const prev = ls.get(OUT_KEY) || {}; if (prev.inb) out.inb = prev.inb;
  await step('inv', inventory); await step('prod', products); await step('ads', () => ads(adsFrom));
  await step('exportId', queueExport);
  if (Object.keys(err).length) out.err = err;
  ls.set(OUT_KEY, out);
  return JSON.stringify({ inv: (out.inv || []).length, prod: (out.prod || []).length, inb: (out.inb || []).length, adsDays: out.ads ? out.ads.daily.length : 0, exportId: out.exportId || null, err: out.err || null });
}
// ---- hand the payload to the sync page (one real click opens the window) ----
const SYNC_URL = 'https://khoimr11.github.io/Lignarc-Dashboard/sync.html', SYNC_ORIGIN = 'https://khoimr11.github.io';
function sendButton(payload) {
  return new Promise(resolve => {
    const id = Math.random().toString(36).slice(2); let w = null, posted = false;
    const b = document.createElement('button'); b.id = 'lg-send'; b.textContent = 'Lignarc · Gửi dữ liệu';
    b.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;padding:22px 38px;font:600 20px -apple-system,Segoe UI,sans-serif;background:#3d312d;color:#fff;border:0;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.35);cursor:pointer';
    const post = () => { if (w && !posted) { posted = true; w.postMessage({ type: 'lg-data', id, payload }, SYNC_ORIGIN); b.textContent = 'Đang ghi dữ liệu…'; } };
    const onMsg = e => { if (e.origin !== SYNC_ORIGIN || !e.data) return; if (e.data.type === 'lg-sync-ready') post(); if (e.data.type === 'lg-ack' && e.data.id === id) { removeEventListener('message', onMsg); b.remove(); window.LG_LAST_ACK = e.data; resolve(e.data); } };
    addEventListener('message', onMsg);
    b.onclick = () => { w = window.open(SYNC_URL, 'lgsync'); if (!w) { b.textContent = 'Cho phép pop-up rồi bấm lại'; return; } b.textContent = 'Đang mở trang đồng bộ…'; setTimeout(post, 8000); };
    document.body.appendChild(b);
  });
}
window.LGW = {
  log, HOWTO, record, collect, grabExport, INB_PAGE,
  async inbound() { const o = ls.get(OUT_KEY) || {}; o.inb = await inbound(); ls.set(OUT_KEY, o); return JSON.stringify({ inb: o.inb.length, open: o.inb.filter(x => !/CANCEL/i.test(x.status)).map(x => x.id + ':' + x.status) }); },
  saved() { const o = ls.get(OPS_KEY) || {}; return JSON.stringify(Object.fromEntries(Object.keys(HOWTO).map(k => [k, o[k] ? new Date(o[k].at).toISOString().slice(0, 16) : 'MISSING']))); },
  get out() { return ls.get(OUT_KEY); },
  send() { const o = ls.get(OUT_KEY); if (!o) throw new Error('collect() first'); const p = { ...o }; delete p.exportId; this.ack = sendButton(p); const r = document.getElementById('lg-send').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), vw: innerWidth, vh: innerHeight }); },
  status() { return window.LG_LAST_ACK ? JSON.stringify(window.LG_LAST_ACK) : 'waiting'; },
  part(i, n = 900) { return JSON.stringify(ls.get(OUT_KEY)).slice(i * n, (i + 1) * n); }
};
return 'LGW v2 ready · ops ' + window.LGW.saved();
})();
