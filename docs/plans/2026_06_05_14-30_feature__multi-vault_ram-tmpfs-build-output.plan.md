# RAM / tmpfs Build Output (Future)

**Status:** Backlog — not scheduled  
**Related:** [`feature/multi-vault`](../../) (`ASTRO_OUT_DIR`, `dist/<vault>/`, `run-with-vault.mjs`)

**Goal:** Reduce persistent SSD write amplification during Astro builds by writing the full build tree to a memory-backed temporary directory, then optionally copying once to `dist/<vault>/` or uploading directly from RAM during publish.

---

## Problem

An Astro static build emits **many small files** (HTML, JS, CSS, Pagefind index, assets). For a large vault (e.g. `ia-on-prem`, ~200+ pages), this is tens of MB and thousands of write operations under `dist/<vault>/` on every build.

Current multi-vault flow already supports a custom output path via `ASTRO_OUT_DIR` (`astro.config.mjs`, `config/vault.mjs`, `scripts/run-with-vault.mjs`, `scripts/lib/deploy.mjs`). Staging splash MDX and vault `public/` copies are negligible (~hundreds of KB); **the bulk of I/O is the Astro `outDir` tree**.

SSD wear from occasional local builds is usually negligible on modern drives, but this optimization is still useful for:

- CI runners on Linux with tmpfs
- Developers who rebuild often and want less churn on a local SSD
- Publish-only flows where a local `dist/` mirror is optional

---

## Proposed approach

```
1. resolveBuildTempDir(vaultSlug)  →  RAM-backed path when available
2. ASTRO_OUT_DIR = <temp>/build
3. astro build  (all intermediate + final artifacts in RAM)
4. On success:
   a. publish: upload SFTP/FTP from temp (skip local dist/ write), OR
   b. preview/cache: single recursive copy temp → dist/<vault>/
5. Always rm -rf temp on exit (success or failure)
```

### Platform behaviour

| Environment | RAM-backed output | Notes |
|-------------|-------------------|-------|
| **Linux native** | Yes — `/dev/shm/astro-build-<slug>-<pid>` | tmpfs; zero config |
| **WSL2** | Yes — `/dev/shm/...` inside Linux | Output writes avoid Windows SSD; **vault reads** on `/mnt/d/...` still cross the 9p boundary (slower reads, some host I/O) |
| **macOS** | Partial — `/tmp` is often memory-backed | Not guaranteed; document behaviour |
| **Windows native** | No built-in tmpfs | `%TEMP%` is usually on the same SSD; optional third-party RAM disk (ImDisk) or document manual `ASTRO_OUT_DIR` |

### Developer workflow constraint (Windows + Obsidian)

Typical setup: **Obsidian on Windows** edits vaults under `D:\Webdev\...`. Obsidian is not a practical daily driver inside WSL.

Implications:

- **Windows-native build** (`npm run publish:ia-on-prem` from PowerShell): RAM tmpfs does **not** help unless the user configures a RAM disk manually.
- **WSL build-only** (engine + Node in WSL, vault/engine paths on `/mnt/d/...`): **write** side can use `/dev/shm`; **read** side (Markdown glob, images) still hits NTFS via 9p — partial win only.
- **Full benefit** requires Linux-native paths for both vault and engine (e.g. CI, dedicated Linux machine, or vault cloned inside WSL ext4, accepting Obsidian stays on Windows for editing and sync/git bridges content).

This is an acceptable trade-off: the plan targets **CI and Linux devs first**; Windows-native remains unchanged unless opt-in.

---

## Configuration (sketch)

| Variable | Purpose |
|----------|---------|
| `BUILD_USE_RAM=1` | Opt in: prefer tmpfs when `resolveRamBuildRoot()` finds a suitable mount |
| `BUILD_RAM_ROOT` | Override root (e.g. `/dev/shm`, custom ImDisk mount) |
| `BUILD_KEEP_DIST=1` | After RAM build, copy to `dist/<vault>/` (default on for local preview; off for publish-only) |

Auto-detect order: `BUILD_RAM_ROOT` → `/dev/shm` (if writable) → fall back to `dist/<vault>/` (current behaviour).

---

## Files to touch (when implemented)

- Create `config/build-temp.mjs` — `resolveRamBuildRoot()`, `mkdtemp` lifecycle
- Modify `config/vault.mjs` — integrate temp dir into `resolveAstroOutDir()` when `BUILD_USE_RAM=1`
- Modify `scripts/lib/deploy.mjs` — `runBuild()` uses temp outDir; publish reads from temp; optional post-build copy to `resolveDistDir()`
- Modify `scripts/run-with-vault.mjs` — pass env flags consistently
- Modify `.env.example` — document flags
- Create `tests/build-temp.test.mjs` — platform detection mocks, cleanup on error
- Update `README.md` — platform matrix and Obsidian/WSL caveat

Existing precedent: `tests/smoke-build.mjs` already builds to `node_modules/.cache/smoke-dist-*`.

---

## Validation (when implemented)

- [ ] `npm test` — unit tests for temp dir resolution and cleanup
- [ ] Linux/WSL: build `ia-on-prem` with `BUILD_USE_RAM=1`; confirm output under `/dev/shm`, then optional copy to `dist/ia-on-prem/`
- [ ] `npm run publish -- --vault=... --skip-git -y` uploads from RAM temp without requiring `dist/` persistence
- [ ] Windows without RAM disk: unchanged behaviour (writes to `dist/<vault>/`)
- [ ] Failed build: temp directory removed, no stale `/dev/shm` folders

---

## Out of scope (separate items)

- Vault `public/` staging in `ensure-vault.mjs` for plain `npm run build` (see multi-vault deploy notes)
- Junction/symlink for vault content (rejected: MDX path + Windows portability)
- Replacing Obsidian; this plan assumes Windows editing stays as-is

---

## Priority

**Low.** Current `dist/<vault>/` per-slug layout already prevents cross-vault overwrites. Implement when CI Linux builds become frequent or a maintainer wants explicit I/O control.
