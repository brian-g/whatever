# GPX Statistics Dashboard — Aurelia 2 + Apple MapKit JS

Plan: `~/.claude/plans/federated-dancing-gem.md`

## Tasks

- [x] Add `@apple/mapkit-loader` dependency (v1.0.0)
- [x] Generate sample GPX + ground-truth stats (scratchpad Python script)
- [x] `src/services/units.js` — metric/imperial formatting
- [x] `src/services/gpx-parser.js` — namespace-agnostic GPX parsing
- [x] `src/services/track-stats.js` — stats/splits/samples (pure, DOM-free)
- [x] `src/services/mapkit.js` — memoised MapKit JS loader
- [x] `src/app.css` — design tokens, grid, light/dark
- [x] `src/components/gpx-drop-zone`
- [x] `src/components/stat-tiles`
- [x] `src/components/elevation-profile` (dataviz skill loaded; palette validated)
- [x] `src/components/splits-table`
- [x] `src/components/route-map` — MapKit JS
- [x] `src/my-app` shell + `src/main.js` registration
- [x] `index.html`, `README.md`, `.env.example`
- [x] ~~`src/resources/value-converters.js`~~ — dropped, see review

## Verification

- [x] `npm run lint` clean (eslint + stylelint)
- [x] `npm run build` succeeds
- [x] Stats math asserted in Node against independent ground truth — 17/17 checks pass
- [x] Browser render verified via headless Firefox screenshots + page console
- [x] Map panel shows the token setup message with no `VITE_MAPKIT_TOKEN`
- [x] Dark mode, imperial units, and the chart crosshair/tooltip verified
- [x] Bindable *change* path verified (units toggle reflows tiles, table and chart axes)

## Review

### What was built

A single-page dashboard: drop a `.gpx` file (or load the bundled 25 km sample) and get a
hero distance figure, 12 stat tiles, an interactive single-series area chart with a
metric switcher (elevation / speed / heart rate), a per-km/mile splits table, file
metadata, and the route on an Apple Maps basemap with start/finish/waypoint markers.

Services are plain modules; `track-stats.js` is deliberately DOM-free so the maths is
testable under Node. Components are plain JS using `static bindables = [...]`, which the
Aurelia runtime reads directly — no decorators, so nothing depends on the Babel decorator
proposal version.

### Deviations from the plan

1. **Sample GPX lives in `public/`, not imported with `?raw`.** At 234 KB, inlining it
   would have put the whole file in the JS bundle. It is now fetched on demand, which also
   exercises the same parse path a real file takes.
2. **No value converters.** The plan called for `src/resources/value-converters.js`. The
   view models already format through `units.js` in the getters that build tiles and rows,
   so converters would have been a second way to do the same thing. Dropped as redundant.
3. **The chart builds its geometry imperatively** into `this.plot` rather than exposing a
   computed getter. The template reads ~12 properties off it and the build is a pass over
   every sample, so a getter meant repeating that work per read.
4. **Splits lost their Pace column.** Pace over a 1 km split *is* the split time, so the
   column repeated the one beside it.

### Config changes (needed, not cosmetic)

- `.stylelintrc.json` — added a BEM-aware `selector-class-pattern`. The stock
  `stylelint-config-standard` pattern rejects `block__element--modifier`, which is the
  naming the stylesheet uses throughout.
- `babel.config.json` — added `@babel/plugin-transform-private-methods` with
  `loose: true` to match the class-properties plugin already configured. The scaffold
  enumerates its class-feature plugins explicitly, so private methods (`#draw()`,
  `#rebuild()`) failed the build until it was listed. Also declared in `devDependencies`
  rather than relying on preset-env's transitive copy.

### Bugs found and fixed during verification

1. **SVG attributes must use `.attr`, never `.bind` or interpolation.** This was the real
   cause of a blank chart. Aurelia routes both `.bind` and `${}` interpolation through the
   DOM *property*, but SVG properties such as `viewBox`, `width`, `x1` and `cx` are
   read-only (`SVGAnimatedRect` / `SVGAnimatedLength`), so assignment throws
   `TypeError: setting getter-only property "viewBox"`. Because Aurelia propagates changes
   synchronously, that throw aborted the render pass mid-way — which is why the splits and
   file-details panels also came up empty. `fill`/`stroke` are CSS properties, not element
   properties, so they were silently doing nothing too. Every SVG binding is now `.attr`,
   with a comment in the template saying why.
2. **`*Changed` callbacks do not fire for a bindable's initial value.** `statsChanged()`
   never ran on first load, leaving the metric switcher empty. State is now seeded in
   `bound()`, with the callbacks handling subsequent changes.
3. **ResizeObserver's first callback lands after the next layout**, so the chart was blank
   on first paint. It now measures once up front, then observes.
4. **"No elevation data in this file" was shown while the element was merely unmeasured.**
   Split into `hasMetricData` (does the file carry it) versus `plot` (is it drawable).
5. **A 1 m trailing split row.** A remainder under 10 m is now dropped instead of being
   rendered as its own split.

### Accuracy

`track-stats.js` was checked against a Python implementation written independently from
the same spec, over the generated sample: distance, elapsed and moving time, elevation
gain/loss, min/max elevation, max/avg/avg-moving speed, and HR/cadence extremes all agree
(worst deviation 0.018 m on 25 km). Three values are deliberately filtered rather than
summed raw — elevation gain uses a 3 m threshold, moving time a 0.5 m/s floor with a 60 s
gap cap, and top speed a 5-point rolling mean — because the unfiltered versions are
actively misleading on real GPS data. Each threshold is documented at its constant.

### Not verified

The map was first exercised on 2026-11-05 with a real token, which is origin-locked to
`whatever-1x5.pages.dev` (Apple returns 401 for `localhost`). It was verified in headless
Firefox by resolving that host to the local dev server (`network.dns.localDomains`, HSTS
preload off, Vite `allowedHosts`) and driving the page over Marionette: MapKit 6.1.197
loads, the basemap, route polyline + casing and markers render, and framing fits the route.
That run caught a bug: on a loop, Start, Finish and the trailhead waypoint shared one
coordinate and the waypoint, added last, covered both. Fixed in `route-map.js` (combined
"Start & finish" marker within 50 m, ends added last, waypoints at `High` priority). The
separate Start/Finish branch for a non-loop route was not driven; the sample is a loop.

Also unexercised: loading a second file over an already-rendered dashboard. It runs the
same `#sync()` path as the initial load, and the units-change test confirms the
change-callback mechanism works, but that specific sequence was not driven.
