# Publish Exclude Via site.config.json

**Goal:** Allow each vault to exclude tracked folders from the static site build via `site.config.json`, without relying on `.gitignore`.

**Scope:** `starlight-obsidian-engine` (filter + tests + docs) and `ia-on-prem-vault` (`site.config.json`).

---

## Files

- Create `config/publish.mjs`
- Modify `config/gitignore.mjs` — combine hardcoded rules, `publish.exclude`, and `.gitignore`
- Create `tests/publish-config.test.mjs`
- Modify `tests/gitignore.test.mjs`
- Modify `README.md` — document `publish.exclude`
- Modify `ia-on-prem-vault/site.config.json` — exclude agent/plan folders

---

## Tasks

- [x] Add `config/publish.mjs` to parse `publish.exclude` from `site.config.json`.
- [x] Extend the vault publish filter to apply `publish.exclude` before `.gitignore`.
- [x] Keep `_private/` and vault-root README hard exclusions unchanged.
- [x] Add unit tests for config parsing and combined filter behavior.
- [x] Update engine README publish/unpublished section.
- [x] Add `publish.exclude` to the ZTH vault for `docs/plans/`, `.agents/`, `.cursor/`.
- [x] Run `npm test` and `npm run build`; append implementation report to this plan.

---

## Implementation/build report

### Changes

**Engine (`starlight-obsidian-engine`)**
- Created `config/publish.mjs` — parses `publish.exclude` from vault `site.config.json`.
- Extended `config/gitignore.mjs` — new `loadVaultPublishFilter()` merges `publish.exclude` + `.gitignore`; `loadVaultGitignore()` kept as alias.
- Updated `config/loaders/vault-docs.mjs` — uses `loadVaultPublishFilter`.
- Created `tests/publish-config.test.mjs` — 5 tests for config parsing.
- Updated `tests/gitignore.test.mjs` — 3 tests for combined filter behavior.
- Updated `README.md` — documented `publish.exclude` vs `.gitignore`.

**Vault (`ia-on-prem-vault`)**
- Added `publish.exclude` to `site.config.json`:
  - `docs/plans/**`
  - `.agents/**`
  - `.cursor/**`

### Validation

- `npm test`: **76 tests**, all passed.
- `npm run build` (ZTH vault via junction):
  - **Before:** 74 pages, route `/docs/plans/...` present, 4 excluded files.
  - **After:** **72 pages**, no `/docs/plans/` route, **5 excluded files** (plan + agent/cursor paths).
  - Pagefind: 72 HTML files indexed.
  - Warnings: Astro markdown deprecation, Vite chunk size (unchanged).

### Notes

- Merge order: hardcoded `_private/` + root README → `publish.exclude` → `.gitignore`.
- Vault plans no longer need Starlight frontmatter for build safety (they are excluded from publish).
- No commit created.

---

## Config shape

```json
{
  "publish": {
    "exclude": [
      "docs/plans/**",
      ".agents/**",
      ".cursor/**"
    ]
  }
}
```

**Merge order:** hardcoded `_private/` + root README → `publish.exclude` → vault `.gitignore`.
