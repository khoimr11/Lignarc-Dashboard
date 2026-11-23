// Probe Amazon listing data (Listings Items, Catalog, Product Type Definitions, A+ Content). Prints only; encrypted by probe.yml.
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
const tok = (await (await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: E.AMZ_SP_REFRESH_TOKEN, client_id: E.AMZ_SP_CLIENT_ID, client_secret: E.AMZ_SP_CLIENT_SECRET }) })).json()).access_token;
const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' };
const get = async u => { const r = await fetch(base + u, { headers: H }); const t = await r.text(); return [r.status, t]; };
const ASIN = 'B0HJQQ3MY4';
let [s, t] = await get(`/products/pricing/v0/items/${ASIN}/offers?MarketplaceId=${MP}&ItemCondition=New`); P('OFFERS', s, t.slice(0, 800));
let seller = null; try { const o = JSON.parse(t).payload.Offers; seller = (o.find(x => x.MyOffer) || o[0]).SellerId; } catch (e) { }
P('SELLER', seller);
if (seller) {
  await sleep(1000);
  [s, t] = await get(`/listings/2021-08-01/items/${seller}?marketplaceIds=${MP}&includedData=summaries,attributes,issues,offers,fulfillmentAvailability,relationships,productTypes&pageSize=20`); P('SEARCH', s, t.length); P(t.slice(0, 40000));
}
await sleep(800);
[s, t] = await get(`/catalog/2022-04-01/items/${ASIN}?marketplaceIds=${MP}&includedData=attributes,images,productTypes,summaries,relationships,dimensions,identifiers,classifications`); P('CATALOG', s, t.length); P(t.slice(0, 20000));
let pt = 'CART'; try { pt = JSON.parse(t).productTypes[0].productType; } catch (e) { }
await sleep(800);
[s, t] = await get(`/definitions/2020-09-01/productTypes/${pt}?marketplaceIds=${MP}&requirements=LISTING&locale=en_US`); P('PTD', pt, s, t.slice(0, 1200));
try { const j = JSON.parse(t); const sch = await (await fetch(j.schema.link.resource)).json(); P('REQUIRED', JSON.stringify(sch.required)); P('PROPS', Object.keys(sch.properties).length, Object.keys(sch.properties).join(','));
  P('ALLOF', JSON.stringify(sch.allOf || []).slice(0, 4000)); } catch (e) { P('PTD ERR', e.message); }
await sleep(800);
[s, t] = await get(`/aplus/2020-11-01/contentDocuments?marketplaceId=${MP}`); P('APLUS', s, t.slice(0, 3000));
try { for (const d of (JSON.parse(t).contentMetadataRecords || []).slice(0, 5)) { await sleep(800); const [s2, t2] = await get(`/aplus/2020-11-01/contentDocuments/${d.contentReferenceKey}/asins?marketplaceId=${MP}`); P('APLUS ASINS', d.contentReferenceKey, s2, t2.slice(0, 800)); } } catch (e) { }
