# Security

**English** · [Français](SECURITY.fr.md)

The engine runs on your machine, at build and deploy time only. It reads your vault, builds a static site (HTML, CSS,
JavaScript, no server code), and sends it to your host over FTPS or SFTP. This page lists what protects your notes, your
credentials and your host, where it lives in the code, and what it does not cover.

## At a glance

| Risk | What stops it | Where |
|---|---|---|
| A private note ends up on the web | `_private/`, the vault-root `README.md`, `publish.exclude` and the vault `.gitignore` are excluded from the build; deploy sends only `dist/` | [`config/publish.mjs`](config/publish.mjs), [`config/gitignore.mjs`](config/gitignore.mjs), [`config/loaders/vault-docs.mjs`](config/loaders/vault-docs.mjs) |
| A secret file in the vault `public/` folder is published | Dotfiles (`.env`…), symbolic links and excluded paths are never copied | [`config/vault-public.mjs`](config/vault-public.mjs) |
| Deploy credentials committed with the code | They live in the vault `.env`, gitignored; the engine `.env` holds only vault paths | [`.gitignore`](.gitignore), [`.env.example`](.env.example) |
| Someone between you and the host reads the FTP password | FTPS: TLS required, certificate checked (unless you set `DEPLOY_FTPS_INSECURE=true`) | [`scripts/lib/deploy.mjs`](scripts/lib/deploy.mjs), `ftpsAccessOptions` |
| Someone poses as the SFTP server and receives the password | With `DEPLOY_HOST_FINGERPRINT`, a server presenting another SSH key is refused before any credential is sent; without it, the fingerprint is printed so you can pin it | [`scripts/lib/sftp-host-key.mjs`](scripts/lib/sftp-host-key.mjs) |
| A tampered remote manifest makes deploy delete files outside the site folder | A manifest path that is absolute, holds `..`, `\` or a control character is never deleted | [`scripts/lib/deploy-manifest.mjs`](scripts/lib/deploy-manifest.mjs), `isSafeManifestPath` |
| Mirror deletes files the host manages | Dotfiles (`.htaccess`, `.well-known`…) and `DEPLOY_PROTECT` entries (default `cgi-bin`) are never touched; over SFTP, mirror refuses the server root | [`scripts/lib/deploy-paths.mjs`](scripts/lib/deploy-paths.mjs), `isProtectedRel` |
| A commit message or an argument run by a shell | `npm` is started with an argument list, without a shell; git likewise | [`scripts/lib/npm-spawn.mjs`](scripts/lib/npm-spawn.mjs), [`scripts/publish.mjs`](scripts/publish.mjs) |
| The Basic Auth password sent in clear | With `forceHttps`, credentials are only asked over HTTPS, after the redirect | [`scripts/lib/auth.mjs`](scripts/lib/auth.mjs) |
| `.htpasswd` downloaded from the site | It is a dotfile, and the generated `.htaccess` denies every `^\.ht` file | [`scripts/lib/auth.mjs`](scripts/lib/auth.mjs) |
| The Basic Auth password left on disk | `.htpasswd` and `.htaccess` are streamed from memory | [`scripts/lib/auth.mjs`](scripts/lib/auth.mjs) |
| A public `.htaccess` that silently removes the password | `htaccess:install` refuses to run while `AUTH_*` is set | [`scripts/htaccess-install.mjs`](scripts/htaccess-install.mjs) |
| A page title or description that breaks out of the JSON-LD block | `<` is escaped as `<` | [`config/seo.mjs`](config/seo.mjs) |
| A lexicon definition that holds HTML | The tooltip writes it with `textContent`, never as HTML | [`src/components/LexiconTooltips.astro`](src/components/LexiconTooltips.astro) |
| A compromised dependency or CI action | `npm ci --ignore-scripts` in CI, read-only `GITHUB_TOKEN`, actions pinned by SHA, Dependabot weekly | [`.github/`](.github/) |

## Your content

- **The vault is trusted.** Its Markdown is rendered as you wrote it, and MDX pages run JavaScript at build time and
  may embed components: only build vaults you trust, as you would only run code you trust.
- **What is excluded** never enters `dist/`, and deploy sends nothing else. With the mirror on (the default), a page
  that was published and is now excluded is deleted from the host on the next deploy; with `--no-mirror`, it stays.
- **Mermaid diagrams** are rendered in the reader's browser by Mermaid, which sanitizes their labels with DOMPurify.

## Your credentials

- **Deploy credentials** (`DEPLOY_*`) live in the vault `.env`, which must stay gitignored. Prefer an SFTP key or an
  FTP account restricted to the site folder.
- **Basic Auth reader credentials** (`AUTH_*`) are independent of the FTP account: a reader never gets write access.
- **The engine prints** the host, the user and the target folder, never a password.

## What leaves your machine

- **To your host**: the files of `dist/`, the deploy manifest (`.deploy-manifest.json`, file names and SHA-256
  hashes, plus the deploy target), and, if you ask, `.htaccess` and `.htpasswd`.
- **To GitHub**, only through `publish`: the commits of the vault and of the engine, after your choice at the prompt.
- **Nothing else**: no telemetry, no account, no network call during a build.

## What it does not protect against

- **The strength of Basic Auth.** `.htpasswd` uses Apache's `$apr1$` (salted MD5), the format every Apache reads; it
  resists a casual look, not an offline attack on a stolen file. Use a long random password, and keep truly
  confidential notes out of the site.
- **The deploy manifest is readable if your host serves dotfiles.** Many hosts refuse them (o2switch answers 403); if
  yours does not, add a rule that denies `.deploy-manifest.json`. It holds file names and hashes, no secret.
- **SFTP without `DEPLOY_HOST_FINGERPRINT`** accepts the server's key, as an SSH client does on a first connection.
  Pin the fingerprint.
- **FTPS with `DEPLOY_FTPS_INSECURE=true`** accepts any certificate. Use it only when the host presents a certificate
  for another name (shared hosting) and you trust the network.
- **Your host itself**: anyone with write access to the site folder can change the site, the manifest or `.htaccess`.
- **Known advisories of dependencies** that have no fix yet (`npm audit`): they concern build-time tools reading your
  own files, not the published site.

## Reporting a problem

Open an issue on the repository, or write to the author through [damien.becherini.fr](https://damien.becherini.fr)
for anything you would rather not make public at once.
