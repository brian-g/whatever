import {
  formatDateTime, formatDistance, formatDuration, formatElevation, formatNumber,
  formatPace, formatSpeed, formatTemperature,
} from '../services/units.js';

/**
 * The summary panel: one hero figure (distance) plus a grid of stat tiles.
 *
 * Tiles are built from the `hasX` flags on the stats object, so a file without a barometer
 * or a heart-rate strap simply shows fewer tiles instead of a row of zeroes and dashes.
 */
export class StatTiles {
  static bindables = ['stats', 'units'];

  get hero() {
    const stats = this.stats;
    if (!stats) return null;
    return {
      value: formatDistance(stats.distance, this.units, 2),
      sub: stats.startTime ? formatDateTime(stats.startTime) : null,
    };
  }

  get tiles() {
    const stats = this.stats;
    if (!stats) return [];
    const units = this.units;
    const tiles = [];

    if (stats.hasTime) {
      tiles.push({
        label: 'Moving time',
        value: formatDuration(stats.movingTime),
        sub: stats.stoppedTime >= 60 ? `${formatDuration(stats.stoppedTime)} stopped` : null,
      });
      tiles.push({ label: 'Elapsed time', value: formatDuration(stats.duration), sub: null });
      tiles.push({
        label: 'Average speed',
        value: formatSpeed(stats.avgMovingSpeed ?? stats.avgSpeed, units),
        sub: `${formatSpeed(stats.avgSpeed, units)} overall`,
      });
      tiles.push({
        label: 'Top speed',
        value: formatSpeed(stats.maxSpeed, units),
        sub: 'rolling 5-point mean',
      });
      tiles.push({
        label: 'Average pace',
        value: formatPace(stats.avgMovingSpeed ?? stats.avgSpeed, units),
        sub: null,
      });
    }

    if (stats.hasElevation) {
      tiles.push({ label: 'Elevation gain', value: formatElevation(stats.elevGain, units), sub: null });
      tiles.push({ label: 'Elevation loss', value: formatElevation(stats.elevLoss, units), sub: null });
      tiles.push({
        label: 'Highest point',
        value: formatElevation(stats.maxElevation, units),
        sub: `${formatElevation(stats.minElevation, units)} lowest`,
      });
    }

    if (stats.hasHeartRate) {
      tiles.push({
        label: 'Average heart rate',
        value: `${formatNumber(stats.avgHr)} bpm`,
        sub: `${formatNumber(stats.maxHr)} bpm max`,
      });
    }

    if (stats.hasCadence) {
      tiles.push({
        label: 'Average cadence',
        value: `${formatNumber(stats.avgCad)} rpm`,
        sub: `${formatNumber(stats.maxCad)} rpm max`,
      });
    }

    if (stats.hasPower) {
      tiles.push({
        label: 'Average power',
        value: `${formatNumber(stats.avgPower)} W`,
        sub: `${formatNumber(stats.maxPower)} W max`,
      });
    }

    if (stats.hasTemperature) {
      tiles.push({
        label: 'Temperature',
        value: `${formatTemperature(stats.minTemp, units)} – ${formatTemperature(stats.maxTemp, units)}`,
        sub: null,
      });
    }

    tiles.push({ label: 'Track points', value: formatNumber(stats.pointCount), sub: null });
    return tiles;
  }
}
