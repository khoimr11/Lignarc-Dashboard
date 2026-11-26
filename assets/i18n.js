// EN / VI switch. The app renders English; in Vietnamese mode every text node and tooltip is translated in place
// from window.LG_VI (longest phrase first, whole words only). Product names, SKUs, portal messages and ticket texts stay as they are.
(function () {
  const KEY = 'lg-lang', DICT = window.LG_VI || {};
  let lang = 'en'; try { lang = localStorage.getItem(KEY) || 'en'; } catch (e) {}
  // Metrics stay in English for PICs and the BOD: Vietnamese metric terms in the dictionary are mapped back to the English metric name.
  const METRIC = [
    ['Biên lợi nhuận góp', 'Contribution Margin'], ['biên lợi nhuận góp', 'contribution margin'], ['Lợi nhuận góp trước QC', 'Contribution before Ads'], ['lợi nhuận góp trước QC', 'contribution before ads'], ['Lợi nhuận góp', 'Contribution'], ['lợi nhuận góp', 'contribution'],
    ['Biên lợi nhuận', 'Margin'], ['biên lợi nhuận', 'margin'], ['Lãi sau QC', 'Profit after Ads'], ['lãi sau QC', 'profit after ads'], ['Lợi nhuận', 'Profit'], ['lợi nhuận', 'profit'],
    ['Doanh thu thuần', 'Net Revenue'], ['doanh thu thuần', 'net revenue'], ['Doanh số thuần', 'Net Sales'], ['doanh số thuần', 'net sales'], ['Doanh thu', 'Revenue'], ['doanh thu', 'revenue'],
    ['Chi tiêu QC', 'Ad Spend'], ['chi tiêu QC', 'ad spend'], ['Doanh số QC', 'Ad Sales'], ['doanh số QC', 'ad sales'], ['Đơn QC', 'Ad Orders'], ['mỗi đơn QC', 'mỗi Ad Order'], ['đơn QC', 'ad orders'], ['Chi tiêu lãng phí', 'Wasted Spend'], ['chi tiêu lãng phí', 'wasted spend'],
    ['Chi phí mỗi đơn QC', 'Cost per Ad Order'], ['Chi phí mỗi đơn', 'Cost per Order'], ['Giá trị đơn TB', 'AOV'], ['CPC tối đa còn lãi', 'Max profitable CPC'],
    ['ACoS hòa vốn', 'Break-even ACoS'], ['CPA hòa vốn', 'Break-even CPA'], ['TACoS hòa vốn', 'Break-even TACoS'], ['ROAS hòa vốn', 'Break-even ROAS'], ['ACoS mục tiêu', 'Target ACoS'], ['Hòa vốn', 'Break-even'], ['hòa vốn', 'break-even'],
    ['Giá vốn', 'COGS'], ['giá vốn', 'COGS'], ['Phí sàn', 'Platform Fees'], ['phí sàn', 'platform fees'], ['Lượt hiển thị', 'Impressions'], ['lượt hiển thị', 'impressions'], ['Tỷ lệ chuyển đổi', 'Conversion Rate'], ['tỷ lệ chuyển đổi', 'conversion rate'],
    ['Số ngày tồn', 'Stock Cover'], ['Số ngày đủ hàng', 'Days of Cover'], ['Giá trị tồn kho', 'Stock Value'], ['Tỷ lệ sự cố', 'Incident Rate'], ['tỷ lệ sự cố', 'incident rate'], ['Tỷ lệ hoàn', 'Return Rate'], ['Tỷ lệ bán hết', 'Sell-through'], ['Tỷ lệ đánh giá', 'Review Rate'],
    ['Chỉ tiêu', 'Target'], ['chỉ tiêu', 'target'], ['Tỷ trọng QC', 'Ad Share'], ['Hạng trong ngành', 'Class Rank'], ['hạng trong ngành', 'class rank'],
  ];
  const metric = v => { for (const [a, b] of METRIC) if (v.includes(a)) v = v.split(a).join(b); return v; };
  const idx = new Map();
  for (const [k0, v0] of Object.entries(DICT)) { const k = k0.trim(), v = metric(String(v0).trim()); if (k.length < 2) continue; const p = k.slice(0, 2); if (!idx.has(p)) idx.set(p, []); idx.get(p).push([k, v]); }
  for (const a of idx.values()) a.sort((x, y) => y[0].length - x[0].length);
  const W = c => !!c && /[A-Za-z0-9_\-]/.test(c);
  const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }, DOW = { Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7', Sun: 'CN' };
  const dates = s => s
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:,? (\d{4}))?\b/g, (m, mo, d, y) => `${d}/${MON[mo]}${y ? '/' + y : ''}`)
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b(?:[ ’'](\d{2,4}))?/g, (m, mo, y) => `Th${MON[mo]}${y ? '/' + y : ''}`)
    .replace(/(\d+) of (\d+)\b/g, '$1/$2')
    .replace(/\bWk (?=\d)/g, 'Tuần ').replace(/\bWeek of (?=\d)/g, 'Tuần ')
    .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, m => DOW[m]);
  function tr(s) {
    if (!s || !/[A-Za-z]{2}/.test(s)) return s;
    let out = '', i = 0; const n = s.length;
    while (i < n) {
      if (i === 0 || !W(s[i - 1]) || !W(s[i])) { const a = idx.get(s.substr(i, 2));
        if (a) { let hit = null; for (const kv of a) { const k = kv[0]; if (s.startsWith(k, i) && (!W(k[k.length - 1]) || !W(s[i + k.length]))) { hit = kv; break; } }
          if (hit) { out += hit[1]; i += hit[0].length; continue; } } }
      out += s[i++];
    }
    return dates(out);
  }
  const ATTRS = ['title', 'aria-label', 'placeholder', 'data-tip', 'data-info'];
  const origT = new WeakMap(), doneT = new WeakMap(), origA = new WeakMap(), doneA = new WeakMap();
  const skip = el => !el || el.closest('textarea,script,style,[data-notr],.notr,code,.kpi .lbl,th,svg text,.legend');
  const skipA = el => !el || el.closest('textarea,script,style,[data-notr],.notr,code');
  function apply(root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { const v = n.nodeValue; if (doneT.get(n) === v || skip(n.parentElement)) continue;
      origT.set(n, v); const t = tr(v); doneT.set(n, t); if (t !== v) n.nodeValue = t; }
    const els = root.querySelectorAll ? root.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')) : [];
    for (const el of els) { if (skipA(el)) continue; let o = origA.get(el), d = doneA.get(el); if (!o) { o = {}; d = {}; origA.set(el, o); doneA.set(el, d); }
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v == null || d[a] === v) continue; o[a] = v; const t = tr(v); d[a] = t; if (t !== v) el.setAttribute(a, t); } }
  }
  function restore(root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) if (origT.has(n) && doneT.get(n) === n.nodeValue) { n.nodeValue = origT.get(n); doneT.delete(n); }
    for (const el of root.querySelectorAll(ATTRS.map(a => `[${a}]`).join(','))) { const o = origA.get(el), d = doneA.get(el); if (!o) continue;
      for (const a of ATTRS) if (o[a] != null && d[a] === el.getAttribute(a)) el.setAttribute(a, o[a]); origA.delete(el); doneA.delete(el); }
  }
  // nav: Vietnamese long label on desktop, short label in the phone tab bar
  const NAV = { overview: ['Tổng quan', 'Tổng'], sales: ['Doanh số', 'Bán'], profit: ['Lợi nhuận', 'Lãi'], customers: ['Khách hàng', 'Khách'], promos: ['Khuyến mãi', 'KM'], listings: ['Listing', 'Listing'], ads: ['Quảng cáo', 'QC'], quality: ['Sự cố & Hoàn', 'Sự cố'], inventory: ['Tồn kho & PO', 'Kho'] };
  function nav(vi) { document.querySelectorAll('.tabs button[data-tab]').forEach(b => { const v = NAV[b.dataset.tab]; if (!v) return;
    if (vi) { if (b.dataset.en == null) b.dataset.en = [...b.querySelectorAll('span')].map(x => x.outerHTML).join(''); b.querySelectorAll('span').forEach(x => x.remove()); b.insertAdjacentHTML('beforeend', `<span class="l" data-notr>${v[0]}</span><span class="s" data-notr>${v[1]}</span>`); }
    else if (b.dataset.en != null) { b.querySelectorAll('span').forEach(x => x.remove()); b.insertAdjacentHTML('beforeend', b.dataset.en); delete b.dataset.en; } }); }
  let queued = false;
  const mo = new MutationObserver(() => { if (lang !== 'vi' || queued) return; queued = true; requestAnimationFrame(() => { queued = false; mo.disconnect(); apply(document.body); observe(); }); });
  const observe = () => mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  function set(l) {
    lang = l; try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.lang = l; mo.disconnect();
    if (l === 'vi') { nav(true); apply(document.body); observe(); } else { restore(document.body); nav(false); }
    const b = document.getElementById('langBtn'); if (b) { b.querySelector('span').textContent = l === 'vi' ? 'VI' : 'EN'; b.setAttribute('title', l === 'vi' ? 'Chuyển sang English' : 'Switch to Tiếng Việt'); b.setAttribute('aria-label', b.getAttribute('title')); }
  }
  window.LG_I18N = { tr, set, get lang() { return lang; } };
  const init = () => { const b = document.getElementById('langBtn'); if (b) b.onclick = () => set(lang === 'vi' ? 'en' : 'vi'); set(lang); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
