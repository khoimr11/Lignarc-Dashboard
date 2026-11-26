// One-off: find an API field that identifies Tried & True and B2B CastleGate orders. Prints field values for known POs.
const E = process.env, P = (...a) => console.log(...a);
const http = async (u, o) => { const r = await fetch(u, o); const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 500), status: r.status }; } };
const unwrap = t => (t && (t.kind === 'NON_NULL' || t.kind === 'LIST') ? unwrap(t.ofType) : t);
const TQ = n => `{__type(name:"${n}"){name fields{name args{name} type{name kind ofType{name kind ofType{name kind ofType{name kind}}}}}}}`;
let all; const TT = ['CS695495271', 'CS695475826', 'CS690630309', 'CS687282199', 'CS687225220'], B2B = ['CS695503995', 'CA694190163', 'CS693782452', 'CS693575796', 'CS693345609', 'CS692869642'], NORMAL = ['CS695474408', 'CS695152256', 'CS694463759'];
const j = await http('https://sso.auth.wayfair.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', client_id: E.WF_CLIENT_ID, client_secret: E.WF_CLIENT_SECRET, ...(E.WF_AUDIENCE ? { audience: E.WF_AUDIENCE } : {}) }) });
const gql = (url, query, variables) => http(url, { method: 'POST', headers: { Authorization: 'Bearer ' + j.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
const L = 'https://api.wayfair.com/v1/graphql', O = 'https://api.wayfair.io/v1/supplier-order-api/graphql';
async function sel(url, name, depth, seen = new Set()) {
  if (seen.has(name)) return ''; seen.add(name);
  const t = (await gql(url, TQ(name))).data?.__type; if (!t) return '';
  const parts = [];
  for (const f of t.fields || []) { if ((f.args || []).some(a => true)) continue; const u = unwrap(f.type);
    if (u.kind === 'SCALAR' || u.kind === 'ENUM') parts.push(f.name); else if (u.kind === 'OBJECT' && depth > 0) { const s = await sel(url, u.name, depth - 1, new Set(seen)); if (s) parts.push(`${f.name} { ${s} }`); } }
  return parts.join(' ');
}
const sel1 = 'poNumber poDate salesChannelName orderType source deliveryMethodCode storePrefix products { partNumber quantity price }';
const seen = new Map();
for (const api of [['ORDER', O], ['LEGACY', L]]) for (const hr of [true, false]) {
  const r = await gql(api[1], `query($f: ${api[0] === 'ORDER' ? 'MonoDateTime' : 'IsoDateTime'}, $h: Boolean){ getCastleGatePurchaseOrders(limit: 200, hasResponse: $h, fromDate: $f, sortOrder: ASC) { ${api[0] === 'ORDER' ? sel1 : 'poNumber poDate salesChannelName orderType storePrefix products { partNumber quantity price }'} } }`, { f: '2026-10-01T00:00:00Z', h: hr });
  if (r.errors) { P(api[0], hr, 'err', JSON.stringify(r.errors).slice(0, 300)); continue; }
  const L2 = r.data.getCastleGatePurchaseOrders || []; P(api[0], 'hasResponse', hr, 'count', L2.length);
  for (const o of L2) { const k = o.poNumber; const prev = seen.get(k) || {}; prev[api[0] + (hr ? '+' : '-')] = [o.salesChannelName, o.orderType, o.source, o.deliveryMethodCode, (o.products || []).map(p => p.partNumber + 'x' + p.quantity).join('/')].join(' | '); prev.date = o.poDate; seen.set(k, prev); }
}
for (const [k, v] of [...seen].sort((a, b) => String(a[1].date).localeCompare(String(b[1].date)))) P('PO', k, TT.includes(k) ? '[TT]' : B2B.includes(k) ? '[B2B]' : '', JSON.stringify(v));
for (const po of all = [...TT, ...B2B, ...NORMAL]) { for (const hr of [true, false]) { const r = await gql(O, `query($p: [String!], $h: Boolean){ getCastleGatePurchaseOrders(poNumbers: $p, hasResponse: $h, limit: 5) { poNumber salesChannelName orderType source } }`, { p: [po], h: hr }); P('ONE', po, hr, JSON.stringify(r.errors ? r.errors[0].message : r.data.getCastleGatePurchaseOrders).slice(0, 300)); } }
