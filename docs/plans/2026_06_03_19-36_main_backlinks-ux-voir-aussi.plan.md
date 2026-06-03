# Backlinks UX — mobile list, section labels, Voir aussi dedup

**Goal:** Fix three backlinks UX issues on lexicon pages without vault content changes.

**Scope:** `starlight-obsidian-engine` only.

---

## Vault impact

| | |
|---|---|
| **Required vault changes** | None — dedup reads existing `## Voir aussi` / `## 🔗 Voir aussi` from vault markdown at render time. |
| **Optional vault doc** | Authors may add a short note in vault README: « Voir aussi » = curated outbound links; rétroliens = automatic inbound citations. |
| **Config** | Reuses existing `lexicon` block in `site.config.json` (directory slug for hidden group header). |

---

## Why

1. **Section header `00-LEXIQUE`** — Grouping uses the raw vault folder slug (`sectionFromVaultPath`). Rendered as a non-clickable `<h3>` with `text-transform: uppercase`, which looks like a broken link. On lexicon entries, peers from the same directory need no rubric; other sections deserve a readable label (`01 Fondations`).
2. **Mobile bullet list** — `.page-backlinks ul { list-style: none }` overrides the mobile `list-style: disc` rule (cascade / scoped specificity). Sidebar should stay compact; mobile should match article lists.
3. **Overlap with « Voir aussi »** — Curated outbound links and automatic inbound backlinks often list the same pages. Showing both duplicates editorial intent. Pragmatic fix: exclude from backlinks any source page already linked in the current page’s Voir aussi section.

---

## Tasks

- [x] Add `scripts/lib/voir-aussi-links.mjs` — parse Voir aussi section, resolve wiki/MD targets; unit tests.
- [x] Extend `src/lib/backlinks-panel.mjs` — dedup filter, `backlinkSectionHeading()` (hide lexicon directory, humanize others); update tests.
- [x] Wire `PageBacklinks.astro` — load Voir aussi slugs from vault file, pass to panel, use section headings in template.
- [x] Fix `PageBacklinks.astro` CSS — scope `list-style: none` to sidebar; remove uppercase on section labels.
- [x] Update `docs/plans/README.md` index.
- [x] Run `npm test`; append implementation report below.

---

## Implementation report

### Changes

| File | Change |
|------|--------|
| `scripts/lib/voir-aussi-links.mjs` | **New** — parse `## Voir aussi` / `## 🔗 Voir aussi`, resolve wiki/MD targets to vault slugs. |
| `tests/voir-aussi-links.test.mjs` | **New** — 4 tests (section boundary, wiki resolution, plain heading, empty). |
| `src/lib/backlinks-panel.mjs` | `excludeVoirAussiSources`, `humanizeSectionSlug`, `backlinkSectionHeading`; `buildBacklinkPanel` accepts `voirAussiSlugs`. |
| `tests/backlinks-panel.test.mjs` | +5 tests (humanize, section heading, dedup, empty panel). |
| `src/components/PageBacklinks.astro` | Load Voir aussi from vault MD; section labels via `backlinkSectionHeading`; CSS scoped to sidebar vs mobile. |
| `docs/plans/README.md` | Index entry for this plan. |

### Behaviour

1. **Section headers** — `00-lexique` group no longer shows a rubric on lexicon pages; other sections show human labels (`01 Fondations`). No uppercase slug styling.
2. **Mobile bullets** — `list-style: none` limited to `.page-backlinks--sidebar`; mobile uses `disc` + article-like link styles.
3. **Voir aussi dedup** — Inbound links whose source slug appears in the current page’s Voir aussi section are excluded. Panel hidden when nothing remains (e.g. RAM when all backlinks are already in Voir aussi).

### Vault impact

No vault file changes required. Dedup reads existing markdown at SSR/build time via `VAULT_PATH`.

### Validation

```
npm test
# tests 108 | pass 108 | fail 0
```

Manual: `npm run build && npm run preview` → `/00-lexique/ram/` under 72rem width.
