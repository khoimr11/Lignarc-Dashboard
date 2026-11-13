/* Merge one collector payload into the dashboard data object. Used by sync.html (browser) and data-tool (Node). */
(function (g) {
  'use strict';
  const etToday = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // US Eastern (approx.)
  function mergeBy(old, add, key) { const m = new Map((old || []).map(r => [key(r), r])); for (const r of add || []) m.set(key(r), r); return [...m.values()]; }
  g.LGMERGE = function (data, p) {
    data.meta = data.meta || {}; data.wf = data.wf || {}; data.amz = data.amz || {};
    const res = { src: p.src };
    if (p.src === 'wayfair') {
      const W = data.wf;
      if (p.inv && p.inv.length) { W.inv = p.inv; W.invHist = W.invHist || {}; W.invHist[etToday()] = p.inv.map(r => [r[0], r[2], r[3]]); res.inv = p.inv.length; }
      if (p.prod && p.prod.length) { W.prod = p.prod; res.prod = p.prod.length; }
      if (p.inb && p.inb.length) {
        // the API has no per-SKU quantities: keep quantities already known (Partner Home or manual PO list)
        const old = new Map((W.inb || []).map(x => [x.id, x])), man = W.inbItems || {};
        for (const x of p.inb) { if (!x.items || !x.items.length) x.items = (old.get(x.id) && old.get(x.id).items && old.get(x.id).items.length ? old.get(x.id).items : (man[x.id] || man[x.po] || [])); }
        W.inb = p.inb; res.inb = p.inb.length; }
      if (p.orders && p.orders.length) { const before = (W.orders || []).length; W.orders = mergeBy(W.orders, p.orders, r => r[0] + '|' + r[7]).sort((a, b) => (b[2] || '').localeCompare(a[2] || '')); res.orders = W.orders.length; res.newOrders = W.orders.length - before; }
      if (p.ads) { W.ads = W.ads || {}; if (p.ads.camps && p.ads.camps.length) W.ads.camps = p.ads.camps; if (p.ads.wallet) W.ads.wallet = p.ads.wallet; if (p.ads.columns) W.ads.columns = p.ads.columns;
        W.ads.daily = mergeBy(W.ads.daily, p.ads.daily, r => r[0] + '|' + r[1]).sort((a, b) => a[1].localeCompare(b[1])); res.adsDays = W.ads.daily.length; }
      data.meta.wfAt = p.at; data.meta.wfErr = p.err || null;
    } else if (p.src === 'amazon-orders') {
      data.amz.orders = mergeBy(data.amz.orders, p.orders, r => r[0] + '|' + r[3]).sort((a, b) => (b[1] || '').localeCompare(a[1] || '')); res.orders = data.amz.orders.length; data.meta.amzOrdersAt = p.at;
    } else if (p.src === 'amazon-ads') {
      const A = data.amz.ads = data.amz.ads || {}; if (p.camps) A.camps = p.camps; A.daily = mergeBy(A.daily, p.daily, r => r[0]).sort((a, b) => a[0].localeCompare(b[0])); res.days = A.daily.length; data.meta.amzAdsAt = p.at;
    } else throw new Error('unknown payload ' + p.src);
    data.meta.at = Math.floor(Date.now() / 1000); data.meta.today = etToday();
    return res;
  };
})(typeof window !== 'undefined' ? window : globalThis);
