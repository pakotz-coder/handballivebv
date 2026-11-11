import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, isCandidate, autoMatch } from '../netlify/lib/youtube.mjs';
import { youtubeFeed } from './fixtures.mjs';

// Meciuri reale din programul oficial (instantaneul din 11.11.2026), in forma in care sunt salvate ca "transmise".
const stream = (matchId, seriesKey, date, home, away, extra = {}) => ({ matchId, seriesKey, date, home, away, ...extra });
const u15 = stream(1680855, 'u15f', '2026-11-15', 'ACS Sporting Ghimbav', 'CSM Corona Brașov');
const u17 = stream(1679347, 'u17f', '2026-11-14', 'CSM Corona Brașov', 'CSS Sighișoara');
const divA = stream(1678175, 'divaf', '2026-11-14', 'CSM Făgăraș', 'CS Știința Bacău');
// Video-uri inventate pentru test (canalul real nu are inca transmisii programate pentru aceste meciuri).
const video = (id, title, published, description = '') => ({ id, title, published, description });

test('feed-ul real al canalului se citeste (2 video-uri la 11.11.2026)', () => {
  const videos = parseFeed(youtubeFeed());
  assert.deepEqual(videos.map((v) => v.id), ['52X4uuWOBwE', 'EzGiSVRi4Is']);
  assert.equal(videos[0].title, 'CS Rapid J2   -  CSM Corona J2   Highlights');
  assert.match(videos[0].description, /22\.08\.2025/);
});

test('video-urile reale de pe canal nu se leaga gresit de meciurile din program', () => {
  const videos = parseFeed(youtubeFeed());
  assert.deepEqual(autoMatch(videos, [u15, u17, divA]), {});
});

test('titlu cu ambele echipe si data meciului: legat automat', () => {
  const v = video('aaa', 'Sporting Ghimbav - CSM Corona Brașov | U15 Junioare | 15.11.2026', '2026-11-10T08:00:00+00:00');
  assert.equal(isCandidate(v, u15), true);
  assert.deepEqual(autoMatch([v], [u15, u17]), { 1680855: 'aaa' });
});

test('titlu scurt, fara data (cum scrie canalul: "CSM Corona J2"), creat cu cateva zile inainte de meci', () => {
  const v = video('bbb', 'CSM Corona J2 - CSS Sighisoara J2', '2026-11-12T18:00:00+00:00');
  assert.deepEqual(autoMatch([v], [u15, u17]), { 1679347: 'bbb' });
});

test('alta categorie in titlu sau alta data scrisa explicit: nu e candidat', () => {
  assert.equal(isCandidate(video('c', 'Sporting Ghimbav - Corona Brasov U17', '2026-11-14T08:00:00+00:00'), u15), false);
  assert.equal(isCandidate(video('d', 'Sporting Ghimbav - Corona Brasov 08.03.2026', '2026-11-14T08:00:00+00:00'), u15), false);
  assert.equal(isCandidate(video('e', 'Sporting Ghimbav - Corona Brasov', '2026-09-01T08:00:00+00:00'), u15), false, 'creat cu mult inainte de meci');
});

test('aceleasi echipe la doua categorii, titlu fara categorie: nu ghicim, ramane de ales din lista', () => {
  const u17same = stream(1, 'u17f', '2026-11-15', 'ACS Sporting Ghimbav', 'CSM Corona Brașov');
  const v = video('f', 'Sporting Ghimbav - CSM Corona Brasov', '2026-11-14T08:00:00+00:00');
  assert.deepEqual(autoMatch([v], [u15, u17same]), {});
  const tagged = video('g', 'Sporting Ghimbav - CSM Corona Brasov J3', '2026-11-14T08:00:00+00:00');
  assert.deepEqual(autoMatch([tagged], [u15, u17same]), { 1680855: 'g' });
});

test('CSM Fagaras si CSS Fagaras nu se confunda', () => {
  const v = video('h', 'CSS Fagaras - Stiinta Bacau', '2026-11-13T08:00:00+00:00');
  assert.equal(isCandidate(v, divA), false);
  assert.equal(isCandidate(video('i', 'CSM Fagaras - CS Stiinta Bacau', '2026-11-13T08:00:00+00:00'), divA), true);
});

test('doua video-uri posibile pentru acelasi meci, un video deja folosit, legatura scoasa manual', () => {
  const a = video('j', 'Sporting Ghimbav - CSM Corona Brasov U15', '2026-11-14T08:00:00+00:00');
  const b = video('k', 'Sporting Ghimbav - CSM Corona Brasov U15 repriza 2', '2026-11-15T08:00:00+00:00');
  assert.deepEqual(autoMatch([a, b], [u15]), {}, 'doua candidate: alege administratorul');
  assert.deepEqual(autoMatch([a], [{ ...u15, noAuto: true }]), {}, 'legatura scoasa manual nu se reface');
  assert.deepEqual(autoMatch([a], [u15, { ...u17, videoId: 'j' }]), {}, 'video-ul e deja legat de alt meci');
});

// --- cazuri gasite la verificarea independenta ---
import { buildVocab } from '../netlify/lib/youtube.mjs';
import { parseSnapshot } from './fixtures.mjs';

// Toate meciurile reale din cele patru serii, in forma folosita la potrivire.
const KEYS = { 2110: 'u15f', 2109: 'u17f', 2111: 'u19f', 2099: 'divaf' };
const fixtures = parseSnapshot().flatMap((c) => c.matches.map((m) => ({ matchId: m.broj, seriesKey: KEYS[c.compId], date: m.d, home: m.e1, away: m.e2 })));
const vocab = buildVocab(fixtures.flatMap((f) => [f.home, f.away]));
const fixture = (id) => fixtures.find((f) => f.matchId === id);

test('prefixul se verifica langa numele echipei: "CSS Fagaras - CSM Corona" nu e meciul lui CSM Fagaras', () => {
  const m = stream(9, 'divaf', '2026-11-20', 'CSM Fagaras', 'CSM Corona Brasov');
  assert.equal(isCandidate(video('p1', 'CSS Fagaras - CSM Corona', '2026-11-19T08:00:00+00:00'), m, vocab), false);
  assert.equal(isCandidate(video('p2', 'CSM Fagaras - CSM Corona', '2026-11-19T08:00:00+00:00'), m, vocab), true);
  const dinamo = stream(10, 'u15f', '2026-11-20', 'CSS Dinamo Brasov', 'CSM Corona Brasov');
  assert.equal(isCandidate(video('p3', 'Dinamo J3 - CSM Corona J3', '2026-11-19T08:00:00+00:00'), dinamo, vocab), true, 'prefixul adversarului nu e scris');
});

test('titluri scurte: un cuvant care apartine unei singure echipe e de ajuns; unul comun mai multora nu', () => {
  assert.deepEqual(autoMatch([video('s1', 'Sporting - Corona U15', '2026-11-14T08:00:00+00:00')], [fixture(1680855)], fixtures), { 1680855: 's1' });
  const codlea = fixtures.find((f) => f.seriesKey === 'u15f' && f.home === 'ACS Transilvania Brasov' && f.away === 'CS Magura Codlea' && f.date === '2026-11-15');
  assert.ok(codlea);
  assert.equal(isCandidate(video('s2', 'Transilvania - Codlea', '2026-11-14T08:00:00+00:00'), codlea, vocab), true);
  assert.equal(isCandidate(video('s3', 'Transilvania - Magura', '2026-11-14T08:00:00+00:00'), codlea, vocab), false, '"Magura" e si Codlea, si Cisnadie');
});

test('aceleasi cluburi joaca si la alta categorie in aceeasi perioada: fara categorie in titlu nu se leaga, chiar daca doar un meci e marcat', () => {
  const u15match = stream(101, 'u15f', '2026-11-21', 'ACS Transilvania Brasov', 'CSM Corona Brasov');
  const u17match = stream(102, 'u17f', '2026-11-22', 'ACS Transilvania Brasov', 'CSM Corona Brasov');
  const v = video('c1', 'Transilvania - Corona', '2026-11-20T08:00:00+00:00');
  assert.deepEqual(autoMatch([v], [u15match], [u15match, u17match]), {});
  assert.deepEqual(autoMatch([video('c2', 'Transilvania - Corona U15', '2026-11-20T08:00:00+00:00')], [u15match], [u15match, u17match]), { 101: 'c2' });
});

test('anul din data conteaza, ordinea echipelor conteaza, rezumatele nu se leaga automat', () => {
  assert.equal(isCandidate(video('d1', 'Sporting Ghimbav - CSM Corona 15.11.2025', '2026-11-14T08:00:00+00:00'), u15, vocab), false, 'alt an');
  assert.equal(isCandidate(video('d2', 'Sporting Ghimbav - CSM Corona 15.11', '2025-11-14T08:00:00+00:00'), u15, vocab), false, 'video de acum un an');
  assert.equal(isCandidate(video('d3', 'CSM Corona - Sporting Ghimbav', '2026-11-14T08:00:00+00:00'), u15, vocab), false, 'echipele inversate = meciul retur');
  assert.deepEqual(autoMatch([video('d4', 'Sporting Ghimbav - CSM Corona U15 Highlights', '2026-11-16T08:00:00+00:00')], [u15], fixtures), {});
  assert.deepEqual(autoMatch([video('d5', 'Sporting Ghimbav - CSM Corona U15', '2026-11-14T08:00:00+00:00')], [u15], fixtures), { 1680855: 'd5' });
});

test('titlurile din feed sunt decodate (entitati numerice)', () => {
  const xml = '<entry><yt:videoId>x1</yt:videoId><title>A &amp; B &#8211; C&#x27;s &quot;D&quot;</title><published>2026-01-01T00:00:00+00:00</published></entry>';
  assert.equal(parseFeed(xml)[0].title, 'A & B – C\'s "D"');
});
