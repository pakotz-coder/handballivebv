// Asambleaza datele site-ului: seriile urmarite (meciuri + clasament) si meciurile transmise.
import { config } from '../../config/site.config.mjs';
import { loadSeries } from './source.mjs';
import { computeStandings, verifyStandings } from './standings.mjs';
import { loadVideos, autoMatch } from './youtube.mjs';
import { readStreams, updateStreams } from './store.mjs';

const clubBySource = new Map(config.clubs.map((c) => [c.sourceName.toLowerCase(), c]));
const clubById = new Map(config.clubs.map((c) => [c.clubId, c]));
export const findClub = (team) => clubById.get(team.clubId) || clubBySource.get((team.name || '').toLowerCase()) || null;

const diacriticsRe = new RegExp(`\\b(${Object.keys(config.diacritics).join('|')})\\b`, 'g');
export const pretty = (text) => (text ? text.replace(diacriticsRe, (w) => config.diacritics[w]) : text);

function decorateTeam(team) {
  const club = findClub(team);
  return { id: team.id, name: club ? club.name : pretty(team.name), club: club ? club.slug : null };
}

// Ora Romaniei, ca text comparabil cu datele din sursa (care sunt deja in ora locala).
export function nowInRomania() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export async function loadAllSeries() {
  const results = await Promise.allSettled(config.competitions.map((comp) => loadSeries(comp)));
  return config.competitions.map((comp, i) => {
    const base = { key: comp.key, label: comp.label, category: comp.category, gender: comp.gender, season: config.season };
    if (results[i].status === 'rejected') {
      return { ...base, error: 'Datele oficiale nu sunt disponibile momentan.', matches: [], standings: [], verified: false };
    }
    const s = results[i].value;
    const computed = computeStandings(s.matches, s.official);
    const check = verifyStandings(computed, s.official);
    return {
      ...base,
      seriesName: s.seriesName,
      fetchedAt: s.fetchedAt,
      stale: Boolean(s.stale),
      verified: check.verified,
      verifyNote: check.reason,
      standings: computed.map((r) => ({ ...r, ...decorateTeam({ id: r.teamId, clubId: r.clubId, name: r.name }) })),
      matches: s.matches.map((m) => ({
        id: m.id, round: m.round, date: m.date, time: m.time, played: m.played, live: m.status === 1,
        score: m.score, half: m.half, hall: pretty(m.hall), city: pretty(m.city),
        home: decorateTeam(m.home), away: decorateTeam(m.away),
        brasov: Boolean(findClub(m.home) || findClub(m.away)),
      })),
    };
  });
}

// Ce pastram pentru un meci transmis. Detaliile meciului sunt copiate aici ca arhiva sa ramana
// intreaga si dupa ce sezonul se incheie si meciul dispare din sursa.
export function streamRecord(series, match, previous = {}) {
  return {
    ...previous,
    matchId: match.id, seriesKey: series.key, season: previous.season || series.season,
    label: series.label, category: series.category, gender: series.gender, round: match.round,
    date: match.date, time: match.time, hall: match.hall, city: match.city,
    home: match.home.name, away: match.away.name, homeClub: match.home.club, awayClub: match.away.club,
    played: match.played, score: match.score,
  };
}

const sameRecord = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Aduce la zi meciurile transmise (scor, ora, sala) si leaga automat video-urile fara dubiu.
// Scrie in Blobs doar daca s-a schimbat ceva.
export async function syncStreams(series, videos) {
  const matchIndex = new Map();
  for (const s of series) for (const m of s.matches) matchIndex.set(m.id, [s, m]);
  const refresh = (streams) => {
    let changed = false;
    for (const [id, rec] of Object.entries(streams)) {
      const found = matchIndex.get(Number(id));
      if (!found) continue;
      const next = streamRecord(found[0], found[1], rec);
      if (!sameRecord(next, rec)) { streams[id] = next; changed = true; }
    }
    const matched = autoMatch(videos, Object.values(streams));
    for (const [id, videoId] of Object.entries(matched)) {
      const video = videos.find((v) => v.id === videoId);
      streams[id] = { ...streams[id], videoId, videoTitle: video.title, videoSource: 'auto' };
      changed = true;
    }
    return changed;
  };
  const current = await readStreams();
  const draft = structuredClone(current);
  if (!refresh(draft)) return current;
  return updateStreams(refresh);
}

export async function buildPublicData() {
  const [series, feed] = await Promise.all([loadAllSeries(), loadVideos()]);
  const streams = await syncStreams(series, feed.videos);
  const today = nowInRomania().date;
  const list = Object.values(streams).map((s) => ({ ...s, upcoming: !s.played && s.date >= today }));
  list.sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  return {
    generatedAt: Date.now(),
    season: config.season,
    today,
    youtubeUrl: config.youtube.channelUrl,
    series,
    streams: list,
    clubs: config.clubs.map(({ slug, name, city }) => ({ slug, name, city })),
  };
}
