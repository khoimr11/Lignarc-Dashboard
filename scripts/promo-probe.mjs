// Probe Wayfair sale events on CastleGate POs (prints only; encrypted by probe.yml)
const E = process.env, P = (...a) => console.log(...a);
const tok = (await (await fetch('https://sso.auth.wayfair.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', client_id: E.WF_CLIENT_ID, client_secret: E.WF_CLIENT_SECRET }) })).json()).access_token;
const U = 'https://api.wayfair.io/v1/supplier-order-api/graphql';
const gql = async (query, variables) => (await fetch(U, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
for (const n of ['SupplierPurchaseOrdersDateTimeIntervalInput', 'SupplierPurchaseOrderDateTimeInterval', 'SupplierCastlegatePurchaseOrdersFilterInput', 'SupplierCastlegatePurchaseOrderProduct', 'SupplierCastlegatePurchaseOrder']) {
  const j = await gql(`{__type(name:"${n}"){fields{name type{name kind ofType{name}}} inputFields{name type{name kind ofType{name}}}}}`); P('T', n, JSON.stringify(j.data && j.data.__type).slice(0, 1500));
}
const it = await gql('{__type(name:"SupplierPurchaseOrdersDateTimeIntervalInput"){inputFields{name}}}');
const [kA, kB] = it.data.__type.inputFields.map(f => f.name);
const dur = await gql('{__type(name:"SupplierPurchaseOrderDateTimeInterval"){fields{name}}}'); const dk = dur.data.__type.fields.map(f => f.name).join(' ');
const all = [];
for (const hasResponse of [true, false]) for (let page = 1; page < 30; page++) {
  const r = await gql(`query($i: SupplierCastlegatePurchaseOrdersInput!, $p: Int!){ castlegatePurchaseOrders(supplierCastlegatePurchaseOrdersInput:$i, page:$p, pageSize:50){ totalCount pageInfo { hasNextPage } nodes { purchaseOrderNumber purchaseOrderDate supplierCastlegatePurchaseOrderProducts { supplierPartNumber quantity wholesalePrice supplierPurchaseOrderProductSaleEvent { saleEventId type name duration { ${dk} } } } } } }`,
    { i: { filter: { hasResponse, [kA === 'start' ? kA : 'purchaseOrderDateTimeInterval']: undefined, purchaseOrderDateTimeInterval: { [kA]: '2026-07-01T00:00:00Z', [kB]: new Date(Date.now() + 864e5).toISOString() } } }, p: page });
  if (r.errors) { P('err', JSON.stringify(r.errors).slice(0, 800)); break; }
  const c = r.data.castlegatePurchaseOrders; all.push(...c.nodes); if (!c.pageInfo.hasNextPage) break;
}
P('POs', all.length);
for (const o of all) P('PO', o.purchaseOrderNumber, o.purchaseOrderDate, JSON.stringify(o.supplierCastlegatePurchaseOrderProducts));
