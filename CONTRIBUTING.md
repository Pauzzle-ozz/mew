# Contribuer à Mew

Merci de vous intéresser au projet. Ce document explique comment travailler dessus.

## Mettre en route

```bash
git clone https://github.com/Pauzzle-ozz/mew.git
cd mew
cd backend && npm install && cd ../frontend && npm install
```

Aucune clé API n'est nécessaire pour développer : le serveur démarre sans configuration et vous annonce ce qui est actif. Vous n'avez besoin d'une clé que si vous travaillez sur les fonctions de rédaction — et dans ce cas, un modèle local via **Ollama** suffit et ne coûte rien : choisissez-le dans l'écran Paramètres (http://localhost:3000/parametres).

Deux terminaux : `cd backend && npm run dev` et `cd frontend && npm run dev`.

## Avant d'ouvrir une pull request

```bash
cd frontend && npm run build   # doit passer
cd frontend && npm run lint    # 0 erreur (3 warnings React sont connus et assumés)
cd backend  && npm test        # doit passer
```

Et démarrez le serveur au moins une fois **sans fichier `.env`** : le projet doit toujours fonctionner sans configuration.

Ces trois commandes sont exactement ce que GitHub relance tout seul sur votre pull request (`.github/workflows/ci.yml`). Les lancer avant d'ouvrir la PR vous évite un aller-retour. Si la CI est rouge et que tout passe chez vous, vérifiez votre version de Node : la CI utilise Node 22, comme le `.nvmrc`.

## La règle la plus importante du projet

> **Si deux personnes différentes, avec la même information sous les yeux, arriveraient forcément au même résultat, alors c'est du code — pas un appel au modèle de langage.**

Un modèle n'est appelé que pour produire un texte destiné à être lu et jugé par un humain (lettre de motivation, email d'approche, reformulation d'une phrase).

Le test pratique : *« puis-je écrire un test automatique qui vérifie que la réponse est bonne ? »*
Si oui, c'est du code. Si la réponse dépend du goût du lecteur, c'est le modèle.

Pourquoi c'est important : un score inventé par un modèle change à chaque appel, ne s'explique pas à l'utilisateur, coûte de l'argent et ne fonctionne pas hors ligne. Un calcul fait les quatre.

## Conventions

- **Tout est en français** : code, commentaires, messages d'interface, commits. Le projet vise le marché de l'emploi français.
- Les chaînes JSX historiques sont sans accents ; les commentaires peuvent en avoir.
- **Composants** : `PascalCase.jsx` · **hooks** : `useX.js` · **routes API** : `kebab-case`
- **Commits** : `type: description` — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- **250 lignes par fichier**, à vue de nez. Au-delà, il y a probablement deux choses dans le même fichier.
- Les commentaires expliquent **pourquoi**, pas **quoi**. Un commentaire faux coûte plus cher qu'une absence de commentaire : il envoie activement le lecteur sur une fausse piste.

## Je veux changer X, je vais où

| Ce que vous voulez faire | Où aller |
|---|---|
| Changer un texte envoyé au modèle | `backend/src/prompts/` — un fichier par usage |
| Ajouter une route API | `backend/src/routes/`, puis un client dans `frontend/lib/api/` |
| Changer la logique métier | `backend/src/services/` |
| Changer où sont rangées les données | `backend/src/storage/` — deux adaptateurs, une seule interface |
| Ajouter une variable de configuration | `backend/src/config/index.js` **et** `backend/.env.example` |
| Changer le modèle utilisé | l'écran **Paramètres** — les modèles sont désignés par rôle (`redaction`, `extraction`), jamais écrits dans le code métier |
| **Ajouter un fournisseur d'IA** | `backend/src/llm/providers/catalogue.js` — voir juste en dessous |
| Ajouter un protocole d'API | `backend/src/llm/adapters/` — seulement si le fournisseur ne parle pas le format OpenAI |
| Ajouter une page | `frontend/app/` |
| Modifier les couleurs, le thème | `frontend/app/globals.css` (variables CSS) |

## Ajouter un fournisseur d'IA

C'est la contribution la plus utile et la plus simple du projet : **c'est de la donnée, pas du code.**

La quasi-totalité des services parlent le format d'API d'OpenAI. Dans ce cas, il suffit de copier une entrée dans `backend/src/llm/providers/catalogue.js` :

```js
{
  id: 'monfournisseur',
  nom: 'Mon Fournisseur',
  adaptateur: 'openai-compatible',        // ou 'anthropic', ou 'google'
  baseURL: 'https://api.exemple.com/v1',  // null si l'utilisateur doit la saisir
  cleRequise: true,                       // false pour un service local
  urlCle: 'https://exemple.com/api-keys', // où l'on crée une clé, ou null
  prefixeCle: 'sk-',                      // contrôle de saisie indicatif, ou null
  local: false,                           // true = tourne sur la machine de l'utilisateur
  paliergratuit: false,                   // true si un usage gratuit RÉEL existe
  listageDynamique: true,                 // l'adaptateur sait lister les modèles
  note: '',                               // une phrase affichée à l'utilisateur
  modeles: [
    {
      id: 'super-modele-1',       // la chaîne EXACTE envoyée au fournisseur
      nom: 'Super Modèle 1',      // le nom lisible, affiché dans l'interface
      entree: 2.50,               // dollars par MILLION de tokens en entrée
      sortie: 10.00,              // idem en sortie
      contexte: 128000,           // taille de la fenêtre, en tokens
      roles: ['redaction', 'extraction']
    }
  ]
}
```

Aucun autre fichier n'a besoin d'être touché. `backend/test/catalogue.test.js` vérifiera que votre entrée est complète.

Quatre choses à respecter :

- **N'inventez jamais un `id` de modèle.** Un nom faux donne à l'utilisateur une erreur incompréhensible. Copiez-le depuis la documentation du fournisseur.
- **Deux à cinq modèles par fournisseur, pas tout son catalogue.** Un bon modèle de rédaction, un rapide et économique pour l'extraction, éventuellement un intermédiaire. Trop de choix paralyse.
- **`paliergratuit: true` seulement si un usage gratuit réel existe** — pas un crédit d'essai de 5 $.
- **Si le fournisseur a une contrepartie, dites-la dans `note`** : requêtes exploitées pour l'entraînement, serveurs dans une juridiction particulière. L'utilisateur envoie son CV, il a le droit de savoir.

Mettez à jour `verifieLe` en haut du fichier si vous avez revérifié les tarifs.

### Écrire un adaptateur

Seulement si le fournisseur ne parle pas le format OpenAI. Il y en a trois aujourd'hui : `openai-compatible`, `anthropic` et `google`. **N'installez pas le SDK du fournisseur** : `fetch` est natif dans Node, et le SDK `openai` déjà présent couvre tout le reste.

Deux méthodes, décrites en tête de `backend/src/llm/adapters/openaiCompatible.js`. Et une règle qui ne se négocie pas : **toute erreur levée porte un `.code`** parmi `CLE_INVALIDE`, `QUOTA_DEPASSE`, `MODELE_INTROUVABLE`, `TIMEOUT`, `RESEAU`, `FOURNISSEUR`, et un `.message` **en français, compréhensible par quelqu'un qui ne programme pas** :

> « Ollama ne répond pas sur http://localhost:11434. Vérifie qu'il est lancé. »

Ne laissez jamais remonter un message brut de SDK en anglais. C'est ce code qui permet à l'écran Paramètres de dire *où* ça s'arrête, et donc quel geste faire : relancer Ollama, recopier une clé, recharger un compte, corriger un nom de modèle.

## Deux règles de code à ne pas enfreindre

**1. Aucun `fetch` direct dans une page.** Tous les appels au backend passent par `frontend/lib/api/`. C'est ce qui permet de changer la gestion des erreurs ou d'ajouter un en-tête d'authentification à un seul endroit.

**2. Aucun client externe créé au chargement d'un fichier.** Le fournisseur d'IA, Resend et Supabase sont instanciés à la première utilisation réelle. Sinon, une clé absente ne désactive pas une fonctionnalité : elle empêche le serveur entier de démarrer, avec un message d'erreur venu d'une bibliothèque tierce qui ne mentionne ni Mew ni sa configuration. **Le serveur doit toujours démarrer, même sans aucune configuration.**

**3. Une clé API ne quitte jamais le backend.** Elle ne repart pas vers le navigateur (seule `configUtilisateur.lireMasquee()` a le droit de décrire la configuration vers l'extérieur, et elle rend `sk-p...4f2a`), elle n'apparaît dans aucun log, dans aucun message d'erreur, et ne transite jamais dans une URL.

## Par où commencer

De bonnes premières contributions, bien délimitées et sans risque de tout casser :

- **Accessibilité** : les zones de dépôt de PDF ne sont pas utilisables au clavier, et la plupart des `<label>` ne sont pas reliés à leur champ. Un outil de recherche d'emploi inutilisable par une partie des chercheurs d'emploi, c'est un problème de fond.
- **Thème clair** : plusieurs écrans du matcher codent des couleurs en dur pour un fond sombre et restent illisibles en thème clair.
- **Tests** : il n'y en a presque pas. `node --test` est déjà configuré, aucune dépendance à installer.
- **Déduplication** : plusieurs composants sont écrits plusieurs fois (bouton copier, écran de chargement, formatage des expériences).

Le détail de tout ça, avec les fichiers et les numéros de ligne, est dans [docs/refonte/](docs/refonte/).

## Signaler un bug

Dites ce que vous attendiez, ce qui s'est passé, et comment le reproduire. Précisez votre système, votre version de Node (`node -v`) et si vous utilisez une clé API ou non.

**N'incluez jamais votre vrai CV ni une clé API** dans un rapport de bug, une capture d'écran ou un fichier de test : ce dépôt est public. Si vous avez publié une clé par accident, révoquez-la chez le fournisseur — la retirer du commit ne suffit pas.
