// One-off: find an API field that identifies Tried & True and B2B CastleGate orders. Prints field values for known POs.
const E = process.env, P = (...a) => console.log(...a);
const http = async (u, o) => { const r = await fetch(u, o); const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 500), status: r.status }; } };
const unwrap = t => (t && (t.kind === 'NON_NULL' || t.kind === 'LIST') ? unwrap(t.ofType) : t);
const TQ = n => `{__type(name:"${n}"){name fields{name args{name} type{name kind ofType{name kind ofType{name kind ofType{name kind}}}}}}}`;
const TT = ['CS695495271', 'CS695475826', 'CS690630309', 'CS687282199', 'CS687225220'], B2B = ['CS695503995', 'CA694190163', 'CS693782452', 'CS693575796', 'CS693345609', 'CS692869642'], NORMAL = ['CS695474408', 'CS695152256', 'CS694463759'];
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
// 1) legacy getCastleGatePurchaseOrders: every field
const qt = (await gql(L, '{__schema{queryType{fields{name type{name kind ofType{name kind ofType{name kind}}}}}}}')).data?.__schema?.queryType?.fields || [];
P('LEGACY query fields:', qt.map(f => f.name).join(', '));
const cgT = unwrap((qt.find(f => f.name === 'getCastleGatePurchaseOrders') || {}).type || {}).name;
P('CG type', cgT);
const s1 = await sel(L, cgT, 2); P('CG selection', s1.slice(0, 3000));
const r1 = await gql(L, `{ getCastleGatePurchaseOrders(limit: 200, fromDate: "2026-10-15T00:00:00Z", sortOrder: ASC) { ${s1} } }`);
if (r1.errors) P('CG errors', JSON.stringify(r1.errors).slice(0, 1500));
const pos = r1.data?.getCastleGatePurchaseOrders || [];
for (const g of [['TT', TT], ['B2B', B2B], ['NORMAL', NORMAL]]) for (const po of g[1]) { const o = pos.find(x => x.poNumber === po); P('CG', g[0], po, o ? JSON.stringify(o).slice(0, 2500) : 'missing'); }
// field-level diff: fields whose values differ between TT and normal
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, p + k + '.', out); else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'object' ? flat(x, p + k + '[' + i + '].', out) : out[p + k + '[' + i + ']'] = x); else out[p + k] = v; } return out; };
const F = po => flat(pos.find(x => x.poNumber === po));
const keys = new Set(pos.flatMap(o => Object.keys(flat(o))));
for (const k of keys) { const tv = TT.map(p => F(p)[k]), nv = NORMAL.map(p => F(p)[k]), bv = B2B.map(p => F(p)[k]); const st = v => JSON.stringify([...new Set(v.map(String))]); if (st(tv) !== st(nv) || st(bv) !== st(nv)) P('DIFF', k, 'TT', st(tv), 'B2B', st(bv), 'N', st(nv)); }
// 2) supplier-order-api: SoCastlegateOrder node fields for the same POs
const qt2 = (await gql(O, '{__schema{queryType{fields{name}}}}')).data?.__schema?.queryType?.fields || []; P('ORDER_API query fields:', qt2.map(f => f.name).join(', '));
const nodeT = (await gql(O, '{__type(name:"SoCastlegateOrderList"){fields{name type{name kind ofType{name kind ofType{name kind ofType{name kind}}}}}}}')).data?.__type;
P('SoCastlegateOrderList', JSON.stringify(nodeT).slice(0, 800));
const nodeName = nodeT ? unwrap((nodeT.fields.find(f => f.name === 'nodes') || {}).type || {}).name : null; P('node type', nodeName);
if (nodeName) { const s2 = await sel(O, nodeName, 2); P('SO selection', s2.slice(0, 3000));
  const fl = (await gql(O, '{__type(name:"SoCastlegateOrderListFilters"){inputFields{name type{name kind ofType{name kind}}}}}')).data?.__type; P('filters', JSON.stringify(fl).slice(0, 1500));
  for (const po of [...TT, ...B2B.slice(0, 3), ...NORMAL.slice(0, 2)]) { const r = await gql(O, `query($f: SoCastlegateOrderListFilters!){ soCastlegateOrders { orderListByFilters(filters:$f){ nodes { ${s2} } } } }`, { f: { retailerPurchaseOrderNumbers: [po], page: 1, pageSize: 5 } });
    P('SO', po, JSON.stringify(r.errors || r.data).slice(0, 2500)); } }
