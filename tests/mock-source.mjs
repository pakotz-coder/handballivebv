// Server local care tine locul sportinfocentar2.com si al feed-ului YouTube, cu date reale
// din instantaneul de la 11.11.2026. Pornire: npm run mock   (apoi netlify dev cu variabilele din README)
import { deflateSync } from 'node:zlib';
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
  // Sigle simulate: un patrat colorat (PNG generat aici) pentru unele cluburi, 404 pentru restul.
  const logo = url.pathname.match(/^\/coman\/logo\/(\d+)\.png$/);
  if (logo) {
    const id = Number(logo[1]);
    if (id % 3 === 0) return res.writeHead(404).end('Not Found');
    return res.writeHead(200, { 'content-type': 'image/png' }).end(mockPng(id));
  }
  // oEmbed simulat: titlul si canalul unui videoclip de pe alt canal (pentru linkurile puse de mana in admin).
  if (url.pathname === '/oembed') {
    const id = (url.searchParams.get('url') || '').match(/v=([\w-]{11})/)?.[1];
    if (!id || id.startsWith('x')) return res.writeHead(404).end('Not Found');
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ title: `Transmisie de test ${id}`, author_name: 'Alt Canal Handbal' }));
  }
  res.writeHead(404).end('not found');
}).listen(port, () => console.log(`Sursa simulata pe http://localhost:${port}`));

// PNG 64x64: chenar colorat (culoarea depinde de id) cu centru alb. Doar pentru teste.
function mockPng(id) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const size = 64; const hue = [[200, 16, 46], [20, 90, 170], [20, 130, 60], [230, 160, 0]][id % 4];
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) { const inner = x > 16 && x < 47 && y > 16 && y < 47; row.push(...(inner ? [255, 255, 255] : hue)); }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
