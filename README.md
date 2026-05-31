<div align="center">

# Starlight Obsidian Engine

**Publish an Obsidian vault as a fast, static Astro + Starlight site — content and engine fully decoupled.**

[![Astro](https://img.shields.io/badge/Astro-6.x-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![Starlight](https://img.shields.io/badge/Starlight-0.39-FFC107?logo=astro&logoColor=black)](https://starlight.astro.build)
[![Mermaid](https://img.shields.io/badge/Mermaid-pan%2Fzoom-FF3670?logo=mermaid&logoColor=white)](https://mermaid.js.org)
[![i18n](https://img.shields.io/badge/i18n-FR%20%2F%20EN-0A7EA4)](https://starlight.astro.build/guides/i18n/)
[![License: 0BSD](https://img.shields.io/badge/License-0BSD-brightgreen.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-success.svg)](#contributing--contribuer)

</div>

---

## 🇫🇷 Français

Un **moteur Astro + Starlight générique** pour transformer un coffre **Obsidian** en site de documentation statique, rapide et multilingue. Le moteur (ce dépôt) et le contenu (votre vault) vivent dans **deux dépôts séparés** : vous mettez à jour vos notes dans Obsidian, le moteur les publie.

### Pourquoi ce projet ?

- **Découplage total** : le code du moteur ne contient aucune note. Le contenu est monté depuis un vault externe via une *junction* (`src/content/docs`).
- **Obsidian first** : éditez dans Obsidian (wiki links `[[...]]`, templates, diagrammes Mermaid) — le rendu web suit.
- **Diagrammes Mermaid interactifs** : pan, zoom molette/boutons et plein écran (composant maison `MermaidEnhancer`).
- **Multilingue** : routage i18n FR/EN prêt à l'emploi via Starlight.
- **Configuration côté contenu** : titre, locales, sidebar et liens sociaux vivent dans `site.config.json`, à la racine du vault — pas dans le moteur.

### Architecture

```
Webdev/
├─ starlight-obsidian-engine/   ← ce dépôt (moteur, public)
│  └─ src/content/docs   ──────┐  (junction Windows / symlink)
└─ ia-on-prem-vault/            ◄┘  ← vault Obsidian (contenu, privé)
   ├─ site.config.json          (titre, locales, sidebar, social)
   ├─ index.mdx
   └─ 01-fondations/…
```

Le contenu **ne vit pas** dans le moteur : il est résolu au build depuis `VAULT_PATH`. La junction est **requise** pour que Vite résolve les imports `@astrojs/starlight/components` dans les fichiers `.mdx` du vault (`preserveSymlinks` dans `astro.config.mjs`).

### Démarrage rapide

```bash
# 1. Cloner le moteur + placer votre vault Obsidian à côté
git clone https://github.com/DamienBecherini/starlight-obsidian-engine.git
cd starlight-obsidian-engine

# 2. Indiquer le chemin du vault
cp .env.example .env        # puis éditer VAULT_PATH (ex. ../ia-on-prem-vault)

# 3. Installer + lier le vault (crée la junction src/content/docs → VAULT_PATH)
npm install
npm run link:vault

# 4. Lancer
npm run dev                 # http://localhost:4321
```

`predev` / `prebuild` recréent automatiquement la junction si elle manque.

### Configuration du site (`site.config.json`, dans le vault)

```jsonc
{
  "title": "Mon Site",
  "defaultLocale": "fr",
  "locales": { "fr": { "label": "Français" }, "en": { "label": "English" } },
  "social": [{ "icon": "github", "label": "GitHub", "href": "https://github.com/..." }],
  "sidebar": [ /* format Starlight */ ]
}
```

### Scripts

| Commande | Rôle |
|----------|------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build statique (`dist/`) |
| `npm run preview` | Prévisualiser le build |
| `npm run link:vault` | (Re)créer la junction `src/content/docs` → `VAULT_PATH` |

### Modules intégrés

- **Mermaid** — `src/components/MermaidEnhancer.astro` + `src/styles/mermaid.css` (pan/zoom/plein écran) au-dessus de `astro-mermaid`.
- **Wiki links** — `remark-wiki-link` (`config/markdown.mjs`) pour la syntaxe `[[...]]` d'Obsidian.
- **i18n** — locales et libellés pilotés par `site.config.json`.

---

## 🇬🇧 English

A **generic Astro + Starlight engine** that turns an **Obsidian** vault into a fast, multilingual static documentation site. The engine (this repo) and the content (your vault) live in **two separate repositories**: edit your notes in Obsidian, let the engine publish them.

### Why?

- **Full decoupling** — the engine holds no notes. Content is mounted from an external vault through a junction (`src/content/docs`).
- **Obsidian first** — author with wiki links `[[...]]`, templates and Mermaid diagrams; the web render follows.
- **Interactive Mermaid** — wheel/button zoom, pan and fullscreen via a custom `MermaidEnhancer`.
- **Multilingual** — FR/EN i18n routing out of the box.
- **Content-side config** — title, locales, sidebar and social links live in `site.config.json` at the vault root, not in the engine.

### Quick start

```bash
git clone https://github.com/DamienBecherini/starlight-obsidian-engine.git
cd starlight-obsidian-engine
cp .env.example .env        # set VAULT_PATH (e.g. ../ia-on-prem-vault)
npm install
npm run link:vault          # junction src/content/docs → VAULT_PATH
npm run dev                 # http://localhost:4321
```

Site configuration (title, locales, sidebar, social) is read from `site.config.json` at the root of your vault — see the Français section above for the schema.

---

## Contributing / Contribuer

Issues and PRs welcome. The engine is intentionally content-agnostic — keep notes in your own vault repo.

## License

[BSD Zero Clause License (0BSD)](./LICENSE) — public-domain-equivalent, no attribution required. Use it for anything, including closed-source and commercial work.
