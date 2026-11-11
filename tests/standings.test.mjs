import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config/site.config.mjs';
import { looseParse, parseCompetition, normalizeSeries } from '../netlify/lib/source.mjs';
import { computeStandings, verifyStandings } from '../netlify/lib/standings.mjs';
import { parseSnapshot, competitionFile, catalogueFile, officialTables } from './fixtures.mjs';

const snapshot = new Map(parseSnapshot().map((c) => [c.compId, c]));
const official = officialTables();

test('catalogul se citeste si contine competitiile urmarite', () => {
  const cat = looseParse(catalogueFile());
  for (const comp of config.competitions) {
    const entry = cat.find((c) => c.broj === comp.compId);
    assert.ok(entry, `lipseste ${comp.compId}`);
    assert.equal(entry.spol, comp.gender === 'f' ? 1 : 0);
  }
});

test('fisierul competitiei (cu chei fara ghilimele) se citeste fara a executa cod', () => {
  const text = competitionFile(snapshot.get(2110));
  assert.throws(() => JSON.parse(text.slice(text.indexOf('=') + 1).trim().slice(0, -1)), 'fixture-ul trebuie sa NU fie JSON strict');
  for (const obj of [looseParse(text), parseCompetition(text)]) {
    assert.equal(obj.broj, 2110);
    assert.equal(obj.naziv, 'U15 Junioare 26-27');
    assert.equal(obj.lige.length, 2);
    assert.deepEqual(obj.lige[1].poredakkraj, []);
    assert.equal(obj.lige[1].utakmice.length, 32);
  }
  assert.equal(looseParse(text).statistika.mu, 8);
});

for (const comp of config.competitions) {
  test(`clasament ${comp.label}: calculat = oficial (frhlive2.com, 11.11.2026)`, () => {
    const series = normalizeSeries(comp, parseCompetition(competitionFile(snapshot.get(comp.compId))));
    const computed = computeStandings(series.matches, series.official);
    const lines = computed.map((r) => `${r.pos}.|${r.name}|${r.played}|${r.w}|${r.d}|${r.l}|${r.gf}:${r.ga}|${r.pts}`);
    assert.deepEqual(lines, official[comp.compId]);
    assert.deepEqual(verifyStandings(computed, series.official), { verified: true, reason: null });
  });
}

test('un clasament care nu coincide cu cel oficial nu este marcat ca verificat', () => {
  const comp = config.competitions[0];
  const series = normalizeSeries(comp, parseCompetition(competitionFile(snapshot.get(comp.compId))));
  const tampered = series.matches.map((m, i) => (i === 0 ? { ...m, score: [m.score[1], m.score[0]] } : m));
  assert.equal(verifyStandings(computeStandings(tampered, series.official), series.official).verified, false);
});

test('departajarea prin meciuri directe bate golaverajul general (U15, locurile 2-3)', () => {
  const comp = config.competitions.find((c) => c.key === 'u15f');
  const series = normalizeSeries(comp, parseCompetition(competitionFile(snapshot.get(comp.compId))));
  const table = computeStandings(series.matches, series.official);
  const [second, third] = [table[1], table[2]];
  assert.equal(second.name, 'ACS Transilvania Brasov');
  assert.equal(third.name, 'ACS KIDS TAMPA 2015 Brasov');
  assert.ok(third.gf - third.ga > second.gf - second.ga, 'echipa de pe 3 are golaveraj general mai bun');
});

test('meciurile neprogramate (ora 01:00, fara sala) nu au ora; forfaitul nu are scor la pauza', () => {
  const comp = config.competitions.find((c) => c.key === 'u17f');
  const series = normalizeSeries(comp, parseCompetition(competitionFile(snapshot.get(comp.compId))));
  const tba = series.matches.find((m) => m.id === 1679351);
  assert.equal(tba.time, null);
  assert.equal(tba.hall, null);
  const forfeit = series.matches.find((m) => m.id === 1668324);
  assert.deepEqual(forfeit.score, [0, 10]);
  assert.equal(forfeit.half, null);
});
