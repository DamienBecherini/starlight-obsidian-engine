---
name: link-graph-backlinks-phases-6-7
overview: Incremental link-graph cache for large vaults, and optional integrations (Obsidian metadata export, starlight-site-graph). Depends on phases 1–5 being complete.
todos:
  - id: phase-6-cache-state
    content: Add .cache/link-graph-state.json with per-file hash/mtime, gitignore entry
    status: pending
  - id: phase-6-incremental-rebuild
    content: Reparse only changed vault files and merge into existing backlink index
    status: pending
  - id: phase-6-metrics-tests
    content: Log build duration; add incremental rebuild test on single fixture change
    status: pending
  - id: phase-7-metadata-extractor
    content: Document optional Obsidian metadata-extractor workflow for local debug comparison
    status: pending
  - id: phase-7-starlight-site-graph
    content: Evaluate starlight-site-graph for global graph UI vs existing MD link-graph
    status: pending
  - id: phase-7-parallel-workers
    content: Optional worker-thread scan if cache insufficient beyond ~2000 pages
    status: pending
isProject: false
---

# Site-wide backlinks — phases 6 to 7 (scale and optional)

**Prerequisites**:

- [plan 1 — phases 1 to 5](2026_06_01_14-00_main_link-graph-backlinks-phases-1-5.plan.md) delivered and validated in production.
- [Lexicon plan](2026_06_02_12-00_main_lexicon-config-vault.plan.md) delivered (recommended before plan 1 if multi-lexicon vault).

This plan covers optimizations as the vault grows (×10–×20) and **optional** integrations **not required** for the main feature.

---

## Context (recap)

Phases 1–5 introduced:

- [`scripts/lib/link-graph.mjs`](../../scripts/lib/link-graph.mjs) — full scan of published `.md`, inverted index;
- [`src/generated/link-graph.json`](../../src/generated/link-graph.json) — artefact consumed by [`PageBacklinks.astro`](../../src/components/PageBacklinks.astro);
- publish filter identical to the site ([`config/gitignore.mjs`](../../config/gitignore.mjs)).

At ~30 pages today, a full scan is negligible. This plan applies when **prebuild becomes noticeable** or the corpus exceeds ~500 pages.

---

## Phase 6 — Incremental cache

### Objective

Avoid reparsing the entire vault on every `npm run dev` or `npm run build` when only a few files changed.

### Tasks

1. **Cache state** — file [`.cache/link-graph-state.json`](../../.cache/link-graph-state.json) (gitignored):
   ```json
   {
     "version": 1,
     "files": {
       "01-fondations/la-bande-passante-memoire.md": { "mtimeMs": 1710000000000, "sha256": "abc..." }
     },
     "forwardEdges": { "01-fondations/la-bande-passante-memoire": ["00-lexique/memory-wall"] },
     "backlinks": { "00-lexique/memory-wall": [{ "from": "01-fondations/la-bande-passante-memoire", "title": "..." }] }
   }
   ```

   (ZTH vault example)

   - First run (cache absent): full scan, write cache + public JSON.
   - Subsequent runs: compare mtime/hash per published file; reparse **only** modified, added, or deleted files.
2. **Index merge**:
   - **deleted** file or **became unpublished**: remove its outgoing edges and update `backlinks` lists for targets;
   - **modified** file: recalculate outgoing edges, diff with previous state, patch inverted index;
   - **new** file: add edges normally.
3. **CLI**:
   - `link-graph:build` — incremental by default if cache present;
   - `link-graph:build --full` — force full scan (clean CI, debug).
4. **Metrics**:
   - log total duration and number of files reparsed;
   - document recommended threshold in README (e.g. use `--full` in CI if cache not restored).
5. **Tests**:
   - minimal-vault fixture: full build → modify a single `.md` → incremental rebuild → backlinks updated without rescanning others.

### Recommended trigger

| Vault size | Action |
|--------------|--------|
| < ~500 pages | full scan acceptable; phase 6 optional |
| ~500–2000 pages | implement incremental cache |
| > ~2000 pages | cache + evaluate phase 7 parallelization |

### Validation

- `predev` after editing a note: rebuild < 200 ms on typical dev machine (order of magnitude, medium vault).
- `npm test`: incremental case green.
- CI: `link-graph:build --full` or cache restored between jobs (document choice).

---

## Phase 7 — Optional integrations

### Objective

Enrich the editorial experience or global navigation **without replacing** the MD graph from phases 1–5.

### 7a — Obsidian metadata-extractor plugin (local debug)

**Purpose**: locally compare “Obsidian says X backlinks” vs “the build says Y”.

| Aspect | Detail |
|--------|--------|
| Plugin | [metadata-extractor](https://github.com/kometenstaub/metadata-extractor) exports JSON with `links` and `backlinks` per file |
| Usage | export on save or manually, configurable path |
| Rule | the build **never consumes** this JSON in CI as the sole source |
| Filter | optional local diff script: intersection with published pages (`gitignore`) |

**Documentation**: README section “Debug backlinks vs Obsidian” — manual procedure, no runtime dependency.

**Why not the main source**: Obsidian indexes the entire vault (including `_private`, drafts); the site has a strict publish scope. Two sources = divergence risk.

### 7b — starlight-site-graph (global visual graph)

**Purpose**: interactive graph navigation in addition to backlink lists.

| Aspect | Detail |
|--------|--------|
| Package | [starlight-site-graph](https://fevol.github.io/starlight-site-graph/getting-started/) |
| Component | plugin’s native `<PageBacklinks />` |
| Cost | `prefetch: true`, extended schema, sitemap generated from HTML in prod |
| Relation | **complementary** to MD graph — not a substitute for wiki-links before render |

**Evaluation before adoption**:

1. Measure build time with plugin vs MD graph alone.
2. Verify wiki-links (e.g. ZTH vault: `[[00-lexique/ram|Title]]`) become `<a href="/00-lexique/ram/">` in dist HTML (HTML sitemap compatible).
3. Decide: global graph UI yes/no; backlinks remain on custom `PageBacklinks.astro` or migrate to plugin component.

**Expected verdict**: keep MD graph for backlinks (predictable, tested); add site-graph **only** if the visual graph is a product priority.

### 7c — Parallelization (fallback)

If incremental cache is insufficient (> ~2000 pages, frequent `--full` rebuilds):

- partition vault walk by top-level directory;
- Node worker threads (`worker_threads`) for extract + normalization;
- merge edges in the main thread.

Not a priority while phase 6 metrics stay below the documented threshold.

---

## End of plan 2

These phases are **optional** and **decoupled**: the backlinks feature is complete after plan 1.

| Phase | Priority | When |
|-------|----------|-------|
| 6 — Incremental cache | High (later) | prebuild > ~2 s or > ~500 pages |
| 7a — metadata-extractor | Low | Obsidian author debug |
| 7b — starlight-site-graph | Low | need global visual graph |
| 7c — Workers | Very low | cache insufficient at large scale |

**Back**: [plan 1 — phases 1 to 5](2026_06_01_14-00_main_link-graph-backlinks-phases-1-5.plan.md).

---

## Phase 6–7 specific risks

| Risk | Mitigation |
|--------|------------|
| Corrupted / stale cache | `--full` flag; invalidation if cache schema version changes |
| CI without persistent cache | always `--full` in CI or cache artefact between jobs |
| Double maintenance MD graph + site-graph | site-graph UI only; backlinks stay on MD JSON |
| metadata-extractor includes private pages | diff script filters publish; never in prod pipeline |
