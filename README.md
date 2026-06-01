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

A **generic Astro + Starlight engine** that turns an **Obsidian** vault into a fast, multilingual static
documentation site. The engine (this repo) and the content (your vault) live in **two separate
repositories**: edit your notes in Obsidian, let the engine publish them.

## Why?

- **Full decoupling** — the engine holds no notes. Content is mounted from an external vault through a
  junction (`src/content/docs`), resolved at build time from `VAULT_PATH`.
- **Obsidian first** — author with wiki links `[[...]]`, templates and Mermaid diagrams; the web render follows.
- **Interactive Mermaid** — wheel/button zoom, pan and fullscreen via a custom `MermaidEnhancer` built on `svg-pan-zoom`.
- **Multilingual** — i18n routing out of the box (locales driven by the vault config).
- **Content-side config** — title, public URL, locales, sidebar and social links live in `site.config.json` at the
  vault root, not in the engine.

## Architecture

```
Webdev/
├─ starlight-obsidian-engine/   ← this repo (engine, public)
│  └─ src/content/docs   ────────┐  (Windows junction / symlink)
└─ your-obsidian-vault/         ◄┘  ← Obsidian vault (content, private)
   ├─ site.config.json          (title, url, locales, sidebar, social)
   ├─ index.mdx
   └─ 01-foundations/…
```

Content **does not live** in the engine: it is resolved at build time from `VAULT_PATH`. The junction is
**required** so Vite can resolve `@astrojs/starlight/components` imports inside the vault's `.mdx` files
(`preserveSymlinks` in `astro.config.mjs`).

## Quick start

```bash
# 1. Clone the engine and place your Obsidian vault next to it
git clone https://github.com/DamienBecherini/starlight-obsidian-engine.git
cd starlight-obsidian-engine

# 2. Point to the vault
cp .env.example .env            # then edit VAULT_PATH (e.g. ../your-obsidian-vault)

# 3. Install + link the vault (creates the junction src/content/docs → VAULT_PATH)
npm install
npm run link:vault

# 4. Run
npm run dev                     # http://localhost:4321
```

`predev` / `prebuild` recreate the junction automatically if it is missing.

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

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Static build (`dist/`) |
| `npm run preview` | Preview the build |
| `npm run link:vault` | (Re)create the junction `src/content/docs` → `VAULT_PATH` |
| `npm run publish` | Git sync (optional) → build → remote upload (see [Publishing](#publishing)) |
| `npm run deploy` | Build + remote upload (no git) |
| `npm run upload` | Remote upload only (existing `dist/`, no git, no build) |
| `npm run auth:install` | Protect the live site with Apache Basic Auth (see [Private site](#private-site-basic-auth)) |
| `npm run auth:remove` | Remove Basic Auth (make the site public again) |

## Publishing

Back up on GitHub and/or deploy the built site over **FTPS** (FTP over TLS) or **SFTP** (SSH).
**Deploy credentials live in the vault `.env`** — each vault can target a different host. The engine
`.env` only needs `VAULT_PATH`.

### Setup

**Engine** (`starlight-obsidian-engine/.env`):

```env
VAULT_PATH=../your-obsidian-vault
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
cd ../ia-on-prem-vault
npm run upload
```

### Interactive git (`publish` only)

When run in a terminal, each repo with **uncommitted changes** prompts:

1. **Cancel** — abort (nothing is deployed)
2. **Auto-commit** — asks for a commit message, then commits and pushes that repo
3. **Publish anyway** — skip git for that repo (deploys local files; GitHub stays behind)

Repos that are clean but **ahead of origin** are pushed automatically.

### Preview & confirmation

Before uploading, the engine connects to the remote, computes the diff and prints a preview, then asks
for confirmation:

```
📋 Planned changes:
   + new:        3 file(s)
   ~ overwrite:  41 file(s)
   − delete:     2 file(s) (mirror)
       − old-page/index.html
       − 02-legacy/notes/index.html

Proceed with upload? (y/N)
```

The prompt appears when running in a terminal. Skip it with `--yes` (or `-y`) for non-interactive runs;
in a non-TTY context (CI) the upload proceeds without prompting.

During the transfer the engine renders a single-line **progress bar** (by transferred bytes over FTPS,
by file count over SFTP). It is shown only in an interactive terminal; piped/CI logs stay clean.

### Mirror mode (default)

By default, every upload **mirrors** the remote directory: after uploading, remote files that no longer
exist locally are **deleted** (no stale pages). Dotfiles and dot-directories are never touched, so a
server-managed `.htaccess`, `.well-known/`, etc. stay safe. Over **FTPS** the chrooted site root (`/`) is
mirrored with the extra protected entries (`DEPLOY_PROTECT`, default `cgi-bin`). Over **SFTP** the engine
refuses to mirror the real server root, so `DEPLOY_REMOTE_PATH` must be a dedicated directory.

Disable mirroring (additive upload, keep remote-only files) on any command:

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

### Workflow summary

```
npm run publish
  ├─ validate deploy config (fail-fast, before git/build)
  ├─ Vault git  (cancel / commit / skip / push if ahead)
  ├─ Engine git (same)
  ├─ npm run build
  └─ FTPS or SFTP upload dist/ + mirror  (credentials from vault .env)

npm run deploy  →  validate config → build → upload + mirror
npm run upload  →  validate config → upload + mirror (dist/ must already exist)
```

### Private site (Basic Auth)

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
- **Dotfiles are skipped** during upload and **never deleted** by mirror (protects `.htaccess`, etc.);
  over FTPS, `DEPLOY_PROTECT` (default `cgi-bin`) adds extra protected top-level entries.
- **Public URL:** set `url` in the vault's `site.config.json` (not in the engine). Enables the sitemap and
  absolute canonical URLs at build time.

### Private / unpublished notes

The engine reads the vault **`.gitignore`** at build time and **excludes matching Markdown/MDX** from
the site. Deploy only uploads `dist/`, so gitignored notes never reach the web. With mirror mode (default),
pages that were previously published but are now gitignored are **removed from the remote** on the next deploy.

Convention in the vault:

```
README.md          ← repository docs at the vault root (GitHub); never built as a site page
_private/          ← confidential notes (gitignored except _private/README.md placeholder)
.gitignore         ← any rule here also excludes files from the build
```

The vault-root `README.md` and the entire `_private/` tree are **always** excluded from the build, even
if a file is negated in `.gitignore` for Git tracking (e.g. the `_private/README.md` placeholder).

Add custom paths to the vault `.gitignore` for other unpublished content. Do not reference private pages
in `site.config.json` sidebar.

With `--no-mirror`, gitignored pages already online are **not** deleted from the server automatically.

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
- **Math (LaTeX)** — `remark-math` + `rehype-katex` (`config/markdown.mjs`) for Obsidian `$...$` /
  `$$...$$` syntax, rendered at build time (no client JS). Styles: `katex/dist/katex.min.css` +
  `src/styles/katex-starlight.css`.
- **Wiki links** — `remark-wiki-link` (`config/markdown.mjs`) for Obsidian's `[[...]]` syntax.
- **i18n** — locales and labels driven by `site.config.json`.

## Project layout

```
config/          engine config (vault resolution, site config loader, integrations, markdown, Starlight)
scripts/         vault linking, pre-dev/build checks, publish (SFTP)
src/components/  Head override + MermaidEnhancer
src/styles/      Mermaid + KaTeX Starlight overrides
src/content.config.ts   content collection (docsLoader on the junction, glob otherwise)
```

## Contributing

Issues and PRs welcome. The engine is intentionally content-agnostic — keep your notes in your own vault repo.

## License

[BSD Zero Clause License (0BSD)](./LICENSE) — public-domain-equivalent, no attribution required. Use it for
anything, including closed-source and commercial work.
