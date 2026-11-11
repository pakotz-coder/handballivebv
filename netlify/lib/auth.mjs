// Autentificarea administratorului: parola din variabila de mediu ADMIN_PASSWORD,
// sesiune tinuta intr-un cookie semnat (HMAC-SHA256), fara stare pe server.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { cacheStore } from './store.mjs';

const COOKIE = 'hlbv_admin';
const DAYS = 60;

const password = () => process.env.ADMIN_PASSWORD || '';
// Cheia de semnare deriva din parola: schimbarea parolei invalideaza toate sesiunile.
const signingKey = () => createHash('sha256').update(`hlbv-session:${password()}`).digest();
const sign = (payload) => createHmac('sha256', signingKey()).update(payload).digest('base64url');

const safeEqual = (a, b) => {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
};

export const passwordConfigured = () => password().length >= 8;
export const checkPassword = (given) => passwordConfigured() && typeof given === 'string' && safeEqual(given, password());

export function sessionCookie() {
  const expires = Date.now() + DAYS * 86400000;
  return `${COOKIE}=${expires}.${sign(String(expires))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS * 86400}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAuthenticated(req) {
  if (!passwordConfigured()) return false;
  const match = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([\\w-]+)`));
  if (!match) return false;
  const [, expires, signature] = match;
  return Number(expires) > Date.now() && safeEqual(signature, sign(expires));
}

// Cererile care modifica date trebuie sa vina din paginile site-ului (aparare CSRF pe langa SameSite).
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}

// Limiteaza incercarile de parola: cel mult 10 greseli la 15 minute, pe tot site-ul.
const WINDOW = 15 * 60000;
const MAX_FAILS = 10;

export async function loginAllowed() {
  const entry = await cacheStore().get('login-fails', { type: 'json' });
  return !entry || Date.now() - entry.since > WINDOW || entry.count < MAX_FAILS;
}

export async function recordFailedLogin() {
  const store = cacheStore();
  const entry = await store.get('login-fails', { type: 'json' });
  const next = !entry || Date.now() - entry.since > WINDOW ? { since: Date.now(), count: 1 } : { ...entry, count: entry.count + 1 };
  await store.setJSON('login-fails', next);
}
