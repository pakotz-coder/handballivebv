// Construieste site-ul static in dist/: aseaza fiecare pagina din src/pages in sablonul comun,
// copiaza resursele si fonturile. Fara dependinte in afara de Node.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { config } from './config/site.config.mjs';

const pages = [
  { slug: '', file: 'acasa', nav: 'Acasă', title: 'HandbalLiveBV — handbal juvenil din Brașov, live și gratuit', description: 'Transmisii gratuite pe YouTube ale meciurilor de handbal juvenil din județul Brașov: program, arhivă, rezultate și clasamente.' },
  { slug: 'program', file: 'program', nav: 'Program', title: 'Programul transmisiilor — HandbalLiveBV', description: 'Meciurile de handbal juvenil din județul Brașov care urmează să fie transmise live pe YouTube.' },
  { slug: 'arhiva', file: 'arhiva', nav: 'Arhivă', title: 'Arhiva meciurilor transmise — HandbalLiveBV', description: 'Toate meciurile transmise de HandbalLiveBV, cu înregistrările de pe YouTube.' },
  { slug: 'rezultate', file: 'rezultate', nav: 'Rezultate', title: 'Rezultate și clasamente — HandbalLiveBV', description: 'Rezultatele și clasamentele cluburilor brașovene în competițiile de junioare și în Divizia A feminin.' },
  { slug: 'cluburi', file: 'cluburi', nav: 'Cluburi', title: 'Cluburile brașovene — HandbalLiveBV', description: 'Cluburile de handbal din județul Brașov prezente în competițiile urmărite de HandbalLiveBV.' },
  { slug: 'pentru-cluburi-si-parinti', file: 'pentru-cluburi-si-parinti', nav: 'Pentru cluburi și părinți', title: 'Pentru cluburi și părinți — HandbalLiveBV', description: 'Cum ceri o transmisie, regulile de filmare, acordul pentru minori și cum ceri ștergerea unui videoclip.' },
  { slug: 'despre', file: 'despre', nav: 'Despre', title: 'Despre HandbalLiveBV', description: 'Cine face transmisiile HandbalLiveBV și de ce.' },
  { slug: 'admin', file: 'admin', nav: null, title: 'Administrare — HandbalLiveBV', description: '', script: 'admin.js', noindex: true },
];

const src = new URL('./src/', import.meta.url);
const dist = new URL('./dist/', import.meta.url);
const read = (p) => readFileSync(new URL(p, src), 'utf8');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(new URL('assets/', src), new URL('assets/', dist), { recursive: true });
mkdirSync(new URL('assets/fonts/', dist), { recursive: true });
for (const f of [
  '@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2',
  '@fontsource/barlow-condensed/files/barlow-condensed-latin-ext-800-normal.woff2',
  '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2',
]) cpSync(new URL(`./node_modules/${f}`, import.meta.url), new URL(`assets/fonts/${f.split('/').pop()}`, dist));

// Versiune pentru CSS/JS, ca browserele sa ia fisierele noi dupa fiecare publicare.
const version = createHash('sha1').update(['css/site.css', 'js/site.js', 'js/admin.js'].map((f) => read(`assets/${f}`)).join('')).digest('hex').slice(0, 8);

// Adresa de contact vine din variabila de mediu CONTACT_EMAIL (setata in Netlify).
// Daca lipseste, linkurile de contact duc la pagina de Facebook a proiectului.
const email = (process.env.CONTACT_EMAIL || '').trim();
const contact = (subject) => (email
  ? `la <a href="mailto:${email}?subject=${encodeURIComponent(subject)}">${email}</a>`
  : `pe <a href="${config.facebookUrl}" rel="noopener">pagina noastră de Facebook</a> (mesaj privat, cu subiectul „${subject}”)`);

const origin = (process.env.URL || '').replace(/\/$/, '');
const layout = read('layout.html');
for (const page of pages) {
  const path = `/${page.slug ? `${page.slug}/` : ''}`;
  const nav = pages.filter((p) => p.nav).map((p) => {
    const href = `/${p.slug ? `${p.slug}/` : ''}`;
    return `<li><a href="${href}"${p === page ? ' aria-current="page"' : ''}>${p.nav}</a></li>`;
  }).join('');
  const html = layout
    .replace('{{content}}', read(`pages/${page.file}.html`))
    .replaceAll('{{title}}', page.title)
    .replaceAll('{{description}}', page.description)
    .replaceAll('{{origin}}', origin)
    .replaceAll('{{path}}', path)
    .replaceAll('{{page}}', page.file)
    .replaceAll('{{nav}}', nav)
    .replaceAll('{{robots}}', page.noindex ? '<meta name="robots" content="noindex">' : '')
    .replaceAll('{{script}}', page.script || 'site.js')
    .replaceAll('{{v}}', version)
    .replaceAll('{{youtube}}', config.youtube.channelUrl)
    .replaceAll('{{facebook}}', config.facebookUrl)
    .replace(/\{\{contact:([^}]+)\}\}/g, (_, subject) => contact(subject));
  mkdirSync(new URL(`.${path}`, dist), { recursive: true });
  writeFileSync(new URL(`.${path}index.html`, dist), html);
}
console.log(`Site construit in dist/ (${pages.length} pagini, versiune ${version}, contact: ${email || 'pagina de Facebook'})`);
