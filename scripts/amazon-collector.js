/* Lignarc · Amazon collector
 * sellercentral.amazon.com tab:   await LGA.orders()   -> Seller Central orders (MFN + AFN), last 365 days
 * advertising.amazon.com tab:     await LGA.ads()      -> Sponsored Products campaigns (30 days) + daily account totals
 * Then LGA.send() and click the centred button once to hand the payload to the sync page.
 */
(() => {
'use strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function orders() {
  const now = Date.now(), from = now - 365 * 864e5, rows = [];
  for (const ft of ['mfn', 'afn']) {
    for (let off = 0; off < 5000; off += 100) {
      const q = `/orders-api/search?limit=100&offset=${off}&sort=order_date_desc&fulfillmentType=${ft}&orderStatus=all&forceOrdersTableRefreshTrigger=false&date-range=${from}-${now}` + (ft === 'mfn' ? '&mfnMultichannelSalesChannel=Amazon' : '');
      const j = await (await fetch(q, { credentials: 'include', headers: { accept: 'application/json' } })).json();
      for (const o of j.orders || []) {
        const d = new Date(o.orderDate * (o.orderDate < 1e12 ? 1000 : 1)).toISOString().slice(0, 10);
        for (const i of o.orderItems || []) rows.push([o.amazonOrderId, d, o.orderFulfillmentStatus || '', i.sellerSku, i.asin, i.quantityOrdered || i.quantityCanceled || 0, (i.unitPrice && (i.unitPrice.Amount ?? i.unitPrice.amount)) || 0, (i.productName || '').slice(0, 90), ft]);
      }
      if (!j.orders || j.orders.length < 100) break;
    }
  }
  return { v: 1, src: 'amazon-orders', at: Math.floor(Date.now() / 1000), orders: rows };
}
function hook(path, ms = 40000, re = /retrieveReport/) {
  return new Promise(res => {
    const f = document.createElement('iframe'); f.className = 'lgh'; f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    f.style.cssText = 'position:fixed;left:0;top:0;width:1440px;height:900px;opacity:.01;pointer-events:none;z-index:-1;border:0';
    const cap = []; let hooked = false; const t0 = Date.now(); f.src = path; document.body.appendChild(f);
    const tick = () => {
      try { const w = f.contentWindow; if (!hooked && w && w.location.href.includes(path) && w.fetch) { const of = w.fetch; w.fetch = async function (u, o) { const url = typeof u === 'string' ? u : u.url; const r = await of.apply(this, arguments); if (re.test(url)) r.clone().text().then(t => cap.push({ url, body: o && o.body, h: o && o.headers, resp: t })); return r; };
        const X = w.XMLHttpRequest.prototype, oo = X.open, os = X.send, sh = X.setRequestHeader; X.open = function (m, u) { this._u = u; this._h = []; return oo.apply(this, arguments); }; X.setRequestHeader = function (k, v) { this._h.push([k, v]); return sh.apply(this, arguments); }; X.send = function (b) { this.addEventListener('load', () => { if (re.test(this._u)) cap.push({ url: this._u, body: b, h: this._h, resp: this.responseText || '' }); }); return os.apply(this, arguments); }; hooked = true; } } catch (e) {}
      if (cap.some(c => /UnifiedCampaignReportSyncAPI/.test(String(c.body))) || Date.now() - t0 > ms) { res({ f, cap }); return; }
      setTimeout(tick, hooked ? 400 : 15);
    };
    tick();
  });
}
async function ads() {
  const { f, cap } = await hook('/campaign-manager/all-campaigns'); f.remove();
  const c = cap.find(c => /UnifiedCampaignReportSyncAPI/.test(String(c.body))); if (!c) throw new Error('campaign report call not captured');
  const b = JSON.parse(c.body), rc = b.reportConfig, end = new Date(Date.now() - 8 * 3600e3), start = new Date(end - 29 * 864e5);
  rc.startDate = start.toISOString().slice(0, 10); rc.endDate = end.toISOString().slice(0, 10);
  if (rc.filter && rc.filter.and && rc.filter.and[0] && rc.filter.and[0].field === 'state') rc.filter.and[0].values = ['ENABLED', 'PAUSED', 'ARCHIVED'];
  const h = (c.h instanceof Headers ? [...c.h.entries()] : Array.isArray(c.h) ? c.h : Object.entries(c.h || {})).filter(([k]) => !/content-length/i.test(k));
  const j = await (await fetch(c.url, { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify(b) })).json();
  const R = j.report || {}, D = (R.timeUnitsData && R.timeUnitsData.DAILY) || {};
  const camps = (R.data || []).map(x => [x.campaignId, x.campaignName, x.state, x.statusName || '', (x.startDate || '').slice(0, 10), x.campaignBudgetAmount || 0, x.impressions ?? null, x.clicks || 0, x.spend || 0, x.sales || 0, x.orders || 0]);
  const daily = (D.startDates || []).map((d, i) => [d.slice(0, 10), D.impressions ? D.impressions[i] : null, D.clicks ? D.clicks[i] || 0 : 0, D.spend ? D.spend[i] || 0 : 0, D.sales ? D.sales[i] || 0 : 0, D.orders ? D.orders[i] || 0 : 0]);
  return { v: 1, src: 'amazon-ads', at: Math.floor(Date.now() / 1000), camps, daily };
}
const SYNC_URL = 'https://khoimr11.github.io/Lignarc-Dashboard/sync.html';
function sendButton(payload) {
  return new Promise(resolve => {
    const id = Math.random().toString(36).slice(2); let w = null, posted = false;
    const b = document.createElement('button'); b.id = 'lg-send'; b.textContent = 'Lignarc · Gửi dữ liệu';
    b.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;padding:22px 38px;font:600 20px -apple-system,Segoe UI,sans-serif;background:#3d312d;color:#fff;border:0;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.35);cursor:pointer';
    const post = () => { if (w && !posted) { posted = true; w.postMessage({ type: 'lg-data', id, payload }, 'https://khoimr11.github.io'); b.textContent = 'Đang ghi dữ liệu…'; } };
    const onMsg = e => { if (e.origin !== 'https://khoimr11.github.io' || !e.data) return; if (e.data.type === 'lg-sync-ready') post(); if (e.data.type === 'lg-ack' && e.data.id === id) { removeEventListener('message', onMsg); b.remove(); window.LG_LAST_ACK = e.data; resolve(e.data); } };
    addEventListener('message', onMsg);
    b.onclick = () => { w = window.open(SYNC_URL, 'lgsync'); if (!w) { b.textContent = 'Cho phép pop-up rồi bấm lại'; return; } b.textContent = 'Đang mở trang đồng bộ…'; setTimeout(post, 8000); };
    document.body.appendChild(b);
  });
}
window.LGA = {
  async orders() { this.out = await orders(); return JSON.stringify({ orders: this.out.orders.length }); },
  async ads() { this.out = await ads(); return JSON.stringify({ camps: this.out.camps.length, days: this.out.daily.length, spend: this.out.camps.reduce((s, c) => s + c[8], 0) }); },
  send() { if (!this.out) throw new Error('collect first'); this.ack = sendButton(this.out); const r = document.getElementById('lg-send').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), vw: innerWidth, vh: innerHeight }); },
  part(i, n = 900) { return JSON.stringify(this.out).slice(i * n, (i + 1) * n); }
};
return 'LGA ready';
})();
