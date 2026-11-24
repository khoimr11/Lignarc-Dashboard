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
      if (p.sale && p.sale.length) { W.sale = mergeBy(W.sale, p.sale, r => r[0] + '|' + r[1]); res.sale = W.sale.length; }
      if (p.ads) { W.ads = W.ads || {}; if (p.ads.camps && p.ads.camps.length) W.ads.camps = p.ads.camps; if (p.ads.wallet) W.ads.wallet = p.ads.wallet; if (p.ads.columns) W.ads.columns = p.ads.columns; if (p.ads.sample) W.ads.sample = p.ads.sample;
        W.ads.daily = mergeBy(W.ads.daily, p.ads.daily, r => r[0] + '|' + r[1]).sort((a, b) => a[1].localeCompare(b[1])); res.adsDays = W.ads.daily.length; }
      if (p.adsSku && p.adsSku.daily) { W.adsSku = mergeBy(W.adsSku, p.adsSku.daily, r => r[0] + '|' + r[1]).sort((a, b) => a[0].localeCompare(b[0])); W.adsParts = Object.assign(W.adsParts || {}, p.adsSku.parts || {}); res.adsSku = W.adsSku.length;
        if (p.adsSku.byCamp) W.adsSkuCamp = mergeBy(W.adsSkuCamp, p.adsSku.byCamp, r => r[0] + '|' + r[1] + '|' + r[2]).sort((a, b) => a[0].localeCompare(b[0]));
        if (p.adsSku.bids) W.adsBids = p.adsSku.bids; }
      if (p.adsKw && p.adsKw.length) { W.adsKw = mergeBy(W.adsKw, p.adsKw, r => r.slice(0, 5).join('|')).sort((a, b) => a[0].localeCompare(b[0])); res.adsKw = W.adsKw.length; }
      if (p.adsRank && p.adsRank.length) { W.adsRank = mergeBy(W.adsRank, p.adsRank, r => r.slice(0, 3).join('|')).sort((a, b) => a[0].localeCompare(b[0])); res.adsRank = W.adsRank.length; }
      data.meta.wfAt = p.at; data.meta.wfErr = p.err || null;
    } else if (p.src === 'amazon-orders') {
      data.amz.orders = mergeBy(data.amz.orders, p.orders, r => r[0] + '|' + r[3]).sort((a, b) => (b[1] || '').localeCompare(a[1] || '')); res.orders = data.amz.orders.length; data.meta.amzOrdersAt = p.at;
    } else if (p.src === 'amazon-catalog') {
      // Best Seller Rank / Buy Box snapshots: keep one row per ASIN per hour
      const rows = p.rows.map(r => [r.at.slice(0, 13), r.asin, (r.cls && r.cls[0]) || null, (r.disp && r.disp[0]) || null, r.myPrice ?? null, r.bbPrice ?? null, r.offers ?? null, r.myBB ?? null, r.lowest ?? null, r.sellers ?? null]);
      data.amz.rank = mergeBy(data.amz.rank, rows, r => r[0] + '|' + r[1]).sort((a, b) => a[0].localeCompare(b[0])).slice(-3000); res.rank = data.amz.rank.length; data.meta.amzCatalogAt = p.at; data.meta.amzCatalogErr = Object.keys(p.err || {}).length ? p.err : null;
    } else if (p.src === 'incident-media') {
      // customer photo files (data/media/<name>.enc.json) attached to an incident / return case
      const I = data.incidents = data.incidents || { cases: [] }; const c = (I.cases || []).find(x => x.po === p.po && (!p.part || x.part === p.part));
      const M2 = data.incidentMedia = data.incidentMedia || {}; M2[p.po] = { part: p.part, ch: p.ch || 'wf', files: p.files, at: p.at || Math.floor(Date.now() / 1000) };
      if (c) c.media = p.files; res.media = (p.files || []).length;
    } else if (p.src === 'amazon-returns') {
      // merchant-fulfilled return requests, merged by RMA (or order + SKU)
      const key = r => r.amazon_rma_id || (r.order_id + '|' + r.merchant_sku);
      const m = new Map((data.amz.returns || []).map(r => [key(r), r])); for (const r of p.rows || []) m.set(key(r), r);
      data.amz.returns = [...m.values()]; data.amz.returnsAt = p.at; res.returns = data.amz.returns.length;
    } else if (p.src === 'amazon-listings') {
      // full snapshot of every Amazon listing (content, images, portal issues, A+); keep a daily issue count history
      data.amz.listings = { at: p.at, rows: p.rows, aplus: p.aplus, req: p.req, err: Object.keys(p.err || {}).length ? p.err : null };
      const h = data.amz.listingHist = data.amz.listingHist || {}; h[etToday()] = [p.rows.length, p.rows.reduce((s, r) => s + r.issues.length, 0), p.rows.filter(r => (r.status || []).includes('BUYABLE')).length];
      res.listings = p.rows.length;
    } else if (p.src === 'amazon-feedback') {
      data.amz.feedback = { at: p.at, items: p.items }; res.feedback = Object.keys(p.items).length;
    } else if (p.src === 'amazon-traffic') {
      const old = (data.amz.traffic && data.amz.traffic.byDate) || [];
      data.amz.traffic = { byDate: mergeBy(old, p.byDate, r => r[0]).sort((a, b) => a[0].localeCompare(b[0])), byAsin: p.byAsin, from: p.from, to: p.to }; res.traffic = p.byDate.length; data.meta.amzTrafficAt = p.at;
    } else if (p.src === 'amazon-finances') {
      // deferred transactions get re-posted as released with the same id: latest copy wins
      data.amz.fin = mergeBy(data.amz.fin, p.rows, r => r[0]).sort((a, b) => (a[1] || '').localeCompare(b[1] || '')); res.fin = data.amz.fin.length; data.meta.amzFinAt = p.at;
    } else if (p.src === 'amazon-ads') {
      const A = data.amz.ads = data.amz.ads || {};
      if (p.v >= 2) {
        // v2: entity snapshot + daily report rows per type; a report window replaces every row of that type inside the window
        if (p.ent) { A.ent = p.ent; res.ent = 1; }
        for (const w of p.rep || []) { const k = w.k;
          if (k === 'pp') { if (!A.ppWin || w.e >= A.ppWin[1]) { A.pp = w.rows; A.ppWin = [w.s, w.e]; } res.pp = (A.pp || []).length; continue; }
          const keep = (A[k] || []).filter(r => r[0] < w.s || r[0] > w.e);
          const cut = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
          A[k] = keep.concat(w.rows).filter(r => r[0] >= cut).sort((a, b) => a[0].localeCompare(b[0])); res[k] = A[k].length;
        }
        // keep the legacy aggregates the rest of the dashboard reads
        if (A.cd && A.cd.length) {
          const by = new Map(); for (const r of A.cd) { const d = by.get(r[0]) || [r[0], 0, 0, 0, 0, 0]; d[1] += r[2]; d[2] += r[3]; d[3] += r[4]; d[4] += r[5]; d[5] += r[6]; by.set(r[0], d); }
          A.daily = [...by.values()].map(d => d.map((v, i) => i > 2 ? Math.round(v * 100) / 100 : v)).sort((a, b) => a[0].localeCompare(b[0]));
        }
        if (A.ent && A.ent.camps) A.camps = A.ent.camps.map(c => [c.id, c.name, c.state, c.serving, c.start, c.budget, 0, 0, 0, 0, 0]);
        data.meta.amzAdsAt = p.at;
      } else { if (p.camps) A.camps = p.camps; A.daily = mergeBy(A.daily, p.daily, r => r[0]).sort((a, b) => a[0].localeCompare(b[0])); res.days = A.daily.length; data.meta.amzAdsAt = p.at; }
    } else throw new Error('unknown payload ' + p.src);
    data.meta.at = Math.floor(Date.now() / 1000); data.meta.today = etToday();
    return res;
  };
})(typeof window !== 'undefined' ? window : globalThis);
