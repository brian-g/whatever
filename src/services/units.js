/**
 * Unit conversion and display formatting.
 *
 * All values flowing out of `track-stats.js` are SI (metres, seconds, m/s, °C).
 * Conversion to whatever the user is reading happens here, at the edge.
 */

const M_PER_MILE = 1609.344;
const M_PER_FOOT = 0.3048;
const EM_DASH = '—';

export const METRIC = 'metric';
export const IMPERIAL = 'imperial';

/** Split interval for the splits table: 1 km vs 1 mile. */
export const SPLIT_METERS = { [METRIC]: 1000, [IMPERIAL]: M_PER_MILE };

export const UNIT_LABELS = {
  [METRIC]: { distance: 'km', elevation: 'm', speed: 'km/h', pace: '/km', temp: '°C' },
  [IMPERIAL]: { distance: 'mi', elevation: 'ft', speed: 'mph', pace: '/mi', temp: '°F' },
};

export function labels(system) {
  return UNIT_LABELS[system] ?? UNIT_LABELS[METRIC];
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Metres -> km or miles. */
export function toDistance(meters, system) {
  return system === IMPERIAL ? meters / M_PER_MILE : meters / 1000;
}

/** Metres -> metres or feet. */
export function toElevation(meters, system) {
  return system === IMPERIAL ? meters / M_PER_FOOT : meters;
}

/** m/s -> km/h or mph. */
export function toSpeed(metersPerSecond, system) {
  return system === IMPERIAL
    ? (metersPerSecond * 3600) / M_PER_MILE
    : (metersPerSecond * 3600) / 1000;
}

/** °C -> °C or °F. */
export function toTemperature(celsius, system) {
  return system === IMPERIAL ? celsius * 9 / 5 + 32 : celsius;
}

export function formatDistance(meters, system, digits = 2) {
  if (!isNum(meters)) return EM_DASH;
  return `${toDistance(meters, system).toFixed(digits)} ${labels(system).distance}`;
}

export function formatElevation(meters, system) {
  if (!isNum(meters)) return EM_DASH;
  return `${Math.round(toElevation(meters, system))} ${labels(system).elevation}`;
}

export function formatSpeed(metersPerSecond, system, digits = 1) {
  if (!isNum(metersPerSecond)) return EM_DASH;
  return `${toSpeed(metersPerSecond, system).toFixed(digits)} ${labels(system).speed}`;
}

export function formatTemperature(celsius, system) {
  if (!isNum(celsius)) return EM_DASH;
  return `${Math.round(toTemperature(celsius, system))}${labels(system).temp}`;
}

/**
 * Speed expressed as time per unit distance, the way runners and hikers read it.
 * Returns an em dash below ~0.1 m/s, where pace is meaningless rather than merely large.
 */
export function formatPace(metersPerSecond, system) {
  if (!isNum(metersPerSecond) || metersPerSecond < 0.1) return EM_DASH;
  const unitMeters = system === IMPERIAL ? M_PER_MILE : 1000;
  const secondsPerUnit = unitMeters / metersPerSecond;
  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = Math.round(secondsPerUnit - minutes * 60);
  // Rounding 59.6 s up must carry into the minutes, not print "4:60".
  const [m, s] = seconds === 60 ? [minutes + 1, 0] : [minutes, seconds];
  return `${m}:${String(s).padStart(2, '0')} ${labels(system).pace}`;
}

/** Seconds -> `m:ss`, or `h:mm:ss` once it runs past an hour. */
export function formatDuration(seconds) {
  if (!isNum(seconds) || seconds < 0) return EM_DASH;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatNumber(value, digits = 0) {
  if (!isNum(value)) return EM_DASH;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
