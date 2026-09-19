import { hasMapKitToken, loadMapKit, TOKEN_ENV_VAR, TOKEN_HELP } from '../services/mapkit.js';
import { formatDateTime, formatDistance } from '../services/units.js';

/**
 * Draws the route on an Apple Maps basemap via MapKit JS.
 *
 * Values come from `mapkit.MapType` / `mapkit.ColorScheme` rather than the deprecated
 * `mapkit.Map.MapTypes` / `Map.ColorSchemes` accessors, falling back to the documented
 * string constants if a pinned older MapKit build lacks the newer namespaces.
 */

/** Coordinates per polyline. A route denser than this costs render time nobody can see. */
const MAX_POLYLINE_POINTS = 3000;

const MAP_TYPES = [
  { id: 'standard', key: 'Standard', label: 'Standard' },
  { id: 'mutedStandard', key: 'MutedStandard', label: 'Muted' },
  { id: 'hybrid', key: 'Hybrid', label: 'Hybrid' },
  { id: 'satellite', key: 'Satellite', label: 'Satellite' },
];

// Categorical slots 1/3/2 -- the same validated trio the elevation chart uses, so the route
// line matches the "Elevation" series the reader just looked at.
const ROUTE_COLOR = '#2a78d6';
const START_COLOR = '#1baf7a';
const FINISH_COLOR = '#eb6834';
const WAYPOINT_COLOR = '#52514e';
const RADAR_PASS_COLOR = '#d03b3b';

/**
 * The route is drawn twice: a translucent white casing underneath, then the colour on top.
 * A single stroke disappears into satellite imagery and dark basemaps; the casing is what
 * keeps one line legible over every map type.
 */
const CASING_COLOR = '#ffffff';

export class RouteMap {
  static bindables = ['track', 'stats', 'hoverIndex'];

  mapElement = null;
  mapTypes = MAP_TYPES;
  mapType = 'standard';
  error = null;
  errorDetail = null;
  loading = true;

  #mapkit = null;
  #map = null;
  #overlays = [];
  #annotations = [];
  #cursor = null;
  #destroyed = false;

  get hasRadarPasses() {
    return (this.track?.passEvents?.length ?? 0) > 0;
  }

  async attached() {
    if (!hasMapKitToken()) {
      this.error = `Apple Maps is not configured: no ${TOKEN_ENV_VAR} is set.`;
      this.errorDetail = TOKEN_HELP;
      this.loading = false;
      return;
    }

    try {
      this.#mapkit = await loadMapKit();
      // The panel can be torn down while the CDN request is in flight.
      if (this.#destroyed || !this.mapElement) return;

      const mapkit = this.#mapkit;
      this.#map = new mapkit.Map(this.mapElement, {
        mapType: this.#resolveMapType(this.mapType),
        colorScheme: mapkit.ColorScheme?.Adaptive ?? 'adaptive',
        showsCompass: mapkit.FeatureVisibility?.Adaptive ?? 'adaptive',
        showsScale: mapkit.FeatureVisibility?.Adaptive ?? 'adaptive',
        showsMapTypeControl: false,
        isRotationEnabled: false,
        showsPointsOfInterest: true,
      });
      this.#draw();
    } catch (error) {
      this.error = 'Apple Maps could not be loaded.';
      this.errorDetail = `${error.message}\n\nA MapKit JS token that is expired, or signed with `
        + 'the wrong key or Team ID, is rejected by the CDN and reports as a load failure.';
    } finally {
      this.loading = false;
    }
  }

  detaching() {
    this.#destroyed = true;
    this.#clear();
    this.#map?.destroy();
    this.#map = null;
  }

  trackChanged() {
    if (this.#map) this.#draw();
  }

  /** Follows the elevation chart's crosshair with a dot on the route. */
  hoverIndexChanged(value) {
    if (!this.#map || !this.#mapkit) return;
    const point = value === null || value === undefined ? null : this.track?.points?.[value];
    if (!point) {
      if (this.#cursor) {
        this.#map.removeAnnotation(this.#cursor);
        this.#cursor = null;
      }
      return;
    }

    const coordinate = new this.#mapkit.Coordinate(point.lat, point.lon);
    if (this.#cursor) {
      this.#cursor.coordinate = coordinate;
      return;
    }
    this.#cursor = new this.#mapkit.Annotation(coordinate, () => {
      const element = document.createElement('div');
      element.className = 'route-map__cursor';
      return element;
    }, {
      size: { width: 18, height: 18 },
      // Annotations anchor at bottom centre, so nudge down half the height to centre the dot.
      anchorOffset: new DOMPoint(0, 9),
    });
    this.#map.addAnnotation(this.#cursor);
  }

  selectMapType(id) {
    this.mapType = id;
    if (this.#map) this.#map.mapType = this.#resolveMapType(id);
  }

  #resolveMapType(id) {
    const entry = MAP_TYPES.find((type) => type.id === id) ?? MAP_TYPES[0];
    return this.#mapkit?.MapType?.[entry.key] ?? entry.id;
  }

  #clear() {
    if (this.#map) {
      if (this.#overlays.length > 0) this.#map.removeOverlays(this.#overlays);
      if (this.#annotations.length > 0) this.#map.removeAnnotations(this.#annotations);
      if (this.#cursor) this.#map.removeAnnotation(this.#cursor);
    }
    this.#overlays = [];
    this.#annotations = [];
    this.#cursor = null;
  }

  /** Thins a segment to MAX_POLYLINE_POINTS, always keeping the final fix. */
  #coordinates(segment) {
    const mapkit = this.#mapkit;
    const stride = Math.max(1, Math.ceil(segment.length / MAX_POLYLINE_POINTS));
    const coordinates = [];
    for (let i = 0; i < segment.length; i += stride) {
      coordinates.push(new mapkit.Coordinate(segment[i].lat, segment[i].lon));
    }
    if ((segment.length - 1) % stride !== 0) {
      const last = segment[segment.length - 1];
      coordinates.push(new mapkit.Coordinate(last.lat, last.lon));
    }
    return coordinates;
  }

  #draw() {
    const mapkit = this.#mapkit;
    const track = this.track;
    this.#clear();
    if (!track) return;

    const segments = track.tracks
      .flatMap((entry) => entry.segments)
      .filter((segment) => segment.length >= 2);
    if (segments.length === 0) return;

    const framed = [];
    for (const segment of segments) {
      const coordinates = this.#coordinates(segment);
      const casing = new mapkit.PolylineOverlay(coordinates, {
        style: new mapkit.Style({
          lineWidth: 8, lineJoin: 'round', lineCap: 'round',
          strokeColor: CASING_COLOR, strokeOpacity: 0.55,
        }),
      });
      const line = new mapkit.PolylineOverlay(coordinates, {
        style: new mapkit.Style({
          lineWidth: 4, lineJoin: 'round', lineCap: 'round', strokeColor: ROUTE_COLOR,
        }),
      });
      this.#map.addOverlays([casing, line]);
      this.#overlays.push(casing, line);
      framed.push(line);
    }

    const first = segments[0][0];
    const lastSegment = segments[segments.length - 1];
    const last = lastSegment[lastSegment.length - 1];
    const stats = this.stats;

    const markers = [
      new mapkit.MarkerAnnotation(new mapkit.Coordinate(first.lat, first.lon), {
        color: START_COLOR,
        glyphText: 'S',
        title: 'Start',
        subtitle: stats?.startTime ? formatDateTime(stats.startTime) : undefined,
      }),
      new mapkit.MarkerAnnotation(new mapkit.Coordinate(last.lat, last.lon), {
        color: FINISH_COLOR,
        glyphText: 'F',
        title: 'Finish',
        subtitle: stats ? formatDistance(stats.distance, 'metric', 2) : undefined,
      }),
    ];

    const passEvents = track.passEvents ?? [];
    const passPoints = new Set(passEvents.map((event) => event.point));

    for (const waypoint of track.waypoints ?? []) {
      if (passPoints.has(waypoint)) continue;
      markers.push(new mapkit.MarkerAnnotation(
        new mapkit.Coordinate(waypoint.lat, waypoint.lon),
        {
          color: WAYPOINT_COLOR,
          title: waypoint.name ?? 'Waypoint',
          subtitle: waypoint.description ?? undefined,
        },
      ));
    }

    for (const event of passEvents) {
      const details = [event.type, event.distance !== null ? `${event.distance} m` : null]
        .filter(Boolean)
        .join(' · ');
      markers.push(new mapkit.MarkerAnnotation(
        new mapkit.Coordinate(event.point.lat, event.point.lon),
        {
          color: RADAR_PASS_COLOR,
          glyphText: 'P',
          title: 'Radar pass',
          subtitle: details || 'Vehicle passed',
        },
      ));
    }

    this.#map.addAnnotations(markers);
    this.#annotations.push(...markers);

    this.#map.showItems([...framed, ...markers], {
      animate: false,
      padding: { top: 48, right: 32, bottom: 32, left: 32 },
    });
  }
}
