// Server local care tine locul sportinfocentar2.com si al feed-ului YouTube, cu date reale
// din instantaneul de la 11.11.2026. Pornire: npm run mock   (apoi netlify dev cu variabilele din README)
import { createServer } from 'node:http';
import { parseSnapshot, competitionFile, catalogueFile, youtubeFeed } from './fixtures.mjs';

const comps = new Map(parseSnapshot().map((c) => [c.compId, c]));
const port = Number(process.env.MOCK_PORT || 8899);
let hits = 0;

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  hits++;
  console.log(`[mock ${hits}] ${req.method} ${url.pathname}${url.search}`);
  const comp = url.pathname.match(/^\/coman\/natjecanje(\d+)\.js$/);
  if (url.pathname === '/coman/natjecanja13.js') return res.writeHead(200, { 'content-type': 'application/javascript' }).end(catalogueFile());
  if (comp && comps.has(Number(comp[1]))) return res.writeHead(200, { 'content-type': 'application/javascript' }).end(competitionFile(comps.get(Number(comp[1]))));
  if (url.pathname === '/feeds/videos.xml') return res.writeHead(200, { 'content-type': 'text/xml' }).end(youtubeFeed(process.env.MOCK_FEED || undefined));
  res.writeHead(404).end('not found');
}).listen(port, () => console.log(`Sursa simulata pe http://localhost:${port}`));
