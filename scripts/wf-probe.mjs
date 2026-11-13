// Extra Wayfair probes (run by `api-sync.mjs --probe`): order fields for Tried & True / timestamps,
// return-related queries, and SKU-level advertising report types. Prints only; writes nothing.
const LEGACY_API = 'https://api.wayfair.com/v1/graphql';
const ORDER_API = 'https://api.wayfair.io/v1/supplier-order-api/graphql';
const ADS_API = 'https://api.wayfair.io/advertising/v1';
const P = (...a) => console.log('PROBE', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tname = t => t && (t.name || tname(t.ofType));
const tkind = t => t && (t.kind === 'NON_NULL' || t.kind === 'LIST' ? tkind(t.ofType) : t.kind);
const INTRO = '{__schema{queryType{fields{name args{name type{name kind ofType{name kind ofType{name kind}}}}}} types{name kind fields{name type{name kind ofType{name kind ofType{name kind ofType{name kind}}}}}}}}';

export default async function probe({ gql, http, tok }) {
  // 1) legacy schema: CastleGate PO type, every field
  try {
    const j = await gql(LEGACY_API, INTRO);
    const S = j.data.__schema, T = new Map(S.types.map(t => [t.name, t]));
    const q = S.queryType.fields.find(f => f.name === 'getCastleGatePurchaseOrders');
    P('legacy queries with return/refund/credit:', S.queryType.fields.filter(f => /return|refund|credit|chargeback|invoice|remit/i.test(f.name)).map(f => f.name + '(' + f.args.map(a => a.name).join(',') + ')').join(' ; '));
    const ret = (function find(t) { return t && (t.name ? t : find(t.ofType)); })(q.type);
    const poT = T.get(ret.name);
    const scal = t => (t.fields || []).filter(f => /SCALAR|ENUM/.test(tkind(f.type))).map(f => f.name);
    P('PO type', poT.name, 'fields:', poT.fields.map(f => f.name + ':' + tname(f.type)).join(', '));
    const sub = poT.fields.filter(f => tkind(f.type) === 'OBJECT').map(f => { const st = T.get(tname(f.type)); P('  sub', f.name, st.name, st.fields.map(x => x.name + ':' + tname(x.type)).join(', ')); return `${f.name} { ${scal(st).join(' ')} }`; });
    const sel = scal(poT).join(' ') + ' ' + sub.join(' ');
    for (const hasResponse of [true, false]) {
      const r = await gql(LEGACY_API, `query($l: Int32, $h: Boolean, $f: IsoDateTime){ getCastleGatePurchaseOrders(limit:$l, hasResponse:$h, fromDate:$f, sortOrder: ASC){ ${sel} } }`, { l: 100, h: hasResponse, f: '2026-10-15T00:00:00Z' });
      if (r.errors) P('legacy err', JSON.stringify(r.errors).slice(0, 400));
      const L = (r.data && r.data.getCastleGatePurchaseOrders) || [];
      P('hasResponse', hasResponse, 'count', L.length);
      for (const o of L.filter(o => /687225220|687282199|690630309|689194421|689175540/.test(o.poNumber))) P('PO', JSON.stringify(o).slice(0, 2500));
      // which scalar fields differ across orders (candidates for the Tried & True flag)
      const vals = {}; for (const o of L) for (const k of Object.keys(o)) if (typeof o[k] !== 'object') (vals[k] = vals[k] || new Set()).add(String(o[k]));
      P('distinct', JSON.stringify(Object.fromEntries(Object.entries(vals).filter(([k, s]) => s.size < 12).map(([k, s]) => [k, [...s]]))));
    }
  } catch (e) { P('legacy ERR', e.message.slice(0, 300)); }

  // 2) supplier-order-api: anything about returns / tried & true
  try {
    const j = await gql(ORDER_API, INTRO);
    const S = j.data.__schema;
    P('order-api queries:', S.queryType.fields.map(f => f.name).join(', '));
    P('order-api types w/ return|tried|channel:', S.types.filter(t => /return|tried|channel|refund/i.test(t.name)).map(t => t.name + '{' + (t.fields || []).map(f => f.name).join(',') + '}').join(' ; ').slice(0, 3000));
    P('fields named like tried/channel/return:', S.types.flatMap(t => (t.fields || []).filter(f => /tried|salesChannel|return/i.test(f.name)).map(f => t.name + '.' + f.name)).join(', ').slice(0, 2000));
  } catch (e) { P('order-api ERR', e.message.slice(0, 300)); }

  // 3) advertising: SKU-level report types
  const H = { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
  const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  for (const rt of ['PRODUCT_REPORT', 'SKU_REPORT', 'PRODUCT_PERFORMANCE_REPORT', 'AD_GROUP_REPORT']) {
    try {
      const rep = await http(ADS_API + '/reports', { method: 'POST', headers: H, body: JSON.stringify({ name: 'probe-' + rt + '-' + end, reportType: rt, groupBy: 'DAY', program: 'WSP', fileType: 'CSV', filters: { startDate: '2026-10-01', endDate: end }, attributionWindow: 14, supplierId: 467016 }) });
      P('ads', rt, 'created', JSON.stringify(rep).slice(0, 300));
      const id = rep.id || rep.reportId; let st = {};
      for (let i = 0; i < 30; i++) { await sleep(8000); st = await http(ADS_API + '/reports?reportId=' + encodeURIComponent(id), { headers: H }); if (st.url || /FAIL/i.test(st.status || '')) break; }
      P('ads', rt, 'status', st.status);
      if (st.url) { const t = await (await fetch(st.url)).text(); P('ads', rt, 'CSV', t.split('\n').slice(0, 6).join(' || ').slice(0, 2500)); break; }
    } catch (e) { P('ads', rt, 'ERR', e.message.slice(0, 300)); }
  }
}
