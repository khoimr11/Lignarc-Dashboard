// Probe what promotion data the APIs expose (prints only; output is encrypted by probe.yml).
import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
const E = process.env;
if (E.LG_DK && fs.existsSync('data/cred.enc.json')) {
  const f = JSON.parse(fs.readFileSync('data/cred.enc.json', 'utf8')), b = x => Buffer.from(x, 'base64'), ct = b(f.ct);
  const d = createDecipheriv('aes-256-gcm', b(E.LG_DK), b(f.iv)); d.setAuthTag(ct.subarray(-16));
  Object.assign(E, JSON.parse(Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]).toString('utf8')));
}
const sleep = ms => new Promise(r => setTimeout(r, ms)), P = (...a) => console.log(...a);
const base = 'https://sellingpartnerapi-na.amazon.com', MP = 'ATVPDKIKX0DER';
try {
  const tok = (await (await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: E.AMZ_SP_REFRESH_TOKEN, client_id: E.AMZ_SP_CLIENT_ID, client_secret: E.AMZ_SP_CLIENT_SECRET }) })).json()).access_token;
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0', 'content-type': 'application/json' };
  const req = async (u, opt = {}) => { const r = await fetch(base + u, { headers: H, ...opt }); const t = await r.text(); return [r.status, t]; };
  // 1) order items: PromotionIds
  const [s1, t1] = await req(`/orders/v0/orders?MarketplaceIds=${MP}&CreatedAfter=${encodeURIComponent(new Date(Date.now() - 60 * 864e5).toISOString())}&MaxResultsPerPage=100`);
  const orders = (JSON.parse(t1).payload || {}).Orders || []; P('orders', s1, orders.length);
  for (const o of orders.slice(0, 40)) {
    await sleep(2100); const [s, t] = await req(`/orders/v0/orders/${o.AmazonOrderId}/orderItems`);
    const its = ((JSON.parse(t).payload || {}).OrderItems || []);
    P('ITEM', o.AmazonOrderId, o.PurchaseDate, s, JSON.stringify(its.map(i => ({ sku: i.SellerSKU, q: i.QuantityOrdered, price: i.ItemPrice, promoIds: i.PromotionIds, promoDisc: i.PromotionDiscount, shipDisc: i.ShippingDiscount }))));
  }
  // 2) promotion / coupon performance reports
  for (const rt of ['GET_PROMOTION_PERFORMANCE_REPORT', 'GET_COUPON_PERFORMANCE_REPORT']) {
    const body = { reportType: rt, marketplaceIds: [MP], dataStartTime: new Date(Date.now() - 30 * 864e5).toISOString(), dataEndTime: new Date().toISOString() };
    const [s, t] = await req('/reports/2021-06-30/reports', { method: 'POST', body: JSON.stringify(body) }); P('CREATE', rt, s, t.slice(0, 600));
    let id; try { id = JSON.parse(t).reportId; } catch (e) { }
    if (!id) continue;
    for (let i = 0; i < 30; i++) {
      await sleep(10000); const [s2, t2] = await req('/reports/2021-06-30/reports/' + id); const j = JSON.parse(t2);
      if (j.processingStatus === 'DONE') {
        const [s3, t3] = await req('/reports/2021-06-30/documents/' + j.reportDocumentId); const d = JSON.parse(t3);
        const raw = Buffer.from(await (await fetch(d.url)).arrayBuffer());
        const txt = d.compressionAlgorithm === 'GZIP' ? (await import('node:zlib')).gunzipSync(raw).toString() : raw.toString();
        P('REPORT', rt, txt.length, txt.slice(0, 12000)); break;
      }
      if (/CANCELLED|FATAL/.test(j.processingStatus)) { P('REPORT', rt, j.processingStatus, t2.slice(0, 400)); break; }
    }
  }
} catch (e) { P('AMZ ERR', e.message); }

// Wayfair: look for promotion / sale-event types
try {
  const tok = (await (await fetch('https://sso.auth.wayfair.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', client_id: E.WF_CLIENT_ID, client_secret: E.WF_CLIENT_SECRET }) })).json()).access_token;
  const gql = async (url, query, variables) => (await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
  for (const u of ['https://api.wayfair.io/v1/supplier-order-api/graphql', 'https://api.wayfair.com/v1/graphql']) {
    const j = await gql(u, '{__schema{queryType{fields{name}} types{name fields{name type{name kind ofType{name kind ofType{name}}}}}}}');
    const s = j.data && j.data.__schema; if (!s) { P('WF schema', u, JSON.stringify(j).slice(0, 300)); continue; }
    P('WF queries', u, s.queryType.fields.map(f => f.name).join(','));
    for (const t of s.types.filter(t => /promo|sale|event|deal|price|discount|allowance|funding/i.test(t.name) && !/^__/.test(t.name))) P('WF TYPE', t.name, (t.fields || []).map(f => f.name + ':' + (f.type.name || (f.type.ofType && (f.type.ofType.name || (f.type.ofType.ofType && f.type.ofType.ofType.name))))).join(', '));
  }
  const r = await gql('https://api.wayfair.io/v1/supplier-order-api/graphql', `query($i: SupplierCastlegatePurchaseOrdersInput!){ castlegatePurchaseOrders(supplierCastlegatePurchaseOrdersInput:$i, page:1, pageSize:50){ totalCount nodes { purchaseOrderNumber purchaseOrderDate supplierAllowance { __typename } supplierCastlegatePurchaseOrderProducts { supplierPartNumber quantity wholesalePrice supplierPurchaseOrderProductSaleEvent { __typename } } } } }`,
    { i: { filter: { hasResponse: true, warehouseIds: [], purchaseOrderDateTimeInterval: { start: '2026-09-01T00:00:00Z', end: new Date().toISOString() } } } });
  P('WF PO sample', JSON.stringify(r).slice(0, 3000));
} catch (e) { P('WF ERR', e.message); }
