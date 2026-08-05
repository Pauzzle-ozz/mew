# CLAUDE.md — Mew (outils libres de recherche d'emploi)

> Guide pour travailler sur ce repo. Voir [README.md](README.md) pour l'installation et [CONTRIBUTING.md](CONTRIBUTING.md) pour les conventions.

## Le projet en bref

Boîte à outils **open source et locale** pour la recherche d'emploi. **Un seul univers : l'emploi.** 4 outils :

1. **Analyseur de CV** (`/solutions/analyse-cv`) — formulaire ou PDF → métiers correspondants
2. **Optimiseur de CV** (`/solutions/optimiseur-cv`) — PDF → score ATS + CV optimisé (texte, avant/après)
3. **Matcher d'Offres** (`/solutions/matcher-offres`) — 3 modes : adapter le CV à une offre (URL scrapée ou saisie manuelle), mode Rapide (CV PDF + URL), mode Découverte (CV PDF → métiers + offres WTTJ/France Travail)
4. **Candidature Spontanée** (`/solutions/candidature-spontanee`) — génère ET envoie l'email avec CV en pièce jointe, puis rappelle de relancer

> **Le tracker manuel a été retiré** (4 août 2026) : personne ne tient à jour un tableau de suivi, et les plateformes de recrutement le font déjà pour ce qui part de chez elles. Ce qu'aucune ne suit, c'est une candidature spontanée envoyée par email — Mew l'enregistre donc **tout seul** au moment de l'envoi, et affiche « X relances à faire ». `applicationService` existe toujours, mais n'est plus exposé en HTTP : seule `GET /api/applications/user/:userId/statistiques` subsiste, en lecture.

Tout est en **mode texte** : l'IA retourne du texte/JSON structuré, aucune génération de PDF.

## La règle qui structure tout le projet

> **Si deux personnes différentes, avec la même information sous les yeux, arriveraient forcément au même résultat, alors c'est du code — pas un appel LLM.**
>
> Le LLM n'intervient que pour produire un texte destiné à être lu et jugé par un humain (lettre, email, reformulation d'une phrase).

Test pratique : *« puis-je écrire un test automatique qui vérifie que la réponse est bonne ? »* Oui → code. Non, ça dépend du goût du lecteur → LLM.

**Refonte en cours.** Le projet vient d'un modèle où *tout* passait par OpenAI, scores compris. La migration vers le calcul local est décrite étape par étape dans [docs/refonte/02-architecture-code-vs-llm.md](docs/refonte/02-architecture-code-vs-llm.md). L'audit open source est dans [docs/refonte/01-audit-open-source.md](docs/refonte/01-audit-open-source.md).

## Deux invariants à ne jamais casser

1. **Le serveur démarre toujours, même sans aucune configuration.** Aucun client externe (fournisseur d'IA, Resend, Supabase) n'est instancié au chargement d'un module — seulement à la première utilisation réelle. Le catalogue et le répartiteur d'adaptateurs sont eux aussi chargés paresseusement, sous `try/catch`. Une clé absente désactive une fonctionnalité, elle ne fait pas tomber le serveur.
2. **Aucun `fetch` direct dans une page frontend.** Tout passe par `frontend/lib/api/`.
3. **Une clé API ne quitte jamais le backend** : ni vers le navigateur, ni dans un log, ni dans un message d'erreur, ni dans une URL.

## Architecture

```
frontend (Next.js 16, port 3000)
  └─ fetch via lib/api/ ──> backend (Express 5, port 5000)
                              ├─ config/     seul endroit qui lit process.env
                              ├─ llm/        catalogue, adaptateurs, réglages utilisateur
                              ├─ core/       le calcul — zéro réseau, zéro I/O
                              ├─ storage/    fichier JSON local (défaut) | Supabase (option)
                              ├─ services/   orchestration
                              ├─ prompts/    un fichier par workflow IA
                              └─ lib/        logger, urlSecurity, supabaseClient
```

### Backend (`backend/src/`)

- `server.js` — point d'entrée. 6 mounts : `/api/solutions`, `/api/matcher`, `/api/ia`, `/api/applications`, `/api/candidature-spontanee`, `/api/historique`, plus `/api/health` et `/api/capacites`. Écoute sur `127.0.0.1` par défaut.
- `config/index.js` — **seul fichier qui lit `process.env`**. Expose `config.capacites` (ia, envoiEmail, franceTravail, scraping, stockageSupabase, authentificationVerifiee) et `config.resume()`. Arbitre entre `.env` et le choix de l'utilisateur (voir *Le choix du fournisseur*).
- `llm/` — le choix du fournisseur et du modèle. Section dédiée plus bas.
- `storage/` — `index.js` choisit l'adaptateur selon `STORAGE_DRIVER` ; `jsonAdapter.js` (défaut, `backend/data/mew.json`, zéro dépendance, écritures sérialisées) et `supabaseAdapter.js`. Même interface : `applications.create/getByUser/getById/update/delete` et `history.save/list/delete`.
- `routes/` — un fichier par domaine (solutions, matcher, applications, candidatureSpontanee, history)
- `services/` — aiService (ne parle plus à OpenAI en direct : il lit `config.ia`, demande son adaptateur au répartiteur, traduit un **rôle** en nom de modèle ; signatures publiques inchangées), cvService, matcherService, scraperService, jobDiscoveryService, applicationService, candidatureSpontaneeService, emailService, historyService
- `prompts/` — un fichier par workflow IA, chacun exporte `buildPrompt(...) => string` ; `jsonSchemas.js` = prompts de conversion JSON (**voué à disparaître**, voir la refonte) ; `helpers.js` = formatage partagé
- `middleware/` — `uploadPdf.js` (config multer unique, 5 Mo, code d'erreur `FICHIER_NON_PDF`), `rateLimiter.js`
- `lib/` — `logger.js` (niveaux + masquage des données personnelles), `urlSecurity.js` (anti-SSRF), `supabaseClient.js` (paresseux)

### Frontend (`frontend/`)

- `app/` — App Router. `/` redirige vers `/dashboard`. En mode local, `/login` et `/signup` renvoient aussi vers `/dashboard`.
- `lib/auth.js` — **point d'entrée unique de l'authentification**, deux modes (`local` par défaut, `supabase`). `getUser`, `signIn`, `signUp`, `signOut`, `estModeLocal`. `signOut()` renvoie `false` en mode local (rien à quitter) : les pages s'en servent pour savoir s'il faut rediriger.
- `lib/supabase.js` — client paresseux + `supabaseConfigured`
- `lib/api/` — un client par domaine + `config.js` (`API_URL` avec repli sur `localhost:5000`, `lireReponse`, `messageErreurReseau`)
- `app/parametres/page.js` — l'écran de choix du fournisseur. **L'état vit dans la page, pas dans les composants** : les cinq étapes se répondent (changer de fournisseur invalide la clé, les modèles et le résultat du test). `components/parametres/` n'expose que des champs contrôlés.
- `lib/api/iaApi.js` — client des routes `/api/ia`
- `components/cv/`, `components/matcher/`, `components/shared/`
- `context/ThemeContext.js` — thème clair/sombre (localStorage `mew-theme`)

## Le cœur déterministe (`backend/src/core/`)

C'est là que vit la logique du produit. **Zéro réseau, zéro I/O, 100 % testable.**

| Dossier | Rôle |
|---|---|
| `core/texte/` | normalisation, tokenisation, lemmatisation FR, similarités (Levenshtein, Jaro-Winkler, Dice, Jaccard, TF-IDF) |
| `core/cv/` | parseur de CV : sections, contact, dates (avec fusion des chevauchements), compétences, profil + score de confiance |
| `core/offre/` | extraction d'offre en cascade : JSON-LD → balises meta → heuristique, avec niveau de confiance |
| `core/score/` | `ats.js` (barème 100 points), `matching.js` (CV ↔ offre), `metiers.js` (ROME), `recommandations.js` |
| `core/gabarits/` | moteur de texte à trous, relance, justifications |
| `core/suivi/` | jours ouvrés (11 fériés, Pâques par Meeus), relances, statistiques |
| `data/rome/` | référentiel ROME 4.0 — voir `data/LICENCES.md` |

**Deux pièges déjà rencontrés, à ne pas réintroduire :**
- `moyennePonderee` **arrondit à l'entier** : lui passer des fractions entre 0 et 1 écrase tout sur 0 ou 1.
- Pour comparer deux intitulés, **jamais Jaro-Winkler** (il rapproche « chef de projet » et « chef de produit » à 0,93). Utiliser une mesure par mots, pondérée par la rareté — `metiers.js` le fait, sinon « Aide-soignante » attire « Aide d'élevage agricole ».

## Ce qu'il reste au LLM

**5 points d'appel, 6 appels réseau au maximum**, tous de la rédaction :

| Service | Ligne | Appels | Pour quoi |
|---|---|---:|---|
| `matcherService` | 140 · 173 · 242 | 4 | CV adapté (`generateThenConvert` = 2 appels), lettre, extraction de profil PDF |
| `cvService` | 155 | 1 | réécriture du CV optimisé — le score, lui, est calculé |
| `candidatureSpontaneeService` | 42 | 1 | rédaction de l'email d'approche |

Les modèles sont désignés par **rôle** (`redaction`, `extraction`), jamais par nom dans le code métier.

`generateThenConvert` fait **deux** appels pour une seule information : chaque usage restant est une dette à rembourser. Format retenu pour les sorties structurées : **marqueurs texte découpés en JS** (`llm/parseurs/`), pas les Structured Outputs d'OpenAI. C'est ce qui rend le projet portable : un petit modèle local ne sait pas produire du JSON contraint, mais il sait suivre « écris `SUBJECT:` puis une ligne de tirets puis le corps ».

## Le choix du fournisseur (`backend/src/llm/`)

**L'utilisateur choisit son fournisseur ET son modèle depuis l'écran Paramètres**, avec sa propre clé. N'importe quel modèle est atteignable : ChatGPT, Claude, Gemini, Kimi, Mistral, un modèle local, une adresse compatible OpenAI quelconque.

| Fichier | Rôle |
|---|---|
| `llm/providers/catalogue.js` | **de la donnée, pas du code** : 16 fournisseurs, leurs modèles, tarifs, fenêtres. Gelé en profondeur. |
| `llm/providers/index.js` | seule porte d'entrée du catalogue. Ne lève **jamais**, quoi qu'on lui passe. |
| `llm/adapters/index.js` | répartiteur nom → module, chargement **paresseux** (un adaptateur cassé ne doit pas empêcher le serveur de démarrer) |
| `llm/adapters/{openaiCompatible,anthropic,google}.js` | les 3 seuls protocoles. Anthropic et Google via `fetch` natif, **sans leur SDK**. |
| `llm/configUtilisateur.js` | lit/écrit `backend/data/config-ia.json`. Écriture atomique, `chmod 0600`, cache mémoire. |
| `llm/testConnexion.js` | le bouton « Tester » : envoie un vrai mini-prompt et le découpe avec le **vrai** parseur |
| `llm/parseurs/` | découpage des sorties à marqueurs (`emailSpontane`, `cvOptimise`) |
| `llm/cout.js` | estimation de coût à partir des tarifs du catalogue |

**Ajouter un fournisseur compatible OpenAI = copier une entrée du catalogue.** Aucun autre fichier à toucher ; `backend/test/catalogue.test.js` vérifie que l'entrée est complète.

### Le contrat des adaptateurs

Deux méthodes, c'est tout : `completer({ baseURL, cleApi, modele, prompt, temperature, maxTokens, jsonMode, timeoutMs })` → `{ texte, usage: { tokensEntree, tokensSortie }, modele }`, et `listerModeles({ baseURL, cleApi, timeoutMs })` → `[{ id, nom }]` ou `null`.

Toute erreur levée porte un `.code` parmi **`CLE_INVALIDE`** (401/403), **`QUOTA_DEPASSE`** (429/402), **`MODELE_INTROUVABLE`** (404), **`TIMEOUT`**, **`RESEAU`** (DNS, connexion refusée — cas fréquent avec Ollama éteint), **`FOURNISSEUR`** (tout le reste). Le `.message` est en **français, compréhensible par quelqu'un qui ne programme pas** : « Ollama ne répond pas sur http://localhost:11434. Vérifie qu'il est lancé. » Ne jamais laisser remonter un message brut de SDK en anglais. `routes/ia.js` traduit ces codes en statuts HTTP.

### Priorité de la configuration

1. `backend/.env` s'il définit `OPENAI_API_KEY` — **gagne toujours** (installation faite pour d'autres ; l'interface affiche alors le choix comme verrouillé)
2. `backend/data/config-ia.json` — le choix de l'utilisateur
3. rien — et le serveur démarre quand même

L'arbitrage est dans `config/index.js`, en propriétés **calculées** (`config.ia.cleApi`, `.baseURL`, `.modeles`, `.source`) : l'utilisateur peut changer de fournisseur pendant que le serveur tourne. `routes/ia.js` remet à zéro le client mis en cache par `aiService` après chaque enregistrement.

### Trois règles non négociables sur la clé

1. Elle ne repart **jamais** vers le navigateur. Une seule fonction a le droit de décrire la config vers l'extérieur : `configUtilisateur.lireMasquee()`, qui rend `sk-p...4f2a`.
2. Elle n'apparaît **jamais** dans un log ni dans un message d'erreur. `routes/ia.js` ne logue jamais le corps des requêtes.
3. Elle ne transite **jamais** dans une URL — d'où le `POST /api/ia/modeles/:fournisseur` en plus du `GET`.

### Routes

`/api/ia` (monté sans authentification, comme `/api/capacites`) : `GET /fournisseurs`, `GET·PUT·DELETE /config`, `POST /tester` (seule route derrière le limiteur : c'est la seule qui appelle vraiment un fournisseur), `GET·POST /modeles/:fournisseur`.

## Commandes

```bash
cd backend  && npm run dev      # nodemon, port 5000
cd backend  && npm test         # node --test, zéro dépendance
cd frontend && npm run dev      # port 3000
cd frontend && npm run build    # doit passer sans erreur
cd frontend && npm run lint     # 0 erreur (3 warnings React assumés)
```

Avant chaque commit : le build passe, le lint est à 0 erreur, `npm test` est vert, et **le serveur démarre sans fichier `.env`**.

## Variables d'environnement

Aucune n'est obligatoire. Tout est documenté dans `backend/.env.example` et `frontend/.env.example` — **ces deux fichiers font foi** ; toute nouvelle variable doit y être ajoutée en même temps que dans `config/index.js`.

Le fournisseur d'IA n'a normalement **rien à faire dans un `.env`** : il se choisit dans l'écran Paramètres. `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `AI_MODEL_*` restent lus, mais uniquement pour verrouiller une installation faite pour d'autres.

Le `.env` backend est à `backend/.env` (plus dans `src/`), chargé par un chemin absolu calculé depuis `server.js`, sans `override` : une variable passée dans le terminal gagne sur le fichier.

## Conventions

- Code, commentaires et textes UI en **français** (sans accents dans les chaînes JSX historiques, accents OK dans les commentaires)
- Commits : `type: description` (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- Composants : PascalCase.jsx · hooks : `useX.js` · routes API : kebab-case
- ~250 lignes par fichier maximum
- Ne JAMAIS commiter les `.env`, ni un vrai CV (les `*.pdf` sont gitignorés), ni `backend/data/`

## Pièges connus

- `frontend/components/cv/ResultsDisplay.jsx` (bloc commenté « NE PAS SUPPRIMER LE REPLI SUR `note_marche` ») — le repli sur `metier.note_marche` **n'est pas du code mort** : l'historique rejoue des résultats archivés à l'ancien format. Le supprimer afficherait `width: undefined%`.
- `jobDiscoveryService.js` — le paramètre `motsCles` de l'API France Travail est un homonyme piégeux, il n'a rien à voir avec les mots-clés générés par le LLM.
- Sur macOS, le port 5000 est pris par AirPlay → `PORT=5001` dans `backend/.env` et adapter `NEXT_PUBLIC_API_URL`.
- Puppeteer est une **dépendance optionnelle** (~1,3 Go). Son absence désactive le rendu JavaScript des pages, rien d'autre.
- Le backend **n'authentifie pas** les requêtes (il fait confiance au `userId` envoyé par le client). Sans conséquence en local mono-utilisateur, bloquant pour un déploiement partagé. Voir SECURITY.md.
