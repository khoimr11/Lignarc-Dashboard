/* LF Command Center — app (login, data loading, views, task actions) */
(() => {
'use strict';
const CFG = window.CC_CONFIG; { const q = new URLSearchParams(location.search).get('api'); if (q && /^https:\/\/script\.google\.com\//.test(q)) { try { localStorage.setItem('cc-api', q); } catch (e) {} history.replaceState(null, '', location.pathname); } if (!CFG.API_URL) { try { CFG.API_URL = localStorage.getItem('cc-api') || ''; } catch (e) {} } }
const PB = window.CCPB || { routines: [], messages: {}, meta: {} }, E = window.CCE;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} } };
const nfVN = new Intl.NumberFormat('vi-VN');
const vnd = v => nfVN.format(Math.round(v || 0)) + '₫';
const vndS = v => { const a = Math.abs(v || 0); return a >= 1e9 ? (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ' : a >= 1e6 ? (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr' : a >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v || 0)); };
const usd = v => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v || 0)).toLocaleString('en-US');
const pct = (v, d = 0) => v == null || !isFinite(v) ? '–' : (v * 100).toLocaleString('vi-VN', { maximumFractionDigits: d }) + '%';
const dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '–';
const dt = ts => { if (!ts) return '–'; const d = new Date(new Date(ts).getTime() + 7 * 36e5); return d.toISOString().slice(8, 10) + '/' + d.toISOString().slice(5, 7) + ' ' + d.toISOString().slice(11, 16); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hexd = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const OWN = E.OWNERS, SEVN = { P0: 'Critical', P1: 'High', P2: 'Medium', P3: 'Low' };
const isDemo = /[?&]demo=1/.test(location.search);

/* ---------------- crypto & loading ---------------- */
async function sha16(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); }
async function kek(email, pass, salt, iter) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(email.trim().toLowerCase() + '\n' + pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(salt), iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); }
async function openWith(raw, file) { const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(file.iv) }, k, b64d(file.ct)))); }
async function api(op, body = {}) {
  if (isDemo) return demoApi(op, body);
  if (!CFG.API_URL) return { ok: false, err: 'Chưa cấu hình backend giao việc (API_URL)' };
  const r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ op, tok: S.me.tok, ...body }) });
  return r.json();
}
async function login(email, pass) {
  if (!CFG.API_URL) throw new Error('Chưa cấu hình backend. Mở setup.html để thiết lập lần đầu.');
  const r = await (await fetch(CFG.API_URL + '?op=vault', { cache: 'no-store' })).json();
  const V = r.vault; if (!V) throw new Error('Chưa có tài khoản. Mở setup.html để thiết lập.');
  const h = await sha16('lfcc|' + email.trim().toLowerCase()), slot = V.users.find(u => u.h === h); if (!slot) throw new Error('bad');
  try { const k = await kek(email, pass, slot.salt, V.iter || 250000); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(slot.iv) }, k, b64d(slot.ct)))); }
  catch (e) { throw new Error('bad'); }
}
async function loadSources(me) {
  const out = { G: null, L: null, gErr: null, lErr: null, gUpd: null, lUpd: null };
  if (isDemo) { const d = window.CCDEMO(); out.G = d.G; out.L = d.L; return out; }
  const job = async (url, fn) => { const r = await fetch(url + '?ts=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const f = await r.json(); return { data: await fn(f), upd: f.updated }; };
  await Promise.all([
    me.lg ? job(CFG.SRC_GLOBAL, f => openWith(b64d(me.lg), f)).then(x => { out.G = x.data; out.gUpd = x.upd; }).catch(e => { out.gErr = String(e.message || e); }) : null,
    me.lf ? job(CFG.SRC_LOCAL, f => openWith(hexd(me.lf), f)).then(x => { out.L = x.data; out.lUpd = x.upd; }).catch(e => { out.lErr = String(e.message || e); }) : null
  ]);
  return out;
}

/* ---------------- demo backend (localStorage) ---------------- */
function demoApi(op, body) {
  const evs = JSON.parse(store.get('cc-demo-ev') || '[]');
  if (op === 'events.list') return { ok: true, events: S.me.role === 'manager' ? evs : evs.filter(e => e.channel === S.me.channel || e.user === S.me.id) };
  if (op === 'snaps.list') return { ok: true, snaps: [] };
  if (op === 'snapshot') return { ok: true };
  if (op === 'event.add') { const ev = { id: evs.length + 1, ts: new Date().toISOString(), user: S.me.id, role: S.me.role, channel: S.me.role === 'manager' ? (body.ev.channel || '') : S.me.channel, op: body.ev.op, ref: body.ev.ref, data: body.ev.data || {} }; evs.push(ev); store.set('cc-demo-ev', JSON.stringify(evs)); return { ok: true, ev }; }
  return { ok: false };
}
const DEMO_USERS = { manager: { id: 'nhi', name: 'Uyên Nhi', role: 'manager', channel: '', lg: 1, lf: 1 }, trang: { id: 'trang', name: OWN.trang.name, role: 'staff', channel: 'global', lg: 1 }, phu: { id: 'phu', name: OWN.phu.name, role: 'staff', channel: 'local', lf: 1 } };

/* ---------------- state ---------------- */
const S = { me: null, tab: 'brief', src: null, G: null, L: null, issues: [], led: null, rout: [], events: [], snaps: [], f: { ch: 'all', sev: new Set(), owner: 'all', unassigned: false, kind: 'all' }, fx: +(store.get('cc-fx') || CFG.FX) };
const isMgr = () => S.me && S.me.role === 'manager';
const myOwner = () => S.me.channel === 'global' ? 'trang' : S.me.channel === 'local' ? 'phu' : null;

async function compute() {
  const src = S.src, me = S.me;
  try { S.G = src.G ? E.modelGlobal(src.G, { updated: src.gUpd }) : null; } catch (e) { S.G = null; src.gErr = 'Lỗi mô hình: ' + e.message; }
  try { S.L = src.L ? E.modelLocal(src.L, E.LOCAL_PLAN, { updated: src.lUpd }) : null; } catch (e) { S.L = null; src.lErr = 'Lỗi mô hình: ' + e.message; }
  const closedKeys = new Set(E.ledger(S.events, [], []).tasks.filter(t => t.state === 'closed').map(t => t.issueKey));
  let iss = E.detect(S.G, S.L, { fx: S.fx, closedKeys, globalErr: me.lg ? src.gErr : null, localErr: me.lf ? src.lErr : null });
  if (!isMgr()) iss = iss.filter(i => i.owner === myOwner() || (i.channel === me.channel));
  for (const i of iss) { const m = PB.meta[i.rule]; if (m) { i.why = i.why || m.why; i.pbSteps = m.steps; } }
  S.issues = iss;
  S.led = E.ledger(S.events, S.issues, S.snaps);
  const defs = (PB.routines.length ? PB.routines : E.ROUTINES).filter(r => isMgr() || r.owner === myOwner());
  S.rout = E.routines(defs, S.issues, S.events);
}
async function loadEvents() {
  const r = await api('events.list'); S.events = r.ok ? r.events : []; S.apiErr = r.ok ? null : r.err;
  const s = await api('snaps.list'); S.snaps = s.ok ? s.snaps : [];
}
async function snapshotOncePerDay(force) {
  if (!isMgr() || isDemo) return; const k = 'cc-snap-' + E.todayVN(); if (store.get(k) && !force) return;
  const snap = { at: new Date().toISOString(), keys: S.issues.map(i => i.key), issues: S.issues.filter(i => i.kind === 'issue').map(i => ({ sev: i.effSev, owner: OWN[i.owner] ? OWN[i.owner].short : i.owner, title: i.title, age: i.age })), brief: briefLines().map(x => x.replace(/<[^>]+>/g, '')) };
  const r = await api('snapshot', { snap }); if (r.ok) store.set(k, '1'); return { ok: r.ok, issues: snap.keys.length, p0: S.issues.filter(i => i.effSev === 'P0').length };
}
// For an automated run (e.g. a scheduled task in Chrome after the afternoon syncs): reload sources, recompute, store today's snapshot for the 08:15 email.
window.CC_SNAPSHOT = async () => { if (!S.me) return { ok: false, err: 'not logged in' }; S.src = await loadSources(S.me); await loadEvents(); await compute(); render(); return snapshotOncePerDay(true); };

/* ---------------- small UI helpers ---------------- */
const sevTag = s => `<span class="sev ${s}" title="${SEVN[s]}">${s}</span>`;
const kpi = (label, val, meta = '', info = '') => `<div class="kpi card glass"><div class="lbl"><span>${label}</span>${info ? `<span class="info" title="${esc(info)}">i</span>` : ''}</div><div class="val">${val}</div><div class="meta">${meta}</div></div>`;
const card = (title, sub, body, extra = '') => `<section class="card glass"><div class="card-head"><div><h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${extra}</div>${body}</section>`;
const delta = (a, b, inv) => { if (!b) return ''; const d = (a - b) / Math.abs(b); const up = d >= 0; return `<span class="delta ${Math.abs(d) < .005 ? 'flat' : (up !== !!inv) ? 'up' : 'down'}">${up ? '▲' : '▼'} ${pct(Math.abs(d))}</span>`; };
const bar = (p, color) => `<div class="bar-track"><i style="width:${Math.max(0, Math.min(100, p * 100)).toFixed(1)}%;${color ? 'background:' + color : ''}"></i></div>`;
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
function modal(html, bind) { const root = $('#modalRoot'); root.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="box glass">${html}</div></div>`; const m = root.firstChild; m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) root.innerHTML = ''; }); if (bind) bind(m); const f = m.querySelector('input,textarea,select'); if (f) setTimeout(() => f.focus(), 30); return m; }
const closeModal = () => { $('#modalRoot').innerHTML = ''; };
async function copy(t) { try { await navigator.clipboard.writeText(t); toast('Đã copy tin nhắn — dán vào Zalo'); } catch (e) { toast('Không copy được, hãy chọn và copy thủ công'); } }
function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m); }
const ageTxt = i => i.age == null ? '' : i.age === 0 ? 'hôm nay' : i.age + ' ngày';
const ownerName = id => OWN[id] ? OWN[id].short : id;

/* ---------------- brief lines ---------------- */
function briefLines() {
  const out = [], G = S.G, L = S.L, iss = S.issues.filter(i => i.kind === 'issue');
  if (G) out.push(`<b>Global:</b> doanh thu MTD ${usd(G.mtd.rev)}${G.tgt.rev ? ` = <b>${pct(G.mtd.rev / G.pace)}</b> tiến độ target, dự phóng ${usd(G.proj)} / ${usd(G.tgt.rev)}` : ''} · margin 30 ngày ${pct(G.l30.margin, 1)} · % Mkt ${pct(G.l30.mktPct, 1)}.`);
  if (L) out.push(`<b>Local:</b> ${L.mtd.units}/${L.tgtUnits || '–'} kệ tháng này = <b>${L.paceUnits ? pct(L.mtd.units / L.paceUnits) : '–'}</b> tiến độ, dự phóng ${Math.round(L.projUnits)} kệ · thực thu ${vnd(L.l30.unitNet)}/kệ (target ${vnd(L.plan.netPerUnit)}) · kho còn ~${L.whStock} kệ.`);
  const p0 = iss.filter(i => i.effSev === 'P0').length, od = S.led ? S.led.tasks.filter(t => t.overdue).length : 0, miss = iss.filter(i => i.missReport).length, un = iss.filter(i => !i.task && (i.effSev === 'P0' || i.effSev === 'P1')).length;
  out.push(`<b>Việc:</b> ${p0} issue Critical · ${un} issue P0/P1 chưa giao · ${od} việc quá hạn · <b>${miss}</b> issue nghiêm trọng nhân viên chưa báo.`);
  return out;
}

/* ---------------- views ---------------- */
const TABS_M = [['brief', 'Tổng quan', 'M4 13h6V4H4zm0 7h6v-5H4zm10 0h6v-9h-6zm0-16v5h6V4z'], ['perf', 'Hiệu suất', 'M4 19V9m5 10V5m5 14v-7m5 7V8'], ['radar', 'Issue Radar', 'M12 3 2.5 20h19L12 3zm0 6v5m0 3v.5'], ['tasks', 'Giao việc', 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'], ['team', 'Nhân sự', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'], ['routine', 'Định kỳ', 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z']];
const TABS_S = [['brief', 'Tổng quan', TABS_M[0][2]], ['radar', 'Issue của tôi', TABS_M[2][2]], ['tasks', 'Việc được giao', TABS_M[3][2]], ['routine', 'Định kỳ', TABS_M[5][2]], ['team', 'Điểm của tôi', TABS_M[4][2]]];
function renderTabs() {
  const T = isMgr() ? TABS_M : TABS_S, badge = { radar: S.issues.filter(i => i.effSev === 'P0' && i.kind === 'issue').length, tasks: S.led.tasks.filter(t => isMgr() ? t.state === 'review' || t.overdue : t.state !== 'closed').length };
  $('#tabs').innerHTML = T.map(([k, l, d]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg><span class="l">${l}</span>${badge[k] ? `<b class="sev P0" style="min-width:20px;height:18px;font-size:10.5px">${badge[k]}</b>` : ''}</button>`).join('');
}
function render() {
  renderTabs();
  const v = { brief: viewBrief, perf: viewPerf, radar: viewRadar, tasks: viewTasks, team: viewTeam, routine: viewRoutine }[S.tab] || viewBrief;
  $('#view').innerHTML = v(); bindView();
}
function freshPill(label, iso, err) {
  if (err) return `<span class="pill crit"><i></i>${label}: lỗi đọc dữ liệu</span>`;
  if (!iso) return `<span class="pill muted"><i></i>${label}: –</span>`;
  const h = (Date.now() - Date.parse(iso)) / 36e5; return `<span class="pill ${h > 26 ? 'crit' : h > 20 ? 'warn' : 'good'}"><i></i>${label}: cập nhật ${dt(iso)}</span>`;
}
function issueRow(i, compact) {
  const mgr = isMgr(), t = i.task;
  const tags = [i.kind === 'opportunity' ? '<span class="tag good">Cơ hội</span>' : '', i.missReport ? '<span class="tag bad">Miss báo cáo</span>' : '', i.slaBreached ? `<span class="tag bad">Quá SLA ${i.sla * 24}h${i.effSev !== i.sev ? ' → nâng ' + i.sev + '→' + i.effSev : ''}</span>` : '', t ? `<span class="tag">${esc(t.id)} · ${t.state === 'review' ? 'chờ duyệt' : 'đã giao'}</span>` : '', i.ackAt ? `<span class="tag good">NV đã nắm ${dt(i.ackAt)}</span>` : ''].join('');
  const steps = (i.steps || []).map(s => `<li>${esc(s)}</li>`).join('');
  const acts = mgr ? `${t ? `<button class="btn ghost" data-goto="tasks">Xem việc</button>` : `<button class="btn pri" data-assign="${esc(i.key)}">Giao việc</button>`}${!t ? `<button class="btn ghost" data-dismiss="${esc(i.key)}" title="Bỏ qua (ghi log lý do)">Bỏ qua</button>` : ''}`
    : `${!i.ackAt && !t ? `<button class="btn pri" data-ack="${esc(i.key)}">Em đã nắm</button>` : ''}`;
  return `<article class="issue${compact ? ' compact' : ''}"><div>${sevTag(i.effSev)}</div><div><h4>${esc(i.title)}</h4>
    <div class="meta"><span>${i.channel === 'global' ? 'Global' : i.channel === 'local' ? 'Local' : 'Hệ thống'}</span>·<span>${esc(ownerName(i.owner))}</span>${ageTxt(i) ? `·<span>tồn ${ageTxt(i)}</span>` : ''}${i.sla ? `·<span>SLA ${i.sla * 24}h</span>` : ''}${i.impactVnd ? `·<span>ảnh hưởng ~${vndS(i.impactVnd)}₫</span>` : ''}${tags}</div>
    ${i.detail && !compact ? `<div class="det">${esc(i.detail)}</div>` : ''}</div><div class="acts">${acts}</div>
    ${compact ? '' : `<details><summary>Next steps · điều kiện đóng</summary>${i.why ? `<p class="why"><b>Vì sao:</b> ${esc(i.why)}</p>` : ''}<ol>${steps}</ol><p class="why"><b>Tự đóng khi:</b> ${esc(i.closeWhen || '')}</p><p class="why" style="font-size:11.5px;color:var(--muted)">Mã luật ${esc(i.rule)}</p></details>`}</article>`;
}

function viewBrief() {
  const G = S.G, L = S.L, iss = S.issues, hello = new Date().getHours() < 11 ? 'Chào buổi sáng' : 'Xin chào';
  const top = iss.filter(i => !i.task && i.kind === 'issue').slice(0, 6), opp = iss.filter(i => i.kind === 'opportunity').slice(0, 3);
  const cards = S.led.cards, miss = iss.filter(i => i.missReport).length;
  const kp = [];
  if (G) kp.push(kpi('Global · Doanh thu MTD', usd(G.mtd.rev), `${G.tgt.rev ? pct(G.mtd.rev / G.tgt.rev) + ' target tháng · tiến độ ' + pct(G.mtd.rev / G.pace) : 'chưa có target'}${G.tgt.rev ? bar(G.mtd.rev / G.tgt.rev) : ''}`, 'Base cost × units, như dash Lignarc. Target: Cashflow 26+27'));
  if (G) kp.push(kpi('Global · Margin 30 ngày', pct(G.l30.margin, 1), `Profit ${usd(G.l30.profit)} ${delta(G.l30.profit, G.p30.profit)}`, 'Profit ÷ Revenue, sau COGS, phí, deduction, ads'));
  if (L) kp.push(kpi('Local · Kệ bán tháng này', `${L.mtd.units}<small>/ ${L.tgtUnits || '–'}</small>`, `tiến độ ${L.paceUnits ? pct(L.mtd.units / L.paceUnits) : '–'} · NMV ${vndS(L.mtd.nmv)}₫${L.tgtUnits ? bar(L.mtd.units / L.tgtUnits) : ''}`, 'Đơn không hủy. Target theo kế hoạch 2.700 kệ'));
  if (L) kp.push(kpi('Local · Thực thu / kệ', vnd(L.l30.unitNet), `target ${vnd(L.plan.netPerUnit)} · giá sàn ${vnd(L.plan.floorPrice)}`, '(Giá bán − voucher shop − phí sàn) ÷ số kệ, 30 ngày'));
  const nP0 = iss.filter(i => i.effSev === 'P0' && i.kind === 'issue').length, nP1 = iss.filter(i => i.effSev === 'P1' && i.kind === 'issue').length, od = S.led.tasks.filter(t => t.overdue).length, rv = S.led.tasks.filter(t => t.state === 'review').length;
  return `<div class="page-head"><div><h1>${hello}, ${esc(isMgr() ? 'chị ' + S.me.name.split(' ').pop() : S.me.name.split(' ').pop())}</h1><p>${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <div class="fresh">${S.me.lg ? freshPill('Lignarc', S.G && S.G.updatedAt, S.src.gErr) : ''}${S.me.lf ? freshPill('Shopee', S.L && S.L.updatedAt, S.src.lErr) : ''}${S.apiErr ? `<span class="pill warn"><i></i>Sổ giao việc: ${esc(S.apiErr)}</span>` : ''}</div></div>
  <section class="card glass"><h3>Tóm tắt sáng nay</h3><div class="brief-lines">${briefLines().map(x => `<div>${x}</div>`).join('')}</div></section>
  <div class="grid g-kpi">${kp.join('')}</div>
  <div class="grid g-kpi">${kpi('Issue Critical (P0)', `<span style="color:var(--crit-ink)">${nP0}</span>`, `${nP1} High (P1)`)}${kpi('Việc quá hạn', String(od), `${S.led.tasks.filter(t => t.state !== 'closed').length} việc đang mở`)}${kpi(isMgr() ? 'Chờ chị duyệt' : 'Chờ chị duyệt', String(rv), 'Nhân viên báo xong, cần đối chiếu')}${kpi('Miss báo cáo', `<span style="color:${miss ? 'var(--crit-ink)' : 'inherit'}">${miss}</span>`, 'Issue P0/P1 quá 24h nhân viên chưa báo')}</div>
  <div class="grid g-21">
    ${card('Cần quyết ngay', 'Issue chưa giao, xếp theo mức độ × tiền bị ảnh hưởng × số ngày tồn', top.length ? top.map(i => issueRow(i, true)).join('') : '<div class="empty2">Không có issue mở 🎉</div>', `<button class="btn ghost" data-goto="radar">Xem tất cả ${iss.length}</button>`)}
    <div class="grid" style="align-content:start">
      ${isMgr() ? ['trang', 'phu'].map(id => { const c = cards[id]; return card(esc(c.name), id === 'trang' ? 'Global · Wayfair / Amazon' : 'Local · Shopee', `<div class="score"><div class="ring2" style="--p:${c.score};--c:${c.score >= 80 ? 'var(--good)' : c.score >= 60 ? 'var(--warn)' : 'var(--crit)'}"><div><b>${c.score}</b><span>/ 100</span></div></div><div class="statgrid" style="grid-template-columns:repeat(2,1fr)"><div class="stat ${c.p0 ? 'bad' : ''}"><b>${c.p0}</b><span>Issue P0</span></div><div class="stat ${c.overdue ? 'bad' : ''}"><b>${c.overdue}</b><span>Việc quá hạn</span></div><div class="stat ${c.missReport ? 'bad' : ''}"><b>${c.missReport}</b><span>Miss báo cáo</span></div><div class="stat"><b>${c.onTimeRate == null ? '–' : pct(c.onTimeRate)}</b><span>Đúng hạn</span></div></div></div>`, `<button class="btn ghost" data-goto="team">Chi tiết</button>`); }).join('') : ''}
      ${opp.length ? card('Cơ hội', 'Hệ thống gợi ý để tăng trưởng', opp.map(i => issueRow(i, true)).join('')) : ''}
    </div>
  </div>`;
}

function vbars(rows, fmt) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.a, r.t)));
  return `<div class="vbars">${rows.map(r => `<div class="m" title="${esc(r.l)} · thực tế ${fmt(r.a)} · target ${fmt(r.t)}${r.t ? ' · ' + pct(r.a / r.t) : ''}"><span class="pc">${r.t && r.a ? pct(r.a / r.t) : ''}</span><div class="bar" style="height:${r.a / max * 140}px;${r.future ? 'opacity:.35' : ''}"></div>${r.t ? `<div class="tg" style="bottom:${r.t / max * 140}px"></div>` : ''}<span class="lb">${esc(r.l)}</span></div>`).join('')}</div><div class="legend2"><span><i style="background:var(--s1)"></i>Thực tế</span><span><i style="border-top:2px dashed var(--ink2);height:0;border-radius:0"></i>Target</span></div>`;
}
function viewPerf() {
  const G = S.G, L = S.L, fx = S.fx, out = [];
  // combined P&L (VND)
  if (G || L) {
    const gRev = G ? G.mtd.rev * fx : 0, gProfit = G ? G.mtd.profit * fx : 0;
    const rentMtd = L ? L.plan.rent * L.dNow / L.dIn : 0, lNet = L ? L.mtd.net : 0, lNetRev = lNet - rentMtd, lProfit = lNetRev * 0.97;
    const lTgtUnits = L ? L.tgtUnits : 0;
    out.push(`<div class="page-head"><div><h1>Hiệu suất hợp nhất</h1><p>Tháng ${new Date().getMonth() + 1} đến hôm nay · quy đổi $1 = ${nfVN.format(fx)}₫ (đổi trong Cài đặt)</p></div></div>
    <div class="grid g-kpi">${kpi('Doanh thu 2 kênh (MTD)', vndS(gRev + (L ? L.mtd.nmv : 0)) + '₫', `Global ${vndS(gRev)}₫ · Local ${vndS(L ? L.mtd.nmv : 0)}₫`, 'Global: Revenue (base cost) × tỷ giá. Local: NMV')}
      ${kpi('Lợi nhuận 2 kênh (MTD)', vndS(gProfit + lProfit) + '₫', `Global ${vndS(gProfit)}₫ · Local ${vndS(lProfit)}₫`, 'Global: profit sau COGS, phí, deduction, ads. Local: theo bảng target = thực nhận − thuê kho phân bổ − 3% commission (chưa gồm COGS)')}
      ${G ? kpi('Global · % Mkt fee 30 ngày', pct(G.l30.mktPct, 1), `TACoS ${pct(G.l30.tacos, 1)} · ROAS 7 ngày ${G.l7.roas ? G.l7.roas.toFixed(2) : '–'}`) : ''}
      ${L ? kpi('Local · Phí sàn 30 ngày', pct(L.l30.take, 1), `Hủy ${pct(L.l30.cxRate)} · trả hàng ${pct(L.l30.retRate)} · FS ${pct(L.l30.fsShare)} NMV`) : ''}</div>`);
  }
  if (G) {
    const m = G.months.filter(x => x.m <= G.ym || x.tgt).slice(-8);
    out.push(`<div class="grid g-21">${card('Global · Revenue vs target theo tháng', 'Cashflow 26+27 · USD', vbars(m.map(x => ({ l: 'T' + (+x.m.slice(5, 7)), a: x.act.rev, t: x.tgt, future: x.m > G.ym })), usd))}
      ${card('Global · MTD', `so với cùng kỳ 30 ngày trước`, `<table class="t"><tr><th>Chỉ số</th><th class="r">MTD</th><th class="r">Target</th><th class="r">30 ngày</th></tr>
        <tr><td>Revenue</td><td class="r">${usd(G.mtd.rev)}</td><td class="r">${usd(G.tgt.rev)}</td><td class="r">${usd(G.l30.rev)} ${delta(G.l30.rev, G.p30.rev)}</td></tr>
        <tr><td>NMV</td><td class="r">${usd(G.mtd.net)}</td><td class="r">–</td><td class="r">${usd(G.l30.net)} ${delta(G.l30.net, G.p30.net)}</td></tr>
        <tr><td>Units</td><td class="r">${G.mtd.units}</td><td class="r">${G.tgt.unit || '–'}</td><td class="r">${G.l30.units} ${delta(G.l30.units, G.p30.units)}</td></tr>
        <tr><td>Profit</td><td class="r">${usd(G.mtd.profit)}</td><td class="r">${usd(G.tgt.profit)}</td><td class="r">${usd(G.l30.profit)} ${delta(G.l30.profit, G.p30.profit)}</td></tr>
        <tr><td>Margin</td><td class="r">${pct(G.mtd.margin, 1)}</td><td class="r">${G.tgt.rev ? pct(G.tgt.profit / G.tgt.rev, 1) : '–'}</td><td class="r">${pct(G.l30.margin, 1)}</td></tr>
        <tr><td>% Mkt fee</td><td class="r">${pct(G.mtd.mktPct, 1)}</td><td class="r">${G.tgt.rev ? pct(G.tgt.mkt / G.tgt.rev, 1) : '–'}</td><td class="r">${pct(G.l30.mktPct, 1)}</td></tr>
        <tr><td>Returns + Incidents</td><td class="r">${usd(G.mtd.returns + G.mtd.incidents)}</td><td class="r">–</td><td class="r">${usd(G.l30.returns + G.l30.incidents)}</td></tr></table>
        <p class="sub" style="margin-top:10px"><a href="${CFG.DASH_GLOBAL}" target="_blank" rel="noopener">Mở dash Lignarc ↗</a></p>`)}</div>`);
    out.push(card('Global · Tồn kho CastleGate & đồng hồ lưu kho', 'Cover = tồn ÷ tốc độ bán 30 ngày', `<div class="tw"><table class="t"><tr><th>SKU</th><th class="r">Tồn</th><th class="r">Bán 30N</th><th class="r">Cover (ngày)</th><th>Bán gần nhất</th></tr>${G.inv.filter(r => r.onHand || r.sold30).sort((a, b) => (a.coverDays ?? 1e9) - (b.coverDays ?? 1e9)).map(r => `<tr><td><b>${esc(r.part)}</b></td><td class="r">${r.onHand}</td><td class="r">${r.sold30}</td><td class="r">${r.coverDays == null ? '∞' : Math.round(r.coverDays)}</td><td>${dmy(r.lastSale)}</td></tr>`).join('')}</table></div>
      ${G.storage.length ? `<p class="sub" style="margin-top:10px">${G.storage.map(s => `<b>${esc(s.po)}</b>: nhận ${dmy(s.recv)} · hết miễn phí ${dmy(s.end)} (${s.daysLeft >= 0 ? 'còn ' + s.daysLeft : 'quá ' + -s.daysLeft} ngày) · còn ${s.units} units`).join('<br>')}</p>` : ''}`));
  }
  if (L) {
    out.push(`<div class="grid g-21">${card('Local · Kệ bán vs kế hoạch theo tháng', 'Kế hoạch 2.700 kệ (T11/2026 → T5/2027)', vbars(L.months.map(x => ({ l: 'T' + (+x.m.slice(5, 7)), a: x.act.units, t: x.tgt, future: x.m > L.ym })), v => Math.round(v) + ' kệ'))}
      ${card('Local · Kế hoạch vs thực tế', 'Theo bảng target kệ 3 tầng', `<table class="t"><tr><th>Chỉ số</th><th class="r">Thực tế</th><th class="r">Kế hoạch</th></tr>
        <tr><td>Kệ bán tháng này</td><td class="r">${L.mtd.units}</td><td class="r">${L.tgtUnits} (tiến độ ${Math.round(L.paceUnits)})</td></tr>
        <tr><td>Dự phóng cuối tháng</td><td class="r">${Math.round(L.projUnits)}</td><td class="r">${L.tgtUnits}</td></tr>
        <tr><td>Luỹ kế từ T11</td><td class="r">${L.soldSince}</td><td class="r">${Math.round(L.planCum)}</td></tr>
        <tr><td>Tồn kho Suối Nghệ (ước tính)</td><td class="r">${L.whStock}</td><td class="r">${L.months.find(m => m.m === L.ym) ? L.months.find(m => m.m === L.ym).endStock + ' cuối tháng' : '–'}</td></tr>
        <tr><td>Giá bán TB / kệ</td><td class="r">${vnd(L.l30.asp)}</td><td class="r">≥ ${vnd(L.plan.floorPrice)}</td></tr>
        <tr><td>Thực thu / kệ</td><td class="r">${vnd(L.l30.unitNet)}</td><td class="r">${vnd(L.plan.netPerUnit)}</td></tr>
        <tr><td>Phí sàn % NMV</td><td class="r">${pct(L.l30.take, 1)}</td><td class="r">~25%</td></tr>
        <tr><td>Ads Shopee % NMV</td><td class="r">${pct(L.l30.nmv ? L.l30.adCost / L.l30.nmv : null, 1)}</td><td class="r">4%</td></tr>
        <tr><td>Thuê kho / kệ (tháng này)</td><td class="r">${L.rentPerUnit ? vnd(L.rentPerUnit) : '–'}</td><td class="r">20tr/tháng</td></tr></table>
        <p class="sub" style="margin-top:10px"><a href="${CFG.DASH_LOCAL}" target="_blank" rel="noopener">Mở dash Kệ 3 tầng ↗</a></p>`)}</div>`);
  }
  return out.join('') || '<div class="empty2">Chưa có dữ liệu kênh nào</div>';
}

function filteredIssues() {
  const f = S.f;
  return S.issues.filter(i => (f.ch === 'all' || i.channel === f.ch) && (!f.sev.size || f.sev.has(i.effSev)) && (f.owner === 'all' || i.owner === f.owner) && (!f.unassigned || !i.task) && (f.kind === 'all' || i.kind === f.kind));
}
function viewRadar() {
  const f = S.f, list = filteredIssues(), mgr = isMgr();
  const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${f[key] === v}">${l}</button>`).join('')}</div>`;
  const groups = ['P0', 'P1', 'P2', 'P3'].map(s => [s, list.filter(i => i.effSev === s)]).filter(g => g[1].length);
  return `<div class="page-head"><div><h1>${mgr ? 'Issue Radar' : 'Issue của tôi'}</h1><p>${S.issues.length} issue & cơ hội do hệ thống tự phát hiện từ dữ liệu sàn · tuổi tính từ lúc sự việc xảy ra trên sàn</p></div></div>
  <div class="toolbar">${mgr ? seg('ch', [['all', 'Tất cả'], ['global', 'Global'], ['local', 'Local'], ['system', 'Hệ thống']]) : ''}
    <div class="chips">${['P0', 'P1', 'P2', 'P3'].map(s => `<button class="chip" data-sevf="${s}" aria-pressed="${f.sev.has(s)}">${s} · ${S.issues.filter(i => i.effSev === s).length}</button>`).join('')}</div>
    ${seg('kind', [['all', 'Tất cả'], ['issue', 'Vấn đề'], ['opportunity', 'Cơ hội']])}
    ${mgr ? `<button class="chip" data-unas aria-pressed="${f.unassigned}">Chỉ chưa giao</button>` : ''}</div>
  ${groups.map(([s, is]) => `<div><div class="group-h">${sevTag(s)} ${SEVN[s]} · ${is.length}</div>${is.map(i => issueRow(i)).join('')}</div>`).join('') || '<section class="card glass"><div class="empty2">Không có issue phù hợp bộ lọc</div></section>'}`;
}

function taskCard(t) {
  const mgr = isMgr(), o = OWN[t.owner] || { short: t.owner };
  const flag = t.flag === 'warning' ? '<span class="tag bad">Cảnh cáo · lần ' + t.recurrence + '</span>' : t.flag === 'remind' ? '<span class="tag warn">Nhắc nhở</span>' : '';
  const dataOk = t.state !== 'closed' && t.dataResolved ? '<span class="tag good">✓ Dữ liệu xác nhận đã xử lý</span>' : (t.state === 'review' && t.live ? '<span class="tag bad">Báo xong nhưng dữ liệu vẫn còn lỗi</span>' : '');
  let acts = '';
  if (t.state !== 'closed') {
    if (mgr) acts = `${t.state === 'review' || t.dataResolved ? `<button class="btn pri" data-approve="${esc(t.id)}">Duyệt đóng</button>` : ''}<button class="btn" data-remind="${esc(t.id)}">Nhắc nhở</button>${t.recurrence >= 2 || t.reminds ? `<button class="btn danger" data-warn="${esc(t.id)}">Cảnh cáo</button>` : ''}<button class="btn ghost" data-deadline="${esc(t.id)}">Gia hạn</button><button class="btn ghost" data-msg="${esc(t.id)}">Tin nhắn giao</button>`;
    else acts = `${!t.ackAt && t.state !== 'review' ? `<button class="btn pri" data-tack="${esc(t.id)}">Nhận việc</button>` : ''}<button class="btn" data-progress="${esc(t.id)}">Cập nhật</button>${t.state !== 'review' ? `<button class="btn pri" data-done="${esc(t.id)}">Báo hoàn thành</button>` : ''}`;
  } else if (mgr) acts = `<button class="btn ghost" data-reopen="${esc(t.id)}">Mở lại</button>${!t.praised && t.closeHow !== 'dismissed' ? `<button class="btn ghost" data-praise="${esc(t.id)}">Ghi nhận</button>` : ''}`;
  const hist = t.history.map(e => `<li>${dt(e.ts)} · ${esc(e.user)} · ${esc({ assign: 'giao việc', ack: 'nhận việc', progress: 'cập nhật', done: 'báo hoàn thành', approve: 'duyệt đóng', reopen: 'mở lại', remind: 'nhắc nhở', warn: 'cảnh cáo', deadline: 'gia hạn', praise: 'ghi nhận', dismiss: 'huỷ', note: 'ghi chú' }[e.op] || e.op)}${e.data && e.data.note ? ': ' + esc(e.data.note) : ''}${e.data && /^https?:\/\//.test(e.data.link || '') ? ` <a href="${esc(e.data.link)}" target="_blank" rel="noopener">bằng chứng ↗</a>` : ''}${e.data && e.data.due && e.op === 'deadline' ? ' → ' + dmy(e.data.due) : ''}</li>`).join('');
  return `<div class="task ${t.overdue ? 'over' : ''}"><div class="row">${sevTag(t.effSev)}<span>${esc(t.id)}</span>${flag}</div><b class="t">${esc(t.title)}</b>
    <div class="row"><span>${esc(o.short)}</span>·<span>hạn ${dmy(t.due)}${t.overdue ? ` <b style="color:var(--crit-ink)">(trễ ${t.daysOver} ngày)</b>` : ''}</span>${t.reminds ? `·<span>${t.reminds} lần nhắc</span>` : ''}</div>
    ${dataOk ? `<div class="row">${dataOk}</div>` : ''}
    ${t.closeWhen ? `<div class="row" style="color:var(--ink2)">Đóng khi: ${esc(t.closeWhen)}</div>` : ''}
    <div class="acts">${acts}</div><details><summary class="sub" style="cursor:pointer">Lịch sử (${t.history.length})</summary><ul class="hist">${hist}</ul></details></div>`;
}
function viewTasks() {
  const ts = S.led.tasks, recentClosed = ts.filter(t => t.state === 'closed' && t.closedAt && Date.now() - Date.parse(t.closedAt) < 21 * 864e5);
  const cols = [['Quá hạn', ts.filter(t => t.overdue)], ['Đã giao', ts.filter(t => t.state === 'open' && !t.overdue)], ['Đang làm', ts.filter(t => t.state === 'doing' && !t.overdue)], ['Chờ duyệt', ts.filter(t => t.state === 'review' && !t.overdue)], ['Đã đóng (21 ngày)', recentClosed]];
  return `<div class="page-head"><div><h1>${isMgr() ? 'Giao việc & theo dõi' : 'Việc được giao'}</h1><p>Mọi thao tác được ghi vào nhật ký có giờ máy chủ, không sửa/xoá được. Việc chỉ đóng khi chị duyệt — ưu tiên khi dữ liệu đã xác nhận.</p></div></div>
  ${S.apiErr ? `<div class="alert warn"><span class="ic">!</span><div><b>Sổ giao việc chưa kết nối</b><span>${esc(S.apiErr)}</span></div></div>` : ''}
  <div class="kanban">${cols.map(([h, l]) => `<div class="col glass"><h3><span>${h}</span><span>${l.length}</span></h3>${l.sort((a, b) => E.SEV.indexOf(b.effSev) - E.SEV.indexOf(a.effSev)).map(taskCard).join('') || '<div class="empty2" style="padding:12px">—</div>'}</div>`).join('')}</div>`;
}

function challengeList(c, id) {
  const out = [], iss = S.issues.filter(i => i.owner === id), ts = S.led.tasks.filter(t => t.owner === id);
  if (c.missReport) out.push(`<b>${c.missReport} issue nghiêm trọng</b> đã tồn trên 24h mà ${esc(c.short)} chưa báo: ${iss.filter(i => i.missReport).slice(0, 3).map(i => esc(i.title)).join('; ')}.`);
  if (c.overdue) out.push(`<b>${c.overdue} việc quá hạn</b>: ${ts.filter(t => t.overdue).map(t => esc(t.id) + ' (trễ ' + t.daysOver + ' ngày)').join(', ')}.`);
  const fakeDone = ts.filter(t => t.state === 'review' && t.live);
  if (fakeDone.length) out.push(`<b>${fakeDone.length} việc báo "xong" nhưng dữ liệu vẫn còn lỗi</b>: ${fakeDone.map(t => esc(t.id)).join(', ')} — yêu cầu giải trình.`);
  const rec = ts.filter(t => t.recurrence >= 2); if (rec.length) out.push(`<b>Lỗi tái phát</b>: ${rec.map(t => esc(t.ruleId) + ' lần ' + t.recurrence).join(', ')}.`);
  const rf = S.rout.filter(r => r.owner === id && (r.status === 'fail' || r.status === 'pending')); if (rf.length) out.push(`<b>${rf.length} việc định kỳ chưa đạt</b>: ${rf.slice(0, 4).map(r => esc(r.title)).join('; ')}.`);
  if (!out.length) out.push('Không có điểm cần nhắc. Cân nhắc ghi nhận nhân viên.');
  return out;
}
function viewTeam() {
  const ids = isMgr() ? ['trang', 'phu'] : [myOwner()];
  return `<div class="page-head"><div><h1>${isMgr() ? 'Nhân sự · Scorecard trách nhiệm' : 'Điểm trách nhiệm của tôi'}</h1><p>Điểm 100 trừ: quá hạn −8, miss báo cáo −6, tái phát −5, P0 đang mở −5, mở lại −4, cảnh cáo −10; cộng/trừ theo tỷ lệ đúng hạn.</p></div></div>
  ${ids.map(id => { const c = S.led.cards[id]; return card(esc(c.name), id === 'trang' ? 'Global · Wayfair CastleGate & Amazon' : 'Local · Shopee kệ 3 tầng', `<div class="score"><div class="ring2" style="--p:${c.score};--c:${c.score >= 80 ? 'var(--good)' : c.score >= 60 ? 'var(--warn)' : 'var(--crit)'}"><div><b>${c.score}</b><span>/ 100</span></div></div>
    <div class="statgrid"><div class="stat"><b>${c.assigned}</b><span>Việc được giao</span></div><div class="stat"><b>${c.open}</b><span>Đang mở</span></div><div class="stat ${c.overdue ? 'bad' : ''}"><b>${c.overdue}</b><span>Quá hạn</span></div><div class="stat"><b>${c.onTimeRate == null ? '–' : pct(c.onTimeRate)}</b><span>Đúng hạn</span></div>
    <div class="stat ${c.missReport ? 'bad' : ''}"><b>${c.missReport}</b><span>Miss báo cáo</span></div><div class="stat ${c.recurring ? 'bad' : ''}"><b>${c.recurring}</b><span>Tái phát</span></div><div class="stat"><b>${c.reminds}/${c.warns}</b><span>Nhắc nhở / Cảnh cáo</span></div><div class="stat"><b>${c.avgDays == null ? '–' : c.avgDays.toFixed(1) + 'd'}</b><span>Thời gian xử lý TB</span></div>
    <div class="stat ${c.p0 ? 'bad' : ''}"><b>${c.p0}</b><span>Issue P0 đang mở</span></div><div class="stat"><b>${c.p1}</b><span>Issue P1 đang mở</span></div><div class="stat"><b>${c.unassigned}</b><span>Issue chưa giao</span></div><div class="stat"><b>${c.reopen}</b><span>Bị mở lại</span></div></div></div>
    <h3 style="margin-top:18px">${isMgr() ? 'Điểm cần challenge' : 'Điểm cần cải thiện'}</h3><ul class="challenge">${challengeList(c, id).map(x => `<li>${x}</li>`).join('')}</ul>`); }).join('')}`;
}

function viewRoutine() {
  const by = {}; for (const r of S.rout) (by[r.owner] = by[r.owner] || []).push(r);
  const st = { ok: '✓ Đạt', fail: '✗ Chưa đạt (dữ liệu)', review: '⏳ Chờ duyệt', pending: '— Chưa nộp' };
  const cad = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng' };
  return `<div class="page-head"><div><h1>Việc định kỳ</h1><p>Hệ thống kiểm bằng dữ liệu khi có thể; việc không có dữ liệu (content, báo cáo, kiểm kê) phải nộp link bằng chứng và được chị duyệt.</p></div></div>
  ${Object.entries(by).map(([o, rs]) => card(esc(o === 'manager' ? 'Chị Nhi' : OWN[o] ? OWN[o].name : o), `${rs.filter(r => r.status === 'ok').length}/${rs.length} đạt kỳ này`, `<div class="tw"><table class="t"><tr><th>Việc</th><th>Chu kỳ</th><th>Hạn</th><th>Kiểm bằng</th><th>Trạng thái</th><th></th></tr>${rs.map(r => `<tr><td><b>${esc(r.title)}</b>${r.evidence && r.verify === 'evidence' && typeof r.evidence === 'string' && !/^https?:/.test(r.evidence) ? `<br><span class="sub">${esc(r.evidence)}</span>` : ''}</td><td>${cad[r.cadence] || r.cadence}</td><td>${esc(r.due)}</td><td>${r.verify.startsWith('rule:') ? 'Dữ liệu sàn' : 'Bằng chứng'}</td><td class="st-${r.status}">${st[r.status]}${r.submittedAt ? `<br><span class="sub">${dt(r.submittedAt)}</span>` : ''}</td>
    <td>${r.verify === 'evidence' ? (isMgr() ? (r.status === 'review' ? `<button class="btn pri" data-rapprove="${esc(r.ref)}" data-ch="${OWN[r.owner] ? OWN[r.owner].channel : ''}">Duyệt</button>` : '') : (r.status !== 'ok' ? `<button class="btn" data-rsubmit="${esc(r.ref)}">Nộp bằng chứng</button>` : '')) : ''}${/^https?:/.test(r.evidence || '') ? ` <a href="${esc(r.evidence)}" target="_blank" rel="noopener">xem ↗</a>` : ''}</td></tr>`).join('')}</table></div>`)).join('')}`;
}

/* ---------------- actions ---------------- */
async function addEvent(op, ref, data, channel) {
  const r = await api('event.add', { ev: { op, ref, data, channel } });
  if (!r.ok) { toast('Lỗi: ' + (r.err || 'không ghi được')); return false; }
  S.events.push(r.ev); await compute(); render(); return true;
}
const issueByKey = k => S.issues.find(i => i.key === k);
const taskById = id => S.led.tasks.find(t => t.id === id);
function msgVars(t, extra = {}) { return { name: (OWN[t.owner] || {}).short || '', title: t.title, taskId: t.id, deadline: dmy(t.due), detail: t.detail || (t.live && t.live.detail) || '', steps: (t.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n'), closeWhen: t.closeWhen || '', count: t.recurrence, ...extra }; }
function assignModal(i) {
  const due = E.isoAdd(E.todayVN(), i.sla || 7), owner = i.owner === 'manager' ? (i.channel === 'local' ? 'phu' : 'trang') : i.owner;
  modal(`<h3>Giao việc</h3><p class="sub">${sevTag(i.effSev)} ${esc(i.title)}</p>
    <label>Người phụ trách<select id="mOwner"><option value="trang" ${owner === 'trang' ? 'selected' : ''}>${OWN.trang.name} (Global)</option><option value="phu" ${owner === 'phu' ? 'selected' : ''}>${OWN.phu.name} (Local)</option></select></label>
    <label>Mức độ<select id="mSev">${['P0', 'P1', 'P2', 'P3'].map(s => `<option ${s === i.effSev ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label>Hạn hoàn thành<input id="mDue" type="date" value="${due}"></label>
    <label>Các bước cần làm (mỗi dòng 1 bước)<textarea id="mSteps">${esc((i.steps || []).join('\n'))}</textarea></label>
    <label>Điều kiện đóng việc<input id="mClose" value="${esc(i.closeWhen || '')}"></label>
    <div class="foot"><button class="btn ghost" data-close>Huỷ</button><button class="btn pri" id="mGo">Giao & copy tin nhắn Zalo</button></div>`, m => {
    m.querySelector('#mGo').onclick = async () => {
      const ow = m.querySelector('#mOwner').value, d = { taskId: 'T-' + Date.now().toString(36).slice(-5).toUpperCase(), issueKey: i.key, ruleId: i.rule, title: i.title, detail: i.detail || '', sev: m.querySelector('#mSev').value, owner: ow, ownerName: OWN[ow].name, channel: OWN[ow].channel, due: m.querySelector('#mDue').value, steps: m.querySelector('#mSteps').value.split('\n').map(s => s.trim()).filter(Boolean), closeWhen: m.querySelector('#mClose').value };
      closeModal(); if (await addEvent('assign', d.taskId, d, d.channel)) copy(fill(PB.messages.assign, msgVars({ ...d, id: d.taskId })));
    };
  });
}
function noteModal(title, needLink, cb) {
  modal(`<h3>${title}</h3><label>Ghi chú<textarea id="mNote" placeholder="Đã làm gì, kết quả, vướng mắc…"></textarea></label><label>Link bằng chứng ${needLink ? '(bắt buộc)' : '(nếu có)'}<input id="mLink" placeholder="https://… ảnh chụp, link listing, file báo cáo"></label><div class="foot"><button class="btn ghost" data-close>Huỷ</button><button class="btn pri" id="mGo">Gửi</button></div>`, m => {
    m.querySelector('#mGo').onclick = () => { const note = m.querySelector('#mNote').value.trim(), link = m.querySelector('#mLink').value.trim(); if (needLink && !/^https?:\/\//.test(link)) { toast('Cần link bằng chứng (https://…)'); return; } if (!note && !link) { toast('Nhập ghi chú'); return; } closeModal(); cb({ note, link }); };
  });
}
function msgModal(title, text, cb) {
  modal(`<h3>${title}</h3><label>Tin nhắn (sửa được trước khi gửi)<textarea id="mMsg" style="min-height:220px">${esc(text)}</textarea></label><div class="foot"><button class="btn ghost" data-close>Đóng</button><button class="btn pri" id="mGo">${cb ? 'Ghi nhận & copy' : 'Copy'}</button></div>`, m => {
    m.querySelector('#mGo').onclick = async () => { const t = m.querySelector('#mMsg').value; closeModal(); if (cb) await cb(t); copy(t); };
  });
}
function bindView() {
  const V = $('#view');
  V.onclick = async e => {
    const b = e.target.closest('button,[data-goto]'); if (!b) return; const d = b.dataset;
    if (d.goto) { S.tab = d.goto; render(); scrollTo({ top: 0 }); return; }
    if (d.seg !== undefined) return;
    if (b.closest('[data-seg]')) { S.f[b.closest('[data-seg]').dataset.seg] = d.v; render(); return; }
    if (d.sevf) { S.f.sev.has(d.sevf) ? S.f.sev.delete(d.sevf) : S.f.sev.add(d.sevf); render(); return; }
    if (d.unas !== undefined) { S.f.unassigned = !S.f.unassigned; render(); return; }
    if (d.assign) return assignModal(issueByKey(d.assign));
    if (d.dismiss) { const i = issueByKey(d.dismiss); return modal(`<h3>Bỏ qua issue</h3><p class="sub">${esc(i.title)}</p><label>Lý do (được ghi log)<input id="mR"></label><div class="foot"><button class="btn ghost" data-close>Huỷ</button><button class="btn pri" id="mGo">Bỏ qua</button></div>`, m => { m.querySelector('#mGo').onclick = async () => { const r = m.querySelector('#mR').value.trim(); if (!r) return toast('Cần lý do'); closeModal(); const id = 'T-' + Date.now().toString(36).slice(-5).toUpperCase(); await addEvent('assign', id, { taskId: id, issueKey: i.key, ruleId: i.rule, title: i.title, sev: i.sev, owner: i.owner === 'manager' ? 'trang' : i.owner, channel: i.channel, due: E.todayVN(), closeWhen: 'evidence' }, i.channel); await addEvent('dismiss', id, { reason: r }, i.channel); }; }); }
    if (d.ack) return addEvent('ack', d.ack, { note: 'Nhân viên chủ động báo đã nắm issue' }).then(ok => ok && toast('Đã ghi nhận: em đã nắm issue'));
    const t = taskById(d.approve || d.remind || d.warn || d.deadline || d.msg || d.tack || d.progress || d.done || d.reopen || d.praise || '');
    if (d.approve) return addEvent('approve', t.id, { how: t.dataResolved ? 'data' : 'manager' }, t.channel);
    if (d.remind) return msgModal('Nhắc nhở ' + (OWN[t.owner] || {}).short, fill(PB.messages.remind, msgVars(t)), txt => addEvent('remind', t.id, { note: 'Đã gửi nhắc nhở' }, t.channel));
    if (d.warn) { const prior = S.led.tasks.filter(x => x.owner === t.owner && x.ruleId === t.ruleId).map(x => dmy(String(x.assignedAt).slice(0, 10))).join(', '); return msgModal('Cảnh cáo ' + (OWN[t.owner] || {}).short, fill(PB.messages.warning, msgVars(t, { detail: prior, deadline: dmy(E.isoAdd(E.todayVN(), 2)) })), txt => addEvent('warn', t.id, { note: 'Đã gửi cảnh cáo' }, t.channel)); }
    if (d.msg) return msgModal('Tin nhắn giao việc', fill(PB.messages.assign, msgVars(t)));
    if (d.praise) return msgModal('Ghi nhận ' + (OWN[t.owner] || {}).short, fill(PB.messages.praise, msgVars(t)), txt => addEvent('praise', t.id, {}, t.channel));
    if (d.deadline) return modal(`<h3>Gia hạn ${esc(t.id)}</h3><label>Hạn mới<input id="mDue" type="date" value="${E.isoAdd(t.due || E.todayVN(), 2)}"></label><label>Lý do<input id="mR"></label><div class="foot"><button class="btn ghost" data-close>Huỷ</button><button class="btn pri" id="mGo">Lưu</button></div>`, m => { m.querySelector('#mGo').onclick = () => { const due = m.querySelector('#mDue').value, note = m.querySelector('#mR').value; closeModal(); addEvent('deadline', t.id, { due, note }, t.channel); }; });
    if (d.reopen) return addEvent('reopen', t.id, {}, t.channel);
    if (d.tack) return addEvent('ack', t.id, {});
    if (d.progress) return noteModal('Cập nhật tiến độ ' + t.id, false, x => addEvent('progress', t.id, x));
    if (d.done) return noteModal('Báo hoàn thành ' + t.id, String(t.closeWhen || '').startsWith('evidence'), x => addEvent('done', t.id, x));
    if (d.rsubmit) return noteModal('Nộp bằng chứng việc định kỳ', true, x => addEvent('done', d.rsubmit, x));
    if (d.rapprove) return addEvent('approve', d.rapprove, {}, d.ch);
  };
}

/* ---------------- shell ---------------- */
function settings() {
  modal(`<h3>Cài đặt</h3><label>Tỷ giá USD → VND (gộp 2 kênh)<input id="mFx" inputmode="numeric" value="${S.fx}"></label>
    ${isDemo ? `<label>Xem như (demo)<select id="mAs"><option value="manager">Chị Nhi (quản lý)</option><option value="trang">Thuỳ Trang (Global)</option><option value="phu">Đình Phú (Local)</option></select></label>` : ''}
    <p class="sub" style="margin-top:12px">Đăng nhập: ${esc(S.me.name)} · ${S.me.role === 'manager' ? 'Quản lý' : 'Nhân viên'}${S.me.channel ? ' · ' + S.me.channel : ''}</p>
    <div class="foot"><button class="btn ghost" data-close>Đóng</button><button class="btn pri" id="mGo">Lưu</button></div>`, m => {
    if (isDemo) m.querySelector('#mAs').value = S.me.id === 'nhi' ? 'manager' : S.me.id;
    m.querySelector('#mGo').onclick = async () => { const v = +String(m.querySelector('#mFx').value).replace(/\D/g, ''); if (v > 1000) { S.fx = v; store.set('cc-fx', v); } if (isDemo) { S.me = { ...DEMO_USERS[m.querySelector('#mAs').value] }; S.tab = 'brief'; await loadEvents(); } closeModal(); await compute(); render(); showWho(); };
  });
}
function showWho() { $('#who').textContent = (S.me.role === 'manager' ? 'Quản lý · ' : 'NV · ') + S.me.name; $('#sub').textContent = S.me.role === 'manager' ? 'Global · Local · Accountability' : (S.me.channel === 'global' ? 'Global · Wayfair / Amazon' : 'Local · Shopee'); }
async function start(me) {
  S.me = me; $('#login').hidden = true; $('#app').hidden = false; showWho();
  $('#view').innerHTML = '<div class="empty2">Đang giải mã & tính toán…</div>';
  const [src] = await Promise.all([loadSources(me), loadEvents()]); S.src = src;
  await compute(); render(); snapshotOncePerDay();
}
const th0 = store.get('lg-theme'); if (th0) document.documentElement.dataset.theme = th0;
$('#themeBtn').onclick = () => { const r = document.documentElement, cur = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), n = cur === 'dark' ? 'light' : 'dark'; r.dataset.theme = n; store.set('lg-theme', n); };
$('#logoutBtn').onclick = () => { store.del('cc-me'); location.href = location.pathname; };
$('#settingsBtn').onclick = settings;
$('#refreshBtn').onclick = () => start(S.me);
$('#tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { S.tab = b.dataset.tab; render(); scrollTo({ top: 0 }); } };
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Đang giải mã…'; $('#loginErr').textContent = '';
  try { const me = await login($('#user').value, $('#pass').value); if ($('#remember').checked) store.set('cc-me', JSON.stringify(me)); else sessionStorage.setItem('cc-me', JSON.stringify(me)); $('#pass').value = ''; start(me); }
  catch (x) { $('#loginErr').textContent = x.message === 'bad' ? 'Sai email hoặc mật khẩu' : x.message; }
  finally { btn.disabled = false; btn.textContent = 'Đăng nhập'; }
});
if (isDemo) { $('#demoBand').hidden = false; start({ ...DEMO_USERS.manager }); }
else { const saved = store.get('cc-me') || sessionStorage.getItem('cc-me'); if (saved) start(JSON.parse(saved)); else { $('#login').hidden = false; setTimeout(() => $('#user').focus(), 50); } }
})();
