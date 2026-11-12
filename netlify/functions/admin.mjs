// /api/admin/* — panoul de administrare: autentificare, marcarea meciurilor transmise, legarea video-urilor
// (din lista canalului sau cu un link de YouTube de pe orice canal).
import { purgeCache } from '@netlify/functions';
import { config as site } from '../../config/site.config.mjs';
import * as auth from '../lib/auth.mjs';
import { loadAllSeries, syncStreams, streamRecord, nowInRomania, findClub } from '../lib/model.mjs';
import { loadVideos, parseYoutubeLink, videoInfo } from '../lib/youtube.mjs';
import { updateStreams, UserError } from '../lib/store.mjs';
import { loadCatalogue, loadCompetitionRaw } from '../lib/source.mjs';

const json = (body, init = {}) => Response.json(body, { ...init, headers: { 'cache-control': 'no-store', ...(init.headers || {}) } });
const fail = (status, error) => json({ error }, { status });

async function publish() {
  try { await purgeCache({ tags: ['site-data'] }); } catch { /* local (netlify dev) nu exista CDN */ }
}

async function state() {
  const [series, feed] = await Promise.all([loadAllSeries(), loadVideos()]);
  const streams = await syncStreams(series, feed.videos);
  const today = nowInRomania().date;
  const matches = [];
  const listed = new Set();
  for (const s of series) {
    for (const m of s.matches) {
      if (!m.brasov) continue;
      const rec = streams[m.id];
      listed.add(m.id);
      matches.push({
        id: m.id, label: s.label, category: s.category, round: m.round, date: m.date, time: m.time,
        hall: m.hall, city: m.city, home: m.home.name, away: m.away.name, played: m.played, score: m.score,
        upcoming: !m.played && m.date >= today,
        streamed: Boolean(rec), videoId: rec?.videoId || null, videoTitle: rec?.videoTitle || null, videoSource: rec?.videoSource || null,
        videoUrl: rec?.videoUrl || null, videoChannel: rec?.videoChannel || null,
      });
    }
  }
  // Meciuri transmise in sezoane trecute (nu mai sunt in sursa), ca sa poata fi corectate si ele.
  for (const rec of Object.values(streams)) {
    if (listed.has(rec.matchId)) continue;
    matches.push({
      id: rec.matchId, label: rec.label, category: rec.category, round: rec.round, date: rec.date, time: rec.time,
      hall: rec.hall, city: rec.city, home: rec.home, away: rec.away, played: rec.played, score: rec.score,
      upcoming: false, streamed: true, videoId: rec.videoId || null, videoTitle: rec.videoTitle || null, videoSource: rec.videoSource || null,
      videoUrl: rec.videoUrl || null, videoChannel: rec.videoChannel || null,
    });
  }
  matches.sort((a, b) => `${a.date}${a.time || '99'}`.localeCompare(`${b.date}${b.time || '99'}`));
  return json({
    today, matches, videos: feed.videos, youtubeUrl: site.youtube.channelUrl,
    warnings: [
      ...series.filter((s) => s.error).map((s) => `${s.label}: ${s.error}`),
      ...(feed.stale ? ['Lista de videoclipuri de pe YouTube nu a putut fi actualizată.'] : []),
    ],
  });
}

async function toggle({ matchId, on }) {
  const series = await loadAllSeries();
  let found = null;
  for (const s of series) {
    const m = s.matches.find((x) => x.id === Number(matchId));
    if (m) found = [s, m];
  }
  await updateStreams((streams) => {
    if (!on) {
      if (!streams[matchId]) return false;
      delete streams[matchId];
    } else {
      if (!found || !found[1].brasov) throw new UserError('Meciul nu a fost găsit în competițiile urmărite.');
      streams[matchId] = { ...streamRecord(found[0], found[1], streams[matchId]), markedAt: Date.now() };
    }
  });
  const feed = await loadVideos();
  await syncStreams(series, feed.videos);
  await publish();
  return state();
}

async function setVideo({ matchId, videoId }) {
  const feed = await loadVideos();
  const video = videoId ? feed.videos.find((v) => v.id === videoId) : null;
  if (videoId && !video) return fail(400, 'Videoclipul nu mai apare în lista canalului.');
  await updateStreams((streams) => {
    const rec = streams[matchId];
    if (!rec) throw new UserError('Meciul nu este marcat ca transmis.');
    streams[matchId] = video
      ? { ...rec, videoId: video.id, videoUrl: null, videoTitle: video.title, videoChannel: null, videoSource: 'manual', noAuto: false }
      : { ...rec, videoId: null, videoUrl: null, videoTitle: null, videoChannel: null, videoSource: null, noAuto: true };
  });
  await publish();
  return state();
}

// Link de YouTube lipit de administrator: transmisia poate fi pe orice canal, nu doar pe al nostru.
// noAuto: un link pus de mana nu mai e inlocuit de potrivirea automata.
async function setLink({ matchId, url }) {
  const link = parseYoutubeLink(url);
  if (!link) return fail(400, 'Acesta nu este un link de YouTube. Copiază linkul din YouTube (Distribuie → Copiază linkul) și lipește-l aici.');
  const info = link.videoId ? await videoInfo(link.url) : null;
  await updateStreams((streams) => {
    const rec = streams[matchId];
    if (!rec) throw new UserError('Meciul nu este marcat ca transmis.');
    streams[matchId] = {
      ...rec, videoId: link.videoId, videoUrl: link.url, videoTitle: info?.title || null, videoChannel: info?.channel || null,
      videoSource: 'link', noAuto: true,
    };
  });
  await publish();
  return state();
}

// Ajutor pentru trecerea la sezonul urmator: cauta in catalogul FRH competitiile cu acelasi nume
// si, in fiecare, seria cu cele mai multe cluburi brasovene. Intoarce randurile gata de pus in config.
async function seasonHelper() {
  const catalogue = await loadCatalogue();
  const baseName = (n) => n.replace(/\s*\d{2,4}-\d{2,4}\s*$/, '').trim().toLowerCase();
  const out = [];
  for (const comp of site.competitions) {
    const candidates = catalogue.filter((c) => baseName(c.naziv) === comp.label.toLowerCase() && c.spol === (comp.gender === 'f' ? 1 : 0));
    for (const cand of candidates) {
      const raw = await loadCompetitionRaw(cand.broj);
      const seriesList = raw.lige.map((l) => {
        const clubs = new Set();
        for (const u of l.utakmice) {
          for (const t of [{ clubId: u.k1, name: u.e1 }, { clubId: u.k2, name: u.e2 }]) {
            const club = findClub(t);
            if (club) clubs.add(club.name);
          }
        }
        return { seriesId: l.broj, seriesName: l.naziv, brasovClubs: [...clubs] };
      }).filter((s) => s.brasovClubs.length).sort((a, b) => b.brasovClubs.length - a.brasovClubs.length);
      out.push({ key: comp.key, label: comp.label, compId: cand.broj, compName: cand.naziv, current: cand.broj === comp.compId, currentSeriesId: comp.seriesId, series: seriesList });
    }
    if (!candidates.length) out.push({ key: comp.key, label: comp.label, compId: null, series: [] });
  }
  return json({ season: site.season, competitions: out });
}

export default async (req, context) => {
  const route = new URL(req.url).pathname.replace(/^\/api\/admin\//, '');
  const isPost = req.method === 'POST';
  if (isPost && !auth.sameOrigin(req)) return fail(403, 'Cerere respinsă.');
  let body = {};
  if (isPost) {
    try { body = await req.json(); } catch { body = null; }
    if (!body || typeof body !== 'object') return fail(400, 'Cerere invalidă.');
  }
  const ip = context?.ip || '';

  try {
    if (route === 'login' && isPost) {
      if (!auth.passwordConfigured()) return fail(503, 'Parola de administrare nu este configurată (variabila ADMIN_PASSWORD în Netlify, minimum 8 caractere).');
      if (!(await auth.loginAllowed(ip))) return fail(429, 'Prea multe încercări greșite. Încearcă din nou peste 15 minute.');
      if (!auth.checkPassword(body.password)) {
        await auth.recordFailedLogin(ip);
        return fail(401, 'Parolă greșită.');
      }
      return json({ ok: true }, { headers: { 'set-cookie': auth.sessionCookie() } });
    }
    if (route === 'logout' && isPost) return json({ ok: true }, { headers: { 'set-cookie': auth.clearCookie() } });

    if (!auth.isAuthenticated(req)) return fail(401, 'Autentificare necesară.');
    if (route === 'state' && req.method === 'GET') return await state();
    if (route === 'toggle' && isPost) return await toggle(body);
    if (route === 'video' && isPost) return await setVideo(body);
    if (route === 'link' && isPost) return await setLink(body);
    if (route === 'season' && req.method === 'GET') return await seasonHelper();
    return fail(404, 'Rută necunoscută.');
  } catch (err) {
    console.error(err);
    return err instanceof UserError ? fail(400, err.message) : fail(500, 'A apărut o eroare neașteptată. Încearcă din nou.');
  }
};

export const config = { path: '/api/admin/*' };
