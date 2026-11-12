// Feed-ul public al canalului YouTube si potrivirea automata video <-> meci.
import { config } from '../../config/site.config.mjs';
import { cacheStore } from './store.mjs';

const feedUrl = () =>
  `${process.env.YOUTUBE_FEED_BASE_URL || config.youtube.feedBaseUrl}?channel_id=${config.youtube.channelId}`;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? all;
  return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
});
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : '';
};

export function parseFeed(xml) {
  return xml.split('<entry>').slice(1).map((e) => ({
    id: tag(e, 'yt:videoId'),
    title: tag(e, 'title'),
    published: tag(e, 'published'),
    description: tag(e, 'media:description'),
  })).filter((v) => v.id);
}

let memory = null;
const RETRY_MS = 2 * 60000; // dupa un esec, nu mai intrebam YouTube 2 minute

export async function loadVideos() {
  const ttl = config.youtube.cacheMinutes * 60000;
  const fresh = (e) => e && Date.now() - (e.checkedAt ?? e.fetchedAt) < ttl;
  if (fresh(memory)) return memory;
  const store = cacheStore();
  const cached = await store.get('youtube-feed', { type: 'json' });
  if (fresh(cached)) return (memory = cached);
  try {
    const res = await fetch(feedUrl(), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`YouTube a raspuns ${res.status}`);
    const entry = { videos: parseFeed(await res.text()), fetchedAt: Date.now() };
    await store.setJSON('youtube-feed', entry);
    return (memory = entry);
  } catch (err) {
    console.error(`[youtube] ${err.message}`);
    const entry = { ...(cached || { videos: [], fetchedAt: 0 }), stale: true, checkedAt: Date.now() - ttl + RETRY_MS };
    if (cached) await store.setJSON('youtube-feed', entry).catch(() => {});
    return (memory = entry);
  }
}

// Un link de YouTube lipit de administrator: transmisia poate fi si pe alt canal decat al nostru.
// Accepta orice forma (watch, youtu.be, /live/, /shorts/, /embed/, canal, playlist) si intoarce o adresa
// curata pe www.youtube.com, fara parametrii de urmarire. null = nu e un link de YouTube.
export function parseYoutubeLink(input) {
  let text = String(input ?? '').trim();
  if (!text || /\s/.test(text)) return null;
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const [first = '', second = ''] = url.pathname.split('/').filter(Boolean);
  const VIDEO_PATHS = ['live', 'embed', 'shorts', 'v'];
  let id = null;
  if (host === 'youtu.be') id = first;
  else if (host !== 'youtube.com') return null;
  else if (first === 'watch') id = url.searchParams.get('v') ?? '';
  else if (VIDEO_PATHS.includes(first)) id = second;
  if (id !== null) {
    if (!/^[\w-]{11}$/.test(id)) return null;
    const start = (url.searchParams.get('t') || '').match(/^(\d+)s?$/);
    return { videoId: id, url: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start[1]}s` : ''}` };
  }
  // Fara videoclip anume: pagina unui canal (de ex. .../@canal/live) sau un playlist.
  if (!first) return null;
  const list = url.searchParams.get('list');
  if (first === 'playlist') return list && /^[\w-]+$/.test(list) ? { videoId: null, url: `https://www.youtube.com/playlist?list=${list}` } : null;
  return { videoId: null, url: `https://www.youtube.com${url.pathname.replace(/\/+$/, '')}` };
}

// Titlul si canalul unui videoclip de pe orice canal (serviciul public oEmbed al YouTube).
// Doar informativ: daca nu raspunde, linkul se salveaza oricum, fara titlu.
export async function videoInfo(videoUrl) {
  try {
    const endpoint = process.env.YOUTUBE_OEMBED_URL || 'https://www.youtube.com/oembed';
    const res = await fetch(`${endpoint}?format=json&url=${encodeURIComponent(videoUrl)}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
    return { title: clean(data.title), channel: clean(data.author_name) };
  } catch {
    return null;
  }
}

export const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Cuvinte care nu deosebesc o echipa de alta (forme juridice, orasul comun).
const GENERIC = new Set(['acs', 'ahc', 'hcf', 'lps', 'clubul', 'sportiv', 'brasov']);
// Prefixe care conteaza doar cand restul numelui e identic (CSM Fagaras / CSS Fagaras).
const PREFIX = new Set(['csm', 'css', 'cso', 'csu', 'scm']);
// Rezumatele nu se leaga automat ca inregistrare a meciului (pot fi alese manual din lista).
const NOT_A_BROADCAST = /\b(highlights|rezumat)\b/;

const keyWords = (teamName) => norm(teamName).split(' ').filter((w) => w.length > 2 && !GENERIC.has(w) && !PREFIX.has(w) && !/^\d+$/.test(w));

// In cate nume de echipe apare fiecare cuvant: "codlea" apare la o singura echipa, "magura" la doua.
export function buildVocab(teamNames) {
  const vocab = new Map();
  for (const name of new Set(teamNames)) for (const w of new Set(keyWords(name))) vocab.set(w, (vocab.get(w) || 0) + 1);
  return vocab;
}

// Pozitia echipei in titlu sau -1. Echipa e recunoscuta daca titlul contine toate cuvintele ei
// distinctive sau macar unul pe care nu-l mai are nicio alta echipa ("Codlea", "Sporting", "Corona").
function teamPosition(teamName, titleWords, vocab) {
  const key = keyWords(teamName);
  const present = key.filter((w) => titleWords.includes(w));
  if (!present.length) return -1;
  const hits = present.length === key.length ? present : present.filter((w) => vocab.get(w) === 1);
  if (!hits.length) return -1;
  const at = Math.min(...hits.map((w) => titleWords.indexOf(w)));
  // Prefixul scris chiar inaintea numelui trebuie sa fie al acestei echipe: "CSS Fagaras" nu e "CSM Fagaras".
  const before = titleWords[at - 1];
  const prefix = norm(teamName).split(' ').find((w) => PREFIX.has(w));
  return PREFIX.has(before) && before !== prefix ? -1 : at;
}

// 'match' daca data meciului apare in text, 'other' daca apare doar alta data, 'none' daca nu apare nicio data.
function dateInText(text, isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  let found = 'none';
  for (const [, dd, mm, yy] of text.matchAll(/(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?!\d)/g)) {
    if (Number(dd) < 1 || Number(dd) > 31 || Number(mm) < 1 || Number(mm) > 12) continue;
    const yearOk = !yy || Number(yy) === y || Number(yy) === y % 100;
    if (Number(dd) === d && Number(mm) === m && yearOk) return 'match';
    found = 'other';
  }
  return found;
}

// Un video e candidat pentru un meci daca:
//  - titlul contine ambele echipe, gazdele primele (ca in programul oficial);
//  - titlul nu indica alta categorie;
//  - video-ul a fost creat cu cel mult 30 de zile inainte si 7 zile dupa meci;
//  - in titlu sau descriere nu e scrisa o alta data decat a meciului.
export function isCandidate(video, stream, vocab = new Map()) {
  const title = norm(video.title);
  const words = title.split(' ');
  const home = teamPosition(stream.home, words, vocab);
  const away = teamPosition(stream.away, words, vocab);
  if (home < 0 || away < 0 || home >= away) return false;
  const padded = ` ${title} `;
  const mine = config.competitions.find((c) => c.key === stream.seriesKey);
  const hasAlias = (c) => c.aliases.some((a) => padded.includes(` ${norm(a)} `));
  if (mine && !hasAlias(mine) && config.competitions.some((c) => c.category !== mine.category && hasAlias(c))) return false;
  const days = (new Date(video.published) - new Date(`${stream.date}T12:00:00Z`)) / 86400000;
  if (!(days >= -30 && days <= 7)) return false;
  return dateInText(`${video.title} ${video.description || ''}`, stream.date) !== 'other';
}

// Leaga automat doar perechile fara dubiu: meciul marcat are exact un video candidat, iar acel video
// nu se potriveste cu niciun alt meci din program (marcat sau nu). Intoarce { [matchId]: videoId }.
// fixtures = toate meciurile din seriile urmarite, in aceeasi forma ca meciurile marcate.
export function autoMatch(videos, streams, fixtures = []) {
  const all = new Map([...fixtures, ...streams].map((f) => [f.matchId, f]));
  const vocab = buildVocab([...all.values()].flatMap((f) => [f.home, f.away]));
  const taken = new Set(streams.filter((s) => s.videoId).map((s) => s.videoId));
  const usable = videos.filter((v) => !taken.has(v.id) && !NOT_A_BROADCAST.test(norm(v.title)));
  const claims = new Map(usable.map((v) => [v.id, [...all.values()].filter((f) => isCandidate(v, f, vocab)).map((f) => f.matchId)]));
  const result = {};
  // noAuto = administratorul a scos manual legatura; nu o mai refacem automat.
  for (const s of streams.filter((x) => !x.videoId && !x.noAuto)) {
    const mine = usable.filter((v) => claims.get(v.id).includes(s.matchId));
    if (mine.length === 1 && claims.get(mine[0].id).length === 1) result[s.matchId] = mine[0].id;
  }
  return result;
}
