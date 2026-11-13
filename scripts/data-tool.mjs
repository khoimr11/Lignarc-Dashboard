#!/usr/bin/env node
// Lignarc dashboard data tool (Node 18+, no dependencies)
//   LG_DK=<base64 data key> node scripts/data-tool.mjs decrypt [file]            -> prints JSON
//   LG_DK=... node scripts/data-tool.mjs encrypt data.json [file]               -> re-encrypts, keeps user key slots
//   LG_DK=... LG_USERS='[["user","pass"],...]' node scripts/data-tool.mjs init data.json [file]
//   LG_DK=... node scripts/data-tool.mjs adduser <user> <pass> [file]
// The data key (LG_DK) and passwords are never stored in the repo.
import { webcrypto as C } from 'node:crypto';
import fs from 'node:fs';
const S = C.subtle, te = new TextEncoder(), td = new TextDecoder();
const b64 = u => Buffer.from(u).toString('base64'), ub = s => new Uint8Array(Buffer.from(s, 'base64'));
const ITER = 250000, FILE = 'data/lignarc.enc.json';
const hint = async u => Buffer.from(await S.digest('SHA-256', te.encode('lignarc|' + u.trim().toLowerCase()))).toString('hex').slice(0, 16);
async function slot(user, pass, dk) {
  const salt = C.getRandomValues(new Uint8Array(16)), iv = C.getRandomValues(new Uint8Array(12));
  const base = await S.importKey('raw', te.encode(user.trim().toLowerCase() + '\n' + pass), 'PBKDF2', false, ['deriveKey']);
  const k = await S.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  return { h: await hint(user), salt: b64(salt), iv: b64(iv), wk: b64(new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv }, k, dk))) };
}
const key = async dk => S.importKey('raw', dk, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function seal(obj, dk) { const iv = C.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv }, await key(dk), te.encode(JSON.stringify(obj))))) }; }
async function open(file, dk) { return JSON.parse(td.decode(await S.decrypt({ name: 'AES-GCM', iv: ub(file.iv) }, await key(dk), ub(file.ct)))); }
const DK = () => { if (!process.env.LG_DK) throw new Error('set LG_DK'); return ub(process.env.LG_DK); };
const [cmd, a1, a2, a3] = process.argv.slice(2);
if (cmd === 'newkey') { console.log(b64(C.getRandomValues(new Uint8Array(32)))); }
else if (cmd === 'init') {
  const dk = DK(), users = JSON.parse(process.env.LG_USERS || '[]'); if (!users.length) throw new Error('set LG_USERS');
  const out = { v: 2, kdf: 'PBKDF2-SHA256', iter: ITER, users: [], ...(await seal(JSON.parse(fs.readFileSync(a1, 'utf8')), dk)), updated: new Date().toISOString() };
  for (const [u, p] of users) out.users.push(await slot(u, p, dk));
  fs.writeFileSync(a2 || FILE, JSON.stringify(out)); console.log('wrote', a2 || FILE, out.users.length, 'users');
} else if (cmd === 'decrypt') { const f = JSON.parse(fs.readFileSync(a1 || FILE, 'utf8')); console.log(JSON.stringify(await open(f, DK()))); }
else if (cmd === 'encrypt') {
  const p = a2 || FILE, f = JSON.parse(fs.readFileSync(p, 'utf8'));
  Object.assign(f, await seal(JSON.parse(fs.readFileSync(a1, 'utf8')), DK()), { updated: new Date().toISOString() });
  fs.writeFileSync(p, JSON.stringify(f)); console.log('updated', p);
} else if (cmd === 'adduser') {
  const p = a3 || FILE, f = JSON.parse(fs.readFileSync(p, 'utf8')), s = await slot(a1, a2, DK());
  f.users = f.users.filter(x => x.h !== s.h).concat(s); fs.writeFileSync(p, JSON.stringify(f)); console.log('slots', f.users.length);
} else console.log('commands: newkey | init | decrypt | encrypt | adduser');
