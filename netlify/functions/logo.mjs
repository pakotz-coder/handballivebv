// GET /api/logo/<clubId> — sigla unui club, servita de pe site (vezi netlify/lib/logos.mjs).
import { loadLogo, validClubId } from '../lib/logos.mjs';

const notFound = (maxAge) => new Response('', { status: 404, headers: { 'cache-control': `public, max-age=${maxAge}` } });

export default async (req, context) => {
  const id = context?.params?.id ?? new URL(req.url).pathname.split('/').pop();
  if (!validClubId(id)) return notFound(86400);
  try {
    const logo = await loadLogo(Number(id));
    if (!logo) return notFound(86400);
    return new Response(logo.bytes, {
      headers: {
        'content-type': logo.type,
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=86400',
        'netlify-cdn-cache-control': 'public, s-maxage=604800, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error(err);
    return notFound(60);
  }
};

export const config = { path: '/api/logo/:id' };
