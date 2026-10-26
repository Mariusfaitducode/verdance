// Génère une paire de clés VAPID (P-256) pour Web Push.
//   node tools/vapid-keys.mjs            -> affiche les deux clés
//   node tools/vapid-keys.mjs --dev-vars -> écrit aussi .dev.vars (wrangler dev)
// VAPID_PUBLIC  = point public non compressé (65 octets), base64url : c'est l'applicationServerKey du client.
// VAPID_PRIVATE = scalaire privé d (32 octets), base64url.
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
const pub = Buffer.from(raw).toString('base64url');
const priv = jwk.d;

console.log('VAPID_PUBLIC=' + pub);
console.log('VAPID_PRIVATE=' + priv);
if (process.argv.includes('--dev-vars')) {
  const file = fileURLToPath(new URL('../.dev.vars', import.meta.url));
  if (existsSync(file) && !process.argv.includes('--force')) { console.error('.dev.vars existe déjà (--force pour écraser)'); process.exit(1); }
  writeFileSync(file, `VAPID_PUBLIC=${pub}\nVAPID_PRIVATE=${priv}\n`, { mode: 0o600 });
  console.log('-> écrit dans .dev.vars');
}
