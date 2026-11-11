// Configuratia site-ului HandbalLiveBV.
// Tot ce tine de competitii urmarite, serii, cluburi si canalul YouTube se schimba DOAR aici.
// Vezi README.md, sectiunile "Adaugarea unei competitii" si "Trecerea la sezonul urmator".

export const config = {
  // Sezonul curent. Apare in arhiva ca filtru si se salveaza pe fiecare meci transmis.
  season: '2026-27',

  // Sursa oficiala FRH (sportinfocentar2.com). Se citeste doar din functiile Netlify.
  source: {
    baseUrl: 'https://www.sportinfocentar2.com/coman',
    catalogueFile: 'natjecanja13.js',
    // Cat timp (minute) refolosim datele deja citite inainte sa intrebam din nou serverul federatiei.
    cacheMinutes: 10,
  },

  // Competitiile urmarite. Pentru a adauga una (sau partea de baieti) se adauga un rand aici.
  // key      = identificator intern, stabil intre sezoane (nu se schimba la trecerea de sezon)
  // gender   = 'f' (fete) sau 'm' (baieti)
  // compId   = "broj" al competitiei in catalogul FRH; seriesId = "broj" al seriei (lige[].broj)
  // aliases  = cum poate aparea categoria in titlul unui video de pe YouTube
  competitions: [
    { key: 'u15f', label: 'U15 Junioare', category: 'U15', gender: 'f', compId: 2110, seriesId: 4265, aliases: ['u15', 'j3', 'junioare 3', 'junioare iii'] },
    { key: 'u17f', label: 'U17 Junioare', category: 'U17', gender: 'f', compId: 2109, seriesId: 4252, aliases: ['u17', 'j2', 'junioare 2', 'junioare ii'] },
    { key: 'u19f', label: 'U19 Junioare', category: 'U19', gender: 'f', compId: 2111, seriesId: 4277, aliases: ['u19', 'j1', 'junioare 1', 'junioare i'] },
    { key: 'divaf', label: 'Divizia A Feminin', category: 'Divizia A', gender: 'f', compId: 2099, seriesId: 4210, aliases: ['divizia a', 'div a'] },
    // Exemple pentru baieti (sezonul 26-27). Se completeaza seriesId cu seria dorita si se sterge "//":
    // { key: 'u15m', label: 'U15 Juniori', category: 'U15', gender: 'm', compId: 2108, seriesId: 0, aliases: ['u15', 'j3'] },
    // { key: 'u17m', label: 'U17 Juniori', category: 'U17', gender: 'm', compId: 2107, seriesId: 0, aliases: ['u17', 'j2'] },
    // { key: 'u19m', label: 'U19 Juniori', category: 'U19', gender: 'm', compId: 2106, seriesId: 0, aliases: ['u19', 'j1'] },
    // { key: 'divam', label: 'Divizia A Masculin', category: 'Divizia A', gender: 'm', compId: 2100, seriesId: 0, aliases: ['divizia a'] },
  ],

  // Cluburile din judetul Brasov. sourceName = numele exact din datele FRH (fara diacritice);
  // name = numele afisat pe site; clubId = "k1/k2" din datele FRH (acelasi in toate competitiile).
  clubs: [
    { slug: 'corona-brasov', name: 'CSM Corona Brașov', sourceName: 'CSM Corona Brasov', clubId: 20494, city: 'Brașov' },
    { slug: 'transilvania-brasov', name: 'ACS Transilvania Brașov', sourceName: 'ACS Transilvania Brasov', clubId: 25912, city: 'Brașov' },
    { slug: 'dinamo-brasov', name: 'CSS Dinamo Brașov', sourceName: 'CSS Dinamo Brasov', clubId: 25911, city: 'Brașov' },
    { slug: 'kids-tampa-brasov', name: 'ACS Kids Tâmpa 2015 Brașov', sourceName: 'ACS KIDS TAMPA 2015 Brasov', clubId: 25781, city: 'Brașov' },
    { slug: 'sporting-ghimbav', name: 'ACS Sporting Ghimbav', sourceName: 'ACS Sporting Ghimbav', clubId: 25770, city: 'Ghimbav' },
    { slug: 'teutonii-ghimbav', name: 'CSO Teutonii Ghimbav', sourceName: 'CSO Teutonii Ghimbav', clubId: 25861, city: 'Ghimbav' },
    { slug: 'primus-rasnov', name: 'ACS Primus Râșnov', sourceName: 'ACS Primus Rasnov', clubId: 26784, city: 'Râșnov' },
    { slug: 'magura-codlea', name: 'CS Măgura Codlea', sourceName: 'CS Magura Codlea', clubId: 26503, city: 'Codlea' },
    { slug: 'csm-fagaras', name: 'CSM Făgăraș', sourceName: 'CSM Fagaras', clubId: 20520, city: 'Făgăraș' },
    { slug: 'css-fagaras', name: 'CSS Făgăraș', sourceName: 'CSS Fagaras', clubId: 25777, city: 'Făgăraș' },
  ],

  // Canalul YouTube. channelId a fost rezolvat o singura data din @HandbalLiveBv (11.11.2026).
  youtube: {
    handle: '@HandbalLiveBv',
    channelId: 'UCKtWh5QrizDUeEcaS6RGA7g',
    channelUrl: 'https://www.youtube.com/@HandbalLiveBv',
    feedBaseUrl: 'https://www.youtube.com/feeds/videos.xml',
    cacheMinutes: 10,
  },

  facebookUrl: 'https://www.facebook.com/profile.php?id=61590570801741',

  // Datele FRH nu au diacritice. Cuvintele de mai jos sunt inlocuite la afisare (nume de echipe si sali).
  diacritics: {
    Brasov: 'Brașov', Fagaras: 'Făgăraș', Rasnov: 'Râșnov', Sighisoara: 'Sighișoara', Bacau: 'Bacău',
    Galati: 'Galați', Neamt: 'Neamț', Cisnadie: 'Cisnădie', Ploiesti: 'Ploiești', Sfantu: 'Sfântu',
    Magura: 'Măgura', Stiinta: 'Știința', Taureni: 'Tăureni', Scoala: 'Școala', Colibasi: 'Colibași',
    Lecusanu: 'Lecușanu', Carpati: 'Carpați', Dunarea: 'Dunărea', Polivalenta: 'Polivalentă',
    Mica: 'Mică', Municipala: 'Municipală', sporturilor: 'Sporturilor',
  },
};

export default config;
