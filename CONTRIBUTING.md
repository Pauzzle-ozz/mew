# Contribuer à Mew

Merci de vous intéresser au projet. Ce document explique comment travailler dessus.

## Mettre en route

```bash
git clone https://github.com/Pauzzle-ozz/mew.git
cd mew
cd backend && npm install && cd ../frontend && npm install
```

Aucune clé API n'est nécessaire pour développer : le serveur démarre sans configuration et vous annonce ce qui est actif. Vous n'avez besoin d'une clé OpenAI que si vous travaillez sur les trois fonctions de rédaction.

Deux terminaux : `cd backend && npm run dev` et `cd frontend && npm run dev`.

## Avant d'ouvrir une pull request

```bash
cd frontend && npm run build   # doit passer
cd frontend && npm run lint    # 0 erreur (3 warnings React sont connus et assumés)
cd backend  && npm test        # doit passer
```

Et démarrez le serveur au moins une fois **sans fichier `.env`** : le projet doit toujours fonctionner sans configuration.

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
| Changer le modèle utilisé | `backend/.env` — les modèles sont désignés par rôle, jamais écrits dans le code |
| Ajouter une page | `frontend/app/` |
| Modifier les couleurs, le thème | `frontend/app/globals.css` (variables CSS) |

## Deux règles de code à ne pas enfreindre

**1. Aucun `fetch` direct dans une page.** Tous les appels au backend passent par `frontend/lib/api/`. C'est ce qui permet de changer la gestion des erreurs ou d'ajouter un en-tête d'authentification à un seul endroit.

**2. Aucun client externe créé au chargement d'un fichier.** OpenAI, Resend et Supabase sont instanciés à la première utilisation réelle. Sinon, une clé absente ne désactive pas une fonctionnalité : elle empêche le serveur entier de démarrer, avec un message d'erreur venu d'une bibliothèque tierce qui ne mentionne ni Mew ni le fichier `.env`.

## Par où commencer

De bonnes premières contributions, bien délimitées et sans risque de tout casser :

- **Accessibilité** : les zones de dépôt de PDF ne sont pas utilisables au clavier, et la plupart des `<label>` ne sont pas reliés à leur champ. Un outil de recherche d'emploi inutilisable par une partie des chercheurs d'emploi, c'est un problème de fond.
- **Thème clair** : plusieurs écrans du matcher codent des couleurs en dur pour un fond sombre et restent illisibles en thème clair.
- **Tests** : il n'y en a presque pas. `node --test` est déjà configuré, aucune dépendance à installer.
- **Déduplication** : plusieurs composants sont écrits plusieurs fois (bouton copier, écran de chargement, formatage des expériences).

Le détail de tout ça, avec les fichiers et les numéros de ligne, est dans [docs/refonte/](docs/refonte/).

## Signaler un bug

Dites ce que vous attendiez, ce qui s'est passé, et comment le reproduire. Précisez votre système, votre version de Node (`node -v`) et si vous utilisez une clé API ou non.

**N'incluez jamais votre vrai CV** dans un rapport de bug ou un fichier de test : ce dépôt est public.
