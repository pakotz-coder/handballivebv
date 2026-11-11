// Reconstruieste fisierele sursei FRH (acelasi format, cu aceleasi ciudatenii) dintr-un instantaneu
// REAL al datelor, luat la 11.11.2026 din sportinfocentar2.com. Folosit de teste si de serverul
// local de simulare (tests/mock-source.mjs), pentru ca testele sa nu depinda de serverul federatiei.
import { readFileSync } from 'node:fs';

const dir = new URL('./fixtures/', import.meta.url);
const NAMES = { 2099: 'Divizia A Feminin 26-27', 2109: 'U17 Junioare 26-27', 2110: 'U15 Junioare 26-27', 2111: 'U19 Junioare 26-27' };
const SERIES = { 4210: 'Seria B', 4252: 'Seria E', 4265: 'Seria I', 4277: 'Seria E' };
const num = (x) => (x === '' ? null : Number(x));

export function parseSnapshot() {
  const comps = [];
  let cur = null;
  for (const line of readFileSync(new URL('snapshot-2026-11-11.txt', dir), 'utf8').split('\n')) {
    if (!line) continue;
    if (line.startsWith('#C ')) {
      const [, compId, seriesId, ...rest] = line.split(' ');
      const flags = Object.fromEntries(rest.map((kv) => kv.split('=').map((v, i) => (i ? Number(v) : v))));
      cur = { compId: Number(compId), seriesId: Number(seriesId), flags, halls: [], table: [], matches: [] };
      comps.push(cur);
    } else if (line.startsWith('#H ')) {
      cur.halls = line.slice(3).split('|').map((h) => { const i = h.lastIndexOf('/'); return [h.slice(0, i), h.slice(i + 1)]; });
    } else if (line.startsWith('#T ')) {
      cur.table = line.slice(3).split('|').map((row) => {
        const [por, e, k, n, utk, pob, ner, izg, dat, prim, raz, bod, dod, medb, medd, medr] = row.split(';');
        return { por: +por, e: +e, k: +k, n, utk: +utk, pob: +pob, ner: +ner, izg: +izg, dat: +dat, prim: +prim, raz: +raz, bod: +bod, dod: +dod, medb: +medb, medd: +medd, medr: +medr };
      });
    } else {
      const [broj, kolo, md, p, br1, br2, r1, r2, p11, p12, p21, p22, st, hall] = line.split(';');
      const d = `${Number(md.slice(0, 2)) >= 7 ? 2026 : 2027}-${md}`;
      const team = (id) => cur.table.find((t) => t.e === Number(id));
      const [mnaziv, mmjesto] = cur.halls[Number(hall)];
      cur.matches.push({
        broj: +broj, e1: team(br1).n, e2: team(br2).n, k1: team(br1).k, k2: team(br2).k, d, p: `${p}:00`, pc: `${d}T${p}:00`,
        br1: +br1, br2: +br2, r1: num(r1), r2: num(r2), p11: num(p11), p12: num(p12), p21: num(p21), p22: num(p22),
        kolo: +kolo, sv: 1, ts: +st === 2 ? 3 : 0, st: +st, mnaziv, mmjesto,
      });
    }
  }
  return comps;
}

// Fisierul unei competitii, in formatul sursei: prefix "var natjecanjeobjekt =", CRLF,
// o cheie fara ghilimele (poredakkraj), numere cu zero in fata ("mu": 08) si ";" la final.
export function competitionFile(comp) {
  const liga = (broj, naziv, c) => `{\t"broj": ${broj}, \t"naziv": "${naziv}", \t"kr": 1, \t"f": 1, \t"r": ${c ? c.flags.r : 1}, \t"t": 0, \t"tr": 0, \t"kb": null, "utakmice": [\r\n`
    + (c ? c.matches.map((m) => `\t\t\t\t${JSON.stringify(m)}`).join('\r\n\t\t\t\t, ') : '')
    + `\r\n\t\t],\r\n\t\t"tablica": [\r\n` + (c ? c.table.map((t) => `\t\t\t${JSON.stringify({ ...t, kr: 'ro', vr: 0, keid: '' })}`).join('\r\n\t\t\t, ') : '')
    + `\r\n\t\t],\r\n                "poredak": [], poredakkraj: [],\r\n\t\t"sudionici": [],\r\n\t\t"kola": [],\r\n\t\t"turniri": []\r\n\r\n\t\t}`;
  return `var natjecanjeobjekt = \r\n{\r\n\t\t"broj": ${comp.compId}, \t"naziv": "${NAMES[comp.compId]}", \t"spol": 1, \t"sport": 2, "sluzbenici":[], "lige": [\r\n\t\r\n\t\t`
    + [liga(comp.seriesId - 1, 'Seria X (fara cluburi urmarite)', null), liga(comp.seriesId, SERIES[comp.seriesId], comp)].join('\r\n\t\r\n\t\t, ')
    + `\r\n], "ekipe": [${comp.table.map((t) => `{"ekipa": ${t.e}, "naziv": "${t.n}", "statusrostera": null}`).join(', ')}], "rosteri": [], "statistika": {"mvp": 0, "mu": 08, "stat": [{"e": 1, "ime": "x]}", "a": 00}]}\r\n}\r\n;\r\n`;
}

export const catalogueFile = () => readFileSync(new URL('natjecanja13.js', dir), 'utf8');
export const youtubeFeed = (name = 'youtube-feed-2026-11-11.xml') => readFileSync(new URL(name, dir), 'utf8');
export const officialTables = () => JSON.parse(readFileSync(new URL('official-frhlive2-2026-11-11.json', dir), 'utf8'));
