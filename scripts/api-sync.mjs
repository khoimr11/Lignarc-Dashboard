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
// ---------- Amazon Ads API: Sponsored Products daily campaign report (v3) ----------
async function amazonAds(days) {
  if (E.AMZ_ADS_USE_SP_SECRET === '1') E.AMZ_ADS_CLIENT_SECRET = E.AMZ_SP_CLIENT_SECRET;
  const tok = await lwa(E.AMZ_ADS_CLIENT_ID, E.AMZ_ADS_CLIENT_SECRET, E.AMZ_ADS_REFRESH_TOKEN);
  const base = 'https://advertising-api.amazon.com', H = { Authorization: 'Bearer ' + tok, 'Amazon-Advertising-API-ClientId': E.AMZ_ADS_CLIENT_ID };
  const profiles = await http(base + '/v2/profiles', { headers: H });
  const prof = profiles.find(p => p.countryCode === 'US' && p.accountInfo && p.accountInfo.type === 'seller') || profiles[0];
  if (!prof) throw new Error('no Amazon Ads profile');
  if (PROBE) return { profiles: profiles.map(p => [p.profileId, p.countryCode, p.accountInfo && p.accountInfo.type, p.accountInfo && p.accountInfo.name]) };
  const HS = { ...H, 'Amazon-Advertising-API-Scope': String(prof.profileId) };
  const end = new Date(Date.now() - 864e5), start = new Date(end - (days - 1) * 864e5);
  const rep = await http(base + '/reporting/reports', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' }, body: JSON.stringify({
    name: 'lignarc-sp-daily-' + day(end), startDate: day(start), endDate: day(end),
    configuration: { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['campaign'], reportTypeId: 'spCampaigns', timeUnit: 'DAILY', format: 'GZIP_JSON',
      columns: ['date', 'campaignId', 'campaignName', 'campaignStatus', 'campaignBudgetAmount', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d'] } }) });
  let st = rep; for (let i = 0; i < 60 && st.status !== 'COMPLETED'; i++) { await sleep(15000); st = await http(base + '/reporting/reports/' + rep.reportId, { headers: HS }); if (st.status === 'FAILED') throw new Error('Ads report failed: ' + st.failureReason); }
  if (st.status !== 'COMPLETED') throw new Error('Ads report not ready in time');
  const gz = Buffer.from(await (await fetch(st.url)).arrayBuffer()); const rows = JSON.parse(zlib.gunzipSync(gz).toString());
  const camps = new Map(), byDay = new Map();
  for (const r of rows) {
    const c = camps.get(r.campaignId) || [String(r.campaignId), r.campaignName, r.campaignStatus, '', '', r.campaignBudgetAmount || 0, 0, 0, 0, 0, 0];
    c[6] += r.impressions || 0; c[7] += r.clicks || 0; c[8] += r.cost || 0; c[9] += r.sales14d || 0; c[10] += r.purchases14d || 0; camps.set(r.campaignId, c);
    const d = byDay.get(r.date) || [r.date, 0, 0, 0, 0, 0]; d[1] += r.impressions || 0; d[2] += r.clicks || 0; d[3] += r.cost || 0; d[4] += r.sales14d || 0; d[5] += r.purchases14d || 0; byDay.set(r.date, d);
  }
  // campaign delivery status (e.g. payment failure) comes from the campaigns endpoint
  try { const list = await http(base + '/sp/campaigns/list', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/vnd.spCampaign.v3+json', Accept: 'application/vnd.spCampaign.v3+json' }, body: JSON.stringify({ includeExtendedDataFields: true }) });
    for (const x of list.campaigns || []) { const c = camps.get(x.campaignId) || camps.get(+x.campaignId) || [String(x.campaignId), x.name, x.state, '', '', 0, 0, 0, 0, 0, 0]; c[2] = x.state; c[3] = (x.extendedData && (x.extendedData.servingStatus || '')) || ''; c[4] = x.startDate || ''; c[5] = (x.budget && x.budget.budget) || c[5]; camps.set(x.campaignId, c); } } catch (e) { log('campaign list skipped:', e.message); }
  return { v: 1, src: 'amazon-ads', at: Math.floor(Date.now() / 1000), camps: [...camps.values()], daily: [...byDay.values()] };
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
  const due = (k, min) => E.SYNC_ALL === '1' || !st[k] || now - st[k] >= min * 60e3 - 90e3;
  const T = { hourly: due('hourly', 60), six: due('six', 360), daily: due('daily', 1440) };
  log('tiers', JSON.stringify(T));
  const SP = has('AMZ_SP_CLIENT_ID', 'AMZ_SP_CLIENT_SECRET', 'AMZ_SP_REFRESH_TOKEN'), ASINS = (E.AMZ_ASINS || 'B0HJQQ3MY4').split(',');
  const jobs = [];
  if (SP) jobs.push(['amazon-orders', () => T.daily ? amazonOrders(+(E.AMZ_ORDER_DAYS || 45)) : amazonOrders(3, 'LastUpdatedAfter')]);
  if (SP && T.hourly) jobs.push(['amazon-finances', () => amazonFinances(T.daily ? +(E.AMZ_FIN_DAYS || 400) : 60)]);
  if (SP && T.six) jobs.push(['amazon-traffic', () => amazonTraffic(+(E.AMZ_TRAFFIC_DAYS || 60))], ['amazon-catalog', () => amazonCatalog(ASINS)], ['amazon-feedback', () => amazonFeedback(ASINS)], ['amazon-listings', () => amazonListings(ASINS[0] || 'B0HJQQ3MY4')]);
  if (SP && T.hourly) jobs.push(['amazon-returns', () => amazonReturns(T.daily ? 180 : 59)]);
  if (T.six && has('AMZ_ADS_CLIENT_ID', 'AMZ_ADS_REFRESH_TOKEN') && (E.AMZ_ADS_CLIENT_SECRET || E.AMZ_ADS_USE_SP_SECRET === '1')) jobs.push(['amazon-ads', () => amazonAds(+(E.AMZ_ADS_DAYS || 30))]);
  if (has('WF_CLIENT_ID', 'WF_CLIENT_SECRET')) { E.WF_SKIP = [T.hourly ? '' : 'inb', T.six ? '' : 'ads,adsSku'].filter(Boolean).join(','); jobs.push(['wayfair', wayfair]); }
  if (!jobs.length) { log('No API secrets configured — nothing to do.'); return; }
  const payloads = [], errors = {};
  for (const [name, fn] of jobs) { try { const p = await fn(); log(name, 'ok', PROBE ? JSON.stringify(p).slice(0, 4000) : ''); if (!PROBE) payloads.push(p); } catch (e) { errors[name] = e.message.slice(0, 300); log(name, 'FAILED', e.message); } }
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
