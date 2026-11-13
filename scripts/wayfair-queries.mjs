// Wayfair Developer Portal queries used by scripts/api-sync.mjs (production app, read scopes).
// Sources (developer.wayfair.io guides):
//   CastleGate Inventory On-Hand   inventorySummaryList            https://api.wayfair.io/v1/supplier-order-api/graphql
//   CGF Container Milestones       inboundOrderList                https://api.wayfair.io/v1/supplier-order-api/graphql
//   CastleGate Orders              getCastleGatePurchaseOrders     https://api.wayfair.com/v1/graphql
//   Advertising reports (V1)       POST/GET /advertising/v1/reports
const SUPPLIER_ID = +(process.env.WF_SUPPLIER_ID || 467016);
const ORDER_API = 'https://api.wayfair.io/v1/supplier-order-api/graphql';
const LEGACY_API = 'https://api.wayfair.com/v1/graphql';
const ADS_API = 'https://api.wayfair.io/advertising/v1';
const ORDERS_FROM = process.env.WF_ORDERS_FROM || '2026-07-01T00:00:00Z';
const ADS_FROM = process.env.WF_ADS_FROM || '2026-09-01';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = s => (s ? String(s).slice(0, 10) : null);
// '2026-11-12 06:32:11.000000 +00:00' -> Date
const parseTs = s => { if (!s) return null; const m = String(s).match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{2}):?(\d{2})?/); const d = m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4] || '00'}`) : new Date(s); return isNaN(d) ? null : d; };
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = s => { const d = parseTs(s); return d ? ET.format(d) : day(s); };

const Q_INV = `query inventorySummaryList($supplierId: Int!, $filter: InventoryFilterInput, $page: InventoryPageInput) {
  inventorySummaryList(supplierId: $supplierId, filter: $filter, page: $page) {
    pageInfo { hasNextPage endCursor }
    edges { node { supplierPartNumber manufacturerPartId sku productName options
      inventoryPosition { castleGate { onHandQty onHand { inStockQty inStock { fulfillableQty } } warehouses { warehouseId onHandQty } } } } }
  } }`;
const Q_INB = `query InboundOrderList($supplierId: Int!, $status: InboundOrderStatus!, $paginate: InboundOrderPageInput!, $sorts: InboundOrderSortInput) {
  inboundOrderList(supplierId: $supplierId, status: $status, paginate: $paginate, sorts: $sorts) {
    inboundOrders { orderId supplierOrderNumber orderStatus estimatedCargoReadyDate createdDate
      bookings { shippingOrderReceivedDate shippingOrderConfirmedDate
        shipments { shipmentId receivingIds containerNumber containerType originPortCode destinationPortCode trackingStatus
          legStops { locationName shipmentJourneyPortCode shipmentJourney { type timestamp } } } } } } }`;
const Q_CG = `query getCastleGatePurchaseOrders($limit: Int32, $hasResponse: Boolean, $fromDate: IsoDateTime, $sortOrder: SortOrder) {
  getCastleGatePurchaseOrders(limit: $limit, hasResponse: $hasResponse, fromDate: $fromDate, sortOrder: $sortOrder) {
    id poNumber poDate orderId storePrefix customerState customerCountry salesChannelName orderType estimatedShipDate
    warehouse { id name }
    products { partNumber sku quantity price totalCost isCancelled }
  } }`;

const Q_STATUS = `query CastleGateOrderStatuses($filters: SoCastlegateOrderListFilters!) {
  soCastlegateOrders { orderListByFilters(filters: $filters) {
    pageInfo { totalItems totalPages }
    nodes { aggregatorOrderId retailerOrderNumber retailerPurchaseOrderNumbers retailerName orderDate shippingDate orderStatus } } } }`;
function csv(t) { const rows = []; let r = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c.replace(/\r$/, '')); rows.push(r); r = []; c = ''; } else c += ch; } if (c || r.length) { r.push(c); rows.push(r); } return rows; }
const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,%\s]/g, '')); return isNaN(n) ? 0 : n; };

export default async function wayfair({ gql, http, tok }) {
  const out = { v: 3, src: 'wayfair', at: Math.floor(Date.now() / 1000), via: 'api' }, err = {};
  const step = async (k, fn) => { try { out[k] = await fn(); console.log('  wayfair', k, Array.isArray(out[k]) ? out[k].length : 'ok'); } catch (e) { err[k] = e.message.slice(0, 300); console.log('  wayfair', k, 'FAILED', e.message.slice(0, 300)); } };
  const q = async (url, query, variables) => { const j = await gql(url, query, variables); if (j.errors && !j.data) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data; };

  // 1) CastleGate on-hand inventory
  await step('inv', async () => {
    const rows = []; let after = null;
    for (let i = 0; i < 50; i++) {
      const d = await q(ORDER_API, Q_INV, { supplierId: SUPPLIER_ID, page: { first: 100, after } });
      const L = d.inventorySummaryList;
      for (const { node: n } of L.edges || []) {
        const cg = (n.inventoryPosition && n.inventoryPosition.castleGate) || {};
        const avail = cg.onHand && cg.onHand.inStock ? cg.onHand.inStock.fulfillableQty : (cg.onHand ? cg.onHand.inStockQty : null);
        // [part, family sku, CG on hand, CG available, on order, retail, wholesale, aged90, n3m, purchasable, status, supply, name, options]
        rows.push([n.supplierPartNumber, n.sku, cg.onHandQty || 0, avail ?? cg.onHandQty ?? 0, null, null, null, null, null, null, 'ACTIVE', null, n.productName || '', n.options || '']);
      }
      if (!L.pageInfo || !L.pageInfo.hasNextPage) break; after = L.pageInfo.endCursor;
    }
    return rows;
  });

  // 2) CastleGate Forwarding inbound orders + milestones (Receiving Started = start of the 90 free days)
  await step('inb', async () => {
    const res = [];
    for (const status of ['OPEN', 'COMPLETED']) {
      for (let off = 0; off < 500; off += 25) {
        const d = await q(ORDER_API, Q_INB, { supplierId: SUPPLIER_ID, status, paginate: { limit: 25, offset: off }, sorts: { createdDate: 'DESCENDING' } });
        const L = (d.inboundOrderList && d.inboundOrderList.inboundOrders) || [];
        for (const o of L) {
          const ms = {}; let container = null, dest = null, recvId = null;
          for (const b of o.bookings || []) for (const s of b.shipments || []) {
            container = container || s.containerNumber; recvId = recvId || (s.receivingIds || [])[0];
            for (const ls of s.legStops || []) { dest = ls.locationName || dest; for (const j of ls.shipmentJourney || []) if (j.timestamp && (!ms[j.type] || j.timestamp < ms[j.type])) ms[j.type] = j.timestamp; }
          }
          const pick = (...k) => k.map(x => ms[x]).find(Boolean) || null;
          res.push({ id: recvId || o.orderId, orderId: o.orderId, po: o.supplierOrderNumber, status: o.orderStatus, created: day(o.createdDate), ready: day(o.estimatedCargoReadyDate),
            dest, container, loadAtd: pick('ATD_ORIGIN_PORT', 'DEPARTED_FROM_PORT_OF_LOADING', 'ATD'), portAta: pick('ARRIVED_AT_PORT_OF_DISCHARGE', 'ATA_DESTINATION_PORT', 'ATA'), gatedOut: pick('GATED_OUT_AT_DESTINATION_PORT'),
            whAta: pick('DESTINATION_WAREHOUSE_ATA'), eta: pick('DESTINATION_WAREHOUSE_ETA', 'ETA'), recvStart: pick('RECEIVING_STARTED', 'RECEIVING_START', 'DESTINATION_WAREHOUSE_ATA'), recvEnd: pick('RECEIVING_ENDED', 'RECEIVING_END'),
            lastFreeDay: pick('LAST_FREE_DAY'), milestones: ms, items: [] });
        }
        if (L.length < 25) break; await sleep(300);
      }
    }
    return res;
  });

  // 3a) order status: soCastlegateOrders currently fails server-side (null) — statuses come from manual overrides (wf.statusOv)
  const status = new Map();
  // 3b) CastleGate customer orders (both acknowledged and not yet acknowledged)
  await step('orders', async () => {
    const seen = new Map();
    for (const hasResponse of [false, true]) {
      let from = ORDERS_FROM;
      for (let i = 0; i < 80; i++) {
        const d = await q(LEGACY_API, Q_CG, { limit: 100, hasResponse, fromDate: from, sortOrder: 'ASC' });
        const L = d.getCastleGatePurchaseOrders || [];
        let newest = from;
        for (const o of L) {
          if (o.poDate && o.poDate > newest) newest = o.poDate;
          for (const p of o.products || []) {
            const qty = num(p.quantity), key = o.poNumber + '|' + p.partNumber;
            // [po, orderNo, date (US Eastern), status, retailer, state, country, part, sku, name, options, qty, unit wholesale, b2b, sales channel, shipped, warehouse, PO timestamp UTC]
            const S = status.get(o.poNumber) || {}; const label = p.isCancelled ? 'Cancelled' : S.st ? S.st.charAt(0) + S.st.slice(1).toLowerCase().replace(/_/g, ' ') : 'Open';
            const ts = parseTs(o.poDate);
            seen.set(key, [o.poNumber, String(o.orderId || ''), etDay(o.poDate), label, S.retailer || (/^CA/i.test(o.storePrefix || '') ? 'Wayfair.ca' : 'Wayfair'), o.customerState || '', o.customerCountry || '', p.partNumber, p.sku || '', '', '', qty, p.price != null ? num(p.price) : (qty ? num(p.totalCost) / qty : 0), /b2b/i.test(o.orderType || '') ? 'Yes' : 'No', o.salesChannelName || '', S.shipped || null, (o.warehouse && o.warehouse.name) || '', ts ? ts.toISOString() : null]);
          }
        }
        if (L.length < 100 || newest === from) break; from = newest; await sleep(300);
      }
    }
    return [...seen.values()];
  });
  delete out.statuses;

  // 4) Advertising: daily campaign report (V1 reports), CSV parsed by header names
  await step('ads', async () => {
    const H = { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
    const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const rep = await http(ADS_API + '/reports', { method: 'POST', headers: H, body: JSON.stringify({ name: 'lignarc-dashboard-' + end, reportType: 'CAMPAIGN_REPORT', groupBy: 'DAY', program: 'WSP', fileType: 'CSV', filters: { startDate: ADS_FROM, endDate: end }, attributionWindow: 14, supplierId: SUPPLIER_ID }) });
    const id = rep.id || rep.reportId; let st = {};
    for (let i = 0; i < 60; i++) { await sleep(10000); st = await http(ADS_API + '/reports?reportId=' + encodeURIComponent(id), { headers: H }); if (st.status === 'COMPLETED' && st.url) break; if (/FAIL/i.test(st.status || '')) throw new Error('ads report ' + st.status); }
    if (!st.url) throw new Error('ads report not ready');
    const R = csv((await (await fetch(st.url)).text()).replace(/^﻿/, '').trim()); const head = R[0].map(h => h.trim().toLowerCase());
    const col = (...names) => head.findIndex(h => names.some(n => h === n || h.replace(/[^a-z]/g, '') === n.replace(/[^a-z]/g, '')));
    const fuzzy = re => head.findIndex(h => re.test(h));
    const c = { date: col('date', 'day'), id: col('campaign id', 'campaignid'), name: col('campaign name', 'campaign'), impr: fuzzy(/impression/), clicks: fuzzy(/^clicks?$/), spend: fuzzy(/spend|cost/), units: fuzzy(/units/), sales: fuzzy(/(retail )?(revenue|sales)/), orders: fuzzy(/orders/) };
    if (c.date < 0 || c.spend < 0) throw new Error('unexpected ads report columns: ' + head.join('|'));
    const camps = new Map(), agg = new Map();
    for (const r of R.slice(1)) {
      if (r.length < 3) continue; const cid = c.id >= 0 ? r[c.id] : (r[c.name] || 'campaign');
      const dt = String(r[c.date]).match(/(\d{4})-(\d{2})-(\d{2})/) ? r[c.date].slice(0, 10) : (() => { const m = String(r[c.date]).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : r[c.date]; })();
      const ci = n => head.indexOf(n);
      if (!camps.has(cid)) camps.set(cid, [cid, c.name >= 0 ? r[c.name] : cid, ci('campaign_status') >= 0 ? r[ci('campaign_status')] : 1, ci('campaign_start_date') >= 0 ? r[ci('campaign_start_date')] : null, null, ci('campaign_daily_cap_usd') >= 0 ? num(r[ci('campaign_daily_cap_usd')]) : null, null, ci('bidding_strategy') >= 0 ? r[ci('bidding_strategy')] : null]);
      // the report splits each campaign-day by B2B / targeting type: add the pieces up
      const k = cid + '|' + dt, row = agg.get(k) || [cid, dt, 0, 0, 0, 0, 0, 0];
      row[2] += num(r[c.impr]); row[3] += num(r[c.clicks]); row[4] += num(r[c.spend]); row[5] += c.units >= 0 ? num(r[c.units]) : 0; row[6] += c.sales >= 0 ? num(r[c.sales]) : 0; row[7] += c.orders >= 0 ? num(r[c.orders]) : 0; agg.set(k, row);
    }
    const daily = [...agg.values()].map(r => r.map((v, i) => i > 1 ? Math.round(v * 100) / 100 : v));
    return { camps: [...camps.values()], daily, wallet: null, columns: head, sample: R.slice(1, 4) };
  });

  // 5) Advertising by listing (SKU_REPORT): spend / sales per Wayfair listing per day, used to put ad cost on SKUs
  await step('adsSku', async () => {
    const H = { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
    const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const rep = await http(ADS_API + '/reports', { method: 'POST', headers: H, body: JSON.stringify({ name: 'lignarc-sku-' + end, reportType: 'SKU_REPORT', groupBy: 'DAY', program: 'WSP', fileType: 'CSV', filters: { startDate: ADS_FROM, endDate: end }, attributionWindow: 14, supplierId: SUPPLIER_ID }) });
    const id = rep.id || rep.reportId; let st = {};
    for (let i = 0; i < 60; i++) { await sleep(10000); st = await http(ADS_API + '/reports?reportId=' + encodeURIComponent(id), { headers: H }); if (st.status === 'COMPLETED' && st.url) break; if (/FAIL/i.test(st.status || '')) throw new Error('sku report ' + st.status); }
    if (!st.url) throw new Error('sku report not ready');
    const R = csv((await (await fetch(st.url)).text()).replace(/^\uFEFF/, '').trim()); const head = R[0].map(h => h.trim().toLowerCase());
    const ix = re => head.findIndex(h => re.test(h));
    const c = { date: ix(/^date$/), listing: ix(/^listing$/), parts: ix(/part_numbers/), impr: ix(/^impressions$/), clicks: ix(/^clicks$/), spend: ix(/^spend/), sales: ix(/attributed_retail_sales/), orders: ix(/attributed_orders/), units: ix(/attributed_units/) };
    if (c.date < 0 || c.listing < 0 || c.spend < 0) throw new Error('unexpected sku report columns: ' + head.join('|'));
    const agg = new Map(), parts = {};
    for (const r of R.slice(1)) {
      if (r.length < 5) continue; const k = r[c.date] + '|' + r[c.listing];
      const row = agg.get(k) || [r[c.date], r[c.listing], 0, 0, 0, 0, 0, 0];
      row[2] += num(r[c.impr]); row[3] += num(r[c.clicks]); row[4] += num(r[c.spend]); row[5] += num(r[c.sales]); row[6] += num(r[c.orders]); row[7] += num(r[c.units]); agg.set(k, row);
      if (c.parts >= 0) parts[r[c.listing]] = String(r[c.parts]).split(/,\s*/).filter(Boolean);
    }
    // [date, listing, impressions, clicks, spend, attributed retail sales, orders, units]
    return { daily: [...agg.values()].map(r => r.map((v, i) => i > 1 ? Math.round(v * 100) / 100 : v)), parts };
  });

  if (Object.keys(err).length) out.err = err;
  if (!out.inv && !out.inb && !out.orders && !out.ads) throw new Error('all Wayfair steps failed: ' + JSON.stringify(err));
  return out;
}
