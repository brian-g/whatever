/**
 * GPX 1.0/1.1 parsing.
 *
 * Every element lookup goes through `localName`, never a prefixed tag name. Real exports
 * disagree about prefixes for the same data -- Garmin writes `gpxtpx:hr`, Strava writes
 * `gpxtpx:hr` under a differently-named namespace, some tools emit `ns3:hr` or a bare `hr` --
 * and prefix-sensitive lookups are the usual reason a parser handles one file and silently
 * drops data from the next.
 */

/** Extension element local names mapped onto our point fields. */
const EXTENSION_FIELDS = {
  hr: 'hr',
  heartrate: 'hr',
  cad: 'cad',
  cadence: 'cad',
  atemp: 'temp',
  temp: 'temp',
  temperature: 'temp',
  power: 'power',
  pwr: 'power',
  watts: 'power',
};

function childrenNamed(el, localName) {
  return Array.from(el.children).filter((c) => c.localName === localName);
}

function childNamed(el, localName) {
  return Array.from(el.children).find((c) => c.localName === localName) ?? null;
}

function childText(el, localName) {
  const child = childNamed(el, localName);
  const text = child?.textContent?.trim();
  return text ? text : null;
}

function childNumber(el, localName) {
  const text = childText(el, localName);
  if (text === null) return null;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

function parseTime(text) {
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

/** Walks an <extensions> subtree at any depth, filling the first value found per field. */
function readExtensions(el, point) {
  for (const child of el.children) {
    const field = EXTENSION_FIELDS[child.localName.toLowerCase()];
    if (field && point[field] === null) {
      const value = Number.parseFloat(child.textContent);
      if (Number.isFinite(value)) point[field] = value;
    }
    if (child.children.length > 0) readExtensions(child, point);
  }
}

function readPoint(el) {
  const lat = Number.parseFloat(el.getAttribute('lat'));
  const lon = Number.parseFloat(el.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const point = {
    lat,
    lon,
    ele: childNumber(el, 'ele'),
    time: parseTime(childText(el, 'time')),
    hr: null,
    cad: null,
    temp: null,
    power: null,
  };

  const extensions = childNamed(el, 'extensions');
  if (extensions) readExtensions(extensions, point);
  return point;
}

function readWaypoint(el) {
  const point = readPoint(el);
  if (!point) return null;
  return {
    lat: point.lat,
    lon: point.lon,
    ele: point.ele,
    time: point.time,
    name: childText(el, 'name'),
    description: childText(el, 'desc') ?? childText(el, 'cmt'),
    symbol: childText(el, 'sym'),
  };
}

/**
 * @param {string} xmlText raw GPX file contents
 * @returns {{name: string|null, description: string|null, creator: string|null,
 *            time: number|null, tracks: Array, waypoints: Array, points: Array}}
 * @throws {Error} with a message suitable for display when the file cannot be used
 */
export function parseGpx(xmlText) {
  if (typeof xmlText !== 'string' || xmlText.trim() === '') {
    throw new Error('That file is empty.');
  }

  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`That file is not valid XML: ${parseError.textContent.trim().split('\n')[0]}`);
  }

  const root = doc.documentElement;
  if (!root || root.localName !== 'gpx') {
    throw new Error(`Expected a <gpx> root element but found <${root?.localName ?? '?'}>.`);
  }

  const metadata = childNamed(root, 'metadata');
  const tracks = [];

  for (const trk of childrenNamed(root, 'trk')) {
    const segments = childrenNamed(trk, 'trkseg')
      .map((seg) => childrenNamed(seg, 'trkpt').map(readPoint).filter(Boolean))
      .filter((seg) => seg.length > 0);
    if (segments.length === 0) continue;
    tracks.push({
      name: childText(trk, 'name'),
      type: childText(trk, 'type'),
      segments,
      points: segments.flat(),
    });
  }

  // Routes are a planned-path equivalent of a track; treat them as one when no track exists.
  if (tracks.length === 0) {
    for (const rte of childrenNamed(root, 'rte')) {
      const points = childrenNamed(rte, 'rtept').map(readPoint).filter(Boolean);
      if (points.length === 0) continue;
      tracks.push({
        name: childText(rte, 'name'),
        type: 'route',
        segments: [points],
        points,
      });
    }
  }

  const points = tracks.flatMap((track) => track.points);
  if (points.length < 2) {
    throw new Error('That GPX file has no track points to analyse.');
  }

  return {
    name: (metadata && childText(metadata, 'name'))
      ?? tracks.find((t) => t.name)?.name
      ?? null,
    description: metadata ? childText(metadata, 'desc') : null,
    creator: root.getAttribute('creator'),
    time: metadata ? parseTime(childText(metadata, 'time')) : null,
    tracks,
    waypoints: childrenNamed(root, 'wpt').map(readWaypoint).filter(Boolean),
    points,
  };
}
