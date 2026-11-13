// Extra Wayfair probe (run by `api-sync.mjs --probe`): CastleGate PO fields in supplier-order-api
// (sales channel / Tried & True, PO type, allowances, sale events, timestamps). Prints only.
const ORDER_API = 'https://api.wayfair.io/v1/supplier-order-api/graphql';
const P = (...a) => console.log('PROBE', ...a);
const unwrap = t => (t && (t.kind === 'NON_NULL' || t.kind === 'LIST') ? unwrap(t.ofType) : t);
const TQ = n => `{__type(name:"${n}"){name fields{name type{name kind ofType{name kind ofType{name kind ofType{name kind}}}}}}}`;

export default async function probe({ gql }) {
  const types = new Map();
  const getT = async n => { if (!types.has(n)) { const j = await gql(ORDER_API, TQ(n)); types.set(n, j.data && j.data.__type); } return types.get(n); };
  // selection set: scalars + one level of objects (two levels for products)
  async function sel(n, depth) {
    const t = await getT(n); if (!t) return '';
    const parts = [];
    for (const f of t.fields) { const u = unwrap(f.type); if (u.kind === 'SCALAR' || u.kind === 'ENUM') parts.push(f.name); else if (u.kind === 'OBJECT' && depth > 0) { const s = await sel(u.name, depth - 1); if (s) parts.push(`${f.name} { ${s} }`); } }
    return parts.join(' ');
  }
  try {
    const po = await getT('SupplierCastlegatePurchaseOrder');
    for (const n of ['SupplierAllowance', 'SupplierPurchaseOrderProductSaleEvent', 'SupplierPurchaseOrderCustomer', 'GlobalWayfairStore']) { const t = await getT(n); P('type', n, t ? t.fields.map(f => f.name + ':' + unwrap(f.type).name).join(', ') : 'n/a'); }
    let s = await sel('SupplierCastlegatePurchaseOrder', 1);
    const prod = await sel('SupplierCastlegatePurchaseOrderProduct', 1);
    s = s.replace(/supplierCastlegatePurchaseOrderProducts \{[^}]*\}( \})?/, '') + ` supplierCastlegatePurchaseOrderProducts { ${prod} }`;
    s = s.replace(/supplierPurchaseOrderCustomer \{[^}]*\}/, 'supplierPurchaseOrderCustomer { state country }').replace(/supplierPurchaseOrderShipTo \{[^}]*\}/, '').replace(/supplierPurchaseOrderBillTo \{[^}]*\}/, '');
    P('selection', s.slice(0, 1500));
    const it = await gql(ORDER_API, '{__type(name:"SupplierPurchaseOrdersDateTimeIntervalInput"){inputFields{name}}}');
    const keys = ((it.data && it.data.__type && it.data.__type.inputFields) || []).map(f => f.name); P('interval keys', keys.join(','));
    const [kA, kB] = keys.length >= 2 ? keys : ['start', 'end'];
    const all = [];
    for (const hasResponse of [true, false]) for (let page = 1; page < 20; page++) {
      const r = await gql(ORDER_API, `query($i: SupplierCastlegatePurchaseOrdersInput, $p: Int, $ps: Int){ castlegatePurchaseOrders(supplierCastlegatePurchaseOrdersInput:$i, page:$p, pageSize:$ps){ totalCount pageInfo { hasNextPage } nodes { ${s} } } }`,
        { i: { filter: { hasResponse, purchaseOrderDateTimeInterval: { [kA]: '2026-10-01T00:00:00Z', [kB]: new Date(Date.now() + 864e5).toISOString() } } }, p: page, ps: 50 });
      if (r.errors) { P('err', hasResponse, JSON.stringify(r.errors).slice(0, 700)); break; }
      const c = r.data.castlegatePurchaseOrders; all.push(...(c.nodes || []));
      P('page', hasResponse, page, (c.nodes || []).length, 'total', c.totalCount);
      if (!c.pageInfo || !c.pageInfo.hasNextPage) break;
    }
    const sc = {}; for (const o of all) { const k = (o.salesChannelName || '-') + ' | ' + (o.purchaseOrderType || '-') + ' | ' + JSON.stringify(o.supplierAllowance || null).slice(0, 80); sc[k] = (sc[k] || 0) + 1; }
    P('channel|type|allowance counts', JSON.stringify(sc));
    for (const o of all) P('PO', o.purchaseOrderNumber, o.purchaseOrderDate, o.salesChannelName, o.purchaseOrderType, JSON.stringify(o.supplierAllowance), JSON.stringify((o.supplierCastlegatePurchaseOrderProducts || []).map(p => [p.supplierPartNumber, p.quantity, p.wholesalePrice, p.isCancelled, p.internalStatus, p.shippingDate, p.supplierPurchaseOrderProductSaleEvent])).slice(0, 700));
    if (all[0]) P('sample', JSON.stringify(all.find(o => /687225220/.test(o.purchaseOrderNumber)) || all[0]).slice(0, 3000));
  } catch (e) { P('ERR', e.message.slice(0, 500)); }
}
