// Clasament calculat din meciurile jucate: victorie 2 puncte, egal 1, infrangere 0.
// Departajare la egalitate de puncte (dedusa din datele oficiale FRH: campurile medb/medr/medd
// si confirmata pe cele patru serii urmarite, vezi tests/standings.test.mjs):
//   1. punctele din meciurile directe dintre echipele aflate la egalitate
//   2. golaverajul din meciurile directe
//   3. golurile marcate in meciurile directe
//   4. golaverajul general
//   5. golurile marcate in total

function emptyRow(team) {
  return { teamId: team.id, clubId: team.clubId, name: team.name, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, adj: 0 };
}

function addResult(row, gf, ga) {
  row.played++;
  row.gf += gf;
  row.ga += ga;
  if (gf > ga) { row.w++; row.pts += 2; } else if (gf === ga) { row.d++; row.pts += 1; } else row.l++;
}

function headToHead(group, matches) {
  const ids = new Set(group.map((r) => r.teamId));
  const mini = new Map(group.map((r) => [r.teamId, { pts: 0, gf: 0, ga: 0 }]));
  for (const m of matches) {
    if (!m.played || !ids.has(m.home.id) || !ids.has(m.away.id)) continue;
    const [a, b] = m.score;
    const h = mini.get(m.home.id);
    const g = mini.get(m.away.id);
    h.gf += a; h.ga += b; g.gf += b; g.ga += a;
    if (a > b) h.pts += 2; else if (a < b) g.pts += 2; else { h.pts++; g.pts++; }
  }
  return mini;
}

// official (optional) = clasamentul federatiei; din el luam doar penalizarile (adj) si echipele
// fara niciun meci (retrase), care nu pot fi deduse din rezultate.
export function computeStandings(matches, official = []) {
  const rows = new Map();
  const row = (team) => {
    if (!rows.has(team.id)) rows.set(team.id, emptyRow(team));
    return rows.get(team.id);
  };
  for (const m of matches) {
    row(m.home);
    row(m.away);
    if (!m.played) continue;
    addResult(row(m.home), m.score[0], m.score[1]);
    addResult(row(m.away), m.score[1], m.score[0]);
  }
  for (const o of official) {
    const r = row({ id: o.teamId, clubId: o.clubId, name: o.name });
    r.adj = o.adj || 0;
    r.pts += r.adj;
  }

  const list = [...rows.values()];
  const byPoints = new Map();
  for (const r of list) byPoints.set(r.pts, [...(byPoints.get(r.pts) || []), r]);
  const sorted = [];
  for (const pts of [...byPoints.keys()].sort((a, b) => b - a)) {
    const group = byPoints.get(pts);
    if (group.length > 1) {
      const mini = headToHead(group, matches);
      group.sort((x, y) => {
        const a = mini.get(x.teamId);
        const b = mini.get(y.teamId);
        return (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf)
          || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf) || x.name.localeCompare(y.name);
      });
    }
    sorted.push(...group);
  }
  return sorted.map((r, i) => ({ pos: i + 1, ...r }));
}

// Compara clasamentul calculat cu cel oficial din aceeasi sursa. Tabelul e afisat ca verificat
// doar daca ordinea si toate cifrele coincid; altfel site-ul scrie "Clasament neoficial".
export function verifyStandings(computed, official) {
  if (!official.length) return { verified: false, reason: 'Sursa nu are clasament oficial pentru comparatie.' };
  if (official.length !== computed.length) return { verified: false, reason: 'Numar diferit de echipe fata de clasamentul oficial.' };
  const byPos = [...official].sort((a, b) => a.pos - b.pos);
  for (let i = 0; i < computed.length; i++) {
    const c = computed[i];
    const o = byPos[i];
    if (c.teamId !== o.teamId) return { verified: false, reason: `Locul ${i + 1}: calculat ${c.name}, oficial ${o.name}.` };
    for (const f of ['played', 'w', 'd', 'l', 'gf', 'ga', 'pts']) {
      if (c[f] !== o[f]) return { verified: false, reason: `${c.name}: ${f} calculat ${c[f]}, oficial ${o[f]}.` };
    }
  }
  return { verified: true, reason: null };
}
