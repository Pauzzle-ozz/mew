# CLAUDE.md — Mew (outils libres de recherche d'emploi)

> Guide pour travailler sur ce repo. Voir [README.md](README.md) pour l'installation et [CONTRIBUTING.md](CONTRIBUTING.md) pour les conventions.

## Le projet en bref

Boîte à outils **open source et locale** pour la recherche d'emploi. **Un seul univers : l'emploi.** 5 outils :

1. **Analyseur de CV** (`/solutions/analyse-cv`) — formulaire ou PDF → métiers correspondants
2. **Optimiseur de CV** (`/solutions/optimiseur-cv`) — PDF → score ATS + CV optimisé (texte, avant/après)
3. **Matcher d'Offres** (`/solutions/matcher-offres`) — 3 modes : adapter le CV à une offre (URL scrapée ou saisie manuelle), mode Rapide (CV PDF + URL), mode Découverte (CV PDF → métiers + offres WTTJ/France Travail)
4. **Candidature Spontanée** (`/solutions/candidature-spontanee`) — génère ET envoie l'email avec CV en pièce jointe
5. **Suivi de Candidatures** (`/solutions/matcher-offres/candidatures`) — tracker CRUD (statuts : `a_postuler | postule | entretien | offre | refuse`)

Tout est en **mode texte** : l'IA retourne du texte/JSON structuré, aucune génération de PDF.

## La règle qui structure tout le projet

> **Si deux personnes différentes, avec la même information sous les yeux, arriveraient forcément au même résultat, alors c'est du code — pas un appel LLM.**
>
> Le LLM n'intervient que pour produire un texte destiné à être lu et jugé par un humain (lettre, email, reformulation d'une phrase).

Test pratique : *« puis-je écrire un test automatique qui vérifie que la réponse est bonne ? »* Oui → code. Non, ça dépend du goût du lecteur → LLM.

**Refonte en cours.** Le projet vient d'un modèle où *tout* passait par OpenAI, scores compris. La migration vers le calcul local est décrite étape par étape dans [docs/refonte/02-architecture-code-vs-llm.md](docs/refonte/02-architecture-code-vs-llm.md). L'audit open source est dans [docs/refonte/01-audit-open-source.md](docs/refonte/01-audit-open-source.md).

## Deux invariants à ne jamais casser

1. **Le serveur démarre toujours, même sans aucune clé.** Aucun client externe (OpenAI, Resend, Supabase) n'est instancié au chargement d'un module — seulement à la première utilisation réelle. Une clé absente désactive une fonctionnalité, elle ne fait pas tomber le serveur.
2. **Aucun `fetch` direct dans une page frontend.** Tout passe par `frontend/lib/api/`.

## Architecture

```
frontend (Next.js 16, port 3000)
  └─ fetch via lib/api/ ──> backend (Express 5, port 5000)
                              ├─ config/     seul endroit qui lit process.env
                              ├─ storage/    fichier JSON local (défaut) | Supabase (option)
                              ├─ services/   orchestration
                              ├─ prompts/    un fichier par workflow IA
                              └─ lib/        logger, urlSecurity, supabaseClient
```

### Backend (`backend/src/`)

- `server.js` — point d'entrée. 5 mounts : `/api/solutions`, `/api/matcher`, `/api/applications`, `/api/candidature-spontanee`, `/api/historique`, plus `/api/health` et `/api/capacites`. Écoute sur `127.0.0.1` par défaut.
- `config/index.js` — **seul fichier qui lit `process.env`**. Expose `config.capacites` (ia, envoiEmail, franceTravail, scraping, stockageSupabase) et `config.resume()`.
- `storage/` — `index.js` choisit l'adaptateur selon `STORAGE_DRIVER` ; `jsonAdapter.js` (défaut, `backend/data/mew.json`, zéro dépendance, écritures sérialisées) et `supabaseAdapter.js`. Même interface : `applications.create/getByUser/getById/update/delete` et `history.save/list/delete`.
- `routes/` — un fichier par domaine (solutions, matcher, applications, candidatureSpontanee, history)
- `services/` — aiService (client OpenAI, modèles désignés par **rôle**), cvService, matcherService, scraperService, jobDiscoveryService, applicationService, candidatureSpontaneeService, emailService, historyService
- `prompts/` — un fichier par workflow IA, chacun exporte `buildPrompt(...) => string` ; `jsonSchemas.js` = prompts de conversion JSON (**voué à disparaître**, voir la refonte) ; `helpers.js` = formatage partagé
- `middleware/` — `uploadPdf.js` (config multer unique, 5 Mo, code d'erreur `FICHIER_NON_PDF`), `rateLimiter.js`
- `lib/` — `logger.js` (niveaux + masquage des données personnelles), `urlSecurity.js` (anti-SSRF), `supabaseClient.js` (paresseux)

### Frontend (`frontend/`)

- `app/` — App Router. `/` redirige vers `/dashboard`. En mode local, `/login` et `/signup` renvoient aussi vers `/dashboard`.
- `lib/auth.js` — **point d'entrée unique de l'authentification**, deux modes (`local` par défaut, `supabase`). `getUser`, `signIn`, `signUp`, `signOut`, `estModeLocal`. `signOut()` renvoie `false` en mode local (rien à quitter) : les pages s'en servent pour savoir s'il faut rediriger.
- `lib/supabase.js` — client paresseux + `supabaseConfigured`
- `lib/api/` — un client par domaine + `config.js` (`API_URL` avec repli sur `localhost:5000`, `lireReponse`, `messageErreurReseau`)
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

**7 appels possibles dans tout le projet**, tous de la rédaction :

| Service | Appels | Pour quoi |
|---|---:|---|
| `matcherService` | 4 | CV adapté (pipeline 2 étapes), lettre (texte brut), extraction de profil PDF |
| `cvService` | 2 | réécriture du CV optimisé — le score, lui, est calculé |
| `candidatureSpontaneeService` | 1 | rédaction de l'email d'approche |

Les modèles sont désignés par **rôle** (`redaction`, `extraction`), jamais par nom dans le code métier. Erreur 429 OpenAI → HTTP 503.

`generateThenConvert` fait **deux** appels pour une seule information : chaque usage restant est une dette à rembourser. Format retenu pour les sorties structurées : **marqueurs texte découpés en JS**, pas les Structured Outputs d'OpenAI — pour ne dépendre d'aucun fournisseur.

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

Le `.env` backend est à `backend/.env` (plus dans `src/`), chargé par un chemin absolu calculé depuis `server.js`, sans `override` : une variable passée dans le terminal gagne sur le fichier.

## Conventions

- Code, commentaires et textes UI en **français** (sans accents dans les chaînes JSX historiques, accents OK dans les commentaires)
- Commits : `type: description` (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- Composants : PascalCase.jsx · hooks : `useX.js` · routes API : kebab-case
- ~250 lignes par fichier maximum
- Ne JAMAIS commiter les `.env`, ni un vrai CV (les `*.pdf` sont gitignorés), ni `backend/data/`

## Pièges connus

- `frontend/components/cv/ResultsDisplay.jsx:42-47` — le repli sur `metier.note_marche` **n'est pas du code mort** : l'historique rejoue des résultats archivés à l'ancien format. Le supprimer afficherait `width: undefined%`.
- `jobDiscoveryService.js` — le paramètre `motsCles` de l'API France Travail est un homonyme piégeux, il n'a rien à voir avec les mots-clés générés par le LLM.
- Sur macOS, le port 5000 est pris par AirPlay → `PORT=5001` dans `backend/.env` et adapter `NEXT_PUBLIC_API_URL`.
- Puppeteer est une **dépendance optionnelle** (~1,3 Go). Son absence désactive le rendu JavaScript des pages, rien d'autre.
- Le backend **n'authentifie pas** les requêtes (il fait confiance au `userId` envoyé par le client). Sans conséquence en local mono-utilisateur, bloquant pour un déploiement partagé. Voir SECURITY.md.
