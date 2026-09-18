/**
 * Statistics derived from a list of GPX track points.
 *
 * Deliberately free of any browser API: this module takes plain objects and returns plain
 * objects, so the maths can be exercised directly under Node rather than only through the UI.
 * Every value returned is SI -- metres, seconds, m/s, degrees C. Formatting happens in
 * `units.js`.
 */

const EARTH_RADIUS_M = 6371008.8; // IUGG mean radius

/**
 * A rise or fall is only committed to the gain/loss totals once it exceeds this many metres
 * from the last committed reference. Both GPS and barometric altimeters jitter by a metre or
 * two at rest, and summing every raw delta turns that jitter into hundreds of metres of
 * fictional climbing over a few thousand points.
 */
const ELEVATION_THRESHOLD_M = 3;

/** Below this speed a segment counts as stopped rather than moving. */
const MOVING_MIN_SPEED_MS = 0.5;

/**
 * Segments longer than this are treated as a gap in the recording (auto-pause, lost signal,
 * device asleep) and excluded from moving time, so a lunch stop cannot drag the average down.
 */
const MAX_SEGMENT_GAP_S = 60;

/**
 * Instantaneous speed from two consecutive fixes is dominated by GPS noise. Reported speeds
 * come from a centred rolling mean this many segments wide, which is what keeps "max speed"
 * from reporting a sprint that never happened.
 */
const SPEED_WINDOW = 5;

/** Upper bound on points handed to the chart; more than this is invisible detail. */
const MAX_CHART_SAMPLES = 1200;

/**
 * A trailing remainder shorter than this is dropped rather than shown as a split of its own.
 * Without it a route that ends a metre past a boundary gets a final row reading "1 m".
 */
const MIN_PARTIAL_SPLIT_M = 10;

/** Great-circle distance between two points, in metres. */
export function haversine(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Centred rolling mean, used to take the GPS noise out of per-segment speeds. */
function smooth(values, window) {
  const half = Math.floor(window / 2);
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length, i + half + 1);
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += values[j];
    out[i] = sum / (hi - lo);
  }
  return out;
}

/**
 * Threshold-filtered elevation gain and loss over `points[from..to]`.
 * See ELEVATION_THRESHOLD_M for why the raw deltas are not simply summed.
 */
function elevationChange(points, from = 0, to = points.length - 1) {
  let gain = 0;
  let loss = 0;
  let reference = null;
  for (let i = from; i <= to; i++) {
    const ele = points[i].ele;
    if (ele === null || ele === undefined) continue;
    if (reference === null) {
      reference = ele;
      continue;
    }
    const delta = ele - reference;
    if (delta >= ELEVATION_THRESHOLD_M) {
      gain += delta;
      reference = ele;
    } else if (delta <= -ELEVATION_THRESHOLD_M) {
      loss -= delta;
      reference = ele;
    }
  }
  return { gain, loss };
}

function extremes(points, field) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const point of points) {
    const value = point[field];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    count += 1;
  }
  if (count === 0) return { min: null, max: null, avg: null, count: 0 };
  return { min, max, avg: sum / count, count };
}

/**
 * @param {Array} points track points from `parseGpx`
 * @returns {object} distances in m, durations in s, speeds in m/s
 */
export function computeStats(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('Need at least two track points to compute statistics.');
  }

  const n = points.length;
  const cumulative = new Float64Array(n);
  const segmentSpeeds = new Float64Array(n - 1);
  let distance = 0;
  let movingTime = 0;

  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lon > east) east = p.lon;
    if (p.lon < west) west = p.lon;

    if (i === 0) continue;

    const segmentDistance = haversine(points[i - 1], points[i]);
    distance += segmentDistance;
    cumulative[i] = distance;

    const dt = points[i].time !== null && points[i - 1].time !== null
      ? (points[i].time - points[i - 1].time) / 1000
      : 0;
    const speed = dt > 0 ? segmentDistance / dt : 0;
    segmentSpeeds[i - 1] = speed;
    if (dt > 0 && dt <= MAX_SEGMENT_GAP_S && speed >= MOVING_MIN_SPEED_MS) {
      movingTime += dt;
    }
  }

  const smoothedSpeeds = smooth(segmentSpeeds, SPEED_WINDOW);
  let maxSpeed = 0;
  for (const speed of smoothedSpeeds) if (speed > maxSpeed) maxSpeed = speed;

  const timed = points.filter((p) => p.time !== null);
  const startTime = timed.length > 0 ? new Date(timed[0].time) : null;
  const endTime = timed.length > 0 ? new Date(timed[timed.length - 1].time) : null;
  const duration = timed.length > 1 ? (timed[timed.length - 1].time - timed[0].time) / 1000 : 0;

  const { gain, loss } = elevationChange(points);
  const ele = extremes(points, 'ele');
  const hr = extremes(points, 'hr');
  const cad = extremes(points, 'cad');
  const temp = extremes(points, 'temp');
  const power = extremes(points, 'power');

  // Per-point speed, so the chart and the map hover marker read the same number.
  const pointSpeeds = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    pointSpeeds[i] = smoothedSpeeds[Math.min(Math.max(i - 1, 0), smoothedSpeeds.length - 1)];
  }

  const stride = Math.max(1, Math.ceil(n / MAX_CHART_SAMPLES));
  const samples = [];
  for (let i = 0; i < n; i += stride) {
    samples.push({
      index: i,
      distance: cumulative[i],
      elevation: points[i].ele,
      speed: pointSpeeds[i],
      hr: points[i].hr,
      cad: points[i].cad,
      time: points[i].time,
    });
  }
  const last = n - 1;
  if (samples[samples.length - 1].index !== last) {
    samples.push({
      index: last,
      distance: cumulative[last],
      elevation: points[last].ele,
      speed: pointSpeeds[last],
      hr: points[last].hr,
      cad: points[last].cad,
      time: points[last].time,
    });
  }

  return {
    pointCount: n,
    hasTime: timed.length > 1,
    hasElevation: ele.count > 0,
    hasHeartRate: hr.count > 0,
    hasCadence: cad.count > 0,
    hasTemperature: temp.count > 0,
    hasPower: power.count > 0,

    distance,
    duration,
    movingTime,
    stoppedTime: Math.max(0, duration - movingTime),
    startTime,
    endTime,

    avgSpeed: duration > 0 ? distance / duration : null,
    avgMovingSpeed: movingTime > 0 ? distance / movingTime : null,
    maxSpeed: segmentSpeeds.length > 0 ? maxSpeed : null,

    elevGain: ele.count > 0 ? gain : null,
    elevLoss: ele.count > 0 ? loss : null,
    minElevation: ele.min,
    maxElevation: ele.max,
    netElevation: ele.count > 0 ? gain - loss : null,

    avgHr: hr.avg,
    maxHr: hr.max,
    avgCad: cad.avg,
    maxCad: cad.max,
    minTemp: temp.min,
    maxTemp: temp.max,
    avgPower: power.avg,
    maxPower: power.max,

    bounds: { north, south, east, west },
    cumulative,
    pointSpeeds,
    samples,
  };
}

/**
 * Per-km (or per-mile) splits. The boundary crossing is interpolated along the segment that
 * straddles it, so a split's time does not jump to the nearest recorded fix.
 *
 * @param {Array} points track points from `parseGpx`
 * @param {number} splitMeters interval length in metres
 */
export function computeSplits(points, splitMeters) {
  if (!Array.isArray(points) || points.length < 2 || !(splitMeters > 0)) return [];

  const splits = [];
  let boundary = splitMeters;
  let cumulative = 0;
  let splitStartIndex = 0;
  let splitStartDistance = 0;
  let splitStartTime = points[0].time;

  const push = (endDistance, endTime, endIndex, partial) => {
    const { gain, loss } = elevationChange(points, splitStartIndex, endIndex);
    const hr = extremes(points.slice(splitStartIndex, endIndex + 1), 'hr');
    const splitDistance = endDistance - splitStartDistance;
    const splitDuration = splitStartTime !== null && endTime !== null
      ? (endTime - splitStartTime) / 1000
      : null;
    splits.push({
      number: splits.length + 1,
      distance: splitDistance,
      endDistance,
      duration: splitDuration,
      speed: splitDuration > 0 ? splitDistance / splitDuration : null,
      elevGain: gain,
      elevLoss: loss,
      avgHr: hr.avg,
      partial,
    });
    splitStartDistance = endDistance;
    splitStartTime = endTime;
    splitStartIndex = endIndex;
  };

  for (let i = 1; i < points.length; i++) {
    const segmentStart = cumulative;
    const segmentDistance = haversine(points[i - 1], points[i]);
    cumulative += segmentDistance;

    while (cumulative >= boundary && segmentDistance > 0) {
      const fraction = (boundary - segmentStart) / segmentDistance;
      const from = points[i - 1].time;
      const to = points[i].time;
      const crossingTime = from !== null && to !== null ? from + (to - from) * fraction : null;
      push(boundary, crossingTime, i, false);
      boundary += splitMeters;
    }
  }

  // Whatever is left over after the last whole split, if it amounts to anything.
  if (cumulative - splitStartDistance >= MIN_PARTIAL_SPLIT_M) {
    push(cumulative, points[points.length - 1].time, points.length - 1, true);
  }

  return splits;
}
