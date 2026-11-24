// One-off probe: which Amazon Ads v3 report types / entity endpoints and Wayfair ads report types work for this account.
import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
const E = process.env;
if (E.LG_DK && fs.existsSync('data/cred.enc.json')) {
  const f = JSON.parse(fs.readFileSync('data/cred.enc.json', 'utf8')), b = x => Buffer.from(x, 'base64'), ct = b(f.ct);
  const d = createDecipheriv('aes-256-gcm', b(E.LG_DK), b(f.iv)); d.setAuthTag(ct.subarray(-16));
  for (const [k, v] of Object.entries(JSON.parse(Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]).toString('utf8')))) if (v) E[k] = v;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = d => d.toISOString().slice(0, 10);
async function http(url, opt = {}) { const r = await fetch(url, opt); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]} ${t.slice(0, 600)}`); try { return JSON.parse(t); } catch { return t; } }
const out = (...a) => console.log(...a);

async function amazon() {
  const tj = await http('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: E.AMZ_ADS_REFRESH_TOKEN, client_id: E.AMZ_ADS_CLIENT_ID, client_secret: E.AMZ_ADS_CLIENT_SECRET }) });
  const base = 'https://advertising-api.amazon.com', H = { Authorization: 'Bearer ' + tj.access_token, 'Amazon-Advertising-API-ClientId': E.AMZ_ADS_CLIENT_ID };
  const profiles = await http(base + '/v2/profiles', { headers: H });
  const prof = profiles.find(p => p.countryCode === 'US' && p.accountInfo.type === 'seller');
  const HS = { ...H, 'Amazon-Advertising-API-Scope': String(prof.profileId) };
  const ent = async (name, path, type, body = {}) => { try { const j = await http(base + path, { method: 'POST', headers: { ...HS, 'Content-Type': type, Accept: type }, body: JSON.stringify(body) }); out('ENTITY', name, JSON.stringify(j).slice(0, 1500)); return j; } catch (e) { out('ENTITY', name, 'ERR', e.message); } };
  const SKIPENT = true; const camps = SKIPENT ? null : await ent('campaigns', '/sp/campaigns/list', 'application/vnd.spCampaign.v3+json', { includeExtendedDataFields: true });
  const ag = SKIPENT ? null : await ent('adGroups', '/sp/adGroups/list', 'application/vnd.spAdGroup.v3+json', { includeExtendedDataFields: true });
  const kw = SKIPENT ? null : await ent('keywords', '/sp/keywords/list', 'application/vnd.spKeyword.v3+json', { includeExtendedDataFields: true });
  if (!SKIPENT) await ent('targets', '/sp/targets/list', 'application/vnd.spTargetingClause.v3+json', { includeExtendedDataFields: true });
  if (!SKIPENT) await ent('negKeywords', '/sp/negativeKeywords/list', 'application/vnd.spNegativeKeyword.v3+json', {});
  if (!SKIPENT) await ent('campNegKeywords', '/sp/campaignNegativeKeywords/list', 'application/vnd.spCampaignNegativeKeyword.v3+json', {});
  if (!SKIPENT) await ent('negTargets', '/sp/negativeTargets/list', 'application/vnd.spNegativeTargetingClause.v3+json', {});
  if (!SKIPENT) await ent('productAds', '/sp/productAds/list', 'application/vnd.spProductAd.v3+json', { includeExtendedDataFields: true });
  const ids = ((camps && camps.campaigns) || []).map(c => c.campaignId);
  if (!SKIPENT) try { out('BUDGET_USAGE', JSON.stringify(await http(base + '/sp/campaigns/budget/usage', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignIds: ids }) })).slice(0, 1500)); } catch (e) { out('BUDGET_USAGE ERR', e.message); }
  if (!SKIPENT) try { out('BUDGET_RECS', JSON.stringify(await http(base + '/sp/campaigns/budgetRecommendations', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/vnd.budgetrecommendation.v3+json', Accept: 'application/vnd.budgetrecommendation.v3+json' }, body: JSON.stringify({ campaignIds: ids }) })).slice(0, 2500)); } catch (e) { out('BUDGET_RECS ERR', e.message); }
  const k0 = ((kw && kw.keywords) || [])[0], g0 = ((ag && ag.adGroups) || []).find(g => k0 && g.adGroupId === k0.adGroupId);
  if (k0) try { out('BID_RECS', JSON.stringify(await http(base + '/sp/targets/bid/recommendations', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/vnd.spthemebasedbidrecommendation.v4+json', Accept: 'application/vnd.spthemebasedbidrecommendation.v4+json' }, body: JSON.stringify({ campaignId: k0.campaignId, adGroupId: k0.adGroupId, recommendationType: 'BIDS_FOR_EXISTING_AD_GROUP', targetingExpressions: [{ type: 'KEYWORD_' + k0.matchType + '_MATCH', value: k0.keywordText }] }) })).slice(0, 2500)); } catch (e) { out('BID_RECS ERR', e.message); }

  const end = new Date(Date.now() - 864e5), start = new Date(end - 6 * 864e5);
  const defs = {
    campDaily: { groupBy: ['campaign'], reportTypeId: 'spCampaigns', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'campaignName', 'campaignStatus', 'campaignBudgetAmount', 'campaignBiddingStrategy', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d', 'attributedSalesSameSku14d', 'purchasesSameSku14d', 'topOfSearchImpressionShare'] },
    placement: { groupBy: ['campaign', 'campaignPlacement'], reportTypeId: 'spCampaigns', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'placementClassification', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d'] },
    targeting: { groupBy: ['targeting'], reportTypeId: 'spTargeting', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'keywordType', 'matchType', 'targeting', 'keywordBid', 'adKeywordStatus', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d', 'topOfSearchImpressionShare'] },
    searchTerm: { groupBy: ['searchTerm'], reportTypeId: 'spSearchTerm', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'adGroupId', 'keywordId', 'keyword', 'matchType', 'targeting', 'searchTerm', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d'] },
    product: { groupBy: ['advertiser'], reportTypeId: 'spAdvertisedProduct', timeUnit: 'DAILY', columns: ['date', 'campaignId', 'adGroupId', 'advertisedAsin', 'advertisedSku', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d', 'unitsSoldClicks14d', 'attributedSalesSameSku14d', 'unitsSoldSameSku14d', 'salesOtherSku7d', 'unitsSoldOtherSku7d'] },
    purchased: { groupBy: ['asin'], reportTypeId: 'spPurchasedProduct', timeUnit: 'SUMMARY', columns: ['campaignId', 'advertisedAsin', 'purchasedAsin', 'salesOtherSku14d', 'unitsSoldOtherSku14d', 'purchasesOtherSku14d'] },
  };
  const ids2 = {};
  for (const [k, c] of Object.entries(defs)) {
    try { const r = await http(base + '/reporting/reports', { method: 'POST', headers: { ...HS, 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' }, body: JSON.stringify({ name: 'probe-' + k + '-' + Date.now(), startDate: day(start), endDate: day(end), configuration: { adProduct: 'SPONSORED_PRODUCTS', format: 'GZIP_JSON', ...c } }) }); ids2[k] = r.reportId; out('REPORT', k, 'created'); }
    catch (e) { const m = /duplicate of\s*:\s*([0-9a-f-]{36})/i.exec(e.message); if (m) ids2[k] = m[1]; out('REPORT', k, 'ERR', e.message); }
  }
  const t0 = Date.now();
  while (Object.keys(ids2).length && Date.now() - t0 < 18 * 60e3) {
    await sleep(20000);
    for (const [k, id] of Object.entries(ids2)) {
      const st = await http(base + '/reporting/reports/' + id, { headers: HS });
      if (st.status === 'COMPLETED') { const rows = JSON.parse(zlib.gunzipSync(Buffer.from(await (await fetch(st.url)).arrayBuffer())).toString()); out('REPORT', k, 'rows', rows.length, JSON.stringify(rows.slice(0, 3))); delete ids2[k]; }
      else if (st.status === 'FAILED') { out('REPORT', k, 'FAILED', st.failureReason); delete ids2[k]; }
    }
  }
  out('REPORT pending at end:', Object.keys(ids2).join(','));
}

async function wayfair() {
  const j = await http('https://sso.auth.wayfair.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', client_id: E.WF_CLIENT_ID, client_secret: E.WF_CLIENT_SECRET }) });
  const H = { Authorization: 'Bearer ' + j.access_token, 'content-type': 'application/json' }, A = 'https://api.wayfair.io/advertising/v1';
  for (const p of []) { try { out('WF GET', p, JSON.stringify(await http(A + p, { headers: H })).slice(0, 1200)); } catch (e) { out('WF GET', p, 'ERR', e.message.slice(0, 400)); } }
  const end = day(new Date(Date.now() - 864e5)), start = day(new Date(Date.now() - 8 * 864e5));
  const ids = {};
  for (const t of ['KEYWORD_PRODUCT_REPORT', 'PRODUCT_RANK_REPORT', 'LISTING_REPORT']) {
    try { const r = await http(A + '/reports', { method: 'POST', headers: H, body: JSON.stringify({ name: 'probe-' + t + '-' + Date.now(), reportType: t, groupBy: 'DAY', program: 'WSP', fileType: 'CSV', filters: { startDate: start, endDate: end }, attributionWindow: 14, supplierId: 467016 }) }); ids[t] = r.id || r.reportId; out('WF REPORT', t, 'created'); }
    catch (e) { out('WF REPORT', t, 'ERR', e.message.slice(0, 400)); }
  }
  const t0 = Date.now();
  while (Object.keys(ids).length && Date.now() - t0 < 4 * 60e3) {
    await sleep(10000);
    for (const [t, id] of Object.entries(ids)) {
      try { const st = await http(A + '/reports?reportId=' + encodeURIComponent(id), { headers: H });
        if (st.status === 'COMPLETED' && st.url) { const txt = (await (await fetch(st.url)).text()).replace(/^﻿/, ''); const L = txt.split('\n'); out('WF REPORT', t, 'lines', L.length, '\n' + L.slice(0, 6).join('\n')); delete ids[t]; }
        else if (/FAIL/i.test(st.status || '')) { out('WF REPORT', t, 'FAILED', JSON.stringify(st).slice(0, 300)); delete ids[t]; } } catch (e) { out('WF REPORT', t, 'poll ERR', e.message.slice(0, 200)); delete ids[t]; }
    }
  }
}
await Promise.all([amazon().catch(e => out('AMZ FATAL', e.message)), wayfair().catch(e => out('WF FATAL', e.message))]);
