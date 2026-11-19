// Siglele cluburilor, din sistemul federatiei (aceeasi sursa ca rezultatele: <baseUrl>/logo/<clubId>.png).
// Vizitatorii nu le cer niciodata direct de acolo: serverul nostru le aduce o data, le verifica si le
// pastreaza in Netlify Blobs, iar pagina le primeste de pe site (/api/logo/<clubId>).
import { config } from '../../config/site.config.mjs';
import { cacheStore } from './store.mjs';

const baseUrl = () => process.env.SOURCE_BASE_URL || config.source.baseUrl;
const DAY = 24 * 60 * 60 * 1000;
const KEEP_FOUND = 30 * DAY; // o sigla schimbata apare pe site in cel mult o luna
const KEEP_MISSING = DAY; // un club fara sigla e intrebat din nou a doua zi
const MAX_BYTES = 512 * 1024;

export const validClubId = (id) => /^\d{1,7}$/.test(String(id ?? ''));

// Tipul imaginii dupa primii octeti (nu dupa ce declara serverul). SVG nu e acceptat: poate contine cod.
export function imageType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function download(clubId) {
  try {
    const res = await fetch(`${baseUrl()}/logo/${clubId}.png`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return null;
    const type = imageType(bytes);
    return type ? { bytes, type } : null;
  } catch {
    return undefined; // eroare de retea: nu tinem minte nimic, incercam la urmatoarea cerere
  }
}

// { bytes, type } sau null daca clubul nu are sigla.
export async function loadLogo(clubId) {
  const store = cacheStore();
  const key = `logo/${clubId}`;
  const cached = await store.getWithMetadata(key, { type: 'arrayBuffer' });
  const at = cached?.metadata?.at || 0;
  const fresh = Date.now() - at < (cached?.metadata?.type ? KEEP_FOUND : KEEP_MISSING);
  if (cached && fresh) return cached.metadata.type ? { bytes: cached.data, type: cached.metadata.type } : null;

  const logo = await download(clubId);
  if (logo === undefined) return cached?.metadata?.type ? { bytes: cached.data, type: cached.metadata.type } : null;
  if (logo) await store.set(key, logo.bytes, { metadata: { type: logo.type, at: Date.now() } });
  else await store.set(key, new ArrayBuffer(0), { metadata: { type: null, at: Date.now() } });
  return logo;
}
