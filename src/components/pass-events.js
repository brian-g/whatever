import { formatDateTime, formatSpeed } from '../services/units.js';

/** Lists the radar passes with the recorded vehicle and rider speeds at each event. */
export class PassEvents {
  static bindables = ['track', 'stats', 'units'];

  get rows() {
    if (!this.track || !this.stats) return [];
    const points = this.track.points;
    const pointSpeeds = this.stats.pointSpeeds;
    const events = this.track.passEvents ?? [];

    return events.map((event) => {
      const pointIndex = points.indexOf(event.point);
      const pointSpeed = event.riderSpeed
        ?? (pointIndex >= 0 ? pointSpeeds[pointIndex] : null);
      return {
        time: event.point.time === null ? '—' : formatDateTime(new Date(event.point.time)),
        vehicleSpeed: formatSpeed(event.vehicleSpeed, this.units),
        riderSpeed: formatSpeed(pointSpeed, this.units),
      };
    });
  }
}
