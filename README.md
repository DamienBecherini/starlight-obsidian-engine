<div align="center">

# Starlight Obsidian Engine

**Publish an Obsidian vault as a fast, multilingual static site — content and engine fully decoupled.**

[![Astro](https://img.shields.io/badge/Astro-6.x-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![Starlight](https://img.shields.io/badge/Starlight-0.39-FFC107?logo=astro&logoColor=black)](https://starlight.astro.build)
[![Mermaid](https://img.shields.io/badge/Mermaid-pan%2Fzoom-FF3670?logo=mermaid&logoColor=white)](https://mermaid.js.org)
[![i18n](https://img.shields.io/badge/i18n-ready-0A7EA4)](https://starlight.astro.build/guides/i18n/)
[![License: 0BSD](https://img.shields.io/badge/License-0BSD-brightgreen.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-success.svg)](#contributing)

</div>

---

A **generic Astro + Starlight engine** that turns one or more **Obsidian** vaults into fast, multilingual
static documentation sites. The engine (this repo) and the content (your vaults) live in **separate
repositories**: edit your notes in Obsidian, let the engine publish them.

## Why?

- **Full decoupling** — the engine holds no notes. Each vault is resolved at build time via the
  `VAULT_<name>` registry or the `--vault=<name>` flag; `VAULT_PATH` is the single-vault fallback.
  A junction (`src/content/docs`) is optional and only needed for IDE path resolution.
- **Obsidian first** — author with wiki links `[[...]]`, templates and Mermaid diagrams; the web render follows.
- **Interactive Mermaid** — wheel/button zoom, pan and fullscreen via a custom `MermaidEnhancer` built on `svg-pan-zoom`.
- **Multilingual** — i18n routing out of the box (locales driven by the vault config).
- **Content-side config** — title, public URL, locales, sidebar and social links live in `site.config.json` at the
  vault root, not in the engine.

## Architecture

```
Webdev/
├─ starlight-obsidian-engine/   ← this repo (engine, shared)
├─ ia-on-prem-vault/            ← vault A (content, private)
│   ├─ site.config.json         (title, url, locales, sidebar, social)
│   ├─ index.mdx
│   └─ 01-foundations/…
└─ software-craft-vault/        ← vault B (content, private)
    ├─ site.config.json
    └─ …
```

The engine resolves vault content at build time from the `VAULT_<name>` registry in `.env` or the
`--vault=<name>` flag. `VAULT_PATH` is the single-vault fallback (retrocompat). No file is mutated at
runtime — the vault path is resolved **in memory only**.

A junction (`src/content/docs → vault`) is **optional**: create one with `npm run link:vault` if you
want IDE path resolution (Vite `preserveSymlinks`) for `.mdx` imports inside the vault. It is never
required for `dev`, `build`, or `publish`.

**Requires Node.js 22+** (CI runs Node 24). Uses `node:test` (built-in test runner) and `parseEnv` from `node:util`.

## Quick start

```bash
# 1. Clone the engine and place your Obsidian vault(s) next to it
git clone https://github.com/DamienBecherini/starlight-obsidian-engine.git
cd starlight-obsidian-engine

# 2. Register your vault(s)
cp .env.example .env
# Single vault: set VAULT_PATH=../your-obsidian-vault
# Multi-vault:  add VAULT_<name>=<path> entries (see .env.example)

# 3. Install
npm install

# 4. Run
npm run dev                     # uses VAULT_PATH (single-vault fallback)
npm run dev:ia-on-prem          # uses VAULT_ia-on-prem (multi-vault)
```

> **Junction optional.** `npm run link:vault` creates `src/content/docs → VAULT_PATH` for IDE path
> resolution. It is **not required** for `dev`, `build`, or `publish`.

## Site configuration (`site.config.json`, in the vault)

```jsonc
{
  "title": "My Site",
  "url": "https://docs.example.com",
  "defaultLocale": "root",
  "locales": {
    "root": { "label": "English", "lang": "en" },
    "fr": { "label": "Français", "lang": "fr" }
  },
  "social": [{ "icon": "github", "label": "GitHub", "href": "https://github.com/..." }],
  "sidebar": [ /* Starlight sidebar format */ ]
}
```

The engine reads `url` at build time and sets Astro's `site` option (sitemap, canonical URLs). Omit `url`
if the site is local-only during development.

### Optional lexicon (`site.config.json`)

Vaults may declare a `lexicon` block in `site.config.json` to enable automatic index generation:

| Field | Role |
|-------|------|
| `enabled` | `true` activates lexicon tooling (default: off if block absent) |
| `directory` | Folder of term pages (e.g. `glossary/` or `00-lexique/`) |
| `entryTag` | Frontmatter tag marking lexicon entries (default: `lexique`) |
| `hubPage` | Curated hub markdown file (excluded from the generated index) |
| `indexPage` | Generated alphabetical index filename |
| `sortLocale` | `localeCompare` locale for sorting titles (e.g. `fr`, `en`) |
| `index.title`, `index.description`, `index.intro` | Frontmatter and intro for the generated index |

`predev` and `prebuild` run the index generator only when `lexicon.enabled` is true and the directory
exists. Each entry needs `title`, `description`, and the configured `entryTag` in frontmatter. Respect
vault `.gitignore` (ignored files are skipped).

```bash
npm run lexicon:index          # strict: errors if disabled or misconfigured
npm run lexicon:voir-aussi     # format ## Voir aussi wiki links in lexicon entries
```

Commit the generated `indexPage` with the vault when you add or change lexicon entries. Sidebar links
for the hub and index are defined in `site.config.json` (not generated by the engine).

### Backlinks (incoming references)

At `predev` / `prebuild`, the engine builds `src/generated/link-graph.json` (gitignored) from explicit
wiki-links and internal markdown links `](/path/)` in **published** vault pages. The right sidebar shows
**Incoming references** on every page; lexicon entries (`lexicon.entryTag`) use **Pages that mention this term**
with grouping by top-level folder. Hub and generated index pages from `site.config.json` → `lexicon` are
excluded from the panel.

Only **explicit links** count (not plain-text mentions). Compare with Obsidian’s backlinks panel when
spot-checking.

```bash
npm run link-graph:build
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server (uses `VAULT_PATH` fallback) |
| `npm run dev:<name>` | Dev server for a registered vault (e.g. `dev:ia-on-prem`, `dev:craft`) |
| `npm run build` | Static build (`dist/`) |
| `npm run preview` | Preview the build |
| `npm run link:vault` | (Re)create the junction `src/content/docs` → `VAULT_PATH` (optional, IDE nav only) |
| `npm run lexicon:index` | Regenerate the vault lexicon index (`lexicon.indexPage`) from entry frontmatter |
| `npm run lexicon:voir-aussi` | Upgrade `## Voir aussi` wiki links in lexicon entry pages |
| `npm run link-graph:build` | Regenerate `src/generated/link-graph.json` from vault link graph |
| `npm run audit:links` | Report unresolved wiki/MD links; exits 1 only on unexpected failures (allowlist: vault's `.agents/vault-maintenance/link-audit-allowlist.md`); add `--strict` to fail on any unresolved link, `--warn-only` to always exit 0 |
| `npm run publish` | Git sync (optional) → build → remote upload (uses `VAULT_PATH` fallback) |
| `npm run publish:<name>` | Full publish for a registered vault (e.g. `publish:ia-on-prem`, `publish:craft`) |
| `npm run deploy` | Build + remote upload, no git (uses `VAULT_PATH` fallback) |
| `npm run deploy:<name>` | Build + deploy for a registered vault (e.g. `deploy:ia-on-prem`, `deploy:craft`) |
| `npm run upload` | Remote upload only (existing `dist/`, no git, no build) |
| `npm run auth:install` | Protect the live site with Apache Basic Auth (see [Private site](#private-site-basic-auth)) |
| `npm run auth:remove` | Remove Basic Auth (make the site public again) |
| `npm test` | Unit tests (deploy manifest, gitignore, link-graph, lexicon, auth, CLI flags) |
| `npm run test:build` | Smoke build using `tests/fixtures/minimal-vault/` |

All `publish`, `deploy`, and `upload` commands also accept a `--vault=<name>` flag directly:

```bash
npm run publish -- --vault=craft
npm run deploy  -- --vault=ia-on-prem
```

## Tests

Run the unit test suite (Node built-in test runner, no extra dependencies):

```bash
npm test
```

Smoke-build the Astro site against a minimal in-repo vault fixture (excludes `_private/` and
`.gitignore` paths). Uses `FORCE_VAULT_PATH=1` so the fixture wins over the `src/content/docs`
junction, and writes output to a disposable directory under `node_modules/.cache/` (never
`dist/`, never the vault link):

```bash
npm run test:build
```

**Covered:** incremental deploy manifest diff, vault gitignore / `_private` filtering, vault docs
loader exclusion, vault path override (`FORCE_VAULT_PATH`), deploy CLI flags, deploy config
parsing (success paths), Apache `apr1` / htpasswd generation, upload progress formatting.

**Not covered (by design):** real FTPS/SFTP transfers, interactive `publish.mjs` git prompts,
browser-side Mermaid enhancer. CI runs `npm test` and `npm run test:build` on push/PR
(`.github/workflows/ci.yml`).

## Publishing

Back up on GitHub and/or deploy the built site over **FTPS** (FTP over TLS) or **SFTP** (SSH).
**Deploy credentials live in the vault `.env`** — each vault can target a different host. The engine
`.env` only needs `VAULT_PATH`.

### Workflow summary

```
npm run publish
  ├─ validate deploy config (fail-fast, before git/build)
  ├─ Vault git  (cancel / commit / skip / push if ahead)
  ├─ Engine git (same)
  ├─ npm run build
  └─ incremental FTPS/SFTP upload (local + remote `.deploy-manifest.json`)

npm run deploy  →  validate config → build → incremental upload (synced manifest)
npm run upload  →  validate config → incremental upload (dist/ must already exist; run build first)
npm run audit:links  →  unresolved links (exit 1 only on unexpected; use --strict for zero tolerance)
```

### Setup

**Engine** (`starlight-obsidian-engine/.env`):

```env
# Single vault (fallback)
VAULT_PATH=../your-obsidian-vault

# Multi-vault registry — register each vault with VAULT_<name>=<path>
# Used by: --vault=<name> flag, npm run dev:<name>, npm run publish:<name>, etc.
# VAULT_ia-on-prem=../ia-on-prem-vault
# VAULT_craft=../software-craft-vault
```

**Vault** (`your-vault/.env`):

```env
ENGINE_PATH=../starlight-obsidian-engine

# ftps = FTP over TLS (port 21, no SSH). sftp = SSH (port 22).
DEPLOY_PROTOCOL=ftps

DEPLOY_HOST=ftp.example.com
DEPLOY_PORT=21
DEPLOY_USER=your-user
DEPLOY_PASSWORD=your-password
# SFTP only — private key instead of password:
# DEPLOY_PRIVATE_KEY_PATH=id_ed25519

# FTPS: many shared hosts present a cert for a different name (e.g. *.o2switch.net).
# FileZilla silently accepts it; set this to do the same:
# DEPLOY_FTPS_INSECURE=true

DEPLOY_REMOTE_PATH=/
```

> The legacy `SFTP_*` names (`SFTP_HOST`, `SFTP_USER`, …) are still accepted as a
> fallback, but `DEPLOY_*` is the canonical, protocol-neutral naming.

If `DEPLOY_PROTOCOL` is omitted, port `21` selects `ftps` and port `22` selects `sftp`.

Copy from each repo's `.env.example`. Ensure the remote directory exists on your host.

**Remote path & FTPS chroot.** FTPS accounts are almost always **chrooted** to their own
space, so after login the working directory is already the site web root — use
`DEPLOY_REMOTE_PATH=/`. Do **not** repeat the absolute `/home/USER/site` path you see in
FileZilla; that path is relative to the chroot and would nest the upload inside itself.
The engine prints the **resolved absolute target** before uploading so you can confirm.
For SFTP, `/` is the real server root, so use a dedicated absolute directory instead.

**Protected entries.** At the FTPS site root, server-managed entries are never uploaded
nor deleted by mirror: all dotfiles (`.htaccess`, `.well-known`, `.ftpquota`) plus a
configurable list (`DEPLOY_PROTECT`, default `cgi-bin`).

### Commands

| Command | Git | Build | Upload | Typical use |
|---------|-----|-------|--------|-------------|
| `npm run publish` | yes (interactive or flags) | yes | yes | Full workflow: backup + go live |
| `npm run deploy` | no | yes | yes | Rebuild and upload after local edits |
| `npm run upload` | no | no | yes | Push an existing `dist/` only |

All three work **from the engine or from the vault** (vault scripts delegate to the engine).

```bash
# From the engine
npm run publish
npm run deploy
npm run upload

# From the vault (same commands, delegates via ENGINE_PATH)
cd ../your-obsidian-vault
npm run upload
```

### Interactive git (`publish` only)

When run in a terminal, each repo with **uncommitted changes** prompts:

1. **Cancel** — abort (nothing is deployed)
2. **Auto-commit** — asks for a commit message, then commits and pushes that repo
3. **Publish anyway** — skip git for that repo (deploys local files; GitHub stays behind)

Repos that are clean but **ahead of origin** are pushed automatically.

### Incremental deploy (default)

By default, `deploy`, `upload`, and `publish` use a **deploy manifest** (SHA-256 of every file in the
last successful deploy):

- **Local copy:** `.deploy-manifest.json` in the vault root (gitignored).
- **Remote copy:** same filename at `{DEPLOY_REMOTE_PATH}/.deploy-manifest.json` (dotfile beside
  `dist/` contents; uploaded directly, not part of the static site).

Before each incremental run, the engine **syncs the manifest from the remote** (when present) and merges
it with the local copy: remote wins if local is absent (CI / fresh clone); otherwise the newer
`updatedAt` wins. After upload or delete, both copies are updated.

After `npm run build`, the engine hashes every file in `dist/` and compares it to the merged manifest:

- **Upload** only new or changed files (no remote FTP listing — preview is instant).
- **Delete** remote files that are no longer in `dist/` (obsolete `_astro` bundles, old Pagefind fragments, etc.).
- **Update both manifests** after each file uploaded or deleted (safe to resume if FTPS drops mid-transfer).

First deploy on a target uploads everything and creates both manifests. If you change `DEPLOY_HOST` or
`DEPLOY_REMOTE_PATH`, the manifest is reset automatically for the new target.

Over **SFTP**, changed files upload in parallel (up to 8 concurrent `put` calls on one connection).

Example preview:

```
🔍 Incremental deploy (manifest sync)
   Syncing manifest from remote…
   Hashing dist/ … 274/274

📋 Planned changes (incremental, synced manifest):
   + upload:     12 file(s) (420.5 KB)
   ~ skip:       262 unchanged
   − delete:     8 obsolete remote file(s)
```

### Full deploy (`--full`)

Legacy behaviour: scan the remote tree (~10 s on FTPS), upload **all** of `dist/`, then mirror-walk
the server to remove stale files. Regenerates **local and remote** manifests at the end. Use after manual edits on
the host, a corrupted manifest, or when you want to resync from scratch:

```bash
npm run deploy -- --full
npm run publish -- --full --yes
```

### Preview & confirmation

The prompt appears when running in a terminal. Skip it with `--yes` (or `-y`) for non-interactive runs;
in a non-TTY context (CI) the upload proceeds without prompting.

During the transfer the engine renders a single-line **progress bar** (by transferred bytes over FTPS,
by file count over SFTP). It is shown only in an interactive terminal; piped/CI logs stay clean.

### Orphan cleanup & `--no-mirror`

By default, incremental deploy **deletes obsolete remote files** tracked in the manifest (same goal as
mirror, without a full remote tree walk). Dotfiles and top-level protected entries (`DEPLOY_PROTECT`,
default `cgi-bin`) are never touched.

Keep obsolete remote files (additive upload):

```bash
npm run upload -- --no-mirror     # alias: --additive
npm run deploy -- --no-mirror
npm run publish -- --no-mirror

# skip the confirmation prompt
npm run deploy -- --yes
```

### Non-interactive flags (`publish` only)

```bash
npm run publish -- --commit-message "Update notes"
npm run publish -- --skip-git          # build + upload, no git
npm run publish -- --help
```

`deploy` and `upload` never touch git.

### Private site (Basic Auth)

> **Apache only.** This feature generates `.htaccess` + `.htpasswd` files. It works on Apache-based shared hosting (o2switch, OVH mutualisé, cPanel, etc.). It has **no effect** on Nginx, Caddy, Vercel, Netlify, AWS S3, or any host that does not process `.htaccess`.

Make the deployed site private with Apache Basic Auth. The engine generates a `.htpasswd`
(Apache `$apr1$` MD5 hash, salted) and a `.htaccess`, then uploads both to the site root
over the same `DEPLOY_*` connection.

Add to the **vault** `.env`:

```env
AUTH_USER=lecteur
AUTH_PASSWORD=a-strong-password
# Real absolute server path of the site root (what Apache sees). On a chrooted FTP
# account, "/" maps to this path — copy it from cPanel / your host:
AUTH_SERVER_ROOT=/home/USER/your-site-folder
# AUTH_HTPASSWD_NAME=.htpasswd   # filename at the site root (must stay hidden)
AUTH_REALM=IA On-Premise          # text in the browser login popup
```

```bash
npm run auth:install                 # generate + upload .htpasswd then .htaccess
npm run auth:remove                  # delete .htaccess and .htpasswd
npm run auth:remove -- --keep-htpasswd   # delete only .htaccess
npm run auth:remove -- --yes             # skip the confirmation prompt
```

After install, the site returns **401** without credentials and **200** with the
`AUTH_USER` / `AUTH_PASSWORD` pair.

Notes:

- The reader credentials are **independent** of the FTP account (`DEPLOY_USER`) — least privilege.
- `.htpasswd` lives at the site root inside the chroot (so FTP can write it), but is a dotfile:
  never served by Apache, never uploaded or deleted by `deploy` / `upload` mirroring. The generated
  `.htaccess` also denies any `^\.ht` file.
- `AUTH_SERVER_ROOT` is the **real absolute path** used for `AuthUserFile` (Apache reads the real
  filesystem, not the chroot view), distinct from `DEPLOY_REMOTE_PATH=/` used by FTP.
- Files are streamed from memory — the hashed password is never written to local disk.

### Notes & limitations

- **Mirror is the default** (remote files absent locally are deleted). Use `--no-mirror` for additive
  uploads. Over SFTP, `DEPLOY_REMOTE_PATH` must be a dedicated directory (mirror refuses the server root).
- **Dotfiles are skipped** during `dist/` upload and **never deleted** by mirror (protects `.htaccess`, etc.);
  the deploy manifest (`.deploy-manifest.json`) is managed separately and stored at the remote deploy root;
  over FTPS, `DEPLOY_PROTECT` (default `cgi-bin`) adds extra protected top-level entries.
- **Public URL:** set `url` in the vault's `site.config.json` (not in the engine). Enables the sitemap and
  absolute canonical URLs at build time.

### Private / unpublished notes

The engine excludes Markdown/MDX from the site when paths match any of:

1. **Hardcoded rules** — vault-root `README.md` / `readme.txt`, and the entire `_private/` tree (even if negated in `.gitignore`).
2. **`publish.exclude` in `site.config.json`** — version-controlled paths that must stay out of the public site (agent plans, skills, Cursor rules, etc.).
3. **Vault `.gitignore`** — files that should neither be committed nor published.

Deploy only uploads `dist/`, so excluded notes never reach the web. With mirror mode (default),
pages that were previously published but are now excluded are **removed from the remote** on the next deploy.

Example in the vault's `site.config.json`:

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

Convention in the vault:

```
README.md          ← repository docs at the vault root (GitHub); never built as a site page
_private/          ← confidential notes (gitignored except _private/README.md placeholder)
.gitignore         ← git-only exclusions (also excluded from the build)
site.config.json   ← publish.exclude for tracked-but-unpublished folders
```

Add custom paths to `.gitignore` when content should not be in Git. Use `publish.exclude` when content
should be versioned but not published. Do not reference private pages in `site.config.json` sidebar.

With `--no-mirror`, excluded pages already online are **not** deleted from the server automatically.

## Build analysis & bundle size

`npm run build` prints a Vite warning: *"Some chunks are larger than 500 kB"*. This is expected and
**safe to ignore**. The only chunks above 500 kB are Mermaid's own bundles:

| Chunk | ~Size | Loaded when |
|-------|-------|-------------|
| `mermaid.core.*` | ~590 kB | a page contains any Mermaid diagram |
| `wardley-*` | ~600 kB | a page contains a Wardley map |
| `cytoscape.esm.*` | ~430 kB | architecture / cose-bilkent layouts |
| `katex.*` | ~255 kB | a Mermaid diagram contains math labels (client-side, via `astro-mermaid`) |

These are **lazily imported client-side** by `astro-mermaid` — they are fetched only on pages that
actually render that diagram type, so they never weigh on the initial page load. They are also already
optimally code-split per diagram type; grouping them with `manualChunks` would merge separate lazy
bundles into one eager bundle (worse), and raising `chunkSizeWarningLimit` would only hide the message.
We intentionally do neither.

To inspect what goes into each chunk, run an **opt-in** analysis build (writes `dist/stats.html`, never
part of a normal build or deploy):

```bash
# bash / zsh
ANALYZE=true npm run build

# PowerShell
$env:ANALYZE="true"; npm run build; Remove-Item Env:\ANALYZE
```

## Built-in modules

- **Mermaid** — `src/components/MermaidEnhancer.astro` + `src/styles/mermaid.css` (pan/zoom/fullscreen) on
  top of `astro-mermaid`. See the bundled debugging skill in `.agents/skills/astro-mermaid/`.
- **Backlinks** — `src/components/PageBacklinks.astro` injected into `src/components/PageSidebar.astro`
  (Starlight `PageSidebar` override). Reads `src/generated/link-graph.json` built at `predev`/`prebuild`.
- **Editorial badge** — `src/components/VerifiedBadge.astro` renders `last_modified`, `last_verified`,
  `verified_by`, `verified_hitl`, and `prices_valid_as_of` frontmatter fields at the bottom of each page.
- **Math (LaTeX)** — `remark-math` + `rehype-katex` (`config/markdown.mjs`) for Obsidian `$...$` /
  `$$...$$` syntax, rendered at build time (no client JS). Styles: `katex/dist/katex.min.css` +
  `src/styles/katex-starlight.css`.
- **Wiki links** — `remark-wiki-link` (`config/markdown.mjs`) for Obsidian's `[[...]]` syntax.
- **i18n** — locales and labels driven by `site.config.json`.

## Project layout

```
config/               engine config (vault resolution, site config loader, integrations, markdown, Starlight)
scripts/              vault linking, pre-dev/build checks, publish (FTPS/SFTP)
src/components/       Head, Footer, MermaidEnhancer, PageSidebar, PageBacklinks, VerifiedBadge overrides
src/styles/           Mermaid, KaTeX, backlinks, footnotes, external-links Starlight overrides
src/generated/        link-graph.json (gitignored; rebuilt at predev/prebuild)
src/content.config.ts content collection (compositeLoader: docsLoader + vault glob, junction-aware)
```

## Contributing

Issues and PRs welcome. The engine is intentionally content-agnostic — keep your notes in your own vault repo.

## License

[BSD Zero Clause License (0BSD)](./LICENSE) — public-domain-equivalent, no attribution required. Use it for
anything, including closed-source and commercial work.
