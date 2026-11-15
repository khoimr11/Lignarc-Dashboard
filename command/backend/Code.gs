/**
 * LF Command Center — task & accountability backend (Google Apps Script, bound to a Google Sheet).
 *
 * - Every action (assign, ack, progress, done, approve, remind, warn…) is APPENDED to the "Events" sheet with the
 *   server's own timestamp. Nothing is ever edited or deleted through the API, so the history cannot be rewritten.
 * - Staff can only read/write events of their own channel and only use staff actions.
 * - The vault (encrypted login bundle) is stored here; it is useless without each user's password.
 * - morningDigest() runs every morning (trigger installed by setup()) and emails the manager.
 *
 * Deploy: Extensions › Apps Script › paste this file › Run setup() once (authorize) › copy the ADMIN secret from the log
 *         › Deploy › New deployment › Web app › Execute as: Me · Who has access: Anyone › copy the /exec URL.
 */
const SH_EVENTS = 'Events', SH_SNAP = 'Snapshots';
const MANAGER_OPS = ['assign', 'deadline', 'approve', 'reopen', 'remind', 'warn', 'praise', 'dismiss', 'note', 'routine.set'];
const STAFF_OPS = ['ack', 'progress', 'done', 'note'];
const P = PropertiesService.getScriptProperties();

function setup() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SH_EVENTS)) ss.insertSheet(SH_EVENTS).appendRow(['id', 'ts', 'user', 'role', 'channel', 'op', 'ref', 'data']);
  if (!ss.getSheetByName(SH_SNAP)) ss.insertSheet(SH_SNAP).appendRow(['ts', 'user', 'json']);
  if (!P.getProperty('ADMIN')) P.setProperty('ADMIN', Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'morningDigest') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('morningDigest').timeBased().everyDays(1).atHour(8).nearMinute(15).inTimezone('Asia/Ho_Chi_Minh').create();
  ss.getSheets().forEach(s => s.protect().setWarningOnly(true));
  Logger.log('ADMIN secret (paste into setup page): ' + P.getProperty('ADMIN'));
}

const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const sha = s => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
const users = () => JSON.parse(P.getProperty('USERS') || '[]');

function doGet(e) {
  const op = (e && e.parameter && e.parameter.op) || 'ping';
  if (op === 'vault') return out({ ok: true, vault: P.getProperty('VAULT') ? JSON.parse(P.getProperty('VAULT')) : null });
  return out({ ok: true, ping: new Date().toISOString() });
}

function doPost(e) {
  let b; try { b = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, err: 'bad json' }); }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (b.op === 'admin.setup') {
      if (!b.admin || b.admin !== P.getProperty('ADMIN')) return out({ ok: false, err: 'admin' });
      P.setProperty('USERS', JSON.stringify(b.users || []));
      if (b.vault) P.setProperty('VAULT', JSON.stringify(b.vault));
      if (b.managerEmail) P.setProperty('MANAGER_EMAIL', b.managerEmail);
      if (b.appUrl) P.setProperty('APP_URL', b.appUrl);
      return out({ ok: true, users: (b.users || []).length });
    }
    const th = sha(String(b.tok || '')), u = users().find(x => x.th === th);
    if (!u) return out({ ok: false, err: 'auth' });
    const ss = SpreadsheetApp.getActive();
    if (b.op === 'events.list') {
      const rows = ss.getSheetByName(SH_EVENTS).getDataRange().getValues().slice(1);
      const evs = rows.filter(r => u.role === 'manager' || r[4] === u.channel || r[2] === u.id)
        .map(r => ({ id: r[0], ts: r[1] instanceof Date ? r[1].toISOString() : r[1], user: r[2], role: r[3], channel: r[4], op: r[5], ref: r[6], data: safe(r[7]) }));
      return out({ ok: true, me: { id: u.id, name: u.name, role: u.role, channel: u.channel }, events: evs, now: new Date().toISOString() });
    }
    if (b.op === 'event.add') {
      const ev = b.ev || {}, allowed = u.role === 'manager' ? MANAGER_OPS.concat(STAFF_OPS) : STAFF_OPS;
      if (allowed.indexOf(ev.op) < 0) return out({ ok: false, err: 'not allowed' });
      const channel = u.role === 'manager' ? (ev.channel || '') : u.channel;
      const sh = ss.getSheetByName(SH_EVENTS), id = sh.getLastRow(), ts = new Date();
      const d0 = ev.data || {}; if (d0.link && !/^https?:\/\//.test(String(d0.link))) delete d0.link;   // no javascript: links
      const data = JSON.stringify(d0).slice(0, 45000);
      sh.appendRow([id, ts, u.id, u.role, channel, ev.op, String(ev.ref || '').slice(0, 200), data]);
      return out({ ok: true, ev: { id, ts: ts.toISOString(), user: u.id, role: u.role, channel, op: ev.op, ref: ev.ref, data: d0 } });
    }
    if (b.op === 'snaps.list') {
      const rows = ss.getSheetByName(SH_SNAP).getDataRange().getValues().slice(1).filter(r => r[1] === u.id).slice(-60);
      return out({ ok: true, snaps: rows.map(r => { const j = safe(r[2]); return { ts: r[0] instanceof Date ? r[0].toISOString() : r[0], keys: j.keys || [] }; }) });
    }
    if (b.op === 'snapshot') {
      const sh = ss.getSheetByName(SH_SNAP);
      sh.appendRow([new Date(), u.id, JSON.stringify(b.snap || {}).slice(0, 48000)]);
      if (sh.getLastRow() > 400) sh.deleteRows(2, sh.getLastRow() - 400);
      return out({ ok: true });
    }
    return out({ ok: false, err: 'op' });
  } finally { lock.releaseLock(); }
}
function safe(s) { try { return JSON.parse(s); } catch (x) { return {}; } }

/** 08:15 every morning: email the manager the open critical issues and overdue tasks from the latest snapshot. */
function morningDigest() {
  const to = P.getProperty('MANAGER_EMAIL'); if (!to) return;
  const ss = SpreadsheetApp.getActive(), snaps = ss.getSheetByName(SH_SNAP).getDataRange().getValues().slice(1).filter(r => r[1] === 'manager' || users().some(u => u.id === r[1] && u.role === 'manager'));
  const last = snaps.length ? safe(snaps[snaps.length - 1][2]) : null;
  const evs = ss.getSheetByName(SH_EVENTS).getDataRange().getValues().slice(1).map(r => ({ ts: r[1], op: r[5], ref: r[6], data: safe(r[7]) }));
  const tasks = {}; evs.forEach(e => { if (e.op === 'assign') tasks[e.data.taskId] = Object.assign({ state: 'open' }, e.data); else if (tasks[e.ref]) {
    if (e.op === 'approve' || e.op === 'dismiss') tasks[e.ref].state = 'closed'; else if (e.op === 'reopen') tasks[e.ref].state = 'open'; else if (e.op === 'deadline') tasks[e.ref].due = e.data.due; else if (e.op === 'done') tasks[e.ref].state = 'review'; } });
  const today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  const overdue = Object.values(tasks).filter(t => t.state !== 'closed' && t.due && t.due < today);
  const crit = last && last.issues ? last.issues.filter(i => i.sev === 'P0' || i.sev === 'P1') : [];
  const li = a => a.map(x => '<li>' + x + '</li>').join('');
  const html = '<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px">' +
    '<h2 style="margin:0 0 4px">LF Command Center · ' + today + '</h2>' +
    (last ? '<p style="color:#666">Dữ liệu tính lúc ' + (last.at || '') + '</p>' : '<p>Chưa có snapshot — mở Command Center để tính lần đầu.</p>') +
    (last && last.brief ? '<p>' + last.brief.join('<br>') + '</p>' : '') +
    '<h3>🔴 Issue P0/P1 đang mở (' + crit.length + ')</h3><ul>' + li(crit.slice(0, 25).map(i => '<b>' + i.sev + '</b> [' + (i.owner || '') + '] ' + i.title + (i.age != null ? ' · ' + i.age + ' ngày' : ''))) + '</ul>' +
    '<h3>⏰ Việc quá hạn (' + overdue.length + ')</h3><ul>' + li(overdue.map(t => t.taskId + ' · ' + t.ownerName + ' · ' + t.title + ' · hạn ' + t.due)) + '</ul>' +
    (P.getProperty('APP_URL') ? '<p><a href="' + P.getProperty('APP_URL') + '">Mở Command Center</a></p>' : '') + '</div>';
  MailApp.sendEmail({ to, subject: 'LF Command Center · ' + crit.length + ' issue nghiêm trọng · ' + overdue.length + ' việc quá hạn', htmlBody: html });
}
