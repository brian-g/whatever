/**
 * Lazily loads Apple MapKit JS and hands back the initialised `mapkit` namespace.
 *
 * MapKit JS authenticates with an ES256 JWT signed by a private key from an Apple Developer
 * account; there is no anonymous mode. The token is read from the Vite environment only, so
 * with no token configured the map reports that rather than silently rendering blank tiles.
 */

export const TOKEN_ENV_VAR = 'VITE_MAPKIT_TOKEN';

export const TOKEN_HELP = [
  'Apple Maps needs a MapKit JS token before it can draw a basemap.',
  '',
  '1. Sign in at developer.apple.com → Certificates, Identifiers & Profiles.',
  '2. Register a Maps ID, then create a MapKit JS private key for it.',
  '3. Sign an ES256 JWT with that key (iss = your Team ID, kid = the Key ID).',
  `4. Put it in .env.local as ${TOKEN_ENV_VAR}=<token> and restart the dev server.`,
].join('\n');

/** Libraries actually used by this app: a map, a route overlay, start/finish markers. */
const LIBRARIES = ['map', 'annotations', 'overlays'];

let loading = null;

function readToken() {
  const token = import.meta.env[TOKEN_ENV_VAR];
  return typeof token === 'string' && token.trim() !== '' ? token.trim() : null;
}

/** True when a token is configured. Does not validate it -- only the CDN can do that. */
export function hasMapKitToken() {
  return readToken() !== null;
}

/**
 * Resolves with the `mapkit` namespace, with LIBRARIES loaded. Memoised, so several map
 * instances share one download. A failed attempt is forgotten so it can be retried.
 *
 * @returns {Promise<object>}
 */
export function loadMapKit() {
  loading ??= (async () => {
    const token = readToken();
    if (!token) {
      throw new Error(`No ${TOKEN_ENV_VAR} configured.`);
    }
    const { load } = await import('@apple/mapkit-loader');
    return load({
      token,
      language: navigator.language || 'en-US',
      libraries: LIBRARIES,
    });
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
