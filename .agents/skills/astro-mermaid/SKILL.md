---
name: astro-mermaid
description: Debugging and maintaining the client-side Mermaid pan/zoom/fullscreen enhancer in this repo (src/components/MermaidEnhancer.astro, built on svg-pan-zoom + astro-mermaid). Use when a Mermaid diagram misbehaves — zoom/pan not refreshing, blank/empty diagram after fullscreen exit, controls duplicated or missing, theme re-render wiping controls, or any svg-pan-zoom transform/viewBox glitch. Encodes hard-won gotchas so you don't have to re-investigate from scratch.
license: MIT
metadata:
  author: debug-session
  version: "1.2.0"
  category: debugging
  tags: mermaid, svg-pan-zoom, astro, fullscreen, pan-zoom, client-script, debugging
---

# Astro Mermaid Enhancer — Debugging & Maintenance Skill

Hard-won knowledge about `src/components/MermaidEnhancer.astro`, a client-side `<script>` that
progressively enhances build-time Mermaid SVGs (from `astro-mermaid`) with pan/zoom/fullscreen
controls using the **`svg-pan-zoom`** library. Most bugs here come from a small set of recurring,
non-obvious traps. Read this BEFORE re-investigating — it will save a long enquiry.

## Architecture (read this first)

- `astro-mermaid` renders each diagram to an inline `<svg>` at build time, inside a `.mermaid`
  container. It **re-creates the SVG on theme change** (light/dark), which wipes any controls we injected.
- `MermaidEnhancer.astro` runs a single module-level client script that:
  - Marks each enhanced SVG with `svg.__mermaidEnhanced = true` (marker is on the **SVG**, not the
    container — a new SVG from a theme re-render is unmarked, so it gets re-enhanced cleanly).
  - Keeps per-container state in a `WeakMap<HTMLElement, MermaidState>` (`states`).
  - Decides **inline (small)** vs **zoomable (large)** per diagram using three thresholds
    (`MAX_INLINE_WIDTH`, `MAX_INLINE_HEIGHT`, `MIN_LEGIBLE_SCALE`).
  - A `MutationObserver` on `document.body` + `astro:page-load` drives a debounced `scan()` that calls
    `enhanceContainer` on every `.mermaid`. **It fires MANY times** — idempotency relies on the
    `__mermaidEnhanced` marker. (Verified: `existingControls` stays 1, no duplication.)
- **Two lifecycles for the pan/zoom instance:**
  - **Large diagram:** `svg-pan-zoom` instance created in `enhanceContainer`, lives for the page.
  - **Small diagram:** NO instance until the user enters fullscreen. `enterFullscreen` creates it on the
    fly; `exitFullscreen` **destroys it** and restores the static inline SVG. This teardown is where most
    fullscreen bugs live.

## The Gotchas (each cost real debugging time)

### 0. ⭐ THE zoom-doesn't-repaint-in-fullscreen bug → `onZoom` MUST be a DEFINED callback (CONFIRMED)
**This is the #1 recurring bug and the answer is counter-intuitive.** Symptom: in fullscreen, mouse-wheel
and the +/− buttons appear to do nothing — the diagram only refreshes once you click a pan arrow / press an
arrow key. It looks like a "repaint" problem; it is NOT.

**Root cause (confirmed by runtime logs + user, session d94140):** if `svg-pan-zoom` is created with
`onZoom: undefined`, then `zoomIn()` / `zoomOut()` / `zoomAtPoint()` are effectively **no-ops** — the
internal zoom value does **not** change (`getZoom()` stays put) and therefore no CTM is written. Providing a
**defined** `onZoom` callback makes zoom register and the viewport transform update normally. The mere
**presence** of the function is enough — an empty `() => {}` works (verified); no side-effect inside it is
needed.

**The fix (in `makePanZoom`):**
```ts
onZoom: onZoom ?? (() => {}),   // a DEFINED onZoom is REQUIRED; default to a no-op
```

**Evidence that nails it (so you don't redo the enquiry):**
- Broken (`onZoom` undefined): one wheel event logged, `zoomChanged:false`, `zoomBefore===zoomAfter===0.5`,
  viewport `transform` identical across 3 polled frames.
- Fixed (`onZoom` defined): every wheel/button event logs `zoomChanged:true`, zoom sweeps freely
  `0.5↔1.6`, and the viewport `transform` matrix changes each frame (`tEqBefore:false`).

**Traps that wasted time here:**
- `instance.pan(instance.getPan())` as a "flush" is a **no-op** (proven) — do NOT use it; it does not help.
- The CSS location / `customCss` vs `import './mermaid.css'` is **unrelated** to this bug. Don't revert CSS
  to chase it.
- This regressed once because a debug session added a logging `onZoom` wrapper (which fixed it), then the
  cleanup removed the wrapper → back to `onZoom: undefined`. If you ever strip instrumentation from
  `makePanZoom`, **keep a defined `onZoom`**.

### 1. `svg-pan-zoom` writes the CTM transform DEFERRED (requestAnimationFrame), not synchronously
After `zoomIn()`, `zoomAtPoint()`, `panBy()`, etc., the library updates its internal matrix and fires
`onZoom`, but it writes the `transform` attribute on the `.svg-pan-zoom_viewport` group **on the next
animation frame** (its `ShadowViewport.updateCTMOnNextFrame`).

Consequences:
- If you read `viewport.getAttribute('transform')` synchronously right after a zoom, you get the
  **previous** value (it lags exactly one step — confirmed: `tSyncEqBefore:true`, then the polled frame
  shows the new matrix). Don't trust synchronous transform reads.
- Any **synchronous** DOM cleanup you do (e.g. `removeAttribute('transform')`) can be **overwritten** by
  the library's pending deferred write that fires afterward.
- **Fix pattern (cleanup):** defer your own cleanup/restore into a `requestAnimationFrame`. rAF callbacks run FIFO,
  and yours is scheduled last (during the exit event, after any prior interaction), so it runs AFTER the
  library's pending write and wins. This is exactly what `exitFullscreen`'s small-diagram path does.

### 2. `destroy()` can throw `TypeError: ... "apply", fn is undefined`
`svg-pan-zoom`'s `destroy()` intermittently throws while detaching listeners. If uncaught, it **aborts
the rest of the teardown** (viewBox restore + transform removal never run) → empty diagram on exit.
**Always wrap `destroy()` in try/catch** and continue cleanup regardless. (There's also a guarded
`destroy()` in `enhanceContainer` for the same reason.)

### 3. `svg-pan-zoom` strips the `viewBox` attribute on init and never restores it
On init it removes `viewBox` (replacing it with a viewport `<g transform>`). On `destroy()` it does NOT
put it back, so the SVG falls back to the default 300×150 intrinsic size → tiny/blank. We memorize
`originalViewBox` in state at enhance time and re-apply it during small-diagram exit.

### 4. The fullscreen fit/center transform is poison for the inline SVG
In fullscreen the SVG is sized `100vw × 100vh`. The library's fit/center produces a transform with a
large translate (≈ `viewportHeight/2 − contentHeight/2`, e.g. `translate y ≈ 373`). If that transform
survives onto the SVG once it returns to its small inline size (~155px tall), the content is pushed far
off-screen → **looks empty**. Symptom signature: empty only when zoom/pan was changed in fullscreen;
fine when the view was untouched (no pending transform write). The fix in #1 removes this leftover.

### 5. Manual wheel zoom + `mouseWheelZoomEnabled: false`
Wheel zoom is handled manually (Ctrl+wheel in-article, free wheel in fullscreen) via a `wheel` listener
calling `zoomAtPoint`. The library's own wheel zoom is disabled to avoid double-zoom and preserve page
scroll. If wheel zoom "does nothing", check the early-return guard: `if (!isFS && !e.ctrlKey) return;`.

## Debugging Playbook (what actually worked)

This is **browser-side** code, so you need runtime evidence from the live page, not just code reading.

1. **Confirm the dev server + target page.** `npm run dev` → `http://localhost:4321/`. The repro page
   used was `/01-fondations/memoire-unifiee-vs-ram-vs-vram/` (has small diagrams). Check the terminal
   files for the actual port and recent reloads.
2. **Instrument with HTTP logging** (fetch POST to the debug ingest endpoint). Wrap each log in
   `// #region agent log` / `// #endregion` so it auto-folds. Tiny one-line `__dbg(...)` helper +
   `__vpTransform(svg)` helper that reads `.svg-pan-zoom_viewport`'s transform.
3. **Log location quirk (IMPORTANT, CONFIRMED):** the debug log file is written to
   **`.cursor/debug-<session>.log`** (e.g. `d:\Webdev\ia-on-prem-vault\.cursor\debug-d94140.log`),
   NOT the workspace-root path the debug-mode reminder advertises. `Read`/`Delete` on the root path 404s;
   `Glob` for `**/debug-<session>.log` to find the real file, then read/clear THAT path.
   - The ingest endpoint is healthy and CORS-open: `OPTIONS` preflight returns
     `Access-Control-Allow-Origin: *`, and a valid `POST` returns **HTTP 204**. So if browser logs are
     missing, it is **NOT** a CORS/server problem — see the stale-script trap below.
   - PowerShell aliases `curl` → `Invoke-WebRequest` (its `-H "k: v"` form fails). Use **`curl.exe`** to
     probe the endpoint; or just rely on the in-page `fetch`.
3b. **Stale-script trap (THE silent-no-logs cause):** Astro `<script>` HMR can keep serving the **old
    bundle**, so your freshly-added instrumentation never runs and ZERO logs appear even though everything
    looks wired. Two-part defense:
    - Add a **module-load beacon** — an unconditional `__dbg('BEACON', …, 'instrumented module loaded', …)`
      at the top of the `<script>`. A plain page load must then produce one beacon line. If it doesn't, the
      browser is running cached/old code.
    - Tell the user to **hard-reload with cache disabled** (DevTools → Network → "Disable cache", then
      Ctrl+Shift+R). Beacon firing N times == N reloads; if the beacon fires but interaction logs (zoom)
      don't, the page's JS is broken (see 3c) or the handler path wasn't hit.
3c. **Dev-server cache corruption (`NS_ERROR_CORRUPTED_CONTENT` / empty MIME):** a Firefox error like
    "module at `http://localhost:4321/@id/astro/runtime/client/dev-toolbar/entrypoint.js` blocked due to a
    disallowed MIME type ('')" means Vite's optimized-deps cache is corrupted; the broken module graph can
    silently prevent page scripts (incl. our zoom handlers) from running, so you get a beacon but no
    interaction logs. **Fix:** stop dev, delete `node_modules/.vite` (and restart). Suspected aggravator:
    `vite.resolve.preserveSymlinks: true` added for the engine/vault split — if the MIME error recurs after
    a clean cache, reconsider that Vite option.
4. **Instrument the library's own `onZoom` callback**, not just your button handlers. `onZoom` fires on
   EVERY zoom change regardless of trigger (button, wheel, keyboard, or `destroy()`'s reset). This is how
   you catch zooms that your instrumented handlers miss (e.g. user used a control you didn't wrap).
5. **Capture transform before AND after, and across the rAF boundary.** Comparing the synchronous
   `transformAfter` (unchanged) vs the value in a following rAF reveals the deferred-write behavior (#1).
6. **The "missing log" technique.** If a log that should ALWAYS fire is absent (e.g. an "after" log fires
   but the function's final log doesn't), a **synchronous exception** aborted execution between them.
   This is how `destroy()` throwing (#2) was pinpointed — wrap suspicious calls in try/catch with a
   "THREW" log to confirm.
7. **Verify the fix with before/after logs in the same run.** Tag verification logs `runId: 'post-fix'`.
   Proof of the fullscreen fix: the deferred-cleanup log showed the bad `…,373` transform was present
   right before removal, while the final exit log showed `transform: null` → our removal won.

## Source-access limitation (don't waste time)
`svg-pan-zoom` is installed as a pnpm-style symlinked package; listing `node_modules/svg-pan-zoom`
returns empty and globbing its dist finds nothing. **Don't burn time hunting for the source.** Infer
behavior from runtime logs instead (the deferred-CTM behavior in #1 was confirmed purely from the
one-step transform lag observed in `onZoom` logs).

## Quick checklist when a Mermaid diagram bug is reported

- "Zoom/wheel doesn't refresh until I pan" → **`onZoom` is undefined (#0)** — provide a defined `onZoom`
  callback in `makePanZoom`. This is almost always the cause; check it FIRST before anything else.
- "Diagram blank after exiting fullscreen" → leftover fullscreen transform (#4) + aborted teardown (#2) +
  missing viewBox restore (#3). Ensure teardown is in a rAF, `destroy()` is try/caught, and `viewBox` is
  restored.
- "Controls disappeared after switching theme" → expected: `astro-mermaid` rebuilt the SVG; the new
  unmarked SVG should be re-enhanced by the next `scan()`. Confirm the `__mermaidEnhanced` marker logic
  and that the observer is still attached.
- "Controls duplicated" → check `enhanceContainer` idempotency (marker on SVG) and that stale controls
  are removed; verify `existingControls` count via instrumentation.
- Small vs large behaving differently → remember small diagrams only get a pan/zoom instance inside
  fullscreen; large ones keep theirs.

## Key files
- `src/components/MermaidEnhancer.astro` — the enhancer script (all logic).
- `src/styles/mermaid.css` — fullscreen sizing (`:fullscreen`), control styling, `is-small` rules.
- Diagrams authored in markdown in the external vault (`VAULT_PATH`, e.g. `../ia-on-prem-vault`) via ```mermaid fences.
