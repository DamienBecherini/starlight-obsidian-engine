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

# Rétroliens site-wide — phases 6 à 7 (échelle et optionnel)

**Prérequis** :

- [plan 1 — phases 1 à 5](2026_06_01_14-00_main_link-graph-backlinks-phases-1-5.plan.md) livré et validé en production.
- [Plan lexicon](2026_06_02_12-00_main_lexicon-config-vault.plan.md) livré (recommandé avant plan 1 si vault multi-lexique).

Ce plan couvre les optimisations quand le vault grossit (×10–×20) et des intégrations **non requises** pour la feature principale.

---

## Contexte (rappel)

Les phases 1–5 ont introduit :

- [`scripts/lib/link-graph.mjs`](../../scripts/lib/link-graph.mjs) — scan complet des `.md` publiés, index inversé ;
- [`src/generated/link-graph.json`](../../src/generated/link-graph.json) — artefact consommé par [`PageBacklinks.astro`](../../src/components/PageBacklinks.astro) ;
- filtre publish identique au site ([`config/gitignore.mjs`](../../config/gitignore.mjs)).

À ~30 pages aujourd'hui, un scan complet est négligeable. Ce plan s'active quand le **prébuild devient perceptible** ou que le corpus dépasse ~500 pages.

---

## Phase 6 — Cache incrémental

### Objectif

Éviter de reparser l'intégralité du vault à chaque `npm run dev` ou `npm run build` quand seuls quelques fichiers ont changé.

### Tâches

1. **État de cache** — fichier [`.cache/link-graph-state.json`](../../.cache/link-graph-state.json) (gitignoré) :
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

   (exemple vault ZTH)

   - Au premier run (cache absent) : scan complet, écriture cache + JSON public.
   - Runs suivants : comparer mtime/hash par fichier publié ; reparser **uniquement** les fichiers modifiés, ajoutés ou supprimés.
2. **Fusion index** :
   - fichier **supprimé** ou **devenu non publié** : retirer ses arêtes sortantes et mettre à jour les listes `backlinks` des cibles ;
   - fichier **modifié** : recalculer ses arêtes sortantes, diff avec l'ancien état, patcher l'index inversé ;
   - fichier **nouveau** : ajouter arêtes normalement.
3. **CLI** :
   - `link-graph:build` — incrémental par défaut si cache présent ;
   - `link-graph:build --full` — force scan complet (CI propre, debug).
4. **Métriques** :
   - log durée totale et nombre de fichiers reparsés ;
   - documenter seuil recommandé dans README (ex. activer `--full` en CI si cache non restauré).
5. **Tests** :
   - fixture minimal-vault : build complet → modifier un seul `.md` → rebuild incrémental → backlinks mis à jour sans rescanner les autres.

### Déclencheur recommandé

| Taille vault | Action |
|--------------|--------|
| < ~500 pages | scan complet acceptable ; phase 6 optionnelle |
| ~500–2000 pages | implémenter cache incrémental |
| > ~2000 pages | cache + évaluer phase 7 parallélisation |

### Validation

- `predev` après édition d'une note : rebuild < 200 ms sur machine dev typique (ordre de grandeur, vault moyen).
- `npm test` : cas incrémental vert.
- CI : `link-graph:build --full` ou cache restauré entre jobs (documenter choix).

---

## Phase 7 — Intégrations optionnelles

### Objectif

Enrichir l'expérience éditoriale ou la navigation globale **sans remplacer** le graphe MD des phases 1–5.

### 7a — Plugin Obsidian metadata-extractor (debug local)

**But** : comparer localement « Obsidian dit X rétroliens » vs « le build dit Y ».

| Aspect | Détail |
|--------|--------|
| Plugin | [metadata-extractor](https://github.com/kometenstaub/metadata-extractor) exporte un JSON avec `links` et `backlinks` par fichier |
| Usage | export déclenché à la sauvegarde ou manuellement, chemin configurable |
| Règle | le build **ne consomme jamais** ce JSON en CI comme source unique |
| Filtre | script de diff local optionnel : intersection avec pages publiées (`gitignore`) |

**Documentation** : section README « Debug backlinks vs Obsidian » — procédure manuelle, pas de dépendance runtime.

**Pourquoi pas en source principale** : Obsidian indexe tout le vault (y compris `_private`, brouillons) ; le site a un périmètre publish strict. Deux sources = risque de divergence.

### 7b — starlight-site-graph (graphe visuel global)

**But** : navigation par graphe interactif en plus des listes de rétroliens.

| Aspect | Détail |
|--------|--------|
| Package | [starlight-site-graph](https://fevol.github.io/starlight-site-graph/getting-started/) |
| Composant | `<PageBacklinks />` natif du plugin |
| Coût | `prefetch: true`, schéma étendu, sitemap généré depuis HTML en prod |
| Relation | **complémentaire** au graphe MD — pas substitut pour wiki-links avant rendu |

**Évaluation avant adoption** :

1. Mesurer temps build avec plugin vs graphe MD seul.
2. Vérifier que les wiki-links (ex. vault ZTH : `[[00-lexique/ram|Titre]]`) deviennent bien des `<a href="/00-lexique/ram/">` dans le HTML dist (compatibles sitemap HTML).
3. Décider : graphe global UI oui/non ; rétroliens restent sur `PageBacklinks.astro` maison ou migration vers composant plugin.

**Verdict attendu** : garder le graphe MD pour les rétroliens (prévisible, testé) ; ajouter site-graph **seulement** si le graphe visuel est une priorité produit.

### 7c — Parallélisation (secours)

Si le cache incrémental ne suffit pas (> ~2000 pages, rebuild `--full` fréquent) :

- partitionner le walk vault par répertoire de premier niveau ;
- worker threads Node (`worker_threads`) pour extract + normalisation ;
- fusionner les arêtes dans le thread principal.

Non prioritaire tant que les métriques phase 6 restent sous le seuil documenté.

---

## Fin du plan 2

Ces phases sont **optionnelles** et **découplées** : la feature rétroliens est complète après le plan 1.

| Phase | Priorité | Quand |
|-------|----------|-------|
| 6 — Cache incrémental | Haute (plus tard) | prébuild > ~2 s ou > ~500 pages |
| 7a — metadata-extractor | Basse | debug auteur Obsidian |
| 7b — starlight-site-graph | Basse | besoin graphe visuel global |
| 7c — Workers | Très basse | cache insuffisant à grande échelle |

**Retour** : [plan 1 — phases 1 à 5](2026_06_01_14-00_main_link-graph-backlinks-phases-1-5.plan.md).

---

## Risques spécifiques phases 6–7

| Risque | Mitigation |
|--------|------------|
| Cache corrompu / stale | flag `--full` ; invalidation si version schéma cache change |
| CI sans cache persistant | toujours `--full` en CI ou artefact cache entre jobs |
| Double maintenance graphe MD + site-graph | site-graph UI only ; backlinks restent sur JSON MD |
| metadata-extractor inclut pages privées | diff script filtre publish ; jamais en pipeline prod |
