# Licences des donnees embarquees

**Les fichiers de ce dossier ne sont PAS couverts par la licence MIT du code.**
Ils gardent leur propre licence. Il n'y a aucun conflit juridique — le code peut etre
sous MIT et embarquer des donnees sous une autre licence libre — mais il y a une
**obligation d'attribution**, que remplit ce fichier.

---

## `rome/` — Licence Ouverte 2.0 (Etalab)

**Source** : Repertoire Operationnel des Metiers et des Emplois (ROME) 4.0, France Travail.
Version 61, publiee le 15 juin 2026.

**Page officielle** :
https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois-rome

**Licence** : [Licence Ouverte / Open Licence 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence)
Reutilisation libre, y compris commerciale, sous reserve de mentionner la paternite.
**Aucune clause de partage a l'identique** : elle ne contamine pas la licence du projet.

**Modifications apportees** : extraction, reduction et reformatage en JSON UTF-8 compact.
Les definitions de metier sont tronquees a 400 caracteres et les conditions d'acces a 300.
Le script de conversion est [`backend/scripts/build-rome.js`](../../scripts/build-rome.js),
il est reproductible : `npm run data:update`.

**Contenu** :
- `metiers.json` — 1 911 fiches metier (code ROME, intitule, definition, acces, secteurs)
- `appellations.json` — 14 301 appellations, l'index de recherche de metier
- `metier-competences.json` — les savoir-faire de chaque metier
- `metier-savoirs.json` — les savoirs de chaque metier
- `soft-skills.json` — les 16 savoir-etre professionnels officiels
- `verbes-action.json` — 500 verbes d'action, extraits automatiquement des libelles
  de savoir-faire (chacun commence par un infinitif). Tous secteurs confondus.
- `VERSION.json` — tracabilite : source, version, date, volumes

**Limite connue** : le ROME couvre tous les secteurs, mais son vocabulaire technique
informatique est en retard (il connait « Developpeur / Developpeuse informatique »,
pas « full stack », « React » ou « Kubernetes »). Le complement se trouve dans
`fr/technologies.json`, ecrit a la main et couvert par la licence du projet.

---

## `fr/` — Licence du projet (MIT), sauf mention contraire

Fichiers ecrits pour Mew : bareme ATS, titres de sections de CV, types de contrat,
niveaux de diplome, gabarits d'email, technologies.

**Exception** : `fr/stopwords.json` est adapte de
[stopwords-iso/stopwords-fr](https://github.com/stopwords-iso/stopwords-fr), sous licence **MIT**.

---

## Comment citer

Le README et le pied de page de l'interface mentionnent :
« Donnees metiers : ROME 4.0 - France Travail - Licence Ouverte 2.0 ».
Merci de conserver cette mention si vous reutilisez le projet.
