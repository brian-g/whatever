import { computeSplits } from '../services/track-stats.js';
import {
  SPLIT_METERS, formatDistance, formatDuration, formatElevation, formatNumber,
  formatSpeed, labels as unitLabels,
} from '../services/units.js';

/**
 * Per-kilometre / per-mile splits.
 *
 * Doubles as the table view that keeps every plotted number readable without relying on
 * colour, which is what the light-mode aqua series needs to stay accessible.
 */
export class SplitsTable {
  static bindables = ['points', 'stats', 'units'];

  get unitLabel() {
    return unitLabels(this.units).distance;
  }

  get rows() {
    if (!this.points || !this.stats) return [];
    const units = this.units;
    const splits = computeSplits(this.points, SPLIT_METERS[units] ?? SPLIT_METERS.metric);
    const fastest = splits.reduce((max, s) => Math.max(max, s.speed ?? 0), 0);

    return splits.map((split) => ({
      number: split.number,
      partial: split.partial,
      label: split.partial
        ? `${split.number} · ${formatDistance(split.distance, units, 2)}`
        : String(split.number),
      duration: formatDuration(split.duration),
      speed: formatSpeed(split.speed, units),
      elevGain: formatElevation(split.elevGain, units),
      avgHr: split.avgHr === null ? '—' : formatNumber(split.avgHr),
      // Magnitude cue beside the printed number, not a replacement for it.
      barPercent: fastest > 0 ? ((split.speed ?? 0) / fastest) * 100 : 0,
    }));
  }
}
