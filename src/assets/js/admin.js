// HandbalLiveBV — panoul de administrare. Gandit pentru telefon: fara tastare (in afara parolei),
// o apasare marcheaza un meci ca transmis, inca una anuleaza.
const $ = (sel) => document.querySelector(sel);

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

const shortDate = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const dayOf = (iso) => shortDate.format(new Date(`${iso}T12:00:00Z`));
const count = (n, one, many) => `${n} ${n === 1 ? one : `${n % 100 === 0 || n % 100 >= 20 ? 'de ' : ''}${many}`}`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

let state = null;
let showAll = false;
let showOld = false;
let pickerFor = null; // meciul pentru care e deschisa lista de video-uri
let linkFor = null; // meciul pentru care e deschis campul de link YouTube
let linkDraft = ''; // ce e scris in camp (pastrat daca serverul refuza linkul)
let busy = false;

function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 5000);
}

async function api(path, body) {
  const res = await fetch(`/api/admin/${path}`, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : {});
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') {
    showLogin();
    throw new Error('Sesiunea a expirat. Intră din nou.');
  }
  if (!res.ok) throw new Error(data.error || 'A apărut o eroare. Încearcă din nou.');
  return data;
}

// Trimite o modificare si redeseneaza lista cu starea intoarsa de server.
async function change(path, body) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('#panel button').forEach((b) => { b.disabled = true; });
  try {
    state = await api(path, body);
    pickerFor = null;
    linkFor = null;
    linkDraft = '';
    $('#toast').hidden = true; // un mesaj de eroare mai vechi nu ramane peste o salvare reusita
  } catch (err) {
    toast(err.message);
  }
  busy = false;
  document.querySelectorAll('#panel button').forEach((b) => { b.disabled = false; });
  render();
  // Dupa redesenare, focusul ramane pe butonul meciului la care s-a lucrat (pentru tastatura).
  if (body.matchId) document.querySelector(`.toggle[data-id="${body.matchId}"]`)?.focus({ preventScroll: true });
}

function videoPicker(match) {
  const pick = (videoId) => change('video', { matchId: match.id, videoId });
  return el('ul', { class: 'video-list' },
    state.videos.map((v) => el('li', {}, el('button', { class: 'video-pick', type: 'button', onclick: () => pick(v.id) },
      el('img', { src: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, alt: '', width: 96, height: 54, loading: 'lazy' }),
      el('span', {}, v.title, el('small', { text: `publicat ${dayOf(v.published.slice(0, 10))}` }))))),
    state.videos.length ? null : el('li', { class: 'muted', text: 'Canalul nu are încă videoclipuri publice sau transmisii programate.' }),
    match.videoId || match.videoUrl ? el('li', {}, el('button', { class: 'video-pick none', type: 'button', text: 'Fără videoclip', onclick: () => pick(null) })) : null,
    el('li', {}, el('button', { class: 'video-pick none', type: 'button', text: 'Închide lista', onclick: () => { pickerFor = null; render(); } })));
}

// Camp pentru un link de YouTube de pe orice canal (transmisia nu e mereu pe canalul nostru).
// Pe telefon: copiezi linkul in YouTube (Distribuie -> Copiaza linkul), apoi „Lipește linkul copiat”.
function linkForm(match) {
  const input = el('input', {
    id: `link-${match.id}`, type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: 'https://youtu.be/…', value: linkDraft, required: true, oninput: (e) => { linkDraft = e.target.value; },
  });
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) throw new Error('gol');
      input.value = linkDraft = text;
    } catch {
      toast('Nu am putut citi linkul copiat. Ține apăsat în câmp și alege „Lipește”.');
      input.focus();
    }
  };
  const close = () => { linkFor = null; linkDraft = ''; render(); };
  return el('form', { class: 'link-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    linkDraft = input.value.trim();
    if (!linkDraft) { toast('Lipește mai întâi linkul de YouTube.'); return; }
    change('link', { matchId: match.id, url: linkDraft });
  } },
  el('label', { for: `link-${match.id}`, text: 'Link de YouTube (de pe orice canal)' }),
  input,
  navigator.clipboard?.readText ? el('button', { class: 'btn', type: 'button', text: 'Lipește linkul copiat', onclick: paste }) : null,
  el('button', { class: 'btn btn-primary', type: 'submit', text: 'Salvează linkul' }),
  match.videoId || match.videoUrl ? el('button', { class: 'btn', type: 'button', text: 'Fără videoclip', onclick: () => change('video', { matchId: match.id, videoId: null }) }) : null,
  el('button', { class: 'btn', type: 'button', text: 'Renunță', onclick: close }));
}

// Ce videoclip e legat acum de meci, pe intelesul administratorului.
function videoLine(m) {
  if (!m.videoId && !m.videoUrl) return 'Niciun videoclip legat încă. Se leagă singur când apare pe canalul nostru cu numele echipelor în titlu. Pentru alt canal, pune linkul.';
  if (m.videoSource !== 'link') return `Videoclip: ${m.videoTitle}${m.videoSource === 'auto' ? ' (legat automat)' : ''}`;
  const shown = m.videoUrl.replace('https://www.', '');
  return `Link pus de tine: ${m.videoTitle || shown}${m.videoChannel ? ` · canalul ${m.videoChannel}` : ''}${m.videoTitle ? ` · ${shown}` : ''}`;
}

// Un meci deja jucat este in arhiva: scoaterea lui cere o confirmare (se pierde si legatura cu videoclipul).
function toggle(m) {
  if (m.streamed && !m.upcoming && !window.confirm(`Scoți din arhivă meciul ${m.home} – ${m.away}?`)) return;
  change('toggle', { matchId: m.id, on: !m.streamed });
}

function card(m) {
  const scoreText = m.played && m.score ? ` · ${m.score[0]}:${m.score[1]}` : '';
  const hall = [m.hall, m.city].filter(Boolean).join(', ') || 'sala se anunță';
  const node = el('article', { class: `a-match${m.streamed ? ' on' : ''}` },
    el('p', { class: 'a-when' }, el('strong', { text: m.date === state.today ? 'Astăzi' : dayOf(m.date) }), ` ${m.time || (m.played ? '' : 'ora se anunță')}`),
    el('p', { class: 'a-teams' }, m.home, el('br'), m.away),
    el('p', { class: 'a-meta', text: `${m.label} · etapa ${m.round} · ${hall}${scoreText}` }),
    el('button', { class: 'toggle', type: 'button', 'data-id': m.id, 'aria-pressed': String(m.streamed), onclick: () => toggle(m) },
      'Transmitem', el('small', { text: m.streamed ? 'Marcat. Apasă din nou pentru a anula.' : 'Apasă pentru a-l pune pe site.' })));
  if (m.streamed) {
    const linked = m.videoId || m.videoUrl;
    node.append(el('p', { class: 'video-line', text: videoLine(m) }));
    if (pickerFor === m.id) node.append(videoPicker(m));
    else if (linkFor === m.id) node.append(linkForm(m));
    else {
      node.append(
        el('button', { class: 'btn', type: 'button', text: linked ? 'Schimbă videoclipul (din lista canalului)' : 'Alege videoclipul din listă', onclick: () => { pickerFor = m.id; linkFor = null; render(); } }),
        el('button', { class: 'btn', type: 'button', text: linked ? 'Schimbă cu un link de YouTube' : 'Pune un link de YouTube (orice canal)', onclick: () => { linkFor = m.id; linkDraft = ''; pickerFor = null; render(); } }));
    }
  }
  return node;
}

function render() {
  const upcoming = state.matches.filter((m) => m.upcoming);
  const limit = addDays(state.today, 30);
  const near = upcoming.filter((m) => m.date <= limit || m.streamed);
  const past = state.matches.filter((m) => !m.upcoming).reverse();
  const since = addDays(state.today, -14);
  const recent = past.filter((m) => m.date >= since || m.streamed);
  $('#upcoming').replaceChildren(...(showAll ? upcoming : near).map(card));
  if (!upcoming.length) $('#upcoming').append(el('p', { class: 'muted', text: 'Niciun meci viitor al cluburilor brașovene în datele oficiale.' }));
  $('#show-all').hidden = showAll || near.length === upcoming.length;
  $('#show-all').textContent = `Arată tot sezonul (${count(upcoming.length, 'meci', 'meciuri')})`;
  $('#recent').replaceChildren(...(showOld ? past : recent).map(card));
  if (!recent.length && !showOld) $('#recent').append(el('p', { class: 'muted', text: 'Niciun meci jucat în ultimele 14 zile.' }));
  $('#show-old').hidden = showOld || recent.length === past.length;
  $('#show-old').textContent = `Arată toate meciurile jucate (${past.length})`;
  const warn = $('#warnings');
  warn.hidden = !state.warnings.length;
  warn.textContent = state.warnings.join(' ');
}

function showLogin() {
  $('#panel').hidden = true;
  $('#login').hidden = false;
  $('#password').focus();
}

async function load() {
  try {
    state = await api('state');
    $('#login').hidden = true;
    $('#panel').hidden = false;
    render();
  } catch (err) {
    if ($('#login').hidden) toast(err.message);
  }
}

$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('#login-error');
  error.hidden = true;
  try {
    await api('login', { password: $('#password').value });
    $('#password').value = '';
    await load();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

$('#show-all').addEventListener('click', () => { showAll = true; render(); });
$('#show-old').addEventListener('click', () => { showOld = true; render(); });
$('#logout').addEventListener('click', async () => { await api('logout', {}).catch(() => {}); showLogin(); });

$('#season-btn').addEventListener('click', async () => {
  const out = $('#season-out');
  out.replaceChildren(el('p', { class: 'muted', text: 'Se caută în catalogul federației…' }));
  try {
    const data = await api('season');
    out.replaceChildren(...data.competitions.map((c) => {
      if (!c.compId) return el('p', { class: 'notice', text: `${c.label}: nicio competiție cu acest nume în catalog.` });
      const best = c.series[0];
      return el('div', {},
        el('p', {}, el('strong', { text: `${c.compName}${c.current ? ' (cea configurată acum)' : ' (nouă)'}` })),
        best
          ? el('pre', { class: 'config', text: `key: '${c.key}'  →  compId: ${c.compId}, seriesId: ${best.seriesId}\n${best.seriesName}: ${best.brasovClubs.join(', ')}${c.series.length > 1 ? `\nAlte serii cu cluburi brașovene: ${c.series.slice(1).map((s) => `${s.seriesName} (${s.seriesId}): ${s.brasovClubs.join(', ')}`).join('; ')}` : ''}` })
          : el('p', { class: 'muted', text: 'Nicio serie cu cluburi brașovene (programul poate nu a fost încă publicat).' }));
    }));
  } catch (err) {
    out.replaceChildren(el('p', { class: 'notice', text: err.message }));
  }
});

load();
