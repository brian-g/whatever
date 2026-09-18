import { parseGpx } from './services/gpx-parser.js';
import { computeStats } from './services/track-stats.js';
import { IMPERIAL, METRIC, formatDateTime, formatNumber } from './services/units.js';

const UNITS_STORAGE_KEY = 'gpx-stats:units';

/**
 * Dashboard shell. Owns the loaded track, its statistics, the unit system, and the crosshair
 * index shared between the elevation chart and the map.
 */
export class MyApp {
  units = METRIC;
  unitOptions = [
    { id: METRIC, label: 'Metric' },
    { id: IMPERIAL, label: 'Imperial' },
  ];

  track = null;
  stats = null;
  fileName = null;
  error = null;
  parsing = false;

  /** Index into `track.points`, or null. Written by the chart, read by the map. */
  hoverIndex = null;

  constructor() {
    try {
      const saved = localStorage.getItem(UNITS_STORAGE_KEY);
      if (saved === METRIC || saved === IMPERIAL) this.units = saved;
    } catch {
      // Storage can be unavailable (private browsing, blocked site data); the default stands.
    }
  }

  /**
   * Bound as a callback into `gpx-drop-zone`, which reads text but does not interpret it.
   * Declared as a field so `this` survives being passed around as a plain function.
   */
  onFileLoaded = ({ text, name, error }) => {
    this.hoverIndex = null;
    this.fileName = name;

    if (error) {
      this.#fail(error.message);
      return;
    }

    this.parsing = true;
    try {
      const track = parseGpx(text);
      const stats = computeStats(track.points);
      this.track = track;
      this.stats = stats;
      this.error = null;
    } catch (failure) {
      this.#fail(failure.message);
    } finally {
      this.parsing = false;
    }
  };

  setUnits(units) {
    this.units = units;
    try {
      localStorage.setItem(UNITS_STORAGE_KEY, units);
    } catch {
      // Not being able to remember the preference is not worth interrupting the user over.
    }
  }

  get title() {
    return this.track?.name ?? this.fileName ?? 'Track';
  }

  get metadata() {
    const track = this.track;
    const stats = this.stats;
    if (!track || !stats) return [];

    const segments = track.tracks.reduce((total, t) => total + t.segments.length, 0);
    const rows = [
      { label: 'File', value: this.fileName },
      { label: 'Track name', value: track.name },
      { label: 'Activity', value: track.tracks.find((t) => t.type)?.type },
      { label: 'Recorded by', value: track.creator },
      { label: 'Started', value: stats.startTime ? formatDateTime(stats.startTime) : null },
      { label: 'Finished', value: stats.endTime ? formatDateTime(stats.endTime) : null },
      {
        label: 'Structure',
        value: `${formatNumber(track.tracks.length)} track${track.tracks.length === 1 ? '' : 's'}, `
          + `${formatNumber(segments)} segment${segments === 1 ? '' : 's'}`,
      },
      {
        label: 'Waypoints',
        value: track.waypoints.length > 0 ? formatNumber(track.waypoints.length) : null,
      },
      { label: 'Notes', value: track.description },
    ];
    return rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== '');
  }

  #fail(message) {
    this.error = message;
    this.track = null;
    this.stats = null;
  }
}
