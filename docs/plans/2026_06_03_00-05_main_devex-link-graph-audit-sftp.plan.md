# Plan — DevEx link graph HMR, SFTP manifest checkpoints, smart link audit

**Branch:** `main`  
**Date:** 2026-06-03 00:05

## Goal

Address three follow-up critiques: regenerate backlink graph during dev HMR, checkpoint SFTP upload manifest locally during long transfers, and make `audit:links` CI-safe with allowlists for intentional placeholders.

## Tasks

1. Extract `writeLinkGraph()`; add debounced Vite plugin (`handleHotUpdate` + soft full reload).
2. Wire plugin in `astro.config.mjs` (dev only).
3. SFTP: `saveManifest` every 20 files during `runPool`; keep final `persistDeployManifest`.
4. Add `scripts/lib/audit-links-lib.mjs` (backlog + allowlist parsing, filter, exit policy).
5. Add vault `link-audit-allowlist.md` for roadmap wiki-links (`03-*`, `04-*`).
6. Update `audit-links.mjs` CLI (`--strict`, `--warn-only`; default = fail on unexpected only).
7. Tests + `npm test`.

## Validation

- `npm test` — 89 tests pass
- `node scripts/audit-links.mjs` — exit 0 (9 allowlisted roadmap placeholders)
- Dev: editing vault `.md` in `npm run dev` rebuilds `link-graph.json` and triggers full reload

---

## Implementation report

### Changes

| Area | Files |
|------|-------|
| Link graph dev watch | `scripts/lib/write-link-graph.mjs`, `config/vite/link-graph-watch.mjs`, `scripts/build-link-graph.mjs`, `astro.config.mjs` |
| SFTP manifest checkpoint | `scripts/lib/deploy.mjs` (`SFTP_MANIFEST_CHECKPOINT = 20`) |
| Smart link audit | `scripts/lib/audit-links-lib.mjs`, `scripts/audit-links.mjs`, `tests/audit-links.test.mjs` |
| Vault allowlist | `ia-on-prem-vault/.agents/vault-maintenance/link-audit-allowlist.md` |
| Wiki `\|` escape fix | `scripts/lib/link-graph.mjs` (`normalizeLinkTarget` strips trailing `\`) |
| Docs | `README.md` |

### Behaviour

1. **Dev HMR:** Vite plugin debounces vault markdown changes (400 ms), rebuilds `src/generated/link-graph.json`, sends soft full reload so backlink sidebars update.
2. **SFTP:** Local `.deploy-manifest.json` saved every 20 uploaded files; final `persistDeployManifest` still pushes remote copy.
3. **Audit:** Default mode exits 0 when unresolved links match lexicon backlog headings or `link-audit-allowlist.md` (prefixes `03-stack-logicielle/`, `04-blueprints/`). `--strict` fails on any unresolved; `--warn-only` never fails.

### Tests

`npm test` — 89 collected, 89 pass, 0 fail.
