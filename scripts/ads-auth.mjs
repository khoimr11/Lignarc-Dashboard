// Exchange an Amazon Ads authorization code (data/ads-code.enc.json, AES-GCM with LG_DK) for a refresh token,
// verify it lists an Ads profile, and store it in data/cred.enc.json. Prints no secrets.
import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
const E = process.env, K = Buffer.from(E.LG_DK, 'base64');
const dec = f => { const j = JSON.parse(fs.readFileSync(f, 'utf8')), ct = Buffer.from(j.ct, 'base64'), d = createDecipheriv('aes-256-gcm', K, Buffer.from(j.iv, 'base64')); d.setAuthTag(ct.subarray(-16)); return JSON.parse(Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]).toString()); };
const enc = o => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', K, iv); return JSON.stringify({ iv: iv.toString('base64'), ct: Buffer.concat([c.update(JSON.stringify(o)), c.final(), c.getAuthTag()]).toString('base64') }); };
const { code, redirect } = dec('data/ads-code.enc.json');
// credentials stored (encrypted) in the repo take priority over GitHub secrets
if (fs.existsSync('data/cred.enc.json')) { const c0 = dec('data/cred.enc.json'); for (const k of ['AMZ_ADS_CLIENT_ID', 'AMZ_ADS_CLIENT_SECRET']) if (c0[k]) E[k] = c0[k]; }
const pairs = [['ads', E.AMZ_ADS_CLIENT_ID, E.AMZ_ADS_CLIENT_SECRET], ['sp', E.AMZ_SP_CLIENT_ID, E.AMZ_SP_CLIENT_SECRET]].filter(p => p[1] && p[2]);
let ok = null;
for (const [name, id, secret] of pairs) {
  const r = await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: id, client_secret: secret }) });
  const j = await r.json(); console.log('exchange with', name, r.status, j.error || 'ok', j.error_description || '');
  if (j.refresh_token) { ok = { name, id, secret, rt: j.refresh_token, at: j.access_token }; break; }
}
if (!ok) { console.log('NO TOKEN'); process.exit(0); }
const pr = await fetch('https://advertising-api.amazon.com/v2/profiles', { headers: { Authorization: 'Bearer ' + ok.at, 'Amazon-Advertising-API-ClientId': ok.id } });
const prof = await pr.json(); console.log('profiles', pr.status, Array.isArray(prof) ? prof.map(p => [p.countryCode, p.accountInfo && p.accountInfo.type, p.accountInfo && p.accountInfo.name].join(':')).join(' | ') : JSON.stringify(prof).slice(0, 300));
const cred = fs.existsSync('data/cred.enc.json') ? dec('data/cred.enc.json') : {};
cred.AMZ_ADS_REFRESH_TOKEN = ok.rt; cred.AMZ_ADS_CLIENT_ID = ok.id; if (ok.name === 'sp') cred.AMZ_ADS_USE_SP_SECRET = '1';
fs.writeFileSync('data/cred.enc.json', enc(cred)); fs.rmSync('data/ads-code.enc.json');
console.log('stored refresh token (client:', ok.name + ')');
