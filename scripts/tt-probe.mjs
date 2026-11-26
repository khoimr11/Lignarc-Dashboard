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
const PII = /name|address|city|postal|phone|email|customer(?!Order)|shipTo|billTo/i;
const enumV = async n => { const t = (await gql(O, `{__type(name:"${n}"){enumValues{name}}}`)).data?.__type; return t ? (t.enumValues || []).map(e => e.name).join(', ') : null; };
for (const n of ['SoCastlegateBillingType', 'SoCastlegateOrderSource', 'SoCastlegateOrderStatus']) P('ENUM', n, await enumV(n));
const all = [...TT, ...B2B, ...NORMAL];
// A) getCastleGatePurchaseOrders by PO numbers, non-PII fields only
for (const sel1 of ['poNumber salesChannelName orderType source deliveryMethodCode storePrefix products { partNumber price event { id type name startDate endDate } customComment }', 'poNumber salesChannelName orderType source', 'poNumber salesChannelName orderType']) {
  const r = await gql(O, `query($p: [String!]){ getCastleGatePurchaseOrders(poNumbers: $p, limit: 50) { ${sel1} } }`, { p: all });
  if (r.errors) { P('CG-PO err', sel1.slice(0, 40), JSON.stringify(r.errors).slice(0, 400)); continue; }
  for (const o of r.data.getCastleGatePurchaseOrders || []) P('CG-PO', TT.includes(o.poNumber) ? 'TT ' : B2B.includes(o.poNumber) ? 'B2B' : 'N  ', JSON.stringify(o).slice(0, 900));
  break;
}
// B) soCastlegateOrders.orderListByFilters node, non-PII fields
const SQ = (await gql(O, '{__type(name:"SoCastlegateOrderQuery"){fields{name args{name} type{name kind ofType{name kind ofType{name kind}}}}}}')).data?.__type;
P('SoCastlegateOrderQuery', JSON.stringify((SQ && SQ.fields || []).map(f => [f.name, f.args.map(a => a.name), unwrap(f.type).name])));
const lst = SQ && SQ.fields.find(f => f.name === 'orderListByFilters');
if (lst) { const lt = unwrap(lst.type).name, LT = (await gql(O, `{__type(name:"${lt}"){fields{name type{name kind ofType{name kind ofType{name kind}}}}}}`)).data.__type, nodeName = unwrap(LT.fields.find(f => f.name === 'nodes').type).name;
  const s2 = await sel(O, nodeName, 2); P('SO node', nodeName, s2.slice(0, 2000));
  const s2np = s2.split(' ').filter(w => !PII.test(w)).join(' ');
  for (const po of all) { const r = await gql(O, `query($f: SoCastlegateOrderListFilters!){ soCastlegateOrders { orderListByFilters(filters:$f){ nodes { ${s2} } } } }`, { f: { includePendingOrders: true, supplierId: '467016', purchaseOrderNumbers: [po], page: 1, pageSize: 5 } });
    if (r.errors) { P('SO err', po, JSON.stringify(r.errors).slice(0, 500)); continue; }
    const nodes = r.data.soCastlegateOrders.orderListByFilters.nodes || [];
    const strip = o => JSON.parse(JSON.stringify(o, (k, v) => PII.test(k) && typeof v !== 'object' ? undefined : v));
    P('SO', TT.includes(po) ? 'TT ' : B2B.includes(po) ? 'B2B' : 'N  ', po, JSON.stringify(nodes.map(strip)).slice(0, 1800)); } }
// B2) order detail (item level): every field
{ const dt = (await sel(O, 'SoCastlegateOrderDetail', 3)); P('SO detail sel', dt.slice(0, 3000));
  const dsel = dt.split(' ').filter(w => !PII.test(w) || w === '{' || w === '}').join(' ');
  for (const po of [TT[0], TT[3], B2B[0], NORMAL[0]]) { const r = await gql(O, `query($f: SoCastlegateOrderListFilters!){ soCastlegateOrders { orderDetailsByFilters(filters:$f){ ${dt} } } }`, { f: { includePendingOrders: true, supplierId: '467016', purchaseOrderNumbers: [po], page: 1, pageSize: 5 } });
    const strip = o => JSON.parse(JSON.stringify(o, (k, v) => PII.test(k) && typeof v !== 'object' ? undefined : v));
    P('SO detail', TT.includes(po) ? 'TT ' : B2B.includes(po) ? 'B2B' : 'N  ', po, JSON.stringify(r.errors || strip(r.data)).slice(0, 2500)); } }
// C) fulfillment order list (multichannel) — just the retailer and billingType values
const fr = await gql(O, `query($i: FulfillmentOrderDetailsListInput!){ fulfillmentOrderDetailsList(orderDetailsListInput:$i){ pageInfo { totalItems } nodes { fulfillmentOrder { requestId billingType status retailer { name orderNumber } orderDate } } } }`, { i: { supplierId: 467016, pageSize: 20, page: 1 } });
P('FO', JSON.stringify(fr.errors || fr.data).slice(0, 1500));
