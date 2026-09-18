import { toDistance, toElevation, toSpeed, labels as unitLabels } from '../services/units.js';

/**
 * Single-series area chart over distance, with a crosshair + tooltip.
 *
 * One metric is plotted at a time and switched with the control above the chart. That is a
 * deliberate choice over overlaying elevation and heart rate on twin y-axes: a second y-scale
 * lets the reader infer crossings and correlations that the data does not support.
 *
 * The plot geometry is built imperatively into `this.plot` rather than exposed as a computed
 * getter. It is a pass over every sample, and the template reads a dozen properties off it --
 * as a getter that is a dozen recomputations per render, and it also leaves rendering
 * dependent on the framework invalidating a computed whose inputs include a measured size.
 */

const PADDING = { top: 18, right: 18, bottom: 30, left: 52 };
const TARGET_Y_TICKS = 4;
const TARGET_X_TICKS = 6;

/**
 * Metric definitions. `floorAtZero` marks the scales with a meaningful zero: speed and heart
 * rate get a zero baseline, while elevation is floored just below its minimum, as every
 * mapping tool does -- a ride between 46 m and 216 m is unreadable squashed against 0.
 */
const METRICS = [
  {
    id: 'elevation',
    label: 'Elevation',
    requires: 'hasElevation',
    series: 'var(--series-1)',
    floorAtZero: false,
    value: (sample, units) => (sample.elevation === null ? null : toElevation(sample.elevation, units)),
    unit: (units) => unitLabels(units).elevation,
    format: (value) => Math.round(value).toLocaleString(),
  },
  {
    id: 'speed',
    label: 'Speed',
    requires: 'hasTime',
    series: 'var(--series-2)',
    floorAtZero: true,
    value: (sample, units) => toSpeed(sample.speed, units),
    unit: (units) => unitLabels(units).speed,
    format: (value) => value.toFixed(1),
  },
  {
    id: 'hr',
    label: 'Heart rate',
    requires: 'hasHeartRate',
    series: 'var(--series-3)',
    floorAtZero: false,
    value: (sample) => sample.hr,
    unit: () => 'bpm',
    format: (value) => Math.round(value).toLocaleString(),
  },
];

/** Round a rough interval up to the nearest 1/2/5 x 10^n, so ticks land on readable numbers. */
function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function niceTicks(min, max, target) {
  if (!(max > min)) return [min];
  const step = niceStep((max - min) / target);
  const ticks = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Math.round(value / step) * step);
  }
  return ticks;
}

export class ElevationProfile {
  static bindables = ['stats', 'units', 'hoverIndex'];

  chartElement = null;
  metric = 'elevation';
  width = 0;
  height = 0;

  /** Plot geometry for the template, or null when there is nothing to draw. */
  plot = null;

  /** Crosshair position and readout, or null when nothing is hovered. */
  cursor = null;

  availableMetrics = [];
  hasMetricData = false;

  #observer = null;

  attached() {
    // Measure before observing: a ResizeObserver does not deliver its first callback until
    // after the next layout, so waiting for it leaves the chart blank on first paint.
    this.#measure();
    this.#observer = new ResizeObserver(() => this.#measure());
    this.#observer.observe(this.chartElement);
  }

  detaching() {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /**
   * Aurelia invokes `*Changed` callbacks on subsequent changes, not for the value a bindable
   * is first bound to, so the initial state has to be seeded once the bindings are in place.
   */
  bound() {
    this.#sync();
  }

  statsChanged() {
    this.#sync();
  }

  unitsChanged() {
    this.#rebuild();
  }

  #sync() {
    this.availableMetrics = this.stats
      ? METRICS.filter((metric) => this.stats[metric.requires])
      : [];
    if (!this.availableMetrics.some((metric) => metric.id === this.metric)) {
      this.metric = this.availableMetrics[0]?.id ?? 'elevation';
    }
    this.#rebuild();
  }

  selectMetric(id) {
    this.metric = id;
    this.#rebuild();
  }

  get activeMetric() {
    return METRICS.find((metric) => metric.id === this.metric) ?? METRICS[0];
  }

  get chartLabel() {
    return `${this.activeMetric.label} profile over the length of the route`;
  }

  /** The chart is drawn in CSS pixels (viewBox == element size) so strokes stay a true 2px. */
  #measure() {
    const box = this.chartElement.getBoundingClientRect();
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.#rebuild();
  }

  #rebuild() {
    const metric = this.activeMetric;
    const stats = this.stats;
    this.hasMetricData = Boolean(stats) && stats.samples.some((sample) => {
      const value = metric.value(sample, this.units);
      return value !== null && Number.isFinite(value);
    });
    this.plot = this.#computePlot(metric);
    this.#updateCursor();
  }

  #computePlot(metric) {
    const stats = this.stats;
    if (!stats || this.width < 120 || this.height < 80) return null;

    const units = this.units;
    const entries = [];
    for (const sample of stats.samples) {
      const value = metric.value(sample, units);
      if (value === null || !Number.isFinite(value)) continue;
      entries.push({ sample, value });
    }
    if (entries.length < 2) return null;

    const xMax = toDistance(stats.distance, units);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const { value } of entries) {
      if (value < yMin) yMin = value;
      if (value > yMax) yMax = value;
    }

    const step = niceStep((yMax - yMin) / TARGET_Y_TICKS);
    const yFloor = metric.floorAtZero ? 0 : Math.floor(yMin / step) * step;
    const yCeil = Math.ceil((yMax + step * 0.05) / step) * step;
    const ySpan = yCeil - yFloor || 1;

    const plotWidth = this.width - PADDING.left - PADDING.right;
    const plotHeight = this.height - PADDING.top - PADDING.bottom;
    const toX = (distance) => PADDING.left + (distance / (xMax || 1)) * plotWidth;
    const toY = (value) => PADDING.top + plotHeight - ((value - yFloor) / ySpan) * plotHeight;

    const coords = entries.map(({ sample, value }) => ({
      index: sample.index,
      distance: sample.distance,
      x: toX(toDistance(sample.distance, units)),
      y: toY(value),
      value,
    }));

    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(' ');
    const baseline = PADDING.top + plotHeight;
    const area = `${line} L${coords[coords.length - 1].x.toFixed(2)},${baseline.toFixed(2)} `
      + `L${coords[0].x.toFixed(2)},${baseline.toFixed(2)} Z`;

    const peak = coords.reduce((best, c) => (c.value > best.value ? c : best), coords[0]);

    return {
      metric,
      unit: metric.unit(units),
      viewBox: `0 0 ${this.width} ${this.height}`,
      line,
      area,
      coords,
      baseline,
      left: PADDING.left,
      right: this.width - PADDING.right,
      top: PADDING.top,
      yTicks: niceTicks(yFloor, yCeil, TARGET_Y_TICKS)
        .map((value) => ({ y: toY(value), text: metric.format(value) })),
      xTicks: niceTicks(0, xMax, TARGET_X_TICKS)
        .map((value) => ({ x: toX(value), text: value.toLocaleString() })),
      xUnit: unitLabels(units).distance,
      // A single direct label, on the extreme; the axis and tooltip carry every other value.
      peak: {
        x: Math.min(Math.max(peak.x, PADDING.left + 28), this.width - PADDING.right - 28),
        y: peak.y,
        below: peak.y < PADDING.top + 24,
        text: `${metric.format(peak.value)} ${metric.unit(units)}`,
      },
    };
  }

  hoverIndexChanged() {
    this.#updateCursor();
  }

  #updateCursor() {
    const plot = this.plot;
    if (!plot || this.hoverIndex === null || this.hoverIndex === undefined) {
      this.cursor = null;
      return;
    }

    let nearest = plot.coords[0];
    for (const candidate of plot.coords) {
      if (Math.abs(candidate.index - this.hoverIndex) < Math.abs(nearest.index - this.hoverIndex)) {
        nearest = candidate;
      }
    }

    this.cursor = {
      x: nearest.x,
      y: nearest.y,
      value: `${plot.metric.format(nearest.value)} ${plot.unit}`,
      distance: `${toDistance(nearest.distance, this.units).toFixed(2)} ${plot.xUnit}`,
      // Flip the tooltip to the left of the crosshair before it runs off the right edge.
      flip: nearest.x > this.width - 150,
    };
  }

  onPointerMove(event) {
    const plot = this.plot;
    if (!plot) return;
    const x = event.clientX - this.chartElement.getBoundingClientRect().left;
    let nearest = plot.coords[0];
    for (const candidate of plot.coords) {
      if (Math.abs(candidate.x - x) < Math.abs(nearest.x - x)) nearest = candidate;
    }
    this.hoverIndex = nearest.index;
  }

  onPointerLeave() {
    this.hoverIndex = null;
  }
}
