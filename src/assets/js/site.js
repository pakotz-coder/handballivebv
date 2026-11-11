// HandbalLiveBV — paginile publice. Toate datele vin dintr-un singur apel: /api/data.
const page = document.body.dataset.page;
const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) node.append(kid);
  return node;
}

const fmt = (opts) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', ...opts });
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dateOf = (iso) => new Date(`${iso}T12:00:00Z`);
const videoUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const place = (m) => [m.hall, m.city].filter(Boolean).join(', ') || 'sala se anunță';

function when(m, today, format = shortDate) {
  const day = m.date === today ? 'Astăzi' : format.format(dateOf(m.date));
  return el('p', { class: 'match-when' }, el('strong', { text: day }), ` ${m.time || (m.played ? '' : 'ora se anunță')}`);
}

function teams(home, away, score) {
  const row = (team, mine, other) => el('span', { class: `team${team.club ? ' is-bv' : ''}${score && mine < other ? ' lost' : ''}` },
    el('span', { class: 'team-name', text: team.name }),
    score ? el('span', { class: 'score', text: String(mine) }) : null);
  return el('div', { class: 'teams' }, row(home, score?.[0], score?.[1]), row(away, score?.[1], score?.[0]));
}

// Un meci transmis (din lista streams) ca rand de lista.
function streamItem(s, data) {
  const link = s.videoId
    ? el('a', { class: 'match-link', href: videoUrl(s.videoId), rel: 'noopener', text: s.upcoming ? 'Urmărește pe YouTube' : 'Vezi înregistrarea' })
    : s.upcoming
      ? el('a', { class: 'match-link', href: data.youtubeUrl, rel: 'noopener', text: 'Canalul de YouTube' })
      : el('span', { class: 'match-link muted', text: 'Înregistrarea nu e încă disponibilă' });
  return el('li', { class: 'match' },
    when(s, data.today),
    teams({ name: s.home, club: s.homeClub }, { name: s.away, club: s.awayClub }, s.score),
    el('p', { class: 'match-meta', text: `${s.label} · etapa ${s.round} · ${place(s)}` }),
    link);
}

const streamList = (items, data) => el('ul', { class: 'match-list' }, items.map((s) => streamItem(s, data)));

function fill(target, ...nodes) {
  const box = typeof target === 'string' ? $(target) : target;
  box.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
  return box;
}

/* ---------- Acasă ---------- */
function home(data) {
  const upcoming = data.streams.filter((s) => s.upcoming);
  const past = data.streams.filter((s) => !s.upcoming).reverse();
  const next = upcoming[0];
  if (next) {
    fill('#next-stream', el('div', { class: 'next' },
      when(next, data.today, longDate),
      el('p', { class: 'next-teams' }, el('span', { text: next.home }), el('span', { class: 'vs', text: 'vs' }), el('span', { text: next.away })),
      el('p', { class: 'match-meta', text: `${next.label} · ${place(next)}` }),
      el('p', { class: 'actions' },
        el('a', { class: 'btn btn-primary', rel: 'noopener', href: next.videoId ? videoUrl(next.videoId) : data.youtubeUrl, text: 'Urmărește pe YouTube' }),
        upcoming.length > 1 ? el('a', { class: 'btn', href: '/program/', text: `Tot programul (${upcoming.length})` }) : null)));
  } else {
    fill('#next-stream', el('p', { class: 'notice', text: 'Nicio transmisie programată în acest moment. Meciurile noi apar aici imediat ce sunt confirmate.' }));
  }
  fill('#latest-streams', past.length
    ? streamList(past.slice(0, 4), data)
    : el('p', { class: 'muted', text: 'Încă nu există meciuri în arhivă.' }));
}

/* ---------- Program ---------- */
function program(data) {
  const upcoming = data.streams.filter((s) => s.upcoming);
  if (!upcoming.length) {
    return fill('#program', el('p', { class: 'notice', text: 'Nicio transmisie programată în acest moment. Meciurile noi apar aici imediat ce sunt confirmate.' }));
  }
  const labels = [...new Set([...data.series.map((s) => s.label), ...upcoming.map((s) => s.label)])];
  fill('#program', labels.filter((label) => upcoming.some((s) => s.label === label)).map((label) =>
    el('section', { class: 'series-block' }, el('h2', { text: label }), streamList(upcoming.filter((s) => s.label === label), data))));
}

/* ---------- Arhivă ---------- */
function archive(data) {
  const past = data.streams.filter((s) => !s.upcoming).reverse();
  const form = $('#archive-filters');
  const options = (select, values) => values.forEach(([value, label]) => select.append(el('option', { value, text: label })));
  options(form.category, [...new Set(past.map((s) => s.label))].map((l) => [l, l]));
  options(form.club, data.clubs.filter((c) => past.some((s) => s.homeClub === c.slug || s.awayClub === c.slug)).map((c) => [c.slug, c.name]));
  options(form.season, [...new Set(past.map((s) => s.season))].map((s) => [s, s]));
  const wanted = new URLSearchParams(location.search).get('club');
  if (wanted && [...form.club.options].some((o) => o.value === wanted)) form.club.value = wanted;

  const render = () => {
    const shown = past.filter((s) => (!form.category.value || s.label === form.category.value)
      && (!form.club.value || s.homeClub === form.club.value || s.awayClub === form.club.value)
      && (!form.season.value || s.season === form.season.value));
    $('#archive-count').textContent = past.length ? `${shown.length} ${shown.length === 1 ? 'meci' : 'meciuri'}` : '';
    fill('#archive', shown.length
      ? streamList(shown, data)
      : el('p', { class: 'notice', text: past.length ? 'Niciun meci pentru filtrele alese.' : 'Încă nu există meciuri în arhivă.' }));
  };
  form.addEventListener('change', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}

/* ---------- Rezultate și clasamente ---------- */
function standingsTable(series) {
  const th = (abbr, title, cls) => el('th', { scope: 'col', class: cls }, title ? el('abbr', { title, text: abbr }) : abbr);
  const penalised = series.standings.filter((r) => r.adj);
  const note = series.verified
    ? `${series.seriesName} · calculat din rezultate și verificat automat cu clasamentul oficial al federației`
    : `${series.seriesName} · calculat din rezultate; momentan nu coincide cu clasamentul oficial al federației`;
  return [
    el('div', { class: 'table-scroll' }, el('table', { class: 'standings' },
      el('caption', {}, el('strong', { text: series.verified ? 'Clasament' : 'Clasament neoficial' }), el('span', { text: note })),
      el('thead', {}, el('tr', {},
        th('#', 'Loc', 'pos'), th('Echipă', null, 'name'), th('M', 'Meciuri jucate'), th('V', 'Victorii'), th('E', 'Egaluri'),
        th('Î', 'Înfrângeri'), th('Goluri', 'Goluri marcate și primite', 'wide'), th('Pct', 'Puncte'))),
      el('tbody', {}, series.standings.map((r) => el('tr', { class: r.club ? 'is-bv' : null },
        el('td', { class: 'pos', text: `${r.pos}.` }),
        el('th', { scope: 'row', class: 'name', text: r.name + (r.adj ? ' *' : '') }),
        el('td', { text: r.played }), el('td', { text: r.w }), el('td', { text: r.d }), el('td', { text: r.l }),
        el('td', { class: 'wide', text: `${r.gf}:${r.ga}` }),
        el('td', { class: 'pts', text: r.pts })))))),
    el('p', { class: 'legend', text: 'cluburi din județul Brașov' }),
    penalised.length ? el('p', { class: 'muted', text: `* ${penalised.map((r) => `${r.name}: ${r.adj > 0 ? '+' : '−'}${Math.abs(r.adj)} ${Math.abs(r.adj) === 1 ? 'punct' : 'puncte'}`).join('; ')} (decizie a federației).` }) : null,
  ];
}

function results(series, data) {
  const played = series.matches.filter((m) => m.played);
  const box = el('div', {});
  const check = el('input', { type: 'checkbox', checked: true });
  const render = () => {
    const shown = played.filter((m) => !check.checked || m.brasov);
    const rounds = [...new Set(shown.map((m) => m.round))].sort((a, b) => b - a);
    fill(box, rounds.length
      ? rounds.map((round) => [
        el('h4', { class: 'round-title', text: `Etapa ${round}` }),
        el('ul', { class: 'match-list' }, shown.filter((m) => m.round === round).map((m) => el('li', { class: 'match' },
          when(m, data.today), teams(m.home, m.away, m.score),
          el('p', { class: 'match-meta', text: [m.half ? `la pauză ${m.half[0]}:${m.half[1]}` : null, place(m)].filter(Boolean).join(' · ') })))),
      ])
      : el('p', { class: 'muted', text: 'Niciun rezultat încă.' }));
  };
  check.addEventListener('change', render);
  render();
  return [
    el('div', { class: 'results-head' }, el('h3', { text: 'Rezultate' }), el('label', { class: 'check' }, check, 'Doar cluburi brașovene')),
    box,
  ];
}

function resultsPage(data) {
  const tabs = $('#series-tabs');
  const show = (key) => {
    const series = data.series.find((s) => s.key === key) || data.series[0];
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.key === series.key));
    const updated = series.fetchedAt
      ? `Actualizat ${new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(series.fetchedAt))}.`
      : '';
    fill('#series', series.error
      ? el('p', { class: 'notice', text: `${series.label}: ${series.error}` })
      : [
        el('h2', { text: series.label }),
        series.stale ? el('p', { class: 'notice', text: 'Serverul federației nu a răspuns la ultima actualizare; datele pot fi mai vechi.' }) : null,
        standingsTable(series),
        results(series, data),
        el('p', { class: 'muted', text: `Sursa: datele oficiale ale Federației Române de Handbal. ${updated}` }),
      ]);
    history.replaceState(null, '', `#${series.key}`);
  };
  fill(tabs, data.series.map((s) => el('button', { class: 'btn', type: 'button', 'data-key': s.key, 'aria-pressed': 'false', text: s.label, onclick: () => show(s.key) })));
  show(location.hash.slice(1));
}

/* ---------- Cluburi ---------- */
function clubs(data) {
  const cards = data.clubs.map((club) => {
    const rows = data.series.map((s) => [s, s.standings.find((r) => r.club === club.slug)]).filter(([, row]) => row);
    if (!rows.length) return null;
    const streamed = data.streams.filter((s) => !s.upcoming && (s.homeClub === club.slug || s.awayClub === club.slug)).length;
    return el('li', { class: 'card' },
      el('h2', { text: club.name }),
      el('p', { class: 'muted', text: club.city }),
      el('ul', {}, rows.map(([s, row]) => el('li', {},
        el('a', { href: `/rezultate/#${s.key}`, text: s.label }),
        el('span', { text: `locul ${row.pos} · ${row.pts} ${row.pts === 1 ? 'punct' : 'puncte'}` })))),
      streamed ? el('a', { class: 'more', href: `/arhiva/?club=${club.slug}`, text: `Meciuri transmise (${streamed})` }) : null);
  }).filter(Boolean);
  fill('#clubs', cards.length ? el('ul', { class: 'cards' }, cards) : el('p', { class: 'notice', text: 'Datele oficiale nu sunt disponibile momentan.' }));
}

const pages = { acasa: ['#next-stream', home], program: ['#program', program], arhiva: ['#archive', archive], rezultate: ['#series', resultsPage], cluburi: ['#clubs', clubs] };

async function start() {
  if (!pages[page]) return;
  const [target, render] = pages[page];
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(String(res.status));
    render(await res.json());
  } catch (err) {
    console.error(err);
    fill(target,
      el('p', { class: 'notice', text: 'Datele nu pot fi încărcate acum. Verifică conexiunea și încearcă din nou.' }),
      el('button', { class: 'btn', type: 'button', text: 'Încearcă din nou', onclick: () => location.reload() }));
    if (page === 'acasa') fill('#latest-streams');
  }
}

start();
