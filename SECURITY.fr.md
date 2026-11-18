# Sécurité

**Français** · [English](SECURITY.md)

Le moteur tourne sur votre machine, seulement au moment du build et du déploiement. Il lit votre vault, construit un
site statique (HTML, CSS, JavaScript, aucun code serveur) et l'envoie à votre hébergeur en FTPS ou en SFTP. Cette page
liste ce qui protège vos notes, vos identifiants et votre hébergement, où cela se trouve dans le code, et ce qui n'est
pas couvert.

## En un coup d'œil

| Risque | Ce qui l'empêche | Où |
|---|---|---|
| Une note privée se retrouve sur le web | `_private/`, le `README.md` à la racine du vault, `publish.exclude` et le `.gitignore` du vault sont exclus du build ; le déploiement n'envoie que `dist/` | [`config/publish.mjs`](config/publish.mjs), [`config/gitignore.mjs`](config/gitignore.mjs), [`config/loaders/vault-docs.mjs`](config/loaders/vault-docs.mjs) |
| Un fichier secret du dossier `public/` du vault est publié | Les fichiers cachés (`.env`…), les liens symboliques et les chemins exclus ne sont jamais copiés | [`config/vault-public.mjs`](config/vault-public.mjs) |
| Les identifiants de déploiement commités avec le code | Ils sont dans le `.env` du vault, ignoré par git ; le `.env` du moteur ne contient que des chemins de vaults | [`.gitignore`](.gitignore), [`.env.example`](.env.example) |
| Quelqu'un entre vous et l'hébergeur lit le mot de passe FTP | FTPS : TLS obligatoire, certificat vérifié (sauf si vous définissez `DEPLOY_FTPS_INSECURE=true`) | [`scripts/lib/deploy.mjs`](scripts/lib/deploy.mjs), `ftpsAccessOptions` |
| Quelqu'un se fait passer pour le serveur SFTP et reçoit le mot de passe | Avec `DEPLOY_HOST_FINGERPRINT`, un serveur qui présente une autre clé SSH est refusé avant l'envoi de tout identifiant ; sans elle, l'empreinte est affichée pour que vous puissiez l'épingler | [`scripts/lib/sftp-host-key.mjs`](scripts/lib/sftp-host-key.mjs) |
| Un manifeste distant trafiqué fait supprimer des fichiers hors du dossier du site | Un chemin du manifeste absolu, ou contenant `..`, `\` ou un caractère de contrôle, n'est jamais supprimé | [`scripts/lib/deploy-manifest.mjs`](scripts/lib/deploy-manifest.mjs), `isSafeManifestPath` |
| Le miroir supprime des fichiers gérés par l'hébergeur | Les fichiers cachés (`.htaccess`, `.well-known`…) et les entrées de `DEPLOY_PROTECT` (par défaut `cgi-bin`) ne sont jamais touchés ; en SFTP, le miroir refuse la racine du serveur | [`scripts/lib/deploy-paths.mjs`](scripts/lib/deploy-paths.mjs), `isProtectedRel` |
| Un message de commit ou un argument exécuté par un shell | `npm` est lancé avec une liste d'arguments, sans shell ; git de même | [`scripts/lib/npm-spawn.mjs`](scripts/lib/npm-spawn.mjs), [`scripts/publish.mjs`](scripts/publish.mjs) |
| Le mot de passe de la Basic Auth envoyé en clair | Avec `forceHttps`, les identifiants ne sont demandés qu'en HTTPS, après la redirection | [`scripts/lib/auth.mjs`](scripts/lib/auth.mjs) |
| `.htpasswd` téléchargé depuis le site | C'est un fichier caché, et le `.htaccess` généré interdit tout fichier `^\.ht` | [`scripts/lib/auth.mjs`](scripts/lib/auth.mjs) |
| Le mot de passe de la Basic Auth laissé sur le disque | `.htpasswd` et `.htaccess` sont envoyés depuis la mémoire | [`scripts/lib/auth.mjs`](scripts/lib/auth.mjs) |
| Un `.htaccess` public qui retire le mot de passe sans prévenir | `htaccess:install` refuse de s'exécuter tant que `AUTH_*` est défini | [`scripts/htaccess-install.mjs`](scripts/htaccess-install.mjs) |
| Un titre ou une description de page qui sort du bloc JSON-LD | `<` est échappé en `<` | [`config/seo.mjs`](config/seo.mjs) |
| Une définition du lexique qui contient du HTML | L'infobulle l'écrit avec `textContent`, jamais comme du HTML | [`src/components/LexiconTooltips.astro`](src/components/LexiconTooltips.astro) |
| Une dépendance ou une action de CI compromise | `npm ci --ignore-scripts` dans le CI, `GITHUB_TOKEN` en lecture seule, actions épinglées par SHA, Dependabot chaque semaine | [`.github/`](.github/) |

## Votre contenu

- **Le vault est de confiance.** Son Markdown est rendu tel que vous l'avez écrit, et les pages MDX exécutent du
  JavaScript au moment du build et peuvent embarquer des composants : ne construisez que des vaults de confiance, comme
  vous n'exécutez que du code de confiance.
- **Ce qui est exclu** n'entre jamais dans `dist/`, et le déploiement n'envoie rien d'autre. Avec le miroir activé (par
  défaut), une page publiée puis exclue est supprimée de l'hébergement au déploiement suivant ; avec `--no-mirror`, elle
  reste.
- **Les diagrammes Mermaid** sont rendus dans le navigateur du lecteur par Mermaid, qui nettoie leurs libellés avec
  DOMPurify.

## Vos identifiants

- **Les identifiants de déploiement** (`DEPLOY_*`) sont dans le `.env` du vault, qui doit rester ignoré par git.
  Préférez une clé SFTP ou un compte FTP limité au dossier du site.
- **Les identifiants de lecture de la Basic Auth** (`AUTH_*`) sont indépendants du compte FTP : un lecteur n'obtient
  jamais d'accès en écriture.
- **Le moteur affiche** l'hôte, l'utilisateur et le dossier cible, jamais un mot de passe.

## Ce qui quitte votre machine

- **Vers votre hébergeur** : les fichiers de `dist/`, le manifeste de déploiement (`.deploy-manifest.json` : noms de
  fichiers et empreintes SHA-256, plus la cible du déploiement) et, si vous le demandez, `.htaccess` et `.htpasswd`.
- **Vers GitHub**, seulement par `publish` : les commits du vault et du moteur, après votre choix à la question posée.
- **Rien d'autre** : ni télémétrie, ni compte, ni appel réseau pendant un build.

## Ce qui n'est pas couvert

- **La solidité de la Basic Auth.** `.htpasswd` utilise le format `$apr1$` d'Apache (MD5 salé), celui que tout Apache
  sait lire ; il résiste à un regard curieux, pas à une attaque hors ligne sur un fichier volé. Utilisez un mot de passe
  long et aléatoire, et gardez les notes vraiment confidentielles hors du site.
- **Le manifeste de déploiement est lisible si votre hébergeur sert les fichiers cachés.** Beaucoup les refusent
  (o2switch répond 403) ; si ce n'est pas le cas du vôtre, ajoutez une règle qui interdit `.deploy-manifest.json`. Il
  contient des noms de fichiers et des empreintes, aucun secret.
- **SFTP sans `DEPLOY_HOST_FINGERPRINT`** accepte la clé du serveur, comme un client SSH à la première connexion.
  Épinglez l'empreinte.
- **FTPS avec `DEPLOY_FTPS_INSECURE=true`** accepte n'importe quel certificat. Ne l'utilisez que si l'hébergeur présente
  un certificat au nom d'un autre domaine (hébergement mutualisé) et que vous faites confiance au réseau.
- **Votre hébergeur lui-même** : quiconque peut écrire dans le dossier du site peut modifier le site, le manifeste ou le
  `.htaccess`.
- **Les alertes connues des dépendances** encore sans correctif (`npm audit`) : elles concernent des outils du build qui
  lisent vos propres fichiers, pas le site publié.

## Signaler un problème

Ouvrez une issue sur le dépôt, ou écrivez à l'auteur via [damien.becherini.fr](https://damien.becherini.fr) pour ce que
vous préférez ne pas rendre public tout de suite.
