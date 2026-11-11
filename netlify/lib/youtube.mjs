// Feed-ul public al canalului YouTube si potrivirea automata video <-> meci.
import { config } from '../../config/site.config.mjs';
import { cacheStore } from './store.mjs';

const feedUrl = () =>
  `${process.env.YOUTUBE_FEED_BASE_URL || config.youtube.feedBaseUrl}?channel_id=${config.youtube.channelId}`;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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

export async function loadVideos() {
  const ttl = config.youtube.cacheMinutes * 60000;
  const fresh = (e) => e && Date.now() - e.fetchedAt < ttl;
  if (fresh(memory)) return memory;
  const store = cacheStore();
  const cached = await store.get('youtube-feed', { type: 'json' });
  if (fresh(cached)) return (memory = cached);
  try {
    const res = await fetch(feedUrl(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`YouTube a raspuns ${res.status}`);
    const entry = { videos: parseFeed(await res.text()), fetchedAt: Date.now() };
    await store.setJSON('youtube-feed', entry);
    return (memory = entry);
  } catch (err) {
    console.error(`[youtube] ${err.message}`);
    return cached ? { ...cached, stale: true } : { videos: [], fetchedAt: 0, stale: true };
  }
}

export const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Cuvinte care nu deosebesc o echipa de alta (forme juridice, orasul comun).
const GENERIC = new Set(['cs', 'acs', 'as', 'sc', 'hc', 'ahc', 'hcf', 'lps', 'ct', 'clubul', 'sportiv', 'brasov']);
// Prefixe care conteaza doar cand restul numelui e identic (CSM Fagaras / CSS Fagaras).
const PREFIX = new Set(['csm', 'css', 'cso', 'csu', 'scm']);

function teamInTitle(teamName, titleWords) {
  const words = norm(teamName).split(' ').filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w));
  const key = words.filter((w) => !PREFIX.has(w));
  if (!key.length) return false;
  if (!key.every((w) => titleWords.has(w))) return false;
  const prefix = words.find((w) => PREFIX.has(w));
  // Daca titlul contine un alt prefix de club (ex. "CSS" cand echipa e "CSM"), nu e aceeasi echipa.
  const other = [...PREFIX].some((p) => p !== prefix && titleWords.has(p));
  return !(prefix && other && !titleWords.has(prefix));
}

function dateInText(text, isoDate) {
  const [y, m, d] = isoDate.split('-');
  const re = new RegExp(`(^|\\D)0?${Number(d)}[./-]0?${Number(m)}([./-](${y}|${y.slice(2)}))?(\\D|$)`);
  return re.test(text);
}

// Un video e candidat pentru un meci daca titlul contine ambele echipe, nu indica alta categorie
// si data se potriveste: fie data meciului apare in titlu/descriere, fie video-ul a fost creat
// cu cel mult 21 de zile inainte si 3 zile dupa meci.
export function isCandidate(video, stream) {
  const title = norm(video.title);
  const words = new Set(title.split(' '));
  if (!teamInTitle(stream.home, words) || !teamInTitle(stream.away, words)) return false;
  const padded = ` ${title} `;
  const mine = config.competitions.find((c) => c.key === stream.seriesKey);
  const hasAlias = (c) => c.aliases.some((a) => padded.includes(` ${norm(a)} `));
  if (mine && !hasAlias(mine) && config.competitions.some((c) => c.category !== mine.category && hasAlias(c))) return false;
  const text = `${video.title} ${video.description || ''}`;
  if (dateInText(text, stream.date)) return true;
  if (/\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(text)) return false; // are o alta data scrisa explicit
  const days = (new Date(video.published) - new Date(`${stream.date}T12:00:00Z`)) / 86400000;
  return days >= -21 && days <= 3;
}

// Leaga automat doar perechile fara dubiu: meciul are exact un video candidat si acel video
// nu e candidat pentru niciun alt meci marcat. Intoarce { [matchId]: videoId }.
export function autoMatch(videos, streams) {
  // noAuto = administratorul a scos manual legatura; nu o mai refacem automat.
  const open = streams.filter((s) => !s.videoId && !s.noAuto);
  const taken = new Set(streams.filter((s) => s.videoId).map((s) => s.videoId));
  const candidates = new Map(open.map((s) => [s.matchId, videos.filter((v) => !taken.has(v.id) && isCandidate(v, s))]));
  const claims = new Map();
  for (const list of candidates.values()) for (const v of list) claims.set(v.id, (claims.get(v.id) || 0) + 1);
  const result = {};
  for (const [matchId, list] of candidates) {
    if (list.length === 1 && claims.get(list[0].id) === 1) result[matchId] = list[0].id;
  }
  return result;
}
