// Citirea datelor oficiale FRH (sportinfocentar2.com), doar pe server, cu cache in Netlify Blobs.
import { config } from '../../config/site.config.mjs';
import { cacheStore } from './store.mjs';

const baseUrl = () => process.env.SOURCE_BASE_URL || config.source.baseUrl;

// Fisierele sursei sunt JavaScript ("var natjecanjeobjekt = {...};"), aproape JSON, dar nu chiar:
// unele chei nu au ghilimele (poredakkraj) si unele numere au zero in fata ("mu": 08).
// Nu executam codul primit; il aducem la JSON strict si il citim cu JSON.parse.
export function toStrictJson(s) {
  let out = '';
  let i = 0;
  let prev = ''; // ultimul caracter semnificativ din afara sirurilor
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
      // caracterele de control brute dintr-un sir (tab, rand nou) nu sunt permise in JSON
      out += s.slice(i, j + 1).replace(/[\u0000-\u001f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
      i = j + 1;
      prev = '"';
    } else if ((prev === '{' || prev === ',') && /[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(s[j])) j++;
      let k = j;
      while (k < n && /\s/.test(s[k])) k++;
      const word = s.slice(i, j);
      out += s[k] === ':' ? `"${word}"` : word;
      i = j;
      prev = 'a';
    } else if (c === '0' && /[:,[-]/.test(prev) && /\d/.test(s[i + 1] || '')) {
      i++; // zero in fata unui numar: il sarim
    } else {
      out += c;
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  return out;
}

export function looseParse(text) {
  let body = text.slice(text.indexOf('=') + 1).trim();
  if (body.endsWith(';')) body = body.slice(0, -1);
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(toStrictJson(body));
  }
}

// Dintr-un fisier de competitie (2+ MB) ne trebuie doar numele si seriile ("lige"). Decupam
// tabloul "lige" tinand cont de siruri, ca restul fisierului (statistici etc.) sa nu ne poata incurca.
export function parseCompetition(text) {
  const at = text.search(/"lige"\s*:\s*\[/);
  if (at < 0) throw new Error('Fisierul competitiei nu contine "lige".');
  const open = text.indexOf('[', at);
  let depth = 0;
  let i = open;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    } else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const head = text.slice(0, at);
  return {
    broj: Number((head.match(/"broj"\s*:\s*(\d+)/) || [])[1]),
    naziv: (head.match(/"naziv"\s*:\s*"([^"]*)"/) || [])[1] || '',
    lige: JSON.parse(toStrictJson(text.slice(open, i + 1))),
  };
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'HandbalLiveBV-site/1.0' } });
  if (!res.ok) throw new Error(`Sursa a raspuns ${res.status} pentru ${url}`);
  return res.text();
}

// Statusuri in sursa (din scriptul oficial): 0 neinceput, 1 in joc, 2 terminat,
// 3 dupa prelungiri, 4 dupa aruncari de la 7 m.
const isPlayed = (u) => u.st >= 2 && u.st <= 4 && u.r1 != null && u.r2 != null;

export function normalizeSeries(comp, obj) {
  const liga = (obj.lige || []).find((l) => l.broj === comp.seriesId);
  if (!liga) throw new Error(`Seria ${comp.seriesId} nu exista in competitia ${comp.compId} (${obj.naziv})`);
  const matches = liga.utakmice.map((u) => {
    const played = isPlayed(u);
    const halves = [u.p11, u.p12, u.p21, u.p22];
    const halvesOk = played && halves.every((x) => x != null) && u.p11 + u.p21 === u.r1 && u.p12 + u.p22 === u.r2;
    const time = (u.p || '').slice(0, 5);
    return {
      id: u.broj,
      round: u.kolo,
      date: u.d,
      // Meciurile inca neprogramate apar in sursa cu ora 01:00 si fara sala.
      time: !time || (time === '01:00' && !u.mnaziv) ? null : time,
      home: { id: u.br1, clubId: u.k1, name: u.e1 },
      away: { id: u.br2, clubId: u.k2, name: u.e2 },
      status: u.st,
      played,
      score: played ? [u.r1, u.r2] : null,
      half: halvesOk ? [u.p11, u.p12] : null,
      hall: (u.mnaziv || '').trim() || null,
      city: (u.mmjesto || '').trim() || null,
    };
  });
  // Clasamentul oficial calculat de federatie: il folosim doar ca termen de comparatie
  // si pentru penalizari (dod), nu il afisam ca atare.
  const official = (liga.tablica || []).map((t) => ({
    pos: t.por, teamId: t.e, clubId: t.k, name: t.n, played: t.utk, w: t.pob, d: t.ner, l: t.izg,
    gf: t.dat, ga: t.prim, pts: t.bod, adj: t.dod || 0,
  }));
  return { compId: comp.compId, seriesId: comp.seriesId, compName: obj.naziv, seriesName: liga.naziv, matches, official };
}

const memory = new Map();
const RETRY_MS = 2 * 60000; // dupa un esec, nu mai intrebam serverul federatiei 2 minute

// Intoarce seria normalizata pentru o competitie urmarita. Foloseste cache-ul cat timp e proaspat;
// daca sursa nu raspunde, serveste ultima varianta buna (stale: true) si asteapta inainte de a reincerca.
export async function loadSeries(comp) {
  const key = `series-${comp.compId}-${comp.seriesId}`;
  const ttl = config.source.cacheMinutes * 60000;
  const fresh = (e) => e && Date.now() - (e.checkedAt ?? e.fetchedAt) < ttl;
  if (fresh(memory.get(key))) return memory.get(key);
  const store = cacheStore();
  const cached = await store.get(key, { type: 'json' });
  if (fresh(cached)) {
    memory.set(key, cached);
    return cached;
  }
  try {
    const text = await fetchText(`${baseUrl()}/natjecanje${comp.compId}.js`);
    const entry = { ...normalizeSeries(comp, parseCompetition(text)), fetchedAt: Date.now() };
    await store.setJSON(key, entry);
    memory.set(key, entry);
    return entry;
  } catch (err) {
    console.error(`[sursa] ${key}: ${err.message}`);
    if (!cached) throw err;
    const entry = { ...cached, stale: true, checkedAt: Date.now() - ttl + RETRY_MS };
    await store.setJSON(key, entry).catch(() => {});
    memory.set(key, entry);
    return entry;
  }
}

export async function loadCatalogue() {
  return looseParse(await fetchText(`${baseUrl()}/${config.source.catalogueFile}`));
}

export async function loadCompetitionRaw(compId) {
  return parseCompetition(await fetchText(`${baseUrl()}/natjecanje${compId}.js`));
}
