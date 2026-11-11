// Netlify Blobs: singura "baza de date" a site-ului.
//  - cache:   datele FRH si feed-ul YouTube, pastrate cateva minute
//  - streams: meciurile marcate "Transmitem" si linkurile video (un singur document JSON)
import { getStore } from '@netlify/blobs';

export const cacheStore = () => getStore({ name: 'cache', consistency: 'strong' });
const streamsStore = () => getStore({ name: 'streams', consistency: 'strong' });

const KEY = 'streams';

// Erori al caror mesaj poate fi aratat administratorului (restul apar ca "Eroare neasteptata").
export class UserError extends Error {}

export async function readStreams() {
  return (await streamsStore().get(KEY, { type: 'json' })) || {};
}

// Citeste, modifica si scrie documentul. Scrierea e conditionata de versiunea citita (etag),
// ca o actualizare automata sa nu suprascrie o apasare facuta intre timp in admin.
export async function updateStreams(mutate) {
  const store = streamsStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store.getWithMetadata(KEY, { type: 'json' });
    const streams = current?.data || {};
    const changed = await mutate(streams);
    if (changed === false) return streams;
    // Serverul local (netlify dev) nu intoarce etag pentru un document existent: acolo scriem neconditionat.
    const condition = current?.etag ? { onlyIfMatch: current.etag } : current ? {} : { onlyIfNew: true };
    const result = await store.setJSON(KEY, streams, condition);
    if (!result || result.modified !== false) return streams;
  }
  throw new UserError('Nu am putut salva (prea multe modificări simultane). Încearcă din nou.');
}
