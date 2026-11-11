// GET /api/data — toate datele publice ale site-ului, intr-un singur raspuns JSON.
import { buildPublicData } from '../lib/model.mjs';

export default async () => {
  try {
    const data = await buildPublicData();
    return Response.json(data, {
      headers: {
        'cache-control': 'public, max-age=0, must-revalidate',
        // CDN-ul Netlify pastreaza raspunsul 2 minute; apasarile din admin il golesc imediat (cache-tag).
        'netlify-cdn-cache-control': 'public, s-maxage=120, stale-while-revalidate=600',
        'cache-tag': 'site-data',
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Datele nu pot fi incarcate momentan.' }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
};

export const config = { path: '/api/data' };
