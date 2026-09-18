# GPX Statistics

A sample [Aurelia 2](https://docs.aurelia.io/) app that reads a GPX file in the browser and
shows what is in it: distance, moving time, climbing, speed, per-split breakdowns, an
interactive elevation profile, and the route drawn on **Apple Maps** through
[MapKit JS](https://developer.apple.com/documentation/mapkitjs/).

Nothing is uploaded. Files are parsed locally with `DOMParser`.

## Quick start

    npm install
    npm start

The dev server runs on <http://localhost:9000>. Drag a `.gpx` file onto the page, or press
**Load sample ride** for the bundled 25 km sample.

Everything except the Apple Maps basemap works without any configuration.

## Apple Maps setup

MapKit JS authenticates with a signed token; there is no anonymous mode. Until one is
configured, the route panel explains this and the rest of the dashboard works normally.

1. In the [Apple Developer portal](https://developer.apple.com/account/resources/), under
   **Certificates, Identifiers & Profiles**, register a **Maps ID**.
2. Create a **MapKit JS private key** and associate it with that Maps ID. Download the `.p8`
   key file — Apple lets you download it only once.
3. Sign an **ES256 JWT** with that key. The header needs `kid` (your Key ID) and
   `typ: "JWT"`; the payload needs `iss` (your 10-character Team ID), `iat`, and `exp`.
   Add an `origin` claim to restrict the token to your own domains.
4. Copy the token into `.env.local`:

       cp .env.example .env.local
       # then set VITE_MAPKIT_TOKEN=<your token>

5. Restart `npm start`. Vite only exposes `VITE_`-prefixed variables to the browser.

An expired token, or one signed with the wrong key or Team ID, is rejected by Apple's CDN and
surfaces in the route panel as a load failure.

## How it works

| Path | Role |
|---|---|
| `src/services/gpx-parser.js` | GPX 1.0/1.1 → plain objects. Looks elements up by `localName`, so it does not care whether extensions are written as `gpxtpx:hr`, `ns3:hr` or `hr`. |
| `src/services/track-stats.js` | All the maths. Deliberately free of browser APIs so it can be tested directly under Node. |
| `src/services/mapkit.js` | Memoised MapKit JS loader via `@apple/mapkit-loader`. |
| `src/services/units.js` | Metric/imperial conversion and display formatting. |
| `src/components/` | `route-map`, `elevation-profile`, `stat-tiles`, `splits-table`, `gpx-drop-zone`. |
| `src/my-app.js` | Shell: owns the track, the stats, the unit system and the shared crosshair index. |

Components are plain JavaScript and declare their metadata with `static bindables = [...]`,
which Aurelia reads directly — no decorators, so nothing depends on the Babel decorator
proposal version.

### Numbers worth knowing about

Three values are filtered rather than summed raw, because the unfiltered versions are
misleading:

- **Elevation gain/loss** only commits a rise or fall once it exceeds **3 m** from the last
  committed reference. Altimeters jitter a metre or two at rest, and summing every raw delta
  turns that into hundreds of metres of fictional climbing.
- **Moving time** counts segments at or above **0.5 m/s**, ignoring gaps longer than **60 s**
  so an auto-pause or a lost signal does not drag the average down.
- **Top speed** comes from a centred **5-point rolling mean**, not a single pair of fixes, so
  one GPS jump cannot report a sprint that never happened.

## Scripts

    npm start        # dev server on :9000
    npm run build    # production build to dist/
    npm run lint     # eslint + stylelint
