// Probe Amazon SP-API finance endpoints (prints structure + samples; no buyer PII is returned by these APIs)
const E = process.env, base = 'https://sellingpartnerapi-na.amazon.com', MP = 'ATVPDKIKX0DER';
const tok = (await (await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: E.AMZ_SP_REFRESH_TOKEN, client_id: E.AMZ_SP_CLIENT_ID, client_secret: E.AMZ_SP_CLIENT_SECRET }) })).json()).access_token;
const H = { 'x-amz-access-token': tok, 'user-agent': 'LignarcDashboard/1.0' };
const get = async u => { const r = await fetch(base + u, { headers: H }); const t = await r.text(); return [r.status, t]; };
const after = new Date(Date.now() - 200 * 864e5).toISOString();
for (const u of [
  `/finances/2024-06-19/transactions?postedAfter=${encodeURIComponent(after)}&marketplaceId=${MP}`,
  `/finances/v0/financialEvents?PostedAfter=${encodeURIComponent(after)}&MaxResultsPerPage=100`,
  `/finances/v0/financialEventGroups?FinancialEventGroupStartedAfter=${encodeURIComponent(after)}`,
  `/reports/2021-06-30/reports?reportTypes=GET_SALES_AND_TRAFFIC_REPORT&pageSize=5`,
  `/fba/inventory/v1/summaries?granularityType=Marketplace&granularityId=${MP}&marketplaceIds=${MP}`,
]) { const [s, t] = await get(u); console.log('\n=== ' + u.split('?')[0] + ' -> ' + s + ' (' + t.length + ' chars)\n' + t.slice(0, 14000)); await new Promise(r => setTimeout(r, 2500)); }
