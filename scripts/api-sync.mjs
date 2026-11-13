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
import { webcrypto as C } from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import './../assets/merge.js';

const E = process.env, PROBE = process.argv.includes('--probe');
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
async function amazonOrders(sinceDays) {
  const tok = await lwa(E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET, E.AMZ_SP_REFRESH_TOKEN);
  const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' }, base = 'https://sellingpartnerapi-na.amazon.com';
  const after = new Date(Date.now() - sinceDays * 864e5).toISOString();
  let url = `${base}/orders/v0/orders?MarketplaceIds=${MARKETPLACE}&CreatedAfter=${encodeURIComponent(after)}&MaxResultsPerPage=100`;
  const orders = [];
  while (url) { const j = await http(url, { headers: H }); const p = j.payload || {}; orders.push(...(p.Orders || [])); url = p.NextToken ? `${base}/orders/v0/orders?MarketplaceIds=${MARKETPLACE}&NextToken=${encodeURIComponent(p.NextToken)}` : null; await sleep(1100); }
  if (PROBE) return { orders: orders.length };
  const rows = [];
  for (const o of orders) {
    const it = await http(`${base}/orders/v0/orders/${o.AmazonOrderId}/orderItems`, { headers: H }); await sleep(2100);
    for (const i of (it.payload && it.payload.OrderItems) || []) {
      const q = i.QuantityOrdered || 0, price = i.ItemPrice ? +i.ItemPrice.Amount : 0;
      rows.push([o.AmazonOrderId, (o.PurchaseDate || '').slice(0, 10), o.OrderStatus, i.SellerSKU, i.ASIN, q, q ? Math.round(price / q * 100) / 100 : price, (i.Title || '').slice(0, 90), o.FulfillmentChannel === 'AFN' ? 'afn' : 'mfn']);
    }
  }
  return { v: 1, src: 'amazon-orders', at: Math.floor(Date.now() / 1000), orders: rows };
}
// ---------- Amazon Ads API: Sponsored Products daily campaign report (v3) ----------
async function amazonAds(days) {
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
  const jobs = [];
  if (has('AMZ_SP_CLIENT_ID', 'AMZ_SP_CLIENT_SECRET', 'AMZ_SP_REFRESH_TOKEN')) jobs.push(['amazon-orders', () => amazonOrders(+(E.AMZ_ORDER_DAYS || 45))]);
  if (has('AMZ_ADS_CLIENT_ID', 'AMZ_ADS_CLIENT_SECRET', 'AMZ_ADS_REFRESH_TOKEN')) jobs.push(['amazon-ads', () => amazonAds(+(E.AMZ_ADS_DAYS || 30))]);
  if (has('WF_CLIENT_ID', 'WF_CLIENT_SECRET')) jobs.push(['wayfair', wayfair]);
  if (!jobs.length) { log('No API secrets configured — nothing to do.'); return; }
  const payloads = [], errors = {};
  for (const [name, fn] of jobs) { try { const p = await fn(); log(name, 'ok', PROBE ? JSON.stringify(p).slice(0, 4000) : ''); if (!PROBE) payloads.push(p); } catch (e) { errors[name] = e.message.slice(0, 300); log(name, 'FAILED', e.message); } }
  if (PROBE || !payloads.length) { if (Object.keys(errors).length && !payloads.length && !PROBE) process.exitCode = 1; return; }
  if (!E.LG_DK) throw new Error('LG_DK secret missing');
  const dk = ub(E.LG_DK), file = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const data = JSON.parse(new TextDecoder().decode(await C.subtle.decrypt({ name: 'AES-GCM', iv: ub(file.iv) }, await aes(dk), ub(file.ct))));
  for (const p of payloads) log('merge', JSON.stringify(globalThis.LGMERGE(data, p)));
  data.meta.apiErrors = Object.keys(errors).length ? errors : null;
  const iv = C.getRandomValues(new Uint8Array(12));
  Object.assign(file, { iv: b64(iv), ct: b64(new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(dk), new TextEncoder().encode(JSON.stringify(data))))), updated: new Date().toISOString() });
  fs.writeFileSync(FILE, JSON.stringify(file)); log('wrote', FILE);
})().catch(e => { console.error(e); process.exit(1); });
