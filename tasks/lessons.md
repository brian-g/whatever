# Lessons

Rules derived from mistakes actually made in this repo, so they are not repeated.

## Aurelia 2: never use `.bind` or `${}` on an SVG attribute — use `.attr`

Both `.bind` and interpolation go through the DOM **property**. SVG geometry properties
(`viewBox`, `width`, `height`, `x1`, `cx`, `x`, `y`) are read-only `SVGAnimatedLength` /
`SVGAnimatedRect` objects, so assigning them throws
`TypeError: setting getter-only property "<name>"`. `fill` and `stroke` are CSS properties
rather than element properties, so binding them silently does nothing.

```html
<!-- wrong: throws, and takes the rest of the render pass down with it -->
<svg viewBox="0 0 ${width} ${height}"><line x1.bind="a" stroke.bind="c" /></svg>
<!-- right -->
<svg viewBox.attr="plot.viewBox"><line x1.attr="a" stroke.attr="c" /></svg>
```

The same applies to attributes with no property behind them, such as `aria-pressed`.

**Why it bites so hard:** Aurelia propagates changes synchronously, so a throw inside one
binding aborts the whole render pass. The visible symptom was three *unrelated* panels
further down the template rendering empty. When several sibling views go blank at once,
check the page console for a single exception before suspecting each component.

## Aurelia 2: `*Changed` callbacks do not fire for a bindable's initial value

`statsChanged()` runs when `stats` later changes, not for the value it is first bound to.
Any state derived from a bindable inside a change callback must also be seeded in
`bound()`, or the component renders empty on first load.

## Verify rendering, not just lint and build

`npm run lint` and `npm run build` both passed while the chart was blank and three panels
were empty. Neither catches a runtime template error. When there is no browser-automation
tool available, headless Firefox is enough:

```bash
/Applications/Firefox.app/Contents/MacOS/firefox --headless --profile <dir> \
  --window-size=1500,2000 --screenshot out.png http://localhost:9000/
```

And — this is the part that actually saved time — get the page console instead of guessing
from pixels. In `<profile>/user.js`:

```
user_pref("devtools.console.stdout.content", true);
```

Firefox then prints page console messages and uncaught errors to stdout. Two rounds of
screenshot forensics were spent theorising about framework internals; the console named
the real cause on the first try. **Reach for the log before the screenshot.**

## ResizeObserver does not fire before the first paint

Its first callback arrives after the next layout. Anything sized from it must measure once
synchronously in `attached()` as well, or the first render is blank.

## Distinguish "no data" from "not measured yet"

An empty-state message driven by the same condition as "drawable" claimed a file had no
elevation data when the element simply had no size yet. Gate the message on whether the
data exists, and the drawing on whether it can be drawn.
