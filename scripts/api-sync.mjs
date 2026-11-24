#!/usr/bin/env node
// Lignarc dashboard — daily sync through official APIs (runs in GitHub Actions, no browser).
//
// Secrets (GitHub → Settings → Secrets and variables → Actions):
//   LG_DK                      data key of data/lignarc.enc.json (base64)
//   AMZ_SP_CLIENT_ID / AMZ_SP_CLIENT_SECRET / AMZ_SP_REFRESH_TOKEN      Amazon SP-API private app (self-authorized)
//   AMZ_ADS_CLIENT_ID / AMZ_ADS_CLIENT_SECRET / AMZ_ADS_REFRESH_TOKEN   Amazon Ads API (Login with Amazon)
//   WF_CLIENT_ID / WF_CLIENT_SECRET                                     Wayfair Developer Portal production app
// Each source runs only when its secrets exist; a failing source never blocks the others.
//
//   node scripts/api-sync.mjs            -> fetch, merge into data/lignarc.enc.json
//   node scripts/api-sync.mjs --probe    -> only test logins and print what each API exposes (no data written)
import { webcrypto as C, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import './../assets/merge.js';

const E = process.env, PROBE = process.argv.includes('--probe');
// Optional credential overrides (e.g. a re-authorized SP-API refresh token) kept AES-256-GCM encrypted in the repo
// with the same LG_DK secret — never readable by dashboard users, never in plain text.
if (E.LG_DK && fs.existsSync('data/cred.enc.json')) {
  try {
    const f = JSON.parse(fs.readFileSync('data/cred.enc.json', 'utf8')), b = x => Buffer.from(x, 'base64'), ct = b(f.ct);
    const d = createDecipheriv('aes-256-gcm', b(E.LG_DK), b(f.iv)); d.setAuthTag(ct.subarray(-16));
    const cred = JSON.parse(Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]).toString('utf8'));
    for (const [k, v] of Object.entries(cred)) if (v) E[k] = v;
    console.log('credential overrides:', Object.keys(cred).join(', '));
  } catch (e) { console.log('cred.enc.json not usable:', e.message); }
}
const FILE = 'data/lignarc.enc.json', MARKETPLACE = 'ATVPDKIKX0DER';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const has = (...k) => k.every(x => E[x]);
const day = d => d.toISOString().slice(0, 10);
async function http(url, opt = {}, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, opt);
    if ((r.status === 429 || r.status >= 500) && i < tries) { await sleep(2000 * (i + 1) ** 2); continue; }
    const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]} ${t.slice(0, 300)}`);
    try { return JSON.parse(t); } catch (e) { return t; }
  }
}
// ---------- Login with Amazon ----------
async function lwa(id, secret, refresh) {
  const j = await http('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: id, client_secret: secret }) });
  return j.access_token;
}
// ---------- Amazon SP-API: orders (last 365 days on first run, then last 45 days) ----------
async function amazonOrders(sinceDays, by = 'CreatedAfter') {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' }, base = 'https://sellingpartnerapi-na.amazon.com';
  const after = new Date(Date.now() - sinceDays * 864e5).toISOString();
  let url = `${base}/orders/v0/orders?MarketplaceIds=${MARKETPLACE}&${by}=${encodeURIComponent(after)}&MaxResultsPerPage=100`;
  const orders = [];
  while (url) { const j = await http(url, { headers: H }); const p = j.payload || {}; orders.push(...(p.Orders || [])); url = p.NextToken ? `${base}/orders/v0/orders?MarketplaceIds=${MARKETPLACE}&NextToken=${encodeURIComponent(p.NextToken)}` : null; await sleep(1100); }
  if (PROBE) return { orders: orders.length };
  const rows = [];
  for (const o of orders) {
    const it = await http(`${base}/orders/v0/orders/${o.AmazonOrderId}/orderItems`, { headers: H }); await sleep(2100);
    for (const i of (it.payload && it.payload.OrderItems) || []) {
      const q = i.QuantityOrdered || 0, price = i.ItemPrice ? +i.ItemPrice.Amount : 0;
      const amt = x => x ? +x.Amount || 0 : 0;
      // [0 order, 1 date, 2 status, 3 sku, 4 asin, 5 qty, 6 unit price, 7 title, 8 channel, 9 promo discount (item+ship), 10 shipping charged, 11 purchase ts UTC]
      rows.push([o.AmazonOrderId, (o.PurchaseDate || '').slice(0, 10), o.OrderStatus, i.SellerSKU, i.ASIN, q, q ? Math.round(price / q * 100) / 100 : price, (i.Title || '').slice(0, 90), o.FulfillmentChannel === 'AFN' ? 'afn' : 'mfn',
        Math.round((amt(i.PromotionDiscount) + amt(i.ShippingDiscount)) * 100) / 100, amt(i.ShippingPrice), o.PurchaseDate || '',
        // 12 ship-to state, 13 country, 14 business order — non-PII address fields only (no name, street or phone)
        (o.ShippingAddress && o.ShippingAddress.StateOrRegion) || '', (o.ShippingAddress && o.ShippingAddress.CountryCode) || 'US', o.IsBusinessOrder ? 'yes' : '',
        // 15 promotion ids applied to the item (coupon 'PLM-…', Buy X Get Y 'Percent Off …', deals) — links each sale to its promotion
        (i.PromotionIds || []).join('|')]);
    }
  }
  return { v: 1, src: 'amazon-orders', at: Math.floor(Date.now() / 1000), orders: rows };
}
// ---------- Amazon SP-API: Finances (every transaction incl. deferred: order payments, refunds, fees, ad charges, subscription) ----------
async function amazonFinances(sinceDays) {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' }, base = 'https://sellingpartnerapi-na.amazon.com';
  const rows = [], now = Date.now();
  // the API returns at most 180 days per request window
  for (let from = now - sinceDays * 864e5; from < now; from += 170 * 864e5) {
    const to = Math.min(from + 170 * 864e5, now - 3 * 60e3);
    let next = null;
    do {
      const u = `${base}/finances/2024-06-19/transactions?marketplaceId=${MARKETPLACE}&postedAfter=${encodeURIComponent(new Date(from).toISOString())}&postedBefore=${encodeURIComponent(new Date(to).toISOString())}` + (next ? `&nextToken=${encodeURIComponent(next)}` : '');
      const j = await http(u, { headers: H }); const p = j.payload || {};
      for (const t of p.transactions || []) {
        const leaf = {}, walk = (bs, path) => { for (const b of bs || []) { const k = path ? path + '/' + b.breakdownType : b.breakdownType; if (b.breakdowns && b.breakdowns.length) walk(b.breakdowns, k); else leaf[k] = Math.round(((leaf[k] || 0) + (b.breakdownAmount ? +b.breakdownAmount.currencyAmount : 0)) * 100) / 100; } };
        let sku = null, qty = 0;
        for (const it of t.items || []) { walk(it.breakdowns, ''); for (const c of it.contexts || []) { if (c.sku) sku = c.sku; if (c.quantityShipped) qty += c.quantityShipped; } }
        if (!Object.keys(leaf).length) walk(t.breakdowns, '');
        const rel = Object.fromEntries((t.relatedIdentifiers || []).map(r => [r.relatedIdentifierName, r.relatedIdentifierValue]));
        // [0 id, 1 posted UTC, 2 type, 3 status, 4 order id, 5 sku, 6 qty, 7 total, 8 description, 9 leaf breakdowns]
        rows.push([t.transactionId, t.postedDate, t.transactionType, t.transactionStatus, rel.ORDER_ID || null, sku, qty, t.totalAmount ? +t.totalAmount.currencyAmount : 0, t.description || '', leaf]);
      }
      next = p.nextToken; await sleep(2100);
    } while (next);
  }
  if (PROBE) return { n: rows.length, sample: rows.slice(0, 8) };
  return { v: 1, src: 'amazon-finances', at: Math.floor(Date.now() / 1000), rows };
}
// ---------- Amazon SP-API: Sales & Traffic business report (sessions, page views, conversion, Buy Box) — Brand Analytics role ----------
async function amazonTraffic(sinceDays) {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0', 'content-type': 'application/json' }, base = 'https://sellingpartnerapi-na.amazon.com';
  const day = d => new Date(d).toISOString().slice(0, 10), end = Date.now() - 864e5;
  const run = async (opts, from) => {
    const c = await http(`${base}/reports/2021-06-30/reports`, { method: 'POST', headers: H, body: JSON.stringify({ reportType: 'GET_SALES_AND_TRAFFIC_REPORT', marketplaceIds: [MARKETPLACE], dataStartTime: day(from) + 'T00:00:00Z', dataEndTime: day(end) + 'T23:59:59Z', reportOptions: opts }) });
    for (let i = 0; i < 40; i++) {
      await sleep(15000); const r = await http(`${base}/reports/2021-06-30/reports/${c.reportId}`, { headers: H });
      if (r.processingStatus === 'DONE') { const d = await http(`${base}/reports/2021-06-30/documents/${r.reportDocumentId}`, { headers: H }); const buf = Buffer.from(await (await fetch(d.url)).arrayBuffer()); return JSON.parse((d.compressionAlgorithm === 'GZIP' ? zlib.gunzipSync(buf) : buf).toString('utf8')); }
      if (/CANCELLED|FATAL/.test(r.processingStatus)) throw new Error('traffic report ' + r.processingStatus);
    }
    throw new Error('traffic report timeout');
  };
  const n = v => v && typeof v === 'object' ? +(v.amount ?? 0) : +(v || 0);
  const j = await run({ dateGranularity: 'DAY', asinGranularity: 'CHILD' }, end - sinceDays * 864e5);
  // [0 date, 1 sessions, 2 page views, 3 units ordered, 4 ordered sales, 5 order items, 6 buy box %, 7 unit session %]
  const byDate = (j.salesAndTrafficByDate || []).map(x => { const S = x.salesByDate || {}, T = x.trafficByDate || {}; return [x.date, T.sessions || 0, T.pageViews || 0, S.unitsOrdered || 0, n(S.orderedProductSales), S.totalOrderItems || 0, T.buyBoxPercentage ?? null, T.unitSessionPercentage ?? null]; });
  // [0 child asin, 1 sku, 2 sessions, 3 page views, 4 units, 5 sales, 6 buy box %, 7 unit session %] — totals over the window
  const byAsin = (j.salesAndTrafficByAsin || []).map(x => { const S = x.salesByAsin || {}, T = x.trafficByAsin || {}; return [x.childAsin || x.parentAsin, x.sku || null, T.sessions || 0, T.pageViews || 0, S.unitsOrdered || 0, n(S.orderedProductSales), T.buyBoxPercentage ?? null, T.unitSessionPercentage ?? null]; });
  if (PROBE) return { byDate: byDate.slice(-5), byAsin };
  return { v: 1, src: 'amazon-traffic', at: Math.floor(Date.now() / 1000), byDate, byAsin, from: day(end - sinceDays * 864e5), to: day(end) };
}
// ---------- Amazon SP-API: merchant-fulfilled returns (return requests, reasons, customer comments, SafeT claims, A-to-z) ----------
async function amazonReturns(sinceDays) {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0', 'content-type': 'application/json' }, base = 'https://sellingpartnerapi-na.amazon.com';
  const rows = [], err = {};
  // the report accepts at most 60 days per request
  for (let to = Date.now(), n = 0; n < Math.ceil(sinceDays / 59); n++, to -= 59 * 864e5) {
    const from = to - 59 * 864e5;
    try {
      const c = await http(`${base}/reports/2021-06-30/reports`, { method: 'POST', headers: H, body: JSON.stringify({ reportType: 'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE', marketplaceIds: [MARKETPLACE], dataStartTime: new Date(from).toISOString(), dataEndTime: new Date(to).toISOString() }) });
      let txt = null;
      for (let i = 0; i < 40 && txt == null; i++) {
        await sleep(12000); const r = await http(`${base}/reports/2021-06-30/reports/${c.reportId}`, { headers: H });
        if (r.processingStatus === 'DONE') { const d = await http(`${base}/reports/2021-06-30/documents/${r.reportDocumentId}`, { headers: H }); const buf = Buffer.from(await (await fetch(d.url)).arrayBuffer()); txt = (d.compressionAlgorithm === 'GZIP' ? zlib.gunzipSync(buf) : buf).toString('utf8'); }
        else if (/CANCELLED/.test(r.processingStatus)) txt = ''; // no data in the window
        else if (/FATAL/.test(r.processingStatus)) throw new Error('returns report FATAL');
      }
      const lines = (txt || '').split(/\r?\n/).filter(Boolean); if (lines.length < 2) continue;
      const hd = lines[0].split('\t').map(h => h.trim().toLowerCase());
      const keep = ['order id', 'order date', 'return request date', 'return request status', 'amazon rma id', 'label type', 'label cost', 'return carrier', 'tracking id', 'label to be paid by', 'a-to-z claim', 'is prime', 'asin', 'merchant sku', 'return quantity', 'return reason', 'in policy', 'return type', 'resolution', 'return delivery date', 'order amount', 'order quantity', 'safet action reason', 'safet claim id', 'safet claim state', 'safet claim creation time', 'safet claim reimbursement amount', 'refunded amount', 'category', 'customer comments'];
      for (const l of lines.slice(1)) { const v = l.split('\t'), o = {}; hd.forEach((h, i) => { if (keep.includes(h)) o[h.replace(/[^a-z0-9]+/g, '_')] = (v[i] || '').trim().slice(0, 600); }); rows.push(o); }
    } catch (e) { err['w' + n] = String(e.message).slice(0, 200); }
  }
  return { v: 1, src: 'amazon-returns', at: Math.floor(Date.now() / 1000), rows, err };
}
// ---------- Amazon SP-API: Customer Feedback (review topics & star-rating trend per ASIN) — Brand Analytics role ----------
async function amazonFeedback(asins) {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' }, base = 'https://sellingpartnerapi-na.amazon.com', out = {};
  for (const a of asins) {
    const r = {};
    for (const [k, path] of [['topics', `items/${a}/reviews/topics?marketplaceId=${MARKETPLACE}&sortBy=MENTIONS`], ['trends', `items/${a}/reviews/trends?marketplaceId=${MARKETPLACE}`]]) {
      try { r[k] = await http(`${base}/customerFeedback/2024-06-01/${path}`, { headers: H }); } catch (e) { r[k + 'Err'] = String(e.message).slice(0, 200); }
      await sleep(1500);
    }
    out[a] = r;
  }
  if (PROBE) return out;
  return { v: 1, src: 'amazon-feedback', at: Math.floor(Date.now() / 1000), items: out };
}
// ---------- Amazon SP-API: Best Seller Rank (Catalog) + Buy Box / offers (Pricing) per ASIN ----------
// ---------- Amazon SP-API: every listing with content, images, issues (portal warnings), required attributes, A+ ----------
async function amazonListings(knownAsin) {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' }, base = 'https://sellingpartnerapi-na.amazon.com', err = {};
  let seller = E.AMZ_SELLER_ID;
  if (!seller) { const o = await http(`${base}/products/pricing/v0/items/${knownAsin}/offers?MarketplaceId=${MARKETPLACE}&ItemCondition=New`, { headers: H }); const of = (o.payload && o.payload.Offers) || []; seller = (of.find(x => x.MyOffer) || of[0] || {}).SellerId; await sleep(1500); }
  if (!seller) throw new Error('seller id not found');
  const items = []; let next = null;
  for (let i = 0; i < 30; i++) {
    const j = await http(`${base}/listings/2021-08-01/items/${seller}?marketplaceIds=${MARKETPLACE}&includedData=summaries,attributes,issues,offers,fulfillmentAvailability,relationships&pageSize=20${next ? '&pageToken=' + encodeURIComponent(next) : ''}`, { headers: H });
    items.push(...(j.items || [])); next = j.pagination && j.pagination.nextToken; if (!next) break; await sleep(1200);
  }
  const v1 = (a, k) => { const x = (a[k] || [])[0]; return x == null ? null : x.value ?? x.media_location ?? x; };
  const req = {};
  for (const pt of [...new Set(items.map(it => ((it.summaries || [])[0] || {}).productType).filter(Boolean))]) {
    try { const d = await http(`${base}/definitions/2020-09-01/productTypes/${pt}?marketplaceIds=${MARKETPLACE}&requirements=LISTING&locale=en_US`, { headers: H }); const sch = await (await fetch(d.schema.link.resource)).json(); req[pt] = sch.required || []; } catch (e) { err['ptd:' + pt] = e.message.slice(0, 160); }
    await sleep(800);
  }
  const aplus = [];
  try { const j = await http(`${base}/aplus/2020-11-01/contentDocuments?marketplaceId=${MARKETPLACE}`, { headers: H });
    for (const d of j.contentMetadataRecords || []) { await sleep(700); let asins = []; try { const a = await http(`${base}/aplus/2020-11-01/contentDocuments/${d.contentReferenceKey}/asins?marketplaceId=${MARKETPLACE}`, { headers: H }); asins = (a.asinMetadataSet || []).map(x => x.asin); } catch (e) { }
      aplus.push({ key: d.contentReferenceKey, name: d.contentMetadata.name, status: d.contentMetadata.status, badges: d.contentMetadata.badgeSet, updated: d.contentMetadata.updateTime, asins }); } } catch (e) { err.aplus = e.message.slice(0, 160); }
  const rows = items.map(it => {
    const s = (it.summaries || [])[0] || {}, a = it.attributes || {}, rel = ((it.relationships || [])[0] || {}).relationships || [];
    const imgs = ['main_product_image_locator', ...Array.from({ length: 8 }, (_, i) => 'other_product_image_locator_' + (i + 1))].map(k => v1(a, k)).filter(Boolean);
    const dims = v1(a, 'item_depth_width_height'), po = (a.purchasable_offer || []).find(x => x.audience === 'ALL'), pb = (a.purchasable_offer || []).find(x => x.audience === 'B2B');
    const price = o => o && o.our_price ? o.our_price[0].schedule[0].value_with_tax : null;
    const fa = (it.fulfillmentAvailability || []).find(x => x.fulfillmentChannelCode === 'DEFAULT');
    return { sku: it.sku, asin: s.asin, pt: s.productType, status: s.status || [], name: s.itemName || v1(a, 'item_name'), created: (s.createdDate || '').slice(0, 10), updated: (s.lastUpdatedDate || '').slice(0, 10),
      thumb: s.mainImage && s.mainImage.link, imgs, parent: (rel.find(r => r.parentSkus) || {}).parentSkus?.[0] || null, children: (rel.find(r => r.childSkus) || {}).childSkus || [], theme: ((rel[0] || {}).variationTheme || {}).theme || null,
      level: v1(a, 'parentage_level'), color: v1(a, 'color'), size: v1(a, 'size'), style: v1(a, 'style'), material: (a.material || []).map(x => x.value).join(', ') || null, brand: v1(a, 'brand'),
      bullets: (a.bullet_point || []).map(x => String(x.value).length), desc: String(v1(a, 'product_description') || '').length, kw: Buffer.byteLength(String(v1(a, 'generic_keyword') || '')),
      dims: dims && dims.width ? [dims.width.value, dims.depth && dims.depth.value, dims.height && dims.height.value] : null, weight: (v1(a, 'item_weight') || {}).value ?? v1(a, 'item_weight'), pkgWeight: (v1(a, 'item_package_weight') || {}).value ?? null,
      upc: (a.externally_assigned_product_identifier || []).map(x => x.type).join(',') || (v1(a, 'supplier_declared_has_product_identifier_exemption') ? 'exempt' : null), assembly: v1(a, 'is_assembly_required'), warranty: v1(a, 'warranty_description'), coo: v1(a, 'country_of_origin'),
      list: (v1(a, 'list_price') || {}).value ?? null, price: price(po), b2b: price(pb), qty: fa ? fa.quantity : null,
      has: Object.keys(a), missing: (req[s.productType] || []).filter(k => !a[k]),
      issues: (it.issues || []).map(x => [x.severity, x.code, x.message.slice(0, 300), (x.attributeNames || []).join(','), (x.categories || []).join(',')]) };
  });
  return { v: 1, src: 'amazon-listings', at: Math.floor(Date.now() / 1000), rows, aplus, req, err };
}
async function amazonCatalog(asins) {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' }, base = 'https://sellingpartnerapi-na.amazon.com', rows = [], err = {};
  for (const a of asins) {
    const r = { asin: a, at: new Date().toISOString() };
    try {
      const c = await http(`${base}/catalog/2022-04-01/items/${a}?marketplaceIds=${MARKETPLACE}&includedData=salesRanks,summaries`, { headers: H });
      const sr = (c.salesRanks || [])[0] || {};
      r.cls = (sr.classificationRanks || []).map(x => [x.title, x.rank]); r.disp = (sr.displayGroupRanks || []).map(x => [x.title, x.rank]);
    } catch (e) { err[a + ':catalog'] = e.message.slice(0, 200); }
    await sleep(1200);
    try {
      const o = await http(`${base}/products/pricing/v0/items/${a}/offers?MarketplaceId=${MARKETPLACE}&ItemCondition=New`, { headers: H });
      const P = o.payload || {}, sm = P.Summary || {}, offers = P.Offers || [];
      const bb = (sm.BuyBoxPrices || [])[0], mine = offers.find(x => x.MyOffer);
      r.offers = sm.TotalOfferCount ?? offers.length; r.sellers = new Set(offers.map(x => x.SellerId).filter(Boolean)).size || null; r.bbPrice = bb ? +(bb.LandedPrice || bb.ListingPrice || {}).Amount : null;
      r.myPrice = mine ? +(mine.ListingPrice || {}).Amount : null; r.myBB = mine ? !!mine.IsBuyBoxWinner : null; r.lowest = ((sm.LowestPrices || [])[0] || {}).LandedPrice ? +sm.LowestPrices[0].LandedPrice.Amount : null;
    } catch (e) { err[a + ':pricing'] = e.message.slice(0, 200); }
    rows.push(r); await sleep(2200);
  }
  if (PROBE) return { rows, err };
  return { v: 1, src: 'amazon-catalog', at: Math.floor(Date.now() / 1000), rows, err };
}
// ---------- Amazon Ads API: Sponsored Products (v3 reports + entity snapshot) ----------
// Report types, compact row layouts (all daily except pp):
//  cd  campaign      [date, campaignId, impr, clicks, cost, sales14d, orders14d, units14d, sameSkuSales14d, topOfSearchIS]
//  pl  placement     [date, campaignId, placement, impr, clicks, cost, sales, orders, units]
//  tg  targeting     [date, campaignId, adGroupId, keywordId, keyword|target, matchType, keywordType, impr, clicks, cost, sales, orders, units, topOfSearchIS, bid]
//  st  search term   [date, campaignId, adGroupId, keywordId, keyword|target, matchType, searchTerm, impr, clicks, cost, sales, orders, units]
//  pr  advertised    [date, campaignId, adGroupId, asin, sku, impr, clicks, cost, sales, orders, units, sameSkuSales, sameSkuUnits, otherSkuSales7d]
//  pp  purchased (window summary) [campaignId, advertisedAsin, purchasedAsin, otherSkuSales14d, otherSkuUnits14d, otherSkuOrders14d]
const ADS_REPORTS = {
  cd: { groupBy: ['campaign'], reportTypeId: 'spCampaigns', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d', 'attributedSalesSameSku14d', 'topOfSearchImpressionShare'] },
  pl: { groupBy: ['campaign', 'campaignPlacement'], reportTypeId: 'spCampaigns', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'placementClassification', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d'] },
  tg: { groupBy: ['targeting'], reportTypeId: 'spTargeting', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'adGroupId', 'keywordId', 'keyword', 'keywordType', 'matchType', 'targeting', 'keywordBid', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d', 'topOfSearchImpressionShare'] },
  st: { groupBy: ['searchTerm'], reportTypeId: 'spSearchTerm', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'adGroupId', 'keywordId', 'keyword', 'matchType', 'targeting', 'searchTerm', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d'] },
  pr: { groupBy: ['advertiser'], reportTypeId: 'spAdvertisedProduct', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'adGroupId', 'advertisedAsin', 'advertisedSku', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d', 'attributedSalesSameSku14d', 'unitsSoldSameSku14d', 'salesOtherSku7d'] },
  pp: { groupBy: ['asin'], reportTypeId: 'spPurchasedProduct', timeUnit: 'SUMMARY', columns: ['campaignId', 'advertisedAsin', 'purchasedAsin', 'salesOtherSku14d', 'unitsSoldOtherSku14d', 'purchasesOtherSku14d'] },
};
const r2 = v => Math.round((+v || 0) * 100) / 100;
const ADS_ROW = {
  cd: r => [r.date, String(r.campaignId), r.impressions || 0, r.clicks || 0, r2(r.cost), r2(r.sales14d), r.purchases14d || 0, r.unitsSoldClicks14d || 0, r2(r.attributedSalesSameSku14d), r.topOfSearchImpressionShare == null ? null : r2(r.topOfSearchImpressionShare)],
  pl: r => [r.date, String(r.campaignId), r.placementClassification || '', r.impressions || 0, r.clicks || 0, r2(r.cost), r2(r.sales14d), r.purchases14d || 0, r.unitsSoldClicks14d || 0],
  tg: r => [r.date, String(r.campaignId), String(r.adGroupId || ''), String(r.keywordId || ''), r.keyword || r.targeting || '', r.matchType || '', r.keywordType || '', r.impressions || 0, r.clicks || 0, r2(r.cost), r2(r.sales14d), r.purchases14d || 0, r.unitsSoldClicks14d || 0, r.topOfSearchImpressionShare == null ? null : r2(r.topOfSearchImpressionShare), r.keywordBid == null ? null : r2(r.keywordBid)],
  st: r => [r.date, String(r.campaignId), String(r.adGroupId || ''), String(r.keywordId || ''), r.keyword || r.targeting || '', r.matchType || '', String(r.searchTerm || '').toLowerCase(), r.impressions || 0, r.clicks || 0, r2(r.cost), r2(r.sales14d), r.purchases14d || 0, r.unitsSoldClicks14d || 0],
  pr: r => [r.date, String(r.campaignId), String(r.adGroupId || ''), r.advertisedAsin || '', r.advertisedSku || '', r.impressions || 0, r.clicks || 0, r2(r.cost), r2(r.sales14d), r.purchases14d || 0, r.unitsSoldClicks14d || 0, r2(r.attributedSalesSameSku14d), r.unitsSoldSameSku14d || 0, r2(r.salesOtherSku7d)],
  pp: r => [String(r.campaignId), r.advertisedAsin || '', r.purchasedAsin || '', r2(r.salesOtherSku14d), r.unitsSoldOtherSku14d || 0, r.purchasesOtherSku14d || 0],
};
async function amazonAdsEntities(base, HS) {
  const list = async (path, type, key, body = {}) => { const out = []; let next;
    do { const j = await http(base + path, { method: 'POST', headers: { ...HS, 'Content-Type': type, Accept: type }, body: JSON.stringify({ ...body, ...(next ? { nextToken: next } : {}) }) }); out.push(...(j[key] || [])); next = j.nextToken; } while (next);
    return out; };
  const E2 = { at: Math.floor(Date.now() / 1000) }, err = {};
  const tryit = async (k, fn) => { try { await fn(); } catch (e) { err[k] = e.message.slice(0, 200); } };
  let camps = [], kws = [];
  await tryit('camps', async () => { camps = await list('/sp/campaigns/list', 'application/vnd.spCampaign.v3+json', 'campaigns', { includeExtendedDataFields: true });
    E2.camps = camps.map(c => { const pb = Object.fromEntries(((c.dynamicBidding || {}).placementBidding || []).map(x => [x.placement, x.percentage]));
      return { id: String(c.campaignId), name: c.name, state: c.state, serving: (c.extendedData || {}).servingStatus || '', start: c.startDate || '', end: c.endDate || '', budget: (c.budget || {}).budget || 0, targeting: c.targetingType, strategy: (c.dynamicBidding || {}).strategy || '', top: pb.PLACEMENT_TOP || 0, pp: pb.PLACEMENT_PRODUCT_PAGE || 0, ros: pb.PLACEMENT_REST_OF_SEARCH || 0 }; }); });
  await tryit('adGroups', async () => { E2.adGroups = (await list('/sp/adGroups/list', 'application/vnd.spAdGroup.v3+json', 'adGroups', { includeExtendedDataFields: true })).map(g => [String(g.adGroupId), String(g.campaignId), g.name, g.defaultBid, g.state]); });
  await tryit('keywords', async () => { kws = await list('/sp/keywords/list', 'application/vnd.spKeyword.v3+json', 'keywords', { includeExtendedDataFields: true });
    E2.kws = kws.map(k => [String(k.keywordId), String(k.campaignId), String(k.adGroupId), k.keywordText, k.matchType, k.state, k.bid, ((k.extendedData || {}).servingStatus || '').replace('TARGETING_CLAUSE_', '')]); });
  let tgts = [];
  await tryit('targets', async () => { tgts = await list('/sp/targets/list', 'application/vnd.spTargetingClause.v3+json', 'targetingClauses', { includeExtendedDataFields: true });
    E2.tgts = tgts.map(t => [String(t.targetId), String(t.campaignId), String(t.adGroupId), (t.expression || []).map(x => x.type + (x.value ? '=' + x.value : '')).join(' '), t.state, t.bid ?? null, t.expressionType]); });
  await tryit('neg', async () => { const a = await list('/sp/negativeKeywords/list', 'application/vnd.spNegativeKeyword.v3+json', 'negativeKeywords'), b = await list('/sp/campaignNegativeKeywords/list', 'application/vnd.spCampaignNegativeKeyword.v3+json', 'campaignNegativeKeywords'), c = await list('/sp/negativeTargets/list', 'application/vnd.spNegativeTargetingClause.v3+json', 'negativeTargetingClauses');
    E2.neg = [...a, ...b].filter(x => x.state === 'ENABLED').map(x => [String(x.campaignId), String(x.adGroupId || ''), String(x.keywordText || '').toLowerCase(), x.matchType]).concat(c.filter(x => x.state === 'ENABLED').map(x => [String(x.campaignId), String(x.adGroupId || ''), (x.expression || []).map(e => e.value).join(' '), 'NEGATIVE_' + ((x.expression || [])[0] || {}).type])); });
  await tryit('ads', async () => { E2.ads = (await list('/sp/productAds/list', 'application/vnd.spProductAd.v3+json', 'productAds', { includeExtendedDataFields: true })).map(a => [String(a.adId), String(a.campaignId), String(a.adGroupId), a.asin, a.sku, a.state, ((a.extendedData || {}).servingStatus || '')]); });
  const ids = camps.filter(c => c.state !== 'ARCHIVED').map(c => c.campaignId);
  if (ids.length) {
    await tryit('usage', async () => { const j = await http(base + '/sp/campaigns/budget/usage', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignIds: ids }) }); E2.usage = Object.fromEntries((j.success || []).map(x => [String(x.campaignId), [x.budgetUsagePercent, x.usageUpdatedTimestamp]])); });
    await tryit('budgetRec', async () => { const T = 'application/vnd.budgetrecommendation.v3+json'; const j = await http(base + '/sp/campaigns/budgetRecommendations', { method: 'POST', headers: { ...HS, 'Content-Type': T, Accept: T }, body: JSON.stringify({ campaignIds: ids }) });
      E2.budgetRec = Object.fromEntries((j.budgetRecommendationsSuccessResults || []).map(x => { const m = x.sevenDaysMissedOpportunities || {}; return [String(x.campaignId), { sug: x.suggestedBudget, inBudget: m.percentTimeInBudget, from: m.startDate, to: m.endDate, impr: [m.estimatedMissedImpressionsLower, m.estimatedMissedImpressionsUpper], clicks: [m.estimatedMissedClicksLower, m.estimatedMissedClicksUpper], sales: [m.estimatedMissedSalesLower, m.estimatedMissedSalesUpper] }]; })); });
  }
  // Amazon's suggested bids for every live keyword / ASIN target, grouped by ad group (theme-based v4 recommendations)
  await tryit('bidRec', async () => { const T = 'application/vnd.spthemebasedbidrecommendation.v4+json', groups = new Map(); E2.bidRec = {};
    for (const k of kws.filter(k => k.state === 'ENABLED')) { const g = groups.get(k.adGroupId) || { cid: k.campaignId, ex: [] }; g.ex.push([String(k.keywordId), { type: 'KEYWORD_' + k.matchType + '_MATCH', value: k.keywordText }]); groups.set(k.adGroupId, g); }
    for (const t of tgts.filter(t => t.state === 'ENABLED' && (t.expression || []).length === 1 && /ASIN_SAME_AS|ASIN_EXPANDED/.test(t.expression[0].type))) { const g = groups.get(t.adGroupId) || { cid: t.campaignId, ex: [] }; g.ex.push([String(t.targetId), { type: t.expression[0].type === 'ASIN_SAME_AS' ? 'PAT_ASIN' : 'PAT_ASIN_EXPANDED', value: t.expression[0].value }]); groups.set(t.adGroupId, g); }
    for (const [ag, g] of groups) for (let i = 0; i < g.ex.length; i += 100) { const chunk = g.ex.slice(i, i + 100);
      try { const j = await http(base + '/sp/targets/bid/recommendations', { method: 'POST', headers: { ...HS, 'Content-Type': T, Accept: T }, body: JSON.stringify({ campaignId: g.cid, adGroupId: ag, recommendationType: 'BIDS_FOR_EXISTING_AD_GROUP', targetingExpressions: chunk.map(c => c[1]) }) });
        for (const th of j.bidRecommendations || []) for (const r of th.bidRecommendationsForTargetingExpressions || []) { const hit = chunk.find(c => c[1].type === r.targetingExpression.type && String(c[1].value).toLowerCase() === String(r.targetingExpression.value).toLowerCase()); if (hit) E2.bidRec[hit[0]] = (r.bidValues || []).map(b => b.suggestedBid); }
      } catch (e) { err['bidRec:' + ag] = e.message.slice(0, 160); }
      await sleep(600); } });
  if (Object.keys(err).length) E2.err = err;
  return E2;
}
async function amazonAds(days, create) {
  if (E.AMZ_ADS_USE_SP_SECRET === '1') E.AMZ_ADS_CLIENT_SECRET = E.AMZ_SP_CLIENT_SECRET;
  const tok = await lwa(E.AMZ_ADS_CLIENT_ID, E.AMZ_ADS_CLIENT_SECRET, E.AMZ_ADS_REFRESH_TOKEN);
  const base = 'https://advertising-api.amazon.com', H = { Authorization: 'Bearer ' + tok, 'Amazon-Advertising-API-ClientId': E.AMZ_ADS_CLIENT_ID };
  const profiles = await http(base + '/v2/profiles', { headers: H });
  const prof = profiles.find(p => p.countryCode === 'US' && p.accountInfo && p.accountInfo.type === 'seller') || profiles[0];
  if (!prof) throw new Error('no Amazon Ads profile');
  if (PROBE) return { profiles: profiles.map(p => [p.profileId, p.countryCode, p.accountInfo && p.accountInfo.type, p.accountInfo && p.accountInfo.name]) };
  const HS = { ...H, 'Amazon-Advertising-API-Scope': String(prof.profileId) };
  // Amazon v3 reports take 15–60 min: request them on the 6-hourly run, pick results up on later 15-minute runs.
  const P = (globalThis.SYNC_STATE = globalThis.SYNC_STATE || {});
  delete P.adsReport;
  P.adsQ = (P.adsQ || []).filter(q => Date.now() - q.at < 20 * 3600e3);
  if (create && !P.adsQ.length) {
    const end = new Date(Date.now() - 864e5), wins = [];
    // first run back-fills 60 days (two 30-day windows, Amazon's limit is 31); later runs refresh the last 14 days, where 14-day attribution still moves
    if (!P.adsBackfilled) wins.push([new Date(end - 59 * 864e5), new Date(end - 30 * 864e5)], [new Date(end - 29 * 864e5), end]); else wins.push([new Date(end - (days - 1) * 864e5), end]);
    for (const [k, cfg] of Object.entries(ADS_REPORTS)) for (const [s, e] of (k === 'pp' ? [[new Date(end - 29 * 864e5), end]] : wins)) {
      const body = { name: `lignarc-${k}-${day(s)}-${day(e)}-${Date.now()}`, startDate: day(s), endDate: day(e), configuration: { adProduct: 'SPONSORED_PRODUCTS', format: 'GZIP_JSON', ...cfg } };
      try { const r = await http(base + '/reporting/reports', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' }, body: JSON.stringify(body) }); P.adsQ.push({ k, id: r.reportId, s: day(s), e: day(e), at: Date.now() }); }
      catch (e2) { const m = /duplicate of\s*:\s*([0-9a-f-]{36})/i.exec(e2.message); if (m) P.adsQ.push({ k, id: m[1], s: day(s), e: day(e), at: Date.now() }); else log('ads report', k, 'not created:', e2.message.slice(0, 200)); }
      await sleep(400);
    }
    P.adsBackfilled = 1;
  }
  const rep = [], t0 = Date.now();
  while (P.adsQ.length && Date.now() - t0 < 4.5 * 60e3) {
    for (const q of P.adsQ.slice()) {
      let st; try { st = await http(base + '/reporting/reports/' + q.id, { headers: HS }); } catch (e2) { log('ads poll', q.k, e2.message.slice(0, 120)); continue; }
      if (st.status === 'FAILED') { log('ads report failed', q.k, st.failureReason || ''); P.adsQ = P.adsQ.filter(x => x !== q); continue; }
      if (st.status !== 'COMPLETED') continue;
      const rows = JSON.parse(zlib.gunzipSync(Buffer.from(await (await fetch(st.url)).arrayBuffer())).toString()).map(ADS_ROW[q.k]);
      rep.push({ k: q.k, s: q.s, e: q.e, rows }); P.adsQ = P.adsQ.filter(x => x !== q);
    }
    if (P.adsQ.length) await sleep(20000);
  }
  const ent = create || rep.length ? await amazonAdsEntities(base, HS) : null;
  if (!ent && !rep.length) return { pending: true, status: P.adsQ.length + ' reports queued' };
  return { v: 2, src: 'amazon-ads', at: Math.floor(Date.now() / 1000), ent, rep, queued: P.adsQ.length };
}
// ---------- Wayfair Developer Portal APIs ----------
// OAuth2 client credentials. The CastleGate (inventory on hand, orders, forwarding milestones) and
// Advertising queries are filled in from the sandbox schema (see `--probe`) once the app exists.
async function wayfairToken() {
  const j = await http('https://sso.auth.wayfair.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: E.WF_CLIENT_ID, client_secret: E.WF_CLIENT_SECRET, ...(E.WF_AUDIENCE ? { audience: E.WF_AUDIENCE } : {}) }) });
  return j.access_token;
}
const WF_ENDPOINTS = (E.WF_ENDPOINTS || 'https://api.wayfair.io/v1/supplier-order-api/graphql,https://api.wayfair.com/v1/graphql').split(',');
async function wayfair() {
  const tok = await wayfairToken();
  const gql = (url, query, variables) => http(url, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (PROBE) {
    const out = {};
    for (const u of WF_ENDPOINTS) { try { const j = await gql(u, '{__schema{queryType{fields{name args{name}}}}}'); out[u] = ((j.data && j.data.__schema.queryType.fields) || []).map(f => f.name + '(' + f.args.map(a => a.name).join(',') + ')'); } catch (e) { out[u] = 'ERR ' + e.message.slice(0, 160); } }
    try { const j = await gql('https://api.wayfair.io/v1/supplier-order-api/graphql', '{__schema{types{name kind fields{name args{name} type{name kind ofType{name kind ofType{name ofType{name}}}}} enumValues{name} inputFields{name type{name kind ofType{name}}}}}}');
      if (j.errors) console.log('types errors', JSON.stringify(j.errors).slice(0, 300));
      const T = ((j.data && j.data.__schema.types) || []).filter(t => /^(SoCastlegate|InboundOrder|CastlegatePurchase|SupplierCastlegate)/i.test(t.name));
      for (const t of T) console.log('TYPE', t.name, t.kind, (t.fields || []).map(f => f.name + (f.args && f.args.length ? '(' + f.args.map(a => a.name).join(',') + ')' : '') + ':' + (f.type.name || (f.type.ofType && (f.type.ofType.name || (f.type.ofType.ofType && (f.type.ofType.ofType.name || (f.type.ofType.ofType.ofType && f.type.ofType.ofType.ofType.name))))))).join(', '), (t.enumValues || []).map(e => e.name).join('|'), (t.inputFields || []).map(f => f.name + ':' + (f.type.name || (f.type.ofType && f.type.ofType.name))).join(', '));
    } catch (e) { console.log('types ERR', e.message.slice(0, 200)); }
    if (fs.existsSync('scripts/wf-probe.mjs')) { try { await (await import('./wf-probe.mjs')).default({ gql, http, tok }); } catch (e) { console.log('wf-probe ERR', e.message); } }
    return out;
  }
  const Q = fs.existsSync('scripts/wayfair-queries.mjs') ? (await import('./wayfair-queries.mjs')).default : null;
  if (!Q) throw new Error('Wayfair queries not configured yet (scripts/wayfair-queries.mjs) — run --probe first');
  return Q({ gql, http, tok });   // must return a 'wayfair' payload: { src:'wayfair', inv, inb, orders, ads, prod }
}
// ---------- main ----------
const b64 = u => Buffer.from(u).toString('base64'), ub = s => new Uint8Array(Buffer.from(s, 'base64'));
async function aes(dk) { return C.subtle.importKey('raw', dk, 'AES-GCM', false, ['encrypt', 'decrypt']); }
(async () => {
  // Tiered schedule: the workflow runs every 15 min; heavier jobs only when their interval has passed (state in data/sync-state.json).
  const ST_FILE = 'data/sync-state.json', st = fs.existsSync(ST_FILE) ? JSON.parse(fs.readFileSync(ST_FILE, 'utf8')) : {}, now = Date.now();
  globalThis.SYNC_STATE = st;
  const due = (k, min) => E.SYNC_ALL === '1' || !st[k] || now - st[k] >= min * 60e3 - 90e3;
  const T = { hourly: due('hourly', 60), six: due('six', 360), daily: due('daily', 1440) };
  log('tiers', JSON.stringify(T));
  const SP = has('AMZ_SP_CLIENT_ID', 'AMZ_SP_CLIENT_SECRET', 'AMZ_SP_REFRESH_TOKEN'), ASINS = (E.AMZ_ASINS || 'B0HJQQ3MY4').split(',');
  const jobs = [];
  if (SP) jobs.push(['amazon-orders', () => T.daily ? amazonOrders(+(E.AMZ_ORDER_DAYS || 45)) : amazonOrders(3, 'LastUpdatedAfter')]);
  if (SP && T.hourly) jobs.push(['amazon-finances', () => amazonFinances(T.daily ? +(E.AMZ_FIN_DAYS || 400) : 60)]);
  if (SP && T.six) jobs.push(['amazon-traffic', () => amazonTraffic(+(E.AMZ_TRAFFIC_DAYS || 60))], ['amazon-catalog', () => amazonCatalog(ASINS)], ['amazon-feedback', () => amazonFeedback(ASINS)], ['amazon-listings', () => amazonListings(ASINS[0] || 'B0HJQQ3MY4')]);
  if (SP && T.hourly) jobs.push(['amazon-returns', () => amazonReturns(T.daily ? 180 : 59)]);
  if ((T.six || (st.adsQ && st.adsQ.length)) && has('AMZ_ADS_CLIENT_ID', 'AMZ_ADS_REFRESH_TOKEN') && (E.AMZ_ADS_CLIENT_SECRET || E.AMZ_ADS_USE_SP_SECRET === '1')) jobs.push(['amazon-ads', () => amazonAds(+(E.AMZ_ADS_DAYS || 14), T.six)]);
  if (has('WF_CLIENT_ID', 'WF_CLIENT_SECRET')) { E.WF_SKIP = [T.hourly ? '' : 'inb', T.six ? '' : 'ads,adsSku,adsRank'].filter(Boolean).join(','); jobs.push(['wayfair', wayfair]); }
  if (!jobs.length) { log('No API secrets configured — nothing to do.'); return; }
  const payloads = [], errors = {};
  for (const [name, fn] of jobs) { try { const p = await fn(); if (p && p.pending) { log(name, 'report pending (' + p.status + ') — picked up next run'); continue; } log(name, 'ok', PROBE ? JSON.stringify(p).slice(0, 4000) : ''); if (!PROBE) payloads.push(p); } catch (e) { errors[name] = e.message.slice(0, 300); log(name, 'FAILED', e.message); } }
  if (PROBE || !payloads.length) { if (Object.keys(errors).length && !payloads.length && !PROBE) process.exitCode = 1; return; }
  if (!E.LG_DK) throw new Error('LG_DK secret missing');
  const dk = ub(E.LG_DK), file = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const data = JSON.parse(new TextDecoder().decode(await C.subtle.decrypt({ name: 'AES-GCM', iv: ub(file.iv) }, await aes(dk), ub(file.ct))));
  const fp = d => { const m = { ...d.meta }; for (const k of Object.keys(m)) if (/At$|^at$|^checked/.test(k)) delete m[k]; return C.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ ...d, meta: m }))).then(h => Buffer.from(h).toString('hex')); };
  const before = await fp(data);
  for (const p of payloads) log('merge', JSON.stringify(globalThis.LGMERGE(data, p)));
  data.meta.apiErrors = Object.keys(errors).length ? errors : null;
  for (const k of ['hourly', 'six', 'daily']) if (T[k]) st[k] = now;
  st.errors = data.meta.apiErrors; fs.writeFileSync(ST_FILE, JSON.stringify(st));
  if (await fp(data) === before) { log('no data change — data file left untouched'); return; }
  const iv = C.getRandomValues(new Uint8Array(12));
  Object.assign(file, { iv: b64(iv), ct: b64(new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(dk), new TextEncoder().encode(JSON.stringify(data))))), updated: new Date().toISOString() });
  fs.writeFileSync(FILE, JSON.stringify(file)); log('wrote', FILE);
})().catch(e => { console.error(e); process.exit(1); });
