# HandbalLiveBV — site

Adresa site-ului: https://handballivebv.netlify.app/ (panoul de administrare: `/admin`).

Site-ul proiectului comunitar HandbalLiveBV: transmisii gratuite pe YouTube ale meciurilor de
handbal juvenil din judetul Brasov. Arata programul transmisiilor, arhiva, rezultatele si
clasamentele cluburilor brasovene si are un panou de administrare gandit pentru telefon.

- Pagini statice (HTML, CSS, JavaScript simplu), construite cu `node build.mjs` in folderul `dist/`.
- Doua functii Netlify: `/api/data` (datele publice) si `/api/admin/*` (panoul de administrare).
- Datele oficiale FRH (sportinfocentar2.com) sunt citite doar de functii, pe server, si tinute
  10 minute in Netlify Blobs. Vizitatorii nu ating niciodata serverul federatiei.
- Meciurile marcate „Transmitem” si linkurile video sunt tot in Netlify Blobs. Nu exista alta baza de date.

## 1. Publicarea pe Netlify

1. Urca acest folder intr-un repository GitHub.
2. In Netlify: **Add new site → Import an existing project → GitHub** si alege repository-ul.
   Setarile de build sunt deja in `netlify.toml` (comanda `npm run build`, folderul `dist`); nu trebuie schimbat nimic.
3. Inainte de primul deploy, la **Site configuration → Environment variables**, adauga:

   | Variabila        | Valoare                                                             |
   |------------------|---------------------------------------------------------------------|
   | `ADMIN_PASSWORD` | parola panoului de administrare, minimum 8 caractere                |
   | `CONTACT_EMAIL`  | adresa de e-mail afisata pe pagina „Pentru cluburi si parinti”      |

   `CONTACT_EMAIL` este optionala: daca lipseste, linkurile de contact duc la pagina de Facebook.
   Dupa ce o adaugi sau o schimbi, porneste un deploy nou (**Deploys → Trigger deploy**), pentru ca
   adresa este scrisa in pagini la build.
4. Apasa **Deploy**. Netlify Blobs se activeaza singur, nu trebuie configurat.
5. Optional: la **Domain management** schimba numele site-ului sau leaga un domeniu propriu.
   Dupa orice schimbare de nume sau de domeniu porneste un deploy nou (**Deploys → Trigger deploy**):
   adresa site-ului este scrisa in pagini la build (imaginea afisata cand dai share pe Facebook sau WhatsApp).

De acum, orice `git push` pe ramura principala republica site-ul.

## 2. Parola de administrare

- Parola este valoarea variabilei `ADMIN_PASSWORD` din Netlify. Nu este scrisa nicaieri in cod.
- Schimbarea parolei: modifici variabila in Netlify si pornesti un deploy nou. Toate sesiunile vechi
  devin invalide (cheia de semnare a cookie-ului deriva din parola).
- Dupa autentificare, telefonul ramane conectat 60 de zile (cookie semnat, HttpOnly, Secure, SameSite=Strict).
- Dupa 10 parole gresite de pe aceeasi adresa de internet, autentificarea de pe acea adresa se blocheaza 15 minute.

## 3. Folosirea panoului (`/admin`)

1. Deschizi `adresa-site-ului/admin` si introduci parola (o singura data pe telefon).
2. Vezi meciurile viitoare ale cluburilor brasovene din toate competitiile urmarite, cel mai apropiat primul.
   Echipele, data, ora si sala vin din programul oficial; nu se tasteaza nimic.
3. Apesi **Transmitem** la meciul pe care il transmiti. Apare imediat pe Acasa si in Program.
   Inca o apasare il scoate.
4. Linkul YouTube se leaga singur cand pe canal apare un videoclip (sau o transmisie programata) care:
   - are in titlu ambele echipe, **gazdele primele**, ca in programul oficial (ajunge un cuvant care
     deosebeste echipa: `Sporting`, `Corona`, `Codlea`; `Magura` sau `Ghimbav` singure nu ajung);
   - a fost creat cu cel mult 30 de zile inainte si cel mult 7 zile dupa meci;
   - nu se potriveste cu niciun alt meci din program. Aceleasi cluburi joaca des si la U15, si la U17,
     si la U19 in acelasi weekend, asa ca scrie mereu categoria in titlu (`U15`, `U17`, `U19` sau `J3`, `J2`, `J1`).

   Exemplu de titlu bun: `Sporting Ghimbav - CSM Corona Brasov | U15 | 15.11.2026`.
   Daca site-ul nu e sigur, nu ghiceste: apesi **Alege videoclipul din lista** si atingi videoclipul corect.
   Rezumatele (titluri cu „Highlights” sau „Rezumat”) nu se leaga automat, dar pot fi alese din lista.
5. Dupa meci, scorul se completeaza singur din datele oficiale, iar meciul trece in Arhiva.
6. Pentru meciurile transmise inainte de lansarea site-ului: **Arata toate meciurile jucate**, apoi
   **Transmitem** la fiecare si alegi videoclipul din lista.

Feed-ul public YouTube contine doar ultimele 15 videoclipuri **publice** ale canalului. Un videoclip
nelistat sau privat nu apare in lista. Lista se reimprospateaza la 10 minute.

## 4. Adaugarea unei competitii sau a partii de baieti

Totul se schimba intr-un singur fisier: `config/site.config.mjs`.

- **Competitie noua**: adaugi un rand in `competitions`:

  ```js
  { key: 'u15m', label: 'U15 Juniori', category: 'U15', gender: 'm', compId: 2108, seriesId: 1234, aliases: ['u15', 'j3'] },
  ```

  - `compId` = numarul competitiei din catalogul FRH (`natjecanja13.js`, campul `broj`);
  - `seriesId` = numarul seriei (`lige[].broj` din fisierul competitiei);
  - `gender` = `'f'` sau `'m'`; `key` = un nume intern scurt, care nu se mai schimba intre sezoane.

  In fisier exista deja, comentate, randurile pentru U15/U17/U19 Juniori si Divizia A Masculin
  (2108, 2107, 2106, 2100): stergi `//` si completezi `seriesId`.
- **Club nou din judet**: adaugi un rand in `clubs` (numele exact din datele FRH in `sourceName`,
  iar in `clubId` numarul clubului, campurile `k1`/`k2` ale unui meci).
- **Diacritice** in nume de echipe si sali: lista `diacritics` (datele FRH nu au diacritice).

Dupa modificare: `npm test`, apoi `git push`. Nu trebuie schimbat nimic altceva in cod.

## 5. Trecerea la sezonul urmator

Numerele competitiilor si ale seriilor se schimba in fiecare sezon. O data pe an:

1. Intra in `/admin` si apasa **Cauta competitiile noului sezon** (in josul paginii). Site-ul citeste
   catalogul FRH, gaseste competitiile cu acelasi nume si, in fiecare, seria cu cele mai multe cluburi
   brasovene, apoi afiseaza perechile `compId` / `seriesId` gata de copiat.
2. In `config/site.config.mjs` inlocuieste `compId` si `seriesId` la fiecare competitie si schimba
   `season` (de exemplu `'2027-28'`). `key` ramane neschimbat.
3. `npm test` (testele de clasament folosesc un instantaneu din 11.11.2026 si raman valabile), apoi `git push`.

Meciurile transmise in sezoanele trecute raman in Arhiva: detaliile lor sunt copiate in Netlify Blobs
in momentul marcarii, cu sezonul lor, si pot fi filtrate dupa sezon.

Daca federatia schimba numele unei competitii, butonul nu o mai gaseste: cauta numarul direct in
`https://www.sportinfocentar2.com/coman/natjecanja13.js` (campurile `broj` si `naziv`; `spol` 1 = feminin, 0 = masculin).

## 6. Clasamentele

- Calculate din meciurile jucate: victorie 2 puncte, egal 1, infrangere 0, plus penalizarile federatiei.
- Departajare la egalitate de puncte: punctele din meciurile directe, golaverajul din meciurile directe,
  golurile marcate in meciurile directe, apoi golaverajul general si golurile marcate in total.
- La fiecare incarcare, clasamentul calculat este comparat automat cu cel oficial din aceeasi sursa
  (cel afisat pe frhlive2.com). Daca toate cifrele si ordinea coincid, tabelul apare ca „Clasament”;
  daca nu, apare ca **„Clasament neoficial”**.
- Verificare facuta la 11.11.2026: toate cele patru serii urmarite coincid cu tabelele oficiale
  (vezi `tests/standings.test.mjs` si `tests/fixtures/official-frhlive2-2026-11-11.json`).

## 7. Rulare locala

```
npm install
copy .env.example .env        (Windows; pe Mac/Linux: cp .env.example .env) si pune o parola in el
npm run dev                   (porneste Netlify CLI pe http://localhost:8888)
npm test                      (testele: citirea sursei, clasamente, potrivirea video-urilor)
```

Pentru lucru fara internet sau fara a atinge serverul federatiei exista o sursa simulata, cu date
reale din 11.11.2026: `npm run mock` intr-un terminal, iar in `.env` liniile
`SOURCE_BASE_URL=http://localhost:8899/coman` si `YOUTUBE_FEED_BASE_URL=http://localhost:8899/feeds/videos.xml`.

## 8. Structura

```
config/site.config.mjs     competitii, serii, cluburi, canal YouTube (singurul fisier de configurare)
netlify/functions/         api-data.mjs (date publice), admin.mjs (panoul)
netlify/lib/               source (citirea FRH), standings (clasament), youtube (feed + potrivire),
                           model (asamblare), store (Netlify Blobs), auth (parola + cookie)
src/                       layout.html, pagini, CSS, JavaScript, imagini
build.mjs                  construieste dist/
tests/                     teste si instantaneul de date din 11.11.2026
```

## 9. Ce nu contine site-ul

Proiect comunitar, separat de orice activitate comerciala: fara competitii de seniori in afara de
Divizia A Feminin, fara preturi, oferte sau reclame.
