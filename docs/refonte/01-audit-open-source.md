# Plan de chantier — passer Mew de « SaaS » à « open source local-first »

**Repo** : `c:/Users/pauzzle/mew-mew-ai` · remote `https://github.com/Pauzzle-ozz/Mew-AI.git` · 146 fichiers suivis · branche `main`

---

## Comment lire ce plan

- **4 phases**, dans l'ordre : (0) ce qui bloque la publication → (1) ce qui rend l'usage local possible → (2) sécurité et propreté du code → (3) confort et finitions.
- **15 lots**. Un lot = une session de travail cohérente, un commit (ou une petite série de commits).
- **Effort** : `S` = moins d'1 h · `M` = 1 à 3 h · `L` = une demi-journée ou plus.
- Certains lots dépendent d'une **décision** que toi seul peux prendre : elles sont regroupées plus bas, à lire **avant** de commencer la phase 1.

**Règle d'or pour toute la durée du chantier** : après chaque lot, lance `cd frontend-v2 && npm run build` et démarre le backend. Si ça casse, tu sais quel lot en est la cause. Un commit par lot, jamais deux lots dans le même commit.

---

## Quick wins — faisables tout de suite, aucune décision requise

À faire dans l'heure, avant toute chose. Aucun ne casse quoi que ce soit.

| # | Action | Fichier | Pourquoi |
|---|--------|---------|----------|
| 1 | **Révoquer la clé API n8n** dans ton n8n local (Settings → n8n API → supprimer, régénérer) | — | Une fois révoquée, la clé qui traîne dans l'historique git devient un déchet inoffensif. 2 minutes. |
| 2 | Créer `LICENSE` (texte MIT, `Copyright (c) 2026 Pauzzle-ozz`) | `LICENSE` | Sans ce fichier, GitHub affiche « No license » et **personne n'a le droit légal** de forker ou réutiliser ton code, quoi que dise le README. |
| 3 | Corriger l'URL de clone du README | `README.md:35-36` (`Mew-mew-Ai` → `Mew-AI`) | La toute première commande du README renvoie une 404. |
| 4 | Corriger la casse de CLAUDE.md : `git mv claude.md CLAUDE.tmp.md` puis `git mv CLAUDE.tmp.md CLAUDE.md` | racine | Git a enregistré `claude.md` en minuscules (vérifié). Sur Linux/macOS, Claude Code ne le trouvera pas. |
| 5 | Faire écouter le backend sur la loopback : `app.listen(PORT, process.env.HOST \|\| '127.0.0.1', ...)` | `backend/src/server.js:87` | Aujourd'hui le serveur écoute sur **toutes** les interfaces réseau alors qu'il n'a aucune authentification. Une ligne, énorme gain. |
| 6 | Corriger `focus:ring-1 focus:ring-1` (classe dupliquée) | `frontend-v2/components/matcher/CandidateProfileForm.jsx:260` | Coquille visible dans un repo public. |
| 7 | Ajouter `.claude/settings.local.json` et `.skills/` au `.gitignore` + `git rm --cached` | `.gitignore` | Tes permissions perso et 665 Ko de prompts personnels sont actuellement imposés à tout le monde. |

---

## Les 5 décisions à trancher

Ces choix conditionnent une grande partie du travail. Réponds-y **avant** d'attaquer la phase 1.

### Décision 1 — Réécrire l'historique git ?

Une clé API n8n en clair est présente dans le commit `e602201` (`.Consultant/.mcp.json:9` et `workflow3-import.ps1:13`), déjà poussé sur GitHub. Le dossier a été supprimé, mais **supprimer un fichier ne l'efface pas de l'historique**.

| Option | Conséquence |
|---|---|
| **A. Repartir d'un historique neuf** (`rm -rf .git && git init && commit unique`, force-push) | Tu perds les 52 commits, mais tu effaces d'un coup : la clé n8n, les 61 fichiers `.skills/`, `settings.local.json` et le problème de casse. Simple pour un débutant. |
| B. `git filter-repo --path .Consultant --invert-paths` | Garde l'historique, mais outil externe à installer, et ne règle que la clé. |
| C. Ne rien faire (clé révoquée) | Fonctionne techniquement, mais tout le passé du projet reste public : `.Consultant`, `.skills`, les chemins de ta machine. |

> **Ma recommandation : A**, et faire une copie de sauvegarde du dossier avant (`cp -r . ../mew-backup`). L'historique de 52 commits d'un projet en pivot permanent n'a aucune valeur pour un contributeur ; un premier commit propre en a une. Fais-le **après** la phase 0, pour que le commit initial contienne déjà LICENSE, `.gitignore` correct et `.gitattributes`.

### Décision 2 — Authentification et stockage : cloud, local, ou les deux ?

Aujourd'hui : Supabase est **obligatoire au démarrage** (`server.js:11-17`, `process.exit(1)`), et pourtant il ne sécurise rien — le backend utilise la clé `service_role` qui contourne la Row Level Security, et **aucune route ne vérifie de jeton** (vérifié : 0 occurrence de `auth.getUser` côté backend). L'`userId` arrive en clair dans le body. Usage réel : 2 tables, 8 requêtes, aucune jointure.

| Option | Conséquence |
|---|---|
| **A. Mono-utilisateur local** : suppression de l'auth, stockage fichier JSON ou SQLite | Zéro compte à créer, zéro clé, installation en 3 commandes. La faille d'accès aux données d'autrui **disparaît d'elle-même** (il n'y a plus d'autre utilisateur). Travail : réécrire 8 requêtes + supprimer `userId` partout. |
| B. Garder Supabase et ajouter un vrai middleware d'authentification | Permet un déploiement multi-utilisateur, mais impose un compte cloud à chaque personne qui clone. ~2 h de travail supplémentaire. |
| **C. Les deux, via un adaptateur** (`STORAGE_DRIVER=json` par défaut, `supabase` en option) | Le meilleur des deux, mais deux implémentations à maintenir. |

> **Ma recommandation : A d'abord, C ensuite si l'envie vient.** Ton objectif écrit est « tourne en local sur la machine de n'importe qui ». Un adaptateur JSON (`backend/data/mew.json`) demande zéro dépendance à installer et zéro configuration. SQLite (`better-sqlite3`) est plus solide, mais ajoute une dépendance qui se compile — commence par JSON. **Ne choisis surtout pas « garder Supabase sans middleware d'auth »** : c'est l'état actuel, et il est indéfendable dans un repo public.

### Décision 3 — Supporter les modèles locaux (Ollama, LM Studio) ?

`aiService.js:9-12` crée le client OpenAI **sans `baseURL`** : tout part vers `api.openai.com`. Et 28 noms de modèles (`gpt-4o`, `gpt-4.1-mini`) sont écrits en dur dans 6 fichiers.

| Option | Conséquence |
|---|---|
| **A. Oui** : `OPENAI_BASE_URL` configurable + modèles par « rôle » | Le projet devient utilisable **gratuitement et sans aucun compte**. C'est l'argument produit le plus fort pour un outil qui lit des CV (données personnelles). Travail : `S` pour le `baseURL`, `M` pour les 28 remplacements. |
| B. Non, OpenAI uniquement | Reste dépendant d'un service payant. Un « open source local-first » qui exige une carte bancaire, ça se remarque. |

> **Ma recommandation : A.** C'est le meilleur rapport effort/impact de tout le chantier. Prévois aussi une limite de taille de texte (`AI_MAX_INPUT_CHARS`) : un modèle 8B a une fenêtre bien plus petite que GPT-4o, et aujourd'hui **rien ne borne le texte des CV** envoyé au modèle.

### Décision 4 — Que fait-on du scraping des job boards ?

Le code scrape le HTML de 4 sites (WTTJ, Indeed, HelloWork, APEC) avec un User-Agent qui **imite Chrome** (`jobDiscoveryService.js:7`), sans jamais lire `robots.txt` (0 occurrence dans tout le backend). France Travail, lui, passe par une API officielle avec OAuth2 — c'est propre.

| Option | Conséquence |
|---|---|
| A. Laisser tel quel | Dans un repo public à ton nom, tu assumes publiquement du scraping potentiellement contraire aux CGU de ces sites. |
| **B. Désactivé par défaut** (`SCRAPING_ENABLED=false`), France Travail seul actif, `docs/SCRAPING.md` qui explique | Le mode Découverte reste fonctionnel via l'API officielle. Celui qui active le scraping le fait en connaissance de cause. |
| C. Supprimer les 4 scrapers | Le plus sûr juridiquement, mais tu perds une fonctionnalité et ~320 lignes. |

> **Ma recommandation : B.** Ça règle aussi un problème technique : le mode Découverte peut aujourd'hui lancer **jusqu'à 12 navigateurs Chromium en parallèle** (3 métiers × 4 sources), soit 2 à 4 Go de RAM d'un coup.

### Décision 5 — Périmètre du repo public

Trois questions liées, réponds-y en une fois :

- **`.skills/`** : 61 fichiers, 665 Ko, **17 283 lignes** — plus que ton code source (9 828 lignes). Contenu périmé (portfolio, fiscalité, n8n, génération PDF, « Quand tu (Pauzzle) me demandes de : »). → **Recommandation : sortir du repo** (`git rm -r --cached .skills` + gitignore). Le dossier reste sur ton disque, Claude continue de le lire.
- **`frontend-v2/`** : le suffixe `-v2` laisse croire qu'il existe une v1 (il n'y en a pas, vérifié). 20 références à mettre à jour, **aucun import à corriger** (l'alias `@/` protège tout). → **Recommandation : renommer en `frontend`**, mais **avant** d'écrire le `package.json` racine et la CI, sinon tu écris `frontend-v2` dans des fichiers tout neufs.
- **Nom du dépôt** : le README dit `Mew-mew-Ai`, le remote dit `Mew-AI`, CLAUDE.md dit `Mew-mew-Ai`. → **Recommandation : produit = « Mew », dépôt = `Mew-AI`**, et une seule chaîne partout.

---

# PHASE 0 — Débloquer la publication publique

*Objectif : que le repo puisse être rendu public sans risque juridique ni fuite, et qu'un inconnu puisse l'installer.*

## Lot 1 — Nettoyage et hygiène du dépôt

**Effort : M** · dépend de la **Décision 1** et de la **Décision 5**

**Fichiers** : `.gitignore`, `.gitattributes` (à créer), `.claude/settings.local.json`, `.skills/`, `claude.md` → `CLAUDE.md`

**Ce qu'on fait :**
1. Révoquer la clé n8n (quick win 1), puis appliquer la décision 1 sur l'historique.
2. Réécrire `.gitignore` avec des **motifs** au lieu de chemins figés. Le fichier actuel liste `backend/src/.env` et `frontend-v2/.env.local` en dur : `.env.local`, `.env.production`, `backend/.env.local` et 10 autres chemins **ne sont pas ignorés** (testé avec `git check-ignore`). Points clés : `.env.*` + `!.env.example` (sinon tes modèles de config deviennent invisibles pour git), `*.pdf` et `uploads/` (c'est une app de CV : évite de publier ton CV perso), `.claude/settings.local.json`, `.vscode/`, `.idea/`, `coverage/`, `desktop.ini`.
3. Créer `.gitattributes` (`* text=auto eol=lf`, `*.ps1 text eol=crlf`, `*.pdf binary`). Tu développes sous Windows (CRLF) pour des contributeurs Linux/macOS (LF), sans normalisation aujourd'hui.
4. `git rm --cached .claude/settings.local.json` et `.skills/` (décision 5). Garder `.claude/settings.json`, mais n'y mettre que des permissions non destructrices (`git status`, `git diff`, `npm run lint`) — jamais `git push` ni `git commit`.
5. Renommer `frontend-v2` → `frontend` (décision 5) : `git mv`, puis remplacer la chaîne dans `.gitignore` (l.3, 9), `README.md` (l.42, 61, 133, 171), `CLAUDE.md` (l.20, 36, 62-64, 70), `frontend/package.json:2`.

**Pourquoi ça compte** : c'est le socle. Tant que le `.gitignore` est troué, chaque `git add .` est une prise de risque — et un `.env` avec ta clé OpenAI committé, c'est une facture surprise.

**Vérification** : `git check-ignore -v .env.local frontend/.env.production.local mon-cv.pdf` doit trouver une règle pour chacun ; `git check-ignore backend/.env.example` ne doit **rien** afficher.

## Lot 2 — Identité et licence du projet

**Effort : S**

**Fichiers** : `LICENSE`, `backend/package.json`, `frontend/package.json`, `.nvmrc`, `README.md`

**Ce qu'on fait :**
- Créer `LICENSE` (MIT, 2026, Pauzzle-ozz) — quick win 2.
- `backend/package.json` : `"name": "mew-backend"`, `"description"` remplie, `"main": "src/server.js"` (aujourd'hui `index.js`, **fichier qui n'existe pas**), `"license": "MIT"` (aujourd'hui `ISC`, en contradiction avec le README), `"author"`, `"repository"`, `"keywords"`, `"engines": { "node": ">=20.9.0" }`, `"private": true`.
- `frontend/package.json` : `"name": "mew-frontend"`, `"description"`, `"license": "MIT"`, `"engines"`. Garder `"private": true`.
- Créer `.nvmrc` (une ligne : `22`). Le README dit « Node 20+ » alors que Next 16.1.6 exige **20.9.0** minimum : quelqu'un sous 20.5 installe sans avertissement et se prend l'erreur au build.

**Pourquoi ça compte** : trois fichiers déclarent trois licences différentes. Sans `LICENSE`, ton projet est juridiquement « tous droits réservés » — l'exact contraire de ton objectif.

## Lot 3 — Une documentation qui permet vraiment d'installer

**Effort : M**

**Fichiers** : `backend/.env.example` et `frontend/.env.example` (à créer), `README.md`, `backend/README.md` (à créer), `frontend/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/bug.md`

**Ce qu'on fait :**
1. **Créer les deux `.env.example`** (aucun n'existe : vérifié, `git ls-files | grep env` est vide). 12 variables sont lues par le code, dont **2 documentées nulle part** : `FRONTEND_URL` (qui pilote l'origine CORS, `server.js:34`) et `NODE_ENV` (12 occurrences dans les routes). Commenter chaque variable en français, séparer « obligatoire » et « optionnel ». Dans le fichier frontend, mettre un avertissement en tête : **toute variable `NEXT_PUBLIC_*` part dans le navigateur, n'y mets jamais la clé `service_role`**.
2. **`NODE_ENV` est du code mort** : `npm i -D cross-env` et `"dev": "cross-env NODE_ENV=development nodemon src/server.js"`. Sinon les 12 blocs `details: error.message` ne s'activent jamais.
3. **README — corriger 5 mensonges par omission** :
   - Prérequis : ajouter **« ~2 Go d'espace disque, `npm install` télécharge Chromium »** (mesuré : **1,3 Go** dans `~/.cache/puppeteer`) + un bloc repliable avec les libs système Linux. L'info existe… mais dans `CLAUDE.md:85`, écrit pour l'IA, pas pour les humains.
   - Le tableau API masque **7 routes** derrière deux lignes « CRUD » — et 3 d'entre elles attendent le `userId` **dans le body**, chemin indevinable. Les lister explicitement.
   - Le mode Découverte propose **5 sources** (Indeed, HelloWork, APEC en plus), le README en annonce 2.
   - Resend : dire clairement que `onboarding@resend.dev` n'écrit **qu'au titulaire du compte**, donc l'envoi à un vrai recruteur échoue tant qu'un domaine n'est pas vérifié.
   - Le rate limit annoncé « toutes les routes IA » ne couvre en réalité ni `/api/applications` ni `/api/historique`.
4. **`CONTRIBUTING.md`** : tes conventions existent déjà (CLAUDE.md:55-78) mais sont enfermées dans le fichier destiné à l'IA. Sortir : checklist avant PR (`npm run lint`, `npm run build`), format des commits, « jamais de `fetch` direct dans une page, tout passe par `lib/api/` », et un tableau **« je veux changer X → je vais dans Y »**.
5. **`SECURITY.md`** (10 lignes) : où signaler une faille, et le rappel que `SUPABASE_SERVICE_KEY` contourne la RLS.
6. `backend/README.md` (absent) et compléter `frontend/README.md` qui oublie l'étape `.env.local`.

**Pourquoi ça compte** : aujourd'hui, un inconnu qui clone échoue à la **première commande** (URL 404), puis découvre 12 variables à deviner, puis attend 5 minutes un téléchargement de 1,3 Go que rien n'annonçait.

---

# PHASE 1 — Rendre l'usage local réellement possible

*Objectif : `git clone` → `npm install` → `npm run dev` → ça marche, sans créer un seul compte.*

## Lot 4 — Le backend démarre toujours, et dit ce qui lui manque

**Effort : M** · ⚠️ **bloquant : rien ne fonctionne aujourd'hui sans les 4 clés**

**Fichiers** : `backend/src/services/emailService.js`, `aiService.js`, `lib/supabaseClient.js`, `server.js`, `backend/src/config/index.js` (à créer)

**Le problème, reproduit en exécutant le code** : sans `RESEND_API_KEY`, le backend **crashe au démarrage** avec `Missing API key. Pass it to the constructor new Resend("re_123")` — un message qui ne mentionne ni Mew, ni le fichier `.env`. La chaîne : `server.js:23` → `routes/candidatureSpontanee.js:5` → `candidatureSpontaneeService.js:3` → `emailService.js:64` (`module.exports = new EmailService()`) → le constructeur ligne 22 instancie Resend. Résultat : **aucun des 5 outils ne fonctionne** à cause d'une dépendance dont 4 outils n'ont aucun besoin. Et `RESEND_API_KEY` n'est même pas dans la liste des variables requises (`server.js:11`), donc ton joli message d'erreur en français ne s'affiche jamais.

**Ce qu'on fait :**
1. **Règle à retenir : ne jamais créer un client externe au chargement d'un fichier, seulement au moment de s'en servir.** Rendre les 3 clients « paresseux » (Resend, OpenAI, Supabase) : constructeur vide + une méthode `_client()` qui instancie à la première utilisation et lève une erreur explicite en français si la clé manque.
2. `dotenv.config({ path: path.join(__dirname, '..', '.env') })` au lieu de `'./src/.env'`. Aujourd'hui le chemin est relatif au **dossier de lancement** : `node backend/src/server.js` depuis la racine affiche « Variables manquantes » alors que le `.env` existe. Retirer `override: true` pour permettre `PORT=5001 npm run dev`. Déplacer le fichier en `backend/.env` (il n'est pas versionné, un `mv` suffit) — **quand la doc doit prévenir contre son propre code (« attention : dans `src/`, pas à la racine »), c'est le code qu'il faut changer**.
3. Créer `backend/src/config/index.js` qui expose un objet `capacites` (`ia`, `stockage`, `envoiEmail`, `scraping`, `franceTravail`), et une route `GET /api/capacites`.
4. Au démarrage, un récapitulatif honnête : `[Mew] IA : OpenAI | Stockage : fichier local | Envoi email : désactivé`, plus un avertissement « les 4 autres outils fonctionnent normalement ».
5. Supprimer les 3 lignes des « Pièges connus » de CLAUDE.md qui deviennent fausses.

**Pourquoi ça compte** : c'est **le** bloqueur numéro un. Un contributeur qui clone et voit une stack Resend abandonne dans les 2 minutes.

## Lot 5 — Le frontend démarre sans compte, et parle français quand ça rate

**Effort : M** · dépend de la **Décision 2**

**Fichiers** : `frontend/lib/supabase.js`, `lib/auth/` (à créer), `hooks/useAuth.js`, `lib/api/client.js` (à créer) + les 5 clients, `app/dashboard/page.js`, `components/shared/Header.jsx`

**Ce qu'on fait :**
1. `lib/supabase.js` fait 8 lignes et appelle `createClient(url, key)` **au niveau module** : sans `.env.local`, ça lève `supabaseUrl is required.` et **9 fichiers** l'importent, dont les 5 pages d'outils. Résultat : l'écran d'erreur générique de `ErrorBoundary.jsx`, sans indice. → transformer en `getSupabase()` paresseuse + exporter `supabaseConfigured`.
2. Couche d'auth à deux modes (`NEXT_PUBLIC_AUTH_MODE`, défaut `local`) : en mode local, `getUser()` renvoie un identifiant persisté dans `localStorage` — l'historique et le suivi de candidatures continuent de fonctionner **sans compte**. Aujourd'hui `useAuth.js:23-24` redirige vers `/login` dès qu'il n'y a pas d'utilisateur, et `/` redirige vers `/dashboard` : la **première chose visible** après `npm run dev` est un formulaire de connexion.
3. Attention : `dashboard/page.js:23-30` refait sa **propre** vérification sans passer par `useAuth` — il y a deux endroits à traiter, pas un.
4. Créer `lib/api/client.js` avec un `apiFetch()` unique :
   - `NEXT_PUBLIC_API_URL || 'http://localhost:5000'` — aujourd'hui **aucun des 5 clients n'a de repli**, la variable absente produit des appels vers `undefined/api/...` qui échouent **en silence**.
   - Backend éteint → « Impossible de joindre le serveur. Vérifiez qu'il tourne : `cd backend && npm run dev` » au lieu du `Failed to fetch` brut affiché aujourd'hui.
   - 401 → « Clé OpenAI refusée, vérifiez `OPENAI_API_KEY` » (le backend ne traite que le 429 aujourd'hui : 0 occurrence de `status === 401`).
   - `.json().catch(...)` systématique : 3 clients sur 5 ne protègent pas leur parsing et affichent `Unexpected token '<'` à l'utilisateur.

**Pourquoi ça compte** : c'est la moitié frontend du lot 4. Les deux ensemble transforment « ça crashe » en « ça marche, et si un truc manque, ça me dit lequel ».

## Lot 6 — Stockage local, sans compte cloud

**Effort : L** · dépend de la **Décision 2**

**Fichiers** : `backend/src/storage/` (à créer), `services/applicationService.js`, `services/historyService.js`, `routes/applications.js`, `routes/history.js`, `routes/candidatureSpontanee.js`

**Ce qu'on fait :**
1. **D'abord un petit nettoyage préalable** : `routes/candidatureSpontanee.js:82-88` contient une requête Supabase écrite **en plein milieu d'un handler**, seule requête du projet hors couche service. La déplacer dans un `applicationService.getById(id, userId)`. Ça garantit qu'il n'y aura ensuite **qu'un seul endroit** à migrer.
2. Créer `backend/src/storage/index.js` qui choisit un adaptateur selon `STORAGE_DRIVER` (défaut `json`), avec `jsonAdapter.js` (lit/écrit `backend/data/mew.json`, ids via `crypto.randomUUID()`, **zéro dépendance**) et éventuellement `supabaseAdapter.js` qui reçoit le code actuel tel quel.
3. Les deux services importent `require('../storage')` au lieu de `supabaseClient`. Interface commune : `applications.create/getByUser/getById/update/delete`, `history.save/list/delete`.
4. Ajouter `backend/data/` au `.gitignore`.
5. Retirer `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` des variables obligatoires (`server.js:11`).

**Pourquoi ça compte** : pour tester **l'analyseur de CV**, qui n'a aucun besoin de base de données (`cvService.js` n'importe même pas Supabase), un contributeur doit aujourd'hui créer un compte, un projet, copier 2 clés et exécuter 45 lignes de SQL. Le fichier `mew.json` est en plus la bonne réponse RGPD : l'utilisateur peut le sauvegarder et le supprimer lui-même.

## Lot 7 — L'IA configurable (et Ollama si tu veux)

**Effort : M** · dépend de la **Décision 3**

**Fichiers** : `backend/src/config/ai.js` (à créer), `services/aiService.js`, `matcherService.js`, `cvService.js`, `candidatureSpontaneeService.js`, `jobDiscoveryService.js`, `prompts/helpers.js`, `middleware/rateLimiter.js`

**Ce qu'on fait :**
1. `config/ai.js` centralise : `baseURL` (`OPENAI_BASE_URL`, `undefined` = OpenAI officiel), `apiKey` (défaut `'local'` — Ollama ignore la valeur mais **le SDK exige qu'elle soit non vide**, vérifié), `timeoutMs`, et 3 modèles par **rôle** : `creatif`, `analyse`, `json`.
2. **Passer d'un nom de modèle à un rôle** : `{ model: 'gpt-4o', temperature: 0.7 }` → `{ role: 'creatif', temperature: 0.7 }`. Il y a **28 occurrences** dans 6 fichiers. Vérification finale : `grep -rn "gpt-4" backend/src` ne doit plus renvoyer que `config/ai.js`.
3. **Borner le texte envoyé au modèle** : ajouter `tronquer(texte, max)` dans `prompts/helpers.js` et l'appliquer aux 4 entrées non bornées (`routes/solutions.js:81` et `:131`, `routes/matcher.js:260`, `candidatureSpontaneeService.js:23`). Aujourd'hui **rien** ne limite le texte d'un CV — invisible avec GPT-4o (128k de contexte), fatal avec un modèle local 8B.
4. **Rate limiter** : `rateLimiter.js:7` fige `max: 20` par 15 min, avec le commentaire « protection crédits OpenAI ». En local, l'utilisateur paie sa propre clé et se bride lui-même — le mode Découverte épuise le quota en quelques actions. → `Number(process.env.AI_RATE_LIMIT_MAX ?? 200)`, avec `0` = désactivé, et un message qui précise « limite locale, pas une limite d'OpenAI ».
5. Documenter dans le README une section « 100 % local avec Ollama ».

**Pourquoi ça compte** : c'est ce qui fait passer le projet de « open source mais il faut payer OpenAI » à « gratuit, et ton CV ne quitte jamais ta machine ». C'est l'argument produit qui vaut le plus.

## Lot 8 — Rendre le scraping optionnel et non ruineux

**Effort : M** · dépend de la **Décision 4**

**Fichiers** : `backend/package.json`, `services/jobDiscoveryService.js`, `services/scraperService.js`, `routes/matcher.js`, `docs/SCRAPING.md` (à créer)

**Ce qu'on fait :**
1. Déplacer `puppeteer` de `dependencies` vers `optionalDependencies`, documenter `PUPPETEER_SKIP_DOWNLOAD=true npm install` comme installation légère par défaut (**1,3 Go** en moins).
2. Remplacer les `require('puppeteer')` en tête de fichier par un `chargerPuppeteer()` en try/catch. Si Chromium est absent : log une fois, les scrapers retournent `[]`, le reste marche. (`scraperService` a déjà un repli axios propre ; `jobDiscoveryService` n'en a **aucun**.)
3. **Un seul navigateur, plusieurs onglets** : `_launchBrowser()` est appelé dans chacun des 4 scrapers, et 3 métiers × 4 sources tournent en parallèle → **jusqu'à 12 Chromium simultanés**, 2 à 4 Go de RAM. Remplacer par un `_getBrowser()` mutualisé + `page.close()` au lieu de `browser.close()`, et limiter la concurrence à 2 par lot.
4. `SCRAPING_ENABLED=false` par défaut, source par défaut `['france_travail']` (la seule qui marche sans Chromium, via API officielle).
5. `docs/SCRAPING.md` : ce que fait le code, pourquoi c'est désactivé par défaut, et que celui qui l'active vérifie les CGU. Même avertissement en 3 lignes dans le README.
6. Détail : `headless: 'new'` (l.98) n'est plus une valeur documentée par Puppeteer — écrire `headless: true`.

**Pourquoi ça compte** : un `npm install` de 1,3 Go non annoncé fait fuir. Et « mon PC a freezé en cliquant sur Découvrir » est le pire premier contact possible.

---

# PHASE 2 — Sécurité et qualité du code backend

## Lot 9 — Les deux trous de sécurité réels

**Effort : L** · le SSRF ne dépend d'aucune décision, l'accès aux données dépend de la **Décision 2**

**Fichiers** : `backend/src/services/scraperService.js`, `routes/matcher.js`, `middleware/auth.js` (option B), `lib/logger.js` (à créer), et les 7 lignes de logs listées ci-dessous

**A. SSRF — reproduit en local, ça marche** : un serveur test lancé sur `127.0.0.1:9911` a bien été lu par `scrapeOffer('http://127.0.0.1:9911/admin')`, contenu renvoyé au client. `validateUrl` (l.27-40) ne vérifie **que le protocole**. Un utilisateur peut donc faire lire à ton serveur : `http://localhost:5000/api/historique/<uuid>`, `http://192.168.1.1/` (ta box), `http://169.254.169.254/latest/meta-data/` (métadonnées cloud).
→ Ajouter `verifierCibleAutorisee(url)` : résolution DNS + rejet des plages privées (`127.*`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `::1`, `fc/fd/fe80`). Passer `maxRedirects: 0` et revalider chaque `Location` — sinon un site distant renvoie un 302 vers une IP privée qu'axios suivra. Nouveau code d'erreur `URL_INTERDITE` → 422 côté route.
*(SSRF = Server-Side Request Forgery : l'attaquant ne peut pas atteindre ton réseau, alors il demande à ton serveur de le faire à sa place.)*

**B. Accès aux données** : réglé automatiquement par l'option A de la décision 2. Si tu choisis B (garder Supabase), créer `middleware/auth.js` qui lit `Authorization: Bearer <token>`, appelle `auth.getUser(token)`, pose `req.userId`, et remplacer **partout** `req.body.userId` / `req.params.userId` par `req.userId`. Côté frontend : ajouter l'en-tête dans les 5 clients de `lib/api/` — c'est justement parce que ce dossier centralise tout que ça reste faisable.
> **Règle à retenir : une donnée envoyée par le client ne prouve jamais son identité. Seul un jeton signé, vérifié côté serveur, le fait.**

**C. Logs et données personnelles** : 113 appels `console.*`, dont 7 qui journalisent des données identifiantes — `emailService.js:29` écrit **l'adresse email du recruteur** (une personne tierce), `routes/matcher.js:43` et `:174` et `:470`, `matcherService.js:282`, `cvService.js:32` écrivent prénom et nom. Bon point : le **texte des CV n'est jamais journalisé** (vérifié).
→ Créer `lib/logger.js` (4 niveaux, `LOG_LEVEL`, zéro dépendance) et remplacer ces 7 lignes par des logs non identifiants. Puis écrire dans le README, section « Vie privée » : « Mew ne journalise aucune donnée personnelle. Ton CV est lu en mémoire, envoyé au modèle, puis oublié. » — **le code doit rendre cette phrase vraie**.

## Lot 10 — Hygiène du code backend

**Effort : L** (peut se découper en 3 sessions)

**Fichiers** : `lib/reponses.js`, `middleware/uploadPdf.js`, `services/pdfService.js`, `lib/modeles.js` (tous à créer), + les 5 routes et 6 services

**Ce qu'on fait, par ordre de rendement :**

1. **Gestion d'erreurs** (`M`) — 4 problèmes, une seule correction : `history.js:24/45/66` renvoient le message brut de Supabase au client (noms de tables et de contraintes exposés) ; **11 blocs `error.status === 429` copiés-collés** avec le message recopié à la main (accentué dans 2 fichiers, pas dans le 3e) ; **12 blocs `NODE_ENV === 'development'` qui sont du code mort** ; `solutions.js:36/72/115` renvoient `{ error }` sans `success: false` contrairement aux 40 autres réponses. → un `lib/reponses.js` avec `erreurClient()` et `erreurServeur()`, chaque catch tient en une ligne. Note : écrire `NODE_ENV !== 'production'` (vrai par défaut) et non `=== 'development'` — c'est le bon réglage pour un outil qui tourne chez l'utilisateur.

2. **Multer et lecture PDF** (`S`) — la config multer est écrite 3 fois, avec **deux limites différentes** (2 Mo et 5 Mo) et des accents incohérents, et `server.js:75` détecte l'erreur avec `err.message.includes('PDF')` — ça ne tient que par chance. → un `middleware/uploadPdf.js` unique + un code d'erreur au lieu d'une chaîne. Le bloc « CV illisible » est écrit **5 fois** → un `services/pdfService.js` avec `lireCV(buffer)`.

3. **Duplication des workflows** (`L`) — `matcherService.js` a **6 méthodes pour 3 comportements** (`generateXWorkflow` vs `scraperXWorkflow`, identiques à la construction du prompt près). **La divergence est déjà là** : `matcherCvPersonnalise.js:32` dit « Garder les données exactes (prénom, nom, email, téléphone) » et `scraperCvPersonnalise.js:43` dit seulement « Garder les données exactes » — les deux modes ne donnent déjà plus les mêmes consignes au modèle, sans que ce soit voulu. → constantes partagées dans `prompts/helpers.js` + une méthode `genererDocuments({ mode, ... })`. Même traitement pour `cvService.analyzeCV`/`analyzePDF`, identiques à 2 lignes près.

4. **Les 4 scrapers de job boards** (`L`) — 320 lignes pour ~90 utiles, mêmes 10 étapes, tables de contrats dupliquées 3 fois avec des valeurs différentes. → un `_scrapeJobBoard({ url, selecteurAttente, extraire })` + un fichier par source dans `services/jobBoards/`. **Ajouter une source devient : ajouter un fichier** — le point d'entrée idéal pour un premier contributeur, à documenter dans le CONTRIBUTING.

5. **Format d'offre unique** (`M`) — deux formats coexistent : clés anglaises (`scraperService`) et françaises (`jobDiscoveryService`), et `matcherService.js:286-313` contient les deux à **deux lignes d'écart**. Ce n'est pas un bug actif (la traduction est faite dans `OfferDiscovery.jsx:163-169`, côté frontend, non documentée) mais c'est un piège pour le prochain contributeur. → `lib/modeles.js` avec `normaliserOffre()`, format français partout.

6. **Code mort et commentaires faux** (`S`) — `userId` déclaré mais jamais utilisé dans `cvService.analyzePDF` et `optimizeCVPdf`, transmis depuis le frontend pour rien ; `motsCles` déclaré et passé mais jamais lu dans `jobDiscoveryService` ; **8 références à n8n**, dont `scraperService.js:197` qui affirme « L'extraction réelle est faite par les workflows n8n » — c'est **faux**, c'est OpenAI. ⚠️ Ne PAS toucher à `jobDiscoveryService.js:236` (`motsCles: titrePoste`), c'est un paramètre de l'API France Travail, homonyme piégeux.
> **Dans un repo public, un commentaire faux coûte plus cher qu'une absence de commentaire : il envoie activement le lecteur sur une fausse piste.**

## Lot 11 — Premiers tests et intégration continue

**Effort : M**

**Fichiers** : `backend/test/`, `backend/package.json`, `.github/workflows/ci.yml`

**Ce qu'on fait** : `node --test` (intégré à Node, **zéro dépendance à installer**), 4 tests dans cet ordre de rentabilité :
1. `cvService.normalizeCategorie` — fonction pure, 10 lignes, aucun mock. **5 minutes, parfait pour se lancer.**
2. **Le filtre anti-SSRF** — à écrire *en même temps* que le lot 9, sinon la faille reviendra à la première refonte.
3. `extractTextFromHtml` et `basicParse` (~90 lignes de regex enchaînées, la zone la plus fragile du backend), avec une vraie page d'offre sauvegardée en fixture.
4. Le retry JSON de `aiService` (il double silencieusement le coût des appels et n'a jamais été vérifié) — nécessite de rendre le client injectable.

Puis `.github/workflows/ci.yml` (le dossier `.github/` n'existe pas) : lint + build du frontend + tests du backend sur chaque PR. Deux pièges connus : `PUPPETEER_SKIP_DOWNLOAD=true` (sinon 1,3 Go à chaque run) et des valeurs Supabase **factices** en variables d'env (sinon `next build` échoue, car `supabase.js` instancie le client au chargement).

**Pourquoi ça compte** : c'est ce qui te permettra d'accepter une contribution sans devoir tout relire toi-même.

---

# PHASE 3 — Confort, accessibilité, finitions

## Lot 12 — Accessibilité : rendre les outils utilisables au clavier

**Effort : M** · **le plus important de la phase 3**

**Fichiers** : `components/shared/PdfDropzone.jsx` (à créer), les 6 zones d'upload, `components/cv/AnalyzerForm.jsx`, `components/shared/ToolHistory.jsx`, `lib/utils/fileHelpers.js`

**Le constat** : les 6 zones de dépôt de PDF sont des `<div onClick>` et les 6 `<input type="file">` portent `className="hidden"` (= retiré de l'ordre de tabulation). Recherche de `tabIndex` ou `role="button"` dans tout le frontend : **0 résultat**. Conséquence : **une personne qui navigue au clavier ne peut déposer aucun CV — les 5 outils lui sont inaccessibles.**

**Ce qu'on fait :**
1. Un `PdfDropzone.jsx` partagé avec `role="button"`, `tabIndex={0}`, gestion d'Entrée/Espace. **Point clé : remplacer `className="hidden"` par `className="sr-only"` suffit déjà** à rendre l'input atteignable au clavier tout en le gardant invisible.
2. Y centraliser la validation (aujourd'hui divergente : `CandidateProfileForm.jsx:80-82` rejette un fichier **en silence**, l'utilisateur clique et rien ne se passe) et remonter `err.message` avec `role="alert"`.
3. **35 balises `<label>` sur 39 ne sont pas reliées à leur champ** (pas de `htmlFor`) et `AnalyzerForm.jsx` a 11 champs et **0 label** — un lecteur d'écran annonce « champ de saisie » sans dire lequel.
4. La modale d'historique (`ToolHistory.jsx:47`) n'a ni `role="dialog"`, ni `aria-modal`, ni fermeture par Échap, et ses boutons ✕ et 🗑 n'ont pas d'`aria-label`.

**Pourquoi ça compte** : un outil de recherche d'emploi inutilisable par une partie des chercheurs d'emploi, c'est un problème de fond — et le premier reproche qu'on fera au projet publiquement.

## Lot 13 — Réparer le thème clair

**Effort : L** (mécanique, se fait fichier par fichier)

**Fichiers** : `app/solutions/matcher-offres/page.js`, `components/matcher/*.jsx`, `components/shared/SpontaneTips.jsx`

**Le constat** : `globals.css` définit un design system propre (variables `:root` / `.dark` exposées à Tailwind), mais ~360 classes codent des couleurs en dur pour un fond sombre. Bugs visibles : `matcher-offres/page.js:455` force `bg-black text-white` — **la page reste noire en thème clair, le bouton de thème n'a aucun effet dessus** ; `SpontaneTips.jsx:32-33` rend du texte blanc sur le fond crème `#FFFBF5` — **illisible**.

**Ce qu'on fait** : migration mécanique avec une table de correspondance (`bg-black`/`bg-slate-900` → `bg-background`, `text-white` → `text-text-primary`, `text-pink-*` → `text-primary`, etc.), **du plus visible au moins visible** : `matcher-offres/page.js` (2 lignes, effet immédiat) → `SpontaneTips` (10) → `MatcherTransparency` (18) → `UrlScraper` (25) → `OfferForm` (39) → `OfferDiscovery` (90) → `CandidateProfileForm` (147). Basculer le thème après chaque fichier pour vérifier.

## Lot 14 — Découper et dédupliquer le frontend

**Effort : L**

**Fichiers** : `app/solutions/matcher-offres/page.js` (**872 lignes**), `components/matcher/OfferDiscovery.jsx` (575), `CandidateProfileForm.jsx` (528), `hooks/useAuth.js`, `components/shared/`

**Ce qu'on fait, dans l'ordre de rendement :**
1. **15 min, zéro risque** : sortir les **14 composants d'icônes SVG inline** de `matcher-offres/page.js:89-174` (86 lignes de `<path>` avant la moindre logique) + les 5 du dashboard dans un `components/shared/icons.jsx`. ~140 lignes retirées d'un coup.
2. Composants partagés : `CopyButton` (écrit **3 fois** avec 3 styles différents), `CopyableSection`, `LoadingScreen` (écrit **5 fois**, dont une version déjà désynchronisée avec fond noir), `lib/utils/cvFormat.js` (`formatExperiences` et `formatFormations` écrits 3 fois **à l'identique**), `lib/utils/progress.js` (animation dupliquée au caractère près).
3. `logout` dans `useAuth` (recopié **6 fois**), et supprimer les 3 `supabase.auth.getUser()` redondants qui refont un aller-retour réseau alors que `useAuth()` est appelé 20 lignes plus haut dans le même composant.
4. Un `hooks/useMatcher.js` qui absorbe les **24 `useState`** de `matcher-offres/page.js`, puis un fichier par étape (`MatcherStepChoice`, `MatcherStepInput`, `MatcherStepResults`).
5. Annoncer **250 lignes maximum par fichier** dans le CONTRIBUTING.

## Lot 15 — Détails et code mort

**Effort : S**

- **Textes SaaS** : `signup/page.js:61` « gratuit, sans limites » (faux : rate limiter + clé OpenAI de l'utilisateur), `:82` « sans carte bancaire », `layout.js:19` « L'IA qui vous propulse » + un champ `keywords` inutile. → réécrire en 4 chaînes orientées « vos données restent chez vous ».
- **Code mort** : prop `showAuth` de `Header.jsx` (déclarée, jamais passée, ~20 lignes de JSX), `reset` de `useCVAnalyzer` (jamais appelé), **5 animations CSS et 7 classes `.delay-*` avec 0 occurrence** (~45 lignes de CSS), doublon `ErrorMessage`/`Alert`. ⚠️ Attention : `.delay-500` **entre en collision de nom avec l'utilitaire Tailwind** du même nom — renommer en `.anim-delay-500` et ajuster ses 2 usages.
- **Erreurs avalées** : `candidatures/page.js:166` et `:176` font `console.error` sans rien afficher alors que le state `error` existe — un changement de statut qui échoue est totalement silencieux pour l'utilisateur.
- Deux boutons « Modifier » superposés (`matcher-offres/page.js:845-853` fait doublon avec `MatcherTransparency`), `window.location.reload()` pour un simple reset (`ResultsDisplay.jsx:308`), les 4 `toLocaleDateString('fr-FR')` à centraliser dans `lib/utils/date.js`.
- **i18n : ne rien faire.** Le produit est structurellement français (sources d'offres françaises, prompts en français, contrats CDI/CDD). Juste un bandeau en anglais en tête du README pour éviter les issues « why is this in French? ».

---

## Avant / Après

### Avant

| | |
|---|---|
| **Installation** | Cloner échoue (URL 404). Puis : créer un compte OpenAI **+** un projet Supabase **+** exécuter 45 lignes de SQL **+** créer un compte Resend **+** deviner 12 variables d'environnement dont 2 non documentées **+** les écrire dans `backend/src/.env` (emplacement contre-intuitif) **+** attendre 1,3 Go de Chromium non annoncé. Si une seule de ces étapes manque : le backend **crashe au démarrage** avec une stack de SDK en anglais, ou le frontend affiche « Oups ». |
| **Licence** | Trois fichiers, trois réponses (MIT / ISC / rien), et **aucun fichier LICENSE** → juridiquement, personne n'a le droit de réutiliser le code. |
| **Repo** | 42 % des fichiers suivis (61/146) sont des notes de prompts personnelles décrivant un produit qui n'existe plus. Une clé API dans l'historique. `.gitignore` troué sur 13 chemins. `CLAUDE.md` invisible sous Linux. |
| **Sécurité** | SSRF **reproduit** (le serveur lit `127.0.0.1` sur demande). Zéro vérification d'identité : `curl` sur l'UUID d'un autre utilisateur retourne ses candidatures. Écoute sur toutes les interfaces réseau. Email de recruteur écrit dans les logs. |
| **Code** | 28 noms de modèles OpenAI en dur, 11 blocs 429 copiés-collés, 12 blocs de debug morts, 6 workflows pour 3 comportements (avec une divergence déjà installée), 4 scrapers identiques, 3 zones d'upload dupliquées, 6 `logout` recopiés. Zéro test, zéro CI. |
| **Usage** | Écran de connexion obligatoire dès le premier lancement, thème clair cassé sur tout l'univers matcher, impossible de déposer un CV au clavier. |

### Après

| | |
|---|---|
| **Installation** | `git clone` → `npm install && npm run setup` → copier deux `.env.example` → `npm run dev`. **Aucun compte obligatoire** si tu retiens les décisions 2 et 3 : stockage fichier local + modèle Ollama. Chaque clé optionnelle active une fonctionnalité en plus, et le serveur annonce au démarrage ce qui est actif et ce qui ne l'est pas. |
| **Licence** | `LICENSE` MIT à la racine, cohérent avec les deux `package.json` et le README. GitHub affiche le badge. |
| **Repo** | ~85 fichiers, tous liés au produit. Historique propre. `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `.gitattributes`, `.nvmrc`, template d'issue, CI verte sur chaque PR. |
| **Sécurité** | Filtre anti-SSRF avec test automatisé. Loopback par défaut. Plus de données personnelles dans les logs — et la phrase « ton CV ne quitte pas ta machine » devient vraie. |
| **Code** | Un seul endroit pour la config IA, un seul pour les erreurs, un seul pour l'upload PDF, un seul pour le format d'offre. Ajouter une source d'offres = ajouter un fichier. 4 tests, dont un qui garde la faille SSRF fermée. |
| **Usage** | Ouvre sur le dashboard, pas sur un formulaire de connexion. Thème clair et sombre corrects partout. Dépôt de CV au clavier. Les outils non configurés sont grisés avec « Configuration requise » au lieu de planter. |
| **Positionnement** | Un projet qu'on peut résumer honnêtement en une phrase : *« Des outils IA de recherche d'emploi qui tournent sur ta machine. Ton CV ne part sur aucun serveur. Gratuit, modifiable, sans compte. »* |

### Ordre de bataille conseillé

**Semaine 1** — quick wins (1 h) + décisions 1 et 5 + lots 1, 2, 3 → le repo peut devenir public.
**Semaine 2** — décisions 2, 3, 4 + lots 4, 5 → **le projet démarre chez n'importe qui**. C'est le jalon qui change tout.
**Semaine 3** — lots 6, 7, 8 → plus aucun compte cloud obligatoire.
**Ensuite, sans urgence** — lot 9 (sécurité, mais fais le SSRF dès que possible), puis 10, 11, 12, 13, 14, 15 au fil de l'eau. Les lots 12 à 15 sont d'excellentes **premières issues pour un contributeur** : bien délimités, vérifiables, sans risque de tout casser.