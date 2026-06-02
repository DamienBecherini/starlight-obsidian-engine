# Plan — Gemini review fixes (deploy, link graph, Mermaid, audit)

**Branch:** `main`  
**Date:** 2026-06-02 23:41

## Goal

Address validated points from the Gemini architecture review: remote deploy manifest sync for CI/multi-machine, relative Markdown link extraction for backlinks, SFTP upload concurrency, Mermaid lifecycle cleanup on navigation, automated link audit for lexicon backlog, and Go/GiB editorial clarity in the vault.

## Scope

| Area | Repo | Action |
|------|------|--------|
| Remote manifest fetch/push | `starlight-obsidian-engine` | SFTP + FTPS before/after incremental deploy |
| Relative MD links | `starlight-obsidian-engine` | `link-graph.mjs` + tests |
| SFTP concurrency | `starlight-obsidian-engine` | Batched parallel uploads (limit 8) |
| Mermaid teardown | `starlight-obsidian-engine` | Destroy pan/zoom on `astro:before-swap` |
| Link audit script | `starlight-obsidian-engine` | `scripts/audit-links.mjs` + npm script |
| Go vs GiB note | `ia-on-prem-vault` | Short note in `kv-cache-et-contexte.md` |

**Out of scope:** i18n sidebar strategy (needs translation policy first).

## Tasks

1. Add `remoteManifestPath()`, `fetchRemoteManifest` / `pushRemoteManifest` for SFTP and FTPS.
2. Wire manifest sync into incremental deploy (remote wins when local absent; newer `updatedAt` when both exist).
3. Extend `extractMarkdownInternalTargets` + resolve relative paths from source slug.
4. Add concurrency helper and use in `uploadSelectedFilesSftp`.
5. Add global Mermaid cleanup before page swap.
6. Add `audit-links.mjs` listing unresolved wiki/MD targets.
7. Add Go/GiB footnote in vault KV cache article.
8. Run `npm test` in engine.

## Validation

- `npm test` in `starlight-obsidian-engine`
- New/updated unit tests for link graph and manifest merge logic

---

## Implementation report

**Date:** 2026-06-02 23:41

### Changes

| Area | Files |
|------|-------|
| Remote manifest sync | `scripts/lib/deploy-manifest.mjs`, `scripts/lib/deploy.mjs` |
| SFTP concurrency (8) | `scripts/lib/deploy.mjs` |
| Relative MD links + audit API | `scripts/lib/link-graph.mjs`, `scripts/audit-links.mjs` |
| Mermaid lifecycle | `src/components/MermaidEnhancer.astro` |
| Tests | `tests/deploy-manifest.test.mjs`, `tests/link-graph.test.mjs` |
| npm script | `package.json` (`audit:links`) |
| Go/GiB editorial note | `ia-on-prem-vault/01-fondations/kv-cache-et-contexte.md` |

### Deploy manifest sync

- Before incremental deploy: fetch `.deploy-manifest.json` from the remote deploy root (SFTP/FTPS), merge with local (`mergeManifestSources`: remote if no local, else newer `updatedAt`).
- After deploy (upload, delete, full refresh): persist locally and push manifest back to the same remote path via `persistDeployManifest`.

### Validation evidence

- `npm test`: **81 tests, 0 failures**
- `npm run audit:links`: lists unresolved wiki/MD targets in the vault (expected exit 1 when backlog items exist)

### Limitations / follow-ups

- i18n sidebar strategy unchanged (translation policy needed first).
- Remote manifest lives at `{DEPLOY_REMOTE_PATH}/.deploy-manifest.json` (dotfile, not part of `dist/` mirror).
- SFTP concurrency not yet applied to FTPS incremental uploads (session limits unchanged).
- `audit:links` reports unresolved targets but does not auto-write `lexicon-backlog.md` yet.

**Follow-up:** [DevEx link graph HMR, SFTP checkpoints, smart audit](2026_06_03_00-05_main_devex-link-graph-audit-sftp.plan.md) — delivered 2026-06-03.
