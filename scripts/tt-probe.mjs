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
const QF = (await gql(O, '{__schema{queryType{fields{name args{name type{name kind ofType{name kind ofType{name kind}}}} type{name kind ofType{name kind ofType{name kind ofType{name kind}}}}}}}}')).data.__schema.queryType.fields;
for (const n of ['getCastleGatePurchaseOrders', 'soCastlegateOrders', 'soCastlegateOrderItem', 'fulfillmentOrderDetails', 'fulfillmentOrderDetailsList', 'castlegatePurchaseOrders', 'soCastlegateRetailers'])
  { const f = QF.find(x => x.name === n); if (f) P('Q', n, '->', unwrap(f.type).name, 'args', f.args.map(a => a.name + ':' + (unwrap(a.type).name)).join(', ')); }
const inputT = async n => { const t = (await gql(O, `{__type(name:"${n}"){inputFields{name type{name kind ofType{name kind ofType{name kind}}}}}}`)).data?.__type; return t ? t.inputFields.map(f => f.name + ':' + unwrap(f.type).name).join(', ') : null; };
for (const n of ['SoCastlegateOrderListFilters', 'FulfillmentOrderDetailsInput', 'FulfillmentOrderDetailsListInput', 'SoCastlegateOrderItemInput']) P('INPUT', n, await inputT(n));
// getCastleGatePurchaseOrders on the order API: every scalar field
const cgT = unwrap((QF.find(f => f.name === 'getCastleGatePurchaseOrders') || {}).type || {}).name;
const s1 = await sel(O, cgT, 2); P('CG type', cgT, 'selection', s1.slice(0, 2500));
const r1 = await gql(O, `{ getCastleGatePurchaseOrders(limit: 200, fromDate: "2026-10-15T00:00:00Z", sortOrder: ASC) { ${s1} } }`);
if (r1.errors) P('CG errors', JSON.stringify(r1.errors).slice(0, 1500));
const pos = r1.data?.getCastleGatePurchaseOrders || []; P('CG count', pos.length);
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, p + k + '.', out); else if (Array.isArray(v)) v.forEach((x, i) => x && typeof x === 'object' ? flat(x, p + k + '[' + i + '].', out) : out[p + k + '[' + i + ']'] = x); else out[p + k] = v; } return out; };
const F = po => flat(pos.find(x => x.poNumber === po));
for (const po of [TT[0], B2B[0], NORMAL[0]]) P('CG sample', po, JSON.stringify(pos.find(x => x.poNumber === po) || null).slice(0, 2500));
const keys = new Set(pos.flatMap(o => Object.keys(flat(o))));
for (const k of keys) { const st = v => JSON.stringify([...new Set(v.map(String))]); const tv = st(TT.map(p => F(p)[k])), nv = st(NORMAL.map(p => F(p)[k])), bv = st(B2B.map(p => F(p)[k])); if (tv !== nv || bv !== nv) P('DIFF', k, 'TT', tv, 'B2B', bv, 'N', nv); }
// soCastlegateOrders / order item / fulfillment details
for (const n of ['soCastlegateOrders', 'soCastlegateOrderItem', 'fulfillmentOrderDetails', 'fulfillmentOrderDetailsList']) { const f = QF.find(x => x.name === n); if (!f) continue; const tn = unwrap(f.type).name; P('TYPE', n, tn, (await sel(O, tn, 3)).slice(0, 2500)); }
