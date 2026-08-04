# Mew — Architecture cible « code d'abord, LLM ponctuel »
### Document d'architecture + plan de migration

> **Principe directeur du propriétaire :** *« En majorité, ce que les fonctionnalités doivent faire, c'est du code en dur. Et s'il y a besoin d'intelligence à un moment, on fait appel à une API qui pointe vers un LLM. Le tout en local, il faut juste que l'utilisateur soit connecté à internet. »*

**Vocabulaire de base** (utilisé partout dans ce document) :
- **Déterministe** = même entrée → même sortie, toujours. Un calcul, pas une devinette.
- **Token** = un morceau de mot (≈ 4 caractères en français). L'unité facturée par OpenAI.
- **Prompt** = le texte qu'on envoie au modèle.
- **Regex** = un motif de recherche dans du texte (ex. « une chaîne qui contient un @ entouré de lettres » = un email).
- **Mode dégradé** = l'application tourne sans clé API, avec moins de confort mais elle reste utile.

---

## 1. Le constat en chiffres

**Hypothèses de calcul** (assumées, vérifiables) : 1 token ≈ 4 caractères FR · CV PDF ≈ 5 000 car. (1 250 tokens) · offre scrapée typique ≈ 15 000 car. (3 750 tokens), plafonnée à 50 000 car. = 12 500 tokens (`backend/src/services/scraperService.js:302-305`). Tarifs publics OpenAI : gpt-4o = 2,50 $/M en entrée et 10,00 $/M en sortie · gpt-4.1-mini = 0,40 $/M et 1,60 $/M. 1 $ ≈ 0,92 €.

**Correction importante par rapport aux estimations initiales** : le « CV idéal » n'est **jamais généré depuis l'interface**. `frontend-v2/app/solutions/matcher-offres/page.js:244` fixe `generateIdealCV: false` et cette constante alimente les 3 chemins d'appel. Il reste en revanche **actif par défaut côté service** (`matcherService.js:31` et `:86`) et côté route (`routes/matcher.js:251`) : n'importe quel appel API sans champ `options` déclenche encore 2 appels gpt-4o pour rien. Les chiffres ci-dessous reflètent l'usage réel via l'interface.

| Fonctionnalité | Route | Appels LLM **aujourd'hui** | Modèles | Coût / usage | Temps ressenti | **Après migration** | Coût après |
|---|---|---:|---|---:|---:|---:|---:|
| Analyseur CV (formulaire) | `POST /api/solutions/analyse-cv` | **2** | mini ×2 | ~0,005 € | 8-14 s | **0** (1 court à la demande) | ~0 € |
| Analyseur CV (PDF) | `POST /api/solutions/analyse-cv-pdf-complete` | **2** | mini ×2 | ~0,005 € | 10-16 s | **0** (+ filet si CV atypique) | ~0 € |
| Optimiseur CV / score ATS | `POST /api/solutions/optimiser-cv-pdf` | **2** | mini ×2 | ~0,004 € | 15-25 s | **1** (réécriture ciblée) | ~0,001 € |
| Matcher — mode URL | `POST /api/matcher/analyser-scraper` | **4** | 4o ×2 + mini ×2 | ~0,040 € (jusqu'à 0,077 € sur page lourde) | 20-35 s | **2** | ~0,008 € |
| Matcher — mode Rapide (CV+URL) | `POST /api/matcher/generer-complet` | **5** | mini + 4o ×2 + mini ×2 | ~0,042 € | 25-40 s | **2** | ~0,008 € |
| Matcher — mode Formulaire | `POST /api/matcher/analyser` | **4** | 4o ×2 + mini ×2 | ~0,022 € | 18-30 s | **2** | ~0,007 € |
| Matcher — adapter une offre découverte | `POST /api/matcher/adapter-rapide` | **3** | mini + 4o + mini | ~0,020 € | 15-25 s | **1** (+ cache PDF) | ~0,006 € |
| Mode Découverte | `POST /api/matcher/decouvrir-offres` | **1** | mini | ~0,0012 € | 20-60 s (scraping) | **0** | 0 € |
| Extraction candidat seule | `POST /api/matcher/extraire-candidat-pdf` | **1** | mini | ~0,002 € | 3-6 s | **0 à 1** (selon confiance) | ~0,0005 € |
| Candidature spontanée | `POST /api/candidature-spontanee/envoyer` | **2** | 4o + mini | ~0,007 € | 8-14 s | **1** | ~0,005 € |
| Relance | `POST /api/candidature-spontanee/generer-relance` | **2** | mini ×2 | ~0,0005 € | 3-6 s | **0** | 0 € |
| Suivi de candidatures (CRUD) | `/api/applications/*` | 0 | — | 0 € | < 1 s | 0 | 0 € |
| Historique | `/api/historique/*` | 0 | — | 0 € | < 1 s | 0 | 0 € |

**TOTAL — parcours utilisateur complet** (analyse CV + optimiseur + matcher mode Rapide + candidature spontanée) :

| | Aujourd'hui | Après | Écart |
|---|---:|---:|---:|
| Appels OpenAI | **11** | **4** | **−64 %** |
| Coût | **~0,058 €** | **~0,014 €** | **−76 %** |
| Attente cumulée | **55-90 s** | **15-25 s** | **≈ ÷3,5** |
| Appels qui ne font **que reformater** | **5 sur 11 (45 %)** | **0** | — |

**Trois chiffres à retenir, et il faut être honnête sur ce qu'ils veulent dire :**

1. **L'économie d'argent est dérisoire.** Sur 1 000 parcours par mois, on passe de 58 € à 14 €. Ce n'est **pas** un projet d'économie et il ne faut pas le vendre comme tel.
2. **Le gain réel est ailleurs** : la latence divisée par 3,5 (c'est ce que l'utilisateur ressent), la **reproductibilité** (aujourd'hui le même CV analysé deux fois donne deux scores différents), la **confidentialité** (on cesse d'envoyer email, téléphone et adresse à OpenAI), et le **mode hors-ligne** (4 outils sur 5 restent utilisables sans clé).
3. **Le premier poste de dépense n'est pas la conversion JSON, c'est le texte scrapé envoyé deux fois à gpt-4o.** `matcherService.js:101-120` lance en parallèle 2 workflows qui reçoivent chacun le même `rawText` (jusqu'à 12 500 tokens), et **chacun des deux prompts redemande au modèle d'extraire l'offre** (`scraperCvPersonnalise.js:16-25` et `scraperLettre.js:16-25`, blocs identiques mot pour mot). On paie deux fois la même extraction, en parallèle, sur le même texte.

**Trois problèmes de qualité que les chiffres ne montrent pas :**

- **Aucune température n'est fixée** sur les appels d'analyse. `aiService.js:33` (`if (temperature !== undefined) params.temperature = temperature;`) et `cvService.js:36` qui ne passe que `{ model }` → OpenAI applique **1.0**, le maximum de variabilité. Le même CV donne 78, puis 85, puis 81.
- **On demande au modèle de faire une multiplication.** `jsonSchemas.js:66` : *« moyenne pondérée des 3 scores (adequation × 0.4 + marche × 0.35 + potentiel × 0.25), arrondie »*. C'est `Math.round(a*0.4 + m*0.35 + e*0.25)`.
- **On demande au modèle de s'auto-noter au-dessus de 80.** Le prompt qui produit le `SCORE_MATCHING` contient aussi *« OBJECTIF : le CV optimisé doit atteindre un score de concordance MINIMUM de 80/100 »*. Le beau cercle vert de `MatcherTransparency.jsx` ne mesure pas la correspondance candidat/offre : il mesure l'obéissance du modèle à une consigne.

---

## 2. La règle de partage

> **1.** Si deux personnes différentes, avec la même information sous les yeux, arriveraient **forcément au même résultat**, alors c'est du **code** — même si le résultat est un nombre, un classement, une liste ou une phrase toute faite.
>
> **2.** Le LLM n'intervient que pour produire un **texte destiné à être lu par un humain qui va le juger** (email, lettre, accroche, conseil), ou pour **reformuler une phrase existante** en gardant son sens.
>
> **3.** Dans ce cas, le code calcule d'abord **tout ce qui est calculable**, et n'envoie au modèle **que la matière à rédiger** — jamais le document brut, jamais les données factuelles qu'on lui interdit de modifier.

**Le test pratique, en une question :** *« Est-ce que je peux écrire un test automatique qui vérifie que la réponse est la bonne ? »*
- **Oui** → c'est du code. (Un email est valide ou pas. Un score se recalcule. Une intersection de deux listes a une seule bonne réponse.)
- **Non, ça dépend du goût du lecteur** → c'est le LLM.

**Les trois pièges qui font échouer ce test :**
- *« Le LLM fait ça très bien »* n'est pas un argument. La question n'est pas s'il sait le faire, c'est si un calcul le ferait aussi bien **et de façon reproductible**.
- *« C'est trop compliqué en regex »* est souvent faux. `scraperService.js:241` dit `company: null, // Trop difficile à extraire par regex` — alors que tous les grands sites d'emploi publient le nom de l'entreprise en JSON dans leur page pour être référencés par Google for Jobs.
- **Un LLM ne connaît aucun chiffre du monde réel après sa date d'entraînement.** Lui demander « le ratio offres/candidats » ou « la tension du marché » (`analyseCvForm.js:83-86`), c'est lui demander d'inventer une statistique. Ces données existent en open data.

---

## 3. Ce qui devient du code déterministe

> Colonne « effort » : **S** = quelques heures · **M** = 1 à 2 jours · **L** = 3 à 5 jours.

### 3.1 Couche IA partagée (`aiService`) — bénéficie aux 5 outils

| # | Appel supprimé | L'algorithme qui le remplace | Fichiers à créer / modifier | Effort |
|---|---|---|---|---|
| A1 | **Étape 2 de `generateThenConvert`** (`aiService.js:91-101`) — on paie un 2e modèle pour retaper en JSON le texte que le 1er vient d'écrire. 8 appelants. | Soit le 1er appel répond **directement en JSON contraint par un schéma** (« Structured Outputs », supporté par le SDK `openai ^6.19.0` déjà installé), soit on **découpe le texte en JS** quand le format est déjà imposé par notre propre prompt. | `llm/client.js`, `llm/config.js`, `llm/schemas/*.json`, `llm/parseurs/emailSpontane.js` · **supprimer** `prompts/jsonSchemas.js` (343 lignes) | M |
| A2 | **Le retry aveugle de `generateJSON`** (`aiService.js:65-79`) — on renvoie le prompt **complet** (jusqu'à 14 000 tokens) parce qu'il manquait une accolade. | Escalier du gratuit au payant : (1) `JSON.parse` ; (2) **réparation locale** — retirer les ```` ```json ````, couper avant le premier `{` et après le dernier `}`, supprimer les virgules traînantes ; (3) si `finish_reason === 'length'`, relancer avec `max_tokens` ×2 ; (4) retry **ciblé** (sortie cassée + message d'erreur + schéma ≈ 1 500 tokens au lieu de 14 000) ; (5) `fallback`. | `llm/reparerJson.js` | S |
| A3 | **Le calcul de moyenne pondérée** confié au modèle (`jsonSchemas.js:66`) | `Math.round(a*0.4 + m*0.35 + e*0.25)`. Une ligne. | `core/score/moyennePonderee.js` | S |
| A4 | **Le tri et la `priorite` des métiers** décidés par le modèle | `metiers.sort((x,y) => y.scores.global - x.scores.global).forEach((m,i) => m.priorite = i+1)` | idem A3 | S |
| A5 | **`normalizeCategorie`** (`cvService.js:16-26`) — du code déterministe écrit **uniquement pour réparer** les fantaisies d'accent du modèle | La catégorie devient un **seuil numérique** (≥ 65 / 40-64 / < 40). La fonction disparaît. | `core/score/metiers.js` | S |
| A6 | **Bug silencieux** : `aiService.js:96` fait `.replace('{{GENERATED_TEXT}}', texte)` — les motifs `$&`, `$'`, `` $` `` contenus dans le texte (un CV qui parle de salaires en `$`) **corrompent le prompt**. | `.replace('{{GENERATED_TEXT}}', () => texte)` — passer une fonction désactive l'interprétation. | `aiService.js:96` | S |
| A7 | **25 noms de modèles codés en dur** (`matcherService` ×13, `cvService` ×6, `candidatureSpontanee` ×4, `aiService` ×1, `jobDiscovery` ×1) | Un fichier de **rôles** : `redaction` / `extraction` / `jugement`. Le code métier n'écrit plus jamais `'gpt-4o'`. Ajout d'une `baseURL` optionnelle → basculer sur un modèle local (Ollama, LM Studio) = 2 lignes de `.env`. | `llm/config.js` | S |
| A8 | **`response.usage` jamais lu** (`aiService.js:36-37`, `:62-63`) → impossible de savoir ce que coûte une requête | Lire `prompt_tokens` / `completion_tokens`, multiplier par le tarif, journaliser en euros. **C'est le prérequis de tout le reste** : sans mesure, aucune économie annoncée dans ce document n'est vérifiable. | `llm/cout.js` | S |

### 3.2 Analyseur de CV (`/solutions/analyse-cv`)

| # | Appel supprimé | L'algorithme qui le remplace | Fichiers | Effort |
|---|---|---|---|---|
| B1 | **Analyse du formulaire** (`cvService.js:36`) — le modèle relit un formulaire que l'utilisateur a lui-même découpé champ par champ | **Intersection d'ensembles + score pondéré.** On normalise les compétences saisies (minuscules, accents retirés via `s.normalize('NFD').replace(/\p{Diacritic}/gu,'')`), on les compare aux compétences de chaque fiche métier du référentiel ROME, et on note : 35 % compétences essentielles + 20 % importantes + 20 % proximité d'intitulé + 10 % séniorité + 10 % bonus + 5 % soft skills. **Sortie : un score explicable ligne par ligne.** | `core/score/metiers.js`, `core/texte/normaliser.js`, `core/texte/similarite.js`, `data/rome/*` | L |
| B2 | **Analyse du CV PDF** (`cvService.js:72`) — le texte brut entier part dans le prompt sans **aucun** pré-traitement (`analyseCvPdf.js:11`) | **Parseur de CV en 5 passes** : nettoyage → découpage en sections par en-têtes (une ligne courte, sans point final, souvent en MAJUSCULES) → extraction d'entités par regex (email, téléphone, LinkedIn, dates) → **calcul de l'ancienneté** (on convertit chaque période en mois et on **fusionne les chevauchements** avant de sommer, sinon deux jobs en parallèle comptent double) → détection des compétences. Le même moteur de scoring que B1 prend le relais. | `core/cv/decouperSections.js`, `core/cv/extraireContact.js`, `core/cv/extraireDates.js`, `core/cv/profil.js` | L |
| B3 | **Les deux conversions JSON** (`cvService.js:40`, `:76`) | Disparaissent : le service construit l'objet en JavaScript, il n'y a plus de texte à reparser. | — | S |
| B4 | **La note « marché emploi »** inventée par le modèle | **Lecture d'un fichier.** Score = échelle logarithmique du volume d'offres : `min(100, round(24 * Math.log10(1 + nbOffres)))` — 10 offres → 25, 1 000 offres → 72. Source : enquête BMO de France Travail par code ROME (open data), ou appel réel à l'API FT si `FT_CLIENT_ID` est configuré. **On affiche la source et l'année sous la barre.** | `data/rome/tension.json`, `core/score/metiers.js` | M |
| B5 | **La note « potentiel évolution »** (salaire, télétravail — pure invention) | **Remplacée par une information vraie** : la 3ᵉ barre affiche « Compétences maîtrisées : 9 / 12 », un chiffre calculé et directement actionnable. | idem B4 | S |
| B6 | **Points forts / lacunes / justifications / mots-clés** rédigés par le modèle | **Ensemblisme + phrases à trous.** points_forts = intersection(essentielles du métier, compétences du CV) ; lacunes = différence ; justification = `Tu maîtrises ${n} des ${total} compétences essentielles (${liste}).` **Exact par construction**, alors qu'aujourd'hui le modèle peut lister comme atout une compétence absente du profil sans que rien ne le détecte. | `core/gabarits/justifications.js` | S |
| B7 | **Panne silencieuse non détectée** : un PDF scanné (une photo de CV) donne un texte vide, qui part quand même dans le prompt, et le modèle **invente 8 métiers à partir de rien** | `if (texte.trim().length < 200)` → erreur claire : « Ton PDF est une image scannée, pas du texte. Réexporte-le depuis Word. » **3 lignes qui suppriment une catégorie entière de résultats faux.** | `routes/solutions.js:78` | S |

### 3.3 Optimiseur de CV / score ATS (`/solutions/optimiseur-cv`)

| # | Appel supprimé | L'algorithme qui le remplace | Fichiers | Effort |
|---|---|---|---|---|
| C1 | **Le score ATS sur 100** (`optimiseCvPdf.js:66` : *« Commence par : SCORE ATS: [nombre entre 0 et 100] »* — le prompt ne définit **aucun** critère) | **Barème à points, 100 points, dans un fichier JSON éditable.** 8 familles : structure des sections (18) · coordonnées (14) · dates et chronologie (11) · longueur (9) · rédaction (11) · résultats chiffrés (11) · mots-clés du poste (14) · compatibilité technique (12). **Règle indispensable : tout critère non mesurable pour ce CV sort du calcul ET du dénominateur**, et le score s'affiche en pourcentage des points applicables — sinon une infirmière obtient 0/14 sur les mots-clés tech, systématiquement. | `core/score/ats.js`, `data/fr/ats-bareme.json`, `data/rome/verbes-action.json` | M |
| C2 | **Points forts + améliorations** (`optimiseCvPdf.js:67-68`) — le prompt liste 10 règles ATS aux lignes 26-56, puis demande au modèle de… les recracher | **Le barème sait déjà quel critère est raté et de combien.** On y branche un message par critère, avec les mesures injectées : *« 3 de vos 14 bullets contiennent un chiffre, soit 21 % (−5 pts). Visez la moitié. »* **Tri par (points perdus ÷ facilité)** : « ajouter votre téléphone » (10 secondes) passe avant « réécrire 14 bullets » (une heure). | `core/score/recommandations.js` | S |
| C3 | **La conversion JSON** (`cvService.js:111`) | Disparaît. Elle contient au passage deux poisons : `jsonSchemas.js:94` donne `"score_ats": 85` en exemple (le modèle est tiré vers 85), et `jsonSchemas.js:135` ordonne *« Ne JAMAIS laisser vide, inventer si nécessaire »* — on attribue au candidat des qualités qu'il n'a jamais mentionnées, dans un document qu'il enverra à de vrais recruteurs. | — | S |
| C4 | **Le comparatif avant/après** — qui **n'existe pas** aujourd'hui malgré le CLAUDE.md : `OptimizedSection` ne reçoit qu'un seul texte, il n'y a nulle part de `originalText` | **3 couches, toutes gratuites** : (1) diff de score — on relance le barème après réécriture : « 62 → 81, dont +8 sur les verbes d'action » ; (2) diff mot à mot par **plus longue sous-séquence commune** (le principe de `git diff`) → surlignage vert/barré ; (3) **indice de Jaccard** entre les deux sacs de mots — au-delà de 0,95 on dit honnêtement « la réécriture a changé moins de 5 % du texte » au lieu de vendre une optimisation fictive. | `core/cv/diff.js` | M |
| C5 | **Bug du score 0** : `cvService.js:116` fait `parsed.score_ats \|\| null` → un score de 0 (valeur *falsy*) devient `null` et la jauge disparaît. Même bug dans `ToolHistory.jsx` (`score_ats &&`). Aujourd'hui théorique ; avec un barème déterministe, 0 devient **réellement atteignable** (PDF scanné). | `?? null` et `!= null` | S |

### 3.4 Matcher d'offres (`/solutions/matcher-offres`)

| # | Appel supprimé | L'algorithme qui le remplace | Fichiers | Effort |
|---|---|---|---|---|
| D1 | **L'extraction de l'offre, faite 2 fois en parallèle par gpt-4o** sur 12 500 tokens de page web | **Cascade à 3 niveaux, sans nouvelle dépendance.** (1) **JSON-LD** : on cherche les blocs `<script type="application/ld+json">`, on garde l'objet `@type: "JobPosting"` — titre, entreprise, lieu, contrat, salaire et description y sont déjà structurés, parce que les sites en ont besoin pour Google for Jobs. (2) **Balises meta** : `og:title`, `og:site_name`, `<title>` découpé sur ` - ` / ` \| `. (3) **Heuristique** : premier `<h1>`, code postal en regex, description = le bloc le plus long contenant un marqueur d'offre (« missions », « profil recherché »). Chaque niveau renvoie un champ `confiance`. | `core/offre/extraireJsonLd.js`, `core/offre/extraireOffre.js` · **modifier** `scraperService.js:110` et `:163-176` (conserver le HTML) | L |
| D1b | **Prérequis bloquant** : `scraperService.js:285` bascule sur Puppeteer seulement si `rawText.length < 200`. WTTJ et Indeed sont des applications JavaScript : Axios récupère une coquille qui fait bien plus de 200 caractères mais **ne contient ni l'offre ni son JSON-LD**. | Le critère devient : « pas de bloc `JobPosting` trouvé **OU** texte court ». Sans ce correctif, tout le niveau 1 tombe à plat sur les deux sites les plus utilisés. | `scraperService.js:285` | S |
| D1c | **Gain gratuit et immédiat** : le plafond à 50 000 caractères | Le passer à **15 000**. Une offre ne fait jamais 50 000 caractères ; au-delà on paie du menu de navigation. **Une ligne, −70 % sur le pire cas.** | `scraperService.js:302` | S |
| D2 | **Le `SCORE_MATCHING`** que le prompt force lui-même au-dessus de 80 | **Moyenne pondérée de 4 signaux, chacun affichable.** (1) Couverture des mots-clés de l'offre, 50 % — on garde les termes rares de l'offre (les exigences) et on regarde combien sont dans le CV, en direct ou par **Jaro-Winkler ≥ 0,92** (une mesure de ressemblance entre deux chaînes, entre 0 et 1, qui bonifie le préfixe commun : elle rattrape `kubernets` → `kubernetes`). (2) Proximité des intitulés, 20 % — par **indice de Dice sur les mots**, jamais Jaro-Winkler : « chef de projet » vs « chef de produit » donne 0,67 au lieu de 0,93. (3) Années d'expérience, 15 %. (4) Diplôme, 15 %. **Même règle de neutralisation-redistribution que le barème ATS** : si le dictionnaire reconnaît moins de 3 compétences dans l'offre, les poids basculent sur les critères qui ne dépendent d'aucun dictionnaire. | `core/score/matching.js`, `core/offre/extraireExigences.js` | M |
| D3 | **La liste des « modifications apportées »** — le modèle raconte ce qu'il vient de faire, dans la même réponse où il le fait | **Comparaison de deux objets JavaScript.** On a les deux versions du CV côte à côte en mémoire (`matcherService.js:221-225`). Le code, lui, ne ment pas. **Prérequis manquant** : il existe **trois schémas de CV incompatibles** dans le projet (`extractCandidatFromCV.js:33-38` produit `{titre, entreprise, dates, description}`, `jsonSchemas.js:180-187` produit `{poste, …, date_debut, date_fin, …}`, et l'état du mode Formulaire n'a **aucun** champ `resume`) → il faut d'abord un normalisateur. | `core/cv/normaliserSchema.js`, `core/cv/diff.js` | M |
| D4 | **Le « CV idéal »** (2 workflows, 2 prompts, ~150 lignes) | **Suppression.** Le code est mort côté interface depuis `page.js:244`. Geste immédiat : passer `generateIdealCV` à `false` par défaut dans `matcherService.js:31`, `:86` et `routes/matcher.js:251` — **2 caractères, 5 minutes, aucun risque**. Si la fonctionnalité revient un jour, ce sera une **checklist** (« l'offre attend 10 choses, votre CV en couvre 7 »), qui sort gratuitement du critère 1 du score. | **supprimer** `prompts/matcherCvIdeal.js`, `prompts/scraperCvIdeal.js`, `idealCVToJSON` | S |
| D5 | **L'extraction du profil candidat**, relancée **à chaque clic** sur « Adapter CV » en mode Découverte : 5 offres = 5 extractions identiques du même PDF | **Cache par empreinte du fichier**, ~20 lignes : `crypto.createHash('sha256').update(buffer).digest('hex')`, une `Map` en mémoire, durée de vie 1 h. Même fichier = même empreinte = zéro appel. `crypto` est natif Node, aucune dépendance. **Meilleur rapport valeur/effort de toute la liste.** | `lib/cache/pdfCache.js` | S |
| D6 | **L'analyse de profil du mode Découverte** (`jobDiscoveryService.js:67`) | Les `mots_cles` produits par le modèle sont **purement perdus** : le paramètre `motsCles` est déclaré dans la signature de `_scrapeWTTJ` (`:107`) et `_searchFranceTravail` (`:197`) mais **n'apparaît jamais dans le corps** (l'appel FT envoie `motsCles: titrePoste`, `:236`). Remplacement : les **appellations ROME** sont exactement ces mots-clés, officielles et exhaustives. `niveau_experience` = somme des mois (avec fusion des chevauchements). `resume_profil` = un gabarit de 20 mots. | `core/score/metiers.js`, `core/cv/experience.js` | M |
| D7 | **Trou fonctionnel** : les offres du mode Découverte **ne sont pas classées**. `jobDiscoveryService.js:520-527` dédoublonne par URL et rend le tableau dans l'ordre d'arrivée des sources — alors que l'interface promet « IA matching ». | Le moteur D2 trie 30 offres en quelques millisecondes, avec le détail sur chaque carte : « 87 % — 8 des 9 compétences demandées ». **Zéro appel, amélioration la plus visible de toute la liste.** | `core/score/matching.js` | S |

### 3.5 Candidature spontanée et suivi

| # | Appel supprimé | L'algorithme qui le remplace | Fichiers | Effort |
|---|---|---|---|---|
| E1 | **La conversion JSON de l'email** (`candidatureSpontaneeService.js:34`, étape 2) — on paie un modèle pour découper une chaîne sur un séparateur **qu'on a soi-même imposé 40 lignes plus haut** (`spontaneEmail.js:42-45` : `SUBJECT: …` / `---` / corps) | **8 lignes de JS**, avec deux tolérances indispensables : accepter `OBJET` comme `SUBJECT` et le gras markdown `**SUBJECT:**` ; si le séparateur `---` manque, première ligne = objet, reste = corps. Sinon on **régresse** en robustesse par rapport au modèle. | `llm/parseurs/emailSpontane.js` | S |
| E2 | **L'objet de l'email** rédigé par le modèle | `Candidature spontanee - ${poste}` (+ ` \| ${entreprise}`). Un recruteur filtre sa boîte par mot-clé : un objet plat et cherchable est **meilleur**, pas juste moins cher. | `data/fr/templates-email.json` | S |
| E3 | **`candidate_name`** demandé au modèle pour nommer la pièce jointe `CV_Prenom_Nom.pdf` | **Un champ de formulaire.** Le formulaire a déjà 4 champs, un cinquième ne coûte rien, et c'est fiable à 100 % — contrairement à toute heuristique d'extraction (beaucoup de CV commencent par le **titre du poste** en capitales, pas par le nom : on obtiendrait `CV_Infirmier_Diplome_D_Etat.pdf`). L'email de contact, lui, est **déjà disponible** via `user.email`. | `frontend-v2/app/solutions/candidature-spontanee/page.js` | S |
| E4 | **Les 2 appels de la relance** (`candidatureSpontaneeService.js:102`) | **Gabarit à trous.** Le prompt (`spontaneFollowUp.js:18-29`) impose déjà : 80 mots max, ouverture imposée, clôture imposée, et **l'objet est littéralement écrit dedans** (`SUBJECT: Re: ${originalSubject}`). Il ne reste aucune liberté. 2 variantes choisies par une règle métier (`joursEcoules ≤ 21` → standard, `> 21` → dernier point). **Ici le gabarit est meilleur que le LLM, pas juste moins cher** : un texte relu et validé une fois pour toutes bat un texte différent à chaque fois que personne ne relit. | `core/gabarits/relance.js`, `core/suivi/relances.js` | M |
| E5 | **Bug de données** : `routes/candidatureSpontanee.js:101` récupère le nom du candidat par `app.notes?.match(/Objet: .+ - (.+)/)` sur un champ de notes en français libre. La regex est **gourmande** : si l'objet contient un tiret (`Candidature spontanee - Développeur Web`), elle capture **le nom du poste**. Les relances partent signées « Développeur Web » — ou « Candidat » via le fallback. | **Arrêter de stocker des données dans une phrase.** Migration : `ALTER TABLE job_applications ADD COLUMN candidate_name TEXT DEFAULT '', ADD COLUMN original_subject TEXT DEFAULT '';` | S |
| E6 | **Bug de données** : `applicationService.js:11-30` n'insère **jamais** `applied_at`, alors que la candidature est créée avec `status: 'postule'`. Toute statistique future (délai de réponse, candidatures dormantes) sera fausse. | `applied_at: data.applied_at \|\| (data.status === 'postule' ? new Date().toISOString() : null)` | S |
| E7 | **Fonctionnalité morte** : `follow_up_date` est **écrite** en base mais la chaîne `follow_up` n'apparaît **nulle part** dans le code source du frontend. Dès que l'utilisateur quitte l'écran de confirmation, il n'a plus aucun moyen de retrouver ses relances. | `apps.filter(a => a.follow_up_date <= aujourdhui && !a.follow_up_sent && a.status === 'postule')` → un bandeau « X relances à faire aujourd'hui » dans le tracker. **Rendre la relance gratuite ne sert à rien si personne ne peut la retrouver.** | `core/suivi/relances.js` + composant | M |
| E8 | **Amélioration gratuite** : la relance à J+8 tombe parfois un samedi | `prochainJourOuvre(date)` : samedi → +2, dimanche → +1, jour férié → +1. Les 11 fériés français se calculent (8 fixes + 3 dérivés de Pâques par l'algorithme de Meeus, ~20 lignes d'arithmétique). | `core/suivi/joursOuvres.js` | S |

---

## 4. Ce qui reste au LLM, et pourquoi

**Trois tâches. Trois seulement.** Toutes les trois sont de la **rédaction destinée à un œil humain qui va juger**.

### 4.1 La lettre de motivation — `LLM_JUSTIFIÉ`

**Pourquoi aucun algorithme ne fait l'affaire.** Une lettre doit construire une **argumentation** entre un parcours et un besoin, adapter son registre au secteur (une startup et un cabinet d'expertise comptable n'attendent pas la même chose), et rester fluide sur trois paragraphes. Un gabarit à trous du type *« Je suis vivement intéressé par le poste de [X] au sein de [Y] »* produit exactement la lettre qu'un recruteur reconnaît et jette en dix secondes. C'est l'inverse du résultat recherché.

**Comment on réduit le périmètre — de ~13 000 tokens à ~1 200 :**
- **On n'envoie plus la page web.** L'offre extraite en local (D1) fait ~300 tokens au lieu de 12 500.
- **On envoie la matière que le code a calculée**, et c'est un gain de **qualité**, pas seulement de coût. Aujourd'hui le modèle doit deviner seul quels arguments mettre en avant en fouillant dans du bruit. Demain il reçoit : *« Arguments prioritaires : React (5 ans, projet Y), microservices, gestion d'équipe. Points faibles à ne pas évoquer frontalement : Kubernetes, Terraform. Expérience la plus pertinente : Lead Dev chez Acme, 2021-2024. »*
- **`greeting` et `closing` sont figés en JS.** Ce sont déjà des constantes de fait dans le schéma (`jsonSchemas.js:290`, `:294`). Le modèle ne rédige plus que 3 champs sur 5.
- **On supprime la conversion JSON — et sans écrire de parseur.** Trouvaille : `frontend-v2/app/solutions/matcher-offres/page.js:201-210` (`formatLetterText`) **recolle immédiatement** les 5 champs avec `\n\n` pour les afficher. On paie donc un modèle pour découper un texte que le frontend rassemble 200 ms plus tard. La bonne solution est de **retourner la lettre en texte brut**. C'est du travail négatif : un appel en moins, un parseur en moins.
- **Les deux prompts font doublon** (`matcherLettre.js` et `scraperLettre.js` ont un corps identique une fois le bloc d'extraction retiré) → un seul fichier.

### 4.2 L'email de candidature spontanée — `LLM_JUSTIFIÉ`

**Pourquoi.** 120 à 180 mots d'approche à froid, dont l'accroche doit donner envie de répondre à quelqu'un qui n'attend rien. Même argument que la lettre : un gabarit se voit.

**Comment on réduit :**
- **Le code construit l'email, le modèle remplit un trou.**
  `body = formuleAppel + "\n\n" + BLOC_LLM + "\n\n" + cta + "\n\nCordialement,\n" + nom + "\n" + email`
  La formule d'appel est **déjà calculée en JS** (`spontaneEmail.js:6-8`) puis re-dictée au modèle ; la clôture et l'appel à l'action sont dictés mot pour mot (`:36-37`). Sur 180 mots produits, ~55 sont du gabarit déguisé.
- **Consigne au modèle** : *« Écris DEUX paragraphes, rien d'autre. Ni formule d'appel, ni politesse, ni signature, ni objet. N'invente rien. »*
- **Un seul trou, pas deux.** Ne pas découper la réponse sur les lignes vides : si le modèle écrit 3 paragraphes, le découpage casse.
- **Bénéfice caché** : mettre nom + email + téléphone en clair dans la signature **répare à moitié un vrai bug** — l'email part de `onboarding@resend.dev` **sans champ `reply_to`** (vérifié : `reply_to` n'existe nulle part dans le backend). Aujourd'hui, si le recruteur clique sur « Répondre », sa réponse part dans le vide. La fonctionnalité principale de l'outil — **recevoir une réponse** — est cassée.

### 4.3 La réécriture des bullets d'expérience — `LLM_JUSTIFIÉ`

**Pourquoi.** Transformer *« Responsable de la gestion des clients grands comptes »* en *« Pilote un portefeuille de 40 comptes stratégiques »*, c'est du français naturel qui garde le sens. Une substitution mécanique « responsable de » → « pilote » produit *« Pilote du suivi des clients »*, qui est du français bancal. Et surtout, aucun code ne peut choisir **quel aspect mettre en avant pour tel poste**.

**Comment on réduit — et une règle non négociable :**
- **Le code sélectionne le périmètre.** Le barème ATS sait déjà, bullet par bullet, lesquels n'ont pas de verbe d'action, pas de chiffre, ou dépassent 30 mots. Sur un CV de 12-15 bullets, 5 à 8 sont concernés. On n'envoie que ceux-là, avec un identifiant.
- **On n'envoie JAMAIS** : noms d'entreprises, dates, diplômes, établissements, email, téléphone, adresse. Le prompt actuel **interdit déjà** de les modifier (`optimiseCvPdf.js:60`) — les transmettre est donc du pur gaspillage, et c'est autant de données personnelles qui ne quittent plus la machine. **L'hallucination sur les données factuelles devient impossible par construction**, pas par consigne dans un prompt.
- **⚠️ Interdiction d'inventer, en deux volets.** (a) *Pas de chiffre inventé* : si le bullet source n'en contient pas, le modèle renvoie un emplacement `[X %]` que l'utilisateur complète. (b) *Pas de compétence inventée* : si le poste demande Kubernetes et que le candidat n'en a jamais fait, on ne « l'intègre pas naturellement » — le modèle renvoie ces mots-clés dans un champ `non_integres`, que le code affiche comme un **écart de compétences à combler** (« axe de formation, pas axe de réécriture »). Un chiffre approximatif se défend en entretien ; une techno qu'on ne connaît pas, non.
- **Tous les bullets dans le MÊME appel**, jamais un appel par bullet : moins cher **et** plus cohérent (on peut fournir la liste des verbes déjà utilisés).
- Le prompt actuel demande *« Ne JAMAIS laisser vide, inventer si nécessaire »* (`jsonSchemas.js:135`). Cette instruction existe **aussi** dans `personalizedCVToJSON` (`:207`, utilisée par le matcher). Les deux disparaissent.

### 4.4 Deux filets de sécurité, optionnels et rares

| Filet | Déclenché quand | Ce qu'on envoie | Pourquoi c'est légitime |
|---|---|---|---|
| **Extraction d'offre de secours** | `confiance === 'faible'` **et** mode Rapide (le seul mode sans humain dans la boucle) | Le seul bloc de texte candidat, ~2 000 caractères — pas 50 000 | En mode URL, le meilleur filet existe déjà : **un humain**. `UrlScraper.jsx` gère un état `partial` et la page expose un formulaire éditable. Un utilisateur qui corrige 3 champs est gratuit et infaillible. |
| **Découpage du CV de secours** | Moins de 2 sections détectées, ou > 50 % des lignes hors section (signature d'un CV 2 colonnes que `pdf-parse` a entrelacé) | Uniquement la section non résolue | Jugement sémantique sur du vocabulaire inconnu — un dictionnaire ne peut pas le faire. **Règle d'or : ce filet ne remonte JAMAIS le score.** Si notre parseur ne lit pas ce CV, un vrai ATS ne le lira pas non plus. Le modèle **masquerait** le problème au lieu de le révéler. |

### 4.5 Ce que je refuse d'accorder au LLM, malgré les objections

| Objection entendue | Réponse |
|---|---|
| *« Le LLM peut proposer un métier auquel personne n'aurait pensé »* | Vrai. Mais le ROME est le référentiel **officiel** utilisé par France Travail, avec 1 911 fiches et 14 301 appellations. On peut garder **un** appel optionnel `jugement` qui propose 1-2 métiers émergents (« Prompt Engineer ») absents du référentiel — **désactivé par défaut**, et il *complète* le calcul, il ne le remplace pas. |
| *« Le LLM comprend "j'ai encadré une équipe de 5 personnes" et en déduit management »* | Vrai, et c'est la vraie perte assumée. Mitigation : une regex `encadre\|manage\|pilote` + un nombre de personnes → compétence « management d'équipe ». On ne récupérera pas tout. |
| *« Le mode JSON dégrade la qualité rédactionnelle »* | Vrai du vieux mode `json_object` (`aiService.js:56`), qui dit juste « réponds en JSON ». **Faux** des Structured Outputs, où le schéma contraint le décodage : le modèle ne peut plus produire de JSON invalide, donc il n'y consacre plus d'attention. Et pour la lettre et l'email, on garde de toute façon du **texte brut**. |
| *« Un bon parseur de CV, c'est trop dur »* | Sur les CV standards, non. Sur les CV 2 colonnes, oui — et c'est précisément pour ça qu'il y a un **score de confiance** et un filet, pas une suppression sèche. |

---

## 5. L'architecture cible du backend

### 5.1 Les quatre couches, et la règle qui les sépare

```
routes/       ← HTTP : valide l'entrée, appelle un service, mappe les erreurs
services/     ← ORCHESTRATION : appelle core/ d'abord, llm/ seulement s'il reste du texte à écrire
core/         ← ALGORITHMES PURS : zéro réseau, zéro I/O, 100 % testable, gratuit
data/         ← DICTIONNAIRES versionnés en JSON, chargés une fois au démarrage
llm/          ← LA COUCHE IA, isolée : une seule porte d'entrée
```

> **Règle d'or à inscrire dans `CLAUDE.md` :** un fichier de `services/` ne fait **jamais** `require('openai')`. Un fichier de `core/` ne fait **jamais** de `fetch`, ni de `require('../services/…')`. Si tu ne peux pas tester une fonction sans internet, elle n'a rien à faire dans `core/`.

### 5.2 Arborescence complète

```
backend/
├── package.json                          ← + "test": "node --test" (Node ≥18 : lanceur natif, 0 dépendance)
├── scripts/
│   └── build-rome.js                     télécharge et convertit le référentiel ROME (1 fois / 6 mois)
│
├── tests/                                ← n'existe pas aujourd'hui : AUCUN test dans le repo
│   ├── core/…                            miroir de core/
│   └── fixtures/                         CV et pages HTML de référence (CV SYNTHÉTIQUES uniquement, RGPD)
│
└── src/
    ├── server.js                         démarrage Express — NE BLOQUE PLUS si OPENAI_API_KEY est absente
    │
    ├── core/                             ═══ CŒUR DÉTERMINISTE — 0 réseau, 0 euro, 0 ms ═══
    │   ├── texte/
    │   │   ├── normaliser.js             minuscules · accents retirés · espaces insécables du PDF
    │   │   ├── tokeniser.js              découpe en mots, retire les mots vides (stopwords)
    │   │   ├── lemmatiserFr.js           pluriels, féminins de métiers (-euse→-eur, -trice→-teur)
    │   │   └── similarite.js             jaroWinkler (mots) · dice (intitulés) · jaccard · cosinus
    │   ├── cv/
    │   │   ├── decouperSections.js       texte PDF → {contact, résumé, expériences, formations, compétences}
    │   │   ├── extraireContact.js        regex email / téléphone FR / LinkedIn / code postal
    │   │   ├── extraireDates.js          "Jan 2022 - Mars 2024" → {debut, fin, mois}
    │   │   ├── experience.js             somme des durées AVEC fusion des chevauchements
    │   │   ├── extraireCompetences.js    contenu brut de la section (PAS de filtrage par dictionnaire)
    │   │   ├── normaliserSchema.js       ramène les 3 schémas de CV du projet à un seul
    │   │   ├── profil.js                 assemble l'objet Candidat + un score de confiance
    │   │   ├── fusionner.js              réinjecte les bullets réécrits SANS toucher aux faits
    │   │   └── diff.js                   diff de score · LCS mot à mot · Jaccard
    │   ├── offre/
    │   │   ├── extraireJsonLd.js         lit le <script type="application/ld+json"> schema.org JobPosting
    │   │   ├── extraireOffre.js          cascade JSON-LD → meta → heuristique, avec champ `confiance`
    │   │   └── extraireExigences.js      compétences requises · années · diplôme · langues
    │   ├── score/
    │   │   ├── ats.js                    barème ATS 100 pts + renormalisation des critères non applicables
    │   │   ├── recommandations.js        détail du barème → points forts + améliorations chiffrées
    │   │   ├── matching.js               score CV↔offre + {communs, manquants, actions}
    │   │   ├── metiers.js                profil → métiers ROME classés + catégorie par seuil
    │   │   ├── selectionnerExperiences.js tri des 3 expériences les plus pertinentes (c'est un tri, pas de la rédaction)
    │   │   └── moyennePonderee.js        la formule 0.4/0.35/0.25 aujourd'hui confiée à GPT
    │   ├── gabarits/
    │   │   ├── moteur.js                 rendu {{variable}} + blocs conditionnels {{#entreprise}}…{{/entreprise}}
    │   │   ├── relance.js                2 variantes de relance à variables
    │   │   ├── emailSpontane.js          email 100 % gabarit pour le mode sans clé
    │   │   └── justifications.js         phrases à trous des points forts / lacunes
    │   └── suivi/
    │       ├── relances.js               J+8, "à faire aujourd'hui", statuts
    │       └── joursOuvres.js            week-ends + 11 fériés FR (Pâques par l'algorithme de Meeus)
    │
    ├── data/                             ═══ DICTIONNAIRES VERSIONNÉS ═══  (détail §6)
    │   ├── LICENCES.md                   OBLIGATOIRE
    │   ├── VERSION.json                  {source, version, date, nb_entrees} — traçabilité
    │   ├── rome/                         métiers · appellations · compétences · soft-skills · verbes · tension
    │   ├── geo/communes.json
    │   └── fr/                           stopwords · sections-cv · contrats · diplômes · ats-bareme · templates
    │
    ├── llm/                              ═══ COUCHE IA — PONCTUELLE ET ISOLÉE ═══
    │   ├── config.js                     RÔLES (redaction/extraction/jugement) + baseURL + isAvailable()
    │   ├── client.js                     ask({role, prompt, schema, fallback}) → {ok, data, degraded, usage}
    │   ├── reparerJson.js                réparation locale GRATUITE avant tout retry payant
    │   ├── cout.js                       lit response.usage, journalise en euros
    │   ├── schemas/                      JSON Schemas stricts (Structured Outputs)
    │   ├── parseurs/emailSpontane.js     découpage JS du format SUBJECT/---/corps
    │   └── taches/                       UNE tâche = UN besoin d'intelligence, prompt court
    │       ├── redigerLettreMotivation.js
    │       ├── redigerEmailSpontane.js
    │       ├── reformulerBullets.js
    │       ├── conseilMetier.js          1 métier, à la demande (au clic), pas 8 d'avance
    │       ├── completerProfil.js        filet : découpage de CV atypique
    │       └── extraireOffreSecours.js   filet : page sans JSON-LD, mode Rapide uniquement
    │
    ├── services/                         ═══ ORCHESTRATION ═══
    ├── routes/                           inchangé (sauf les gardes ajoutées)
    ├── middleware/rateLimiter.js         à déplacer sur les seules routes qui appellent encore OpenAI
    └── lib/
        ├── supabaseClient.js
        └── cache/pdfCache.js             empreinte SHA-256 du PDF → profil, TTL 1 h
```

### 5.3 Que deviennent les fichiers actuels

| Fichier actuel | Sort | Détail |
|---|---|---|
| `services/scraperService.js` | **GARDÉ, complété** | Déjà 100 % déterministe. À modifier : conserver le HTML (`:110`, `:163-176`), corriger le déclencheur Puppeteer (`:285`), plafond 50 000 → 15 000 (`:302`), remplacer `basicParse` (`:199-247`) par `core/offre/`. |
| `services/applicationService.js`, `historyService.js` | **GARDÉS** | Zéro LLM, déjà l'architecture cible. Ajouter `applied_at` à l'insert. |
| `services/emailService.js` | **GARDÉ, corrigé** | Ajouter `reply_to`. Instanciation **paresseuse** du client Resend (aujourd'hui `new Resend(undefined)` lève « Missing API key » **au chargement du module**). |
| `services/jobDiscoveryService.js` | **GARDÉ, allégé** | Les 5 scrapers Puppeteer et l'API France Travail sont exemplaires. Retirer `_analyzeProfile` (→ `core/score/metiers.js`), utiliser le paramètre `codeROME` de l'API FT, ajouter le tri par score, renvoyer le profil candidat pour éviter le re-upload. |
| `services/aiService.js` | **ÉCLATÉ** | → `llm/client.js` + `llm/config.js` + `llm/cout.js` + `llm/reparerJson.js`. `generateThenConvert` (`:91-101`) **disparaît**. |
| `services/cvService.js` | **ÉCLATÉ** | Devient un orchestrateur de 40 lignes : `core/cv/profil` → `core/score/ats` → `core/score/recommandations` → `llm/taches/reformulerBullets` (optionnel) → `core/cv/diff`. `normalizeCategorie` (`:16-26`) **supprimée**. |
| `services/matcherService.js` | **ÉCLATÉ** | Idem. `generateIdealCVWorkflow` et `scraperIdealCVWorkflow` **supprimés**. `formatOfferData`/`formatCandidateData` → `core/cv/normaliserSchema.js`. |
| `services/candidatureSpontaneeService.js` | **ALLÉGÉ** | `generateFollowUp` (`:96-110`) **supprimée** → `core/gabarits/relance.js`. |
| `prompts/jsonSchemas.js` (343 lignes) | **🗑 SUPPRIMÉ** | Les 6 convertisseurs disparaissent. C'est le plus gros fichier de prompts du repo et il ne produit **aucune** information. |
| `prompts/matcherCvIdeal.js`, `scraperCvIdeal.js` | **🗑 SUPPRIMÉS** | Code mort côté interface. |
| `prompts/spontaneFollowUp.js` | **🗑 SUPPRIMÉ** | → gabarit. |
| `prompts/optimiseCvPdf.js` | **🗑 SUPPRIMÉ** | Ses 10 règles ATS (`:26-56`) deviennent `data/fr/ats-bareme.json`. Remplacé par `llm/taches/reformulerBullets.js`. |
| `prompts/matcherLettre.js` + `scraperLettre.js` | **FUSIONNÉS** | Corps identiques une fois le bloc d'extraction retiré → `llm/taches/redigerLettreMotivation.js`. |
| `prompts/matcherCvPersonnalise.js` + `scraperCvPersonnalise.js` | **FUSIONNÉS et RÉDUITS** | → `llm/taches/reformulerBullets.js`, ~250 tokens au lieu de ~700. |
| `prompts/analyseCvForm.js`, `analyseCvPdf.js`, `analyseProfileForJobs.js` | **🗑 SUPPRIMÉS** | Intégralement remplacés par `core/score/metiers.js`. |
| `prompts/extractCandidatFromCV.js` | **RÉDUIT** | Devient `llm/taches/completerProfil.js`, filet déclenché seulement en confiance basse. |
| `prompts/spontaneEmail.js` | **RÉDUIT** | Ne demande plus que 2 paragraphes. |
| `prompts/helpers.js` | **CORRIGÉ** | `formatCandidateText` fait `JSON.stringify(experiences, null, 2)` : on paie l'indentation et les guillemets au token, pour du texte destiné à un modèle. → formatage ligne à ligne, **−20 à 30 %** sur ces prompts, en une édition. |
| `frontend-v2/components/cv/ResultsDisplay.jsx:42-47` | **⚠️ NE PAS TOUCHER** | Le fallback `metier.note_marche` **n'est pas du code mort** : l'historique stocke `fullResult` complet et le rejoue tel quel. Toute analyse archivée dans l'ancien format arrive encore ici. Le supprimer ferait afficher `width: undefined%`. **Ajouter un commentaire** pour que personne ne le supprime. |

**Conséquence transversale non évidente :** comme l'historique archive le résultat complet et le rejoue, **chaque changement de format crée une génération d'objets à supporter indéfiniment**. C'est un argument de plus pour garder le **contrat de sortie strictement identique** (`metiers_proposes[]` avec `intitule/categorie/priorite/scores/justifications/conseils/mots_cles`, plus `competences_cles` et `mots_cles_recherche`) — pas seulement « pour ne pas toucher au frontend », mais pour ne pas créer une troisième génération.

---

## 6. Les données embarquées

**Principe : les données dérivées sont commitées dans git, pas téléchargées à l'installation.** Trois raisons : l'app doit démarrer sans réseau, un `npm install` qui télécharge 15 Mo chez France Travail est fragile, et un build reproductible évite qu'un bug apparaisse chez un utilisateur et pas chez vous.

### 6.1 Ce qu'on embarque

| Dossier | Source | Licence | Taille | Contenu (mesuré) |
|---|---|---|---|---|
| `data/rome/` | **ROME 4.0**, France Travail — `https://api.francetravail.fr/api-nomenclatureemploi/v1/open-data/json` (pas de clé, pas de compte) | **Licence Ouverte / Etalab** (`fr-lo`) — **aucune clause de partage à l'identique** | **5,9 Mo** (1,15 Mo gzip) | 1 911 métiers · 14 301 appellations · 19 968 compétences · 15 627 savoirs (dont 3 659 certifications) · 106 792 liens métier↔compétence · mobilités |
| `data/geo/communes.json` | **Base officielle des codes postaux**, La Poste (data.gouv.fr) | **Licence Ouverte 2.0** (`lov2`) | ~600 Ko | ~35 000 communes + codes postaux |
| `data/fr/stopwords.json` | `stopwords-iso/stopwords-fr` | **MIT** | ~5 Ko | ~690 mots vides français |
| `data/fr/*` (le reste) | **100 % maison** | couvert par la licence du repo | ~40 Ko | `sections-cv` · `types-contrat` · `diplomes` · `seuils-seniorite` · `ats-bareme` · `synonymes-metiers` · `templates-email` |
| `data/esco/technologies.json` *(optionnel, cf. §10)* | **ESCO v1.2.1**, Commission européenne | **CC BY 4.0** ⚠️ avec exceptions | 52 Ko | 1 284 technologies en français (Haskell, Erlang, Maltego…) que ROME ne couvre pas |

**Total : ~6,6 Mo bruts (~1,8 Mo gzip).** C'est le poids de 3 photos de téléphone. Parfaitement acceptable dans un dépôt git, chargé une fois en mémoire au démarrage d'Express.

### 6.2 Deux trouvailles qui changent le plan

**(a) Les 637 verbes d'action sortent gratuitement du ROME.** Chaque libellé de savoir-faire commence par un verbe à l'infinitif : `réaliser` (1 179 occurrences), `assurer` (856), `gérer` (826), `analyser` (751), `contrôler` (585), `organiser`, `optimiser`, `développer`, `superviser`, `concevoir`, `coordonner`, `piloter`, `négocier`, `rédiger`… **Vous n'avez pas à écrire cette liste à la main : elle est 60× plus riche que les 11 verbes de `optimiseCvPdf.js:32`.**

**(b) Les 16 savoir-être ROME sont une liste de soft skills officielle et prête à l'emploi** : *Être à l'écoute · Inspirer, donner du sens · Faire preuve d'autonomie · Sens des responsabilités · Esprit d'équipe · Force de proposition · Réactivité · Contrôle de soi · Ouverture au changement · Organiser son travail selon les priorités · Persévérance · Leadership · Rigueur et précision · Curiosité · Créativité · Sens du service.*

### 6.3 ⚠️ Deux pièges techniques à connaître avant d'écrire `build-rome.js`

1. **L'encodage.** Les JSON ROME sont en **ISO-8859-1 (latin1)**, pas en UTF-8, malgré le préfixe `unix_`. `fs.readFileSync(f, 'utf8')` donne `carri�re`. Il faut `fs.readFileSync(f).toString('latin1')`. Pire : certains champs sont en UTF-8 **double-encodé** à l'intérieur du latin1 (`"Macro-compÃ©tence"`). Le script doit nettoyer les deux cas.
2. **Format retenu : des tableaux à clés courtes**, pas des objets verbeux. Exemple réel :
```json
// rome/appellations.json — l'index de recherche de métier
[["Développeur / Développeuse full-stack","M1805"],
 ["Abatteur / Abatteuse de carrière","F1402"]]

// rome/metiers.json — c=code, l=libellé, d=définition, s=secteurs
[{"c":"M1805","l":"Études et développement informatique","d":"Conçoit, développe...","s":["Informatique"]}]

// fr/ats-bareme.json — les 10 règles de optimiseCvPdf.js:26-56, en données pilotables
{"criteres":[
  {"id":"coordonnees","poids":14,"regle":"presence","cibles":["email","telephone"],"facilite":1,
   "messageAction":"Aucun numéro de téléphone détecté (−4 pts). Ajoutez-le dans l'en-tête."},
  {"id":"verbes_action","poids":11,"regle":"ratio_bullets_verbe","seuil_ok":0.8,"facilite":3,
   "messageAction":"{x} de vos {y} bullets ouvrent sur un mot d'action (−{p} pts)."}]}
```
> **Décision d'architecture :** les **messages** vivent dans le **même fichier** que le barème, pas dans un `messages-ats.json` séparé. Deux fichiers indexés par les mêmes codes se désynchronisent dès le premier ajout de critère.

**Les appellations ROME sont déjà écrites aux deux genres** (`Développeur / Développeuse web`). Le cas « developpeuse » se résout par une simple recherche de sous-chaîne, sans fuzzy matching du tout.

### 6.4 Mise à jour

```json
"scripts": {
  "data:fetch":  "node scripts/fetch.js",      // télécharge dans .cache/ (gitignoré)
  "data:build":  "node scripts/build-rome.js", // .cache/ → src/data/*.json
  "data:update": "npm run data:fetch && npm run data:build"
}
```

| Source | Rythme officiel | Conseillé |
|---|---|---|
| ROME 4.0 | ≥ 2×/an (v4.61 en juin 2026, prochaine annoncée en octobre 2026) | **2×/an, février et octobre** — 20 minutes, et le diff git montre les nouveaux métiers, c'est intéressant à relire |
| Codes postaux | continu | 1×/an |
| `data/fr/*` | — | à la main, au fil de l'eau, comme du code |

### 6.5 Ce qu'on **n'**embarque **pas**, et pourquoi

| Écarté | Raison |
|---|---|
| **RNCP** (France Compétences) | ~20 000 fiches, ZIP 9,6 Mo (74 Mo en complet), **mis à jour quotidiennement**. Les 3 659 certifications du ROME suffisent. |
| **O\*NET** | En **anglais uniquement**, codes SOC américains. |
| **Morphalou / Lefff** (lemmatisation) | Licence **LGPL-LR**, réciproque (contaminante). Un stemmer Snowball suffit. |
| **`natural`** (npm) | 14 dépendances dont `pg`, `mongoose`, `redis`, `wordnet-db` — **13,8 Mo décompressés**. Usine à gaz. |
| **`chrono-node`** | 2,76 Mo pour reconnaître « Jan 2022 - Mars 2024 ». Une regex de 15 lignes + une table des 12 mois suffit. |
| **`pdf-parse` v2** | La v2.4.5 passe en **Apache-2.0** et tire `pdfjs-dist` + `@napi-rs/canvas` = **21,3 Mo**. Rester en `^1.1.1` (MIT). |

**Bibliothèques npm retenues (toutes MIT, 0 dépendance) :** `fastest-levenshtein` (21 Ko) · `string-comparison` (34 Ko, Jaro-Winkler + Dice + cosinus) · `papaparse` en **devDependency** uniquement (lecture CSV dans le script de build). **Et rien d'autre** : la suppression d'accents est native (`s.normalize('NFD').replace(/\p{Diacritic}/gu,'')`), et TF-IDF / cosinus / Jaccard font ~30 lignes chacun — les écrire vous-même a un avantage réel : vous comprendrez ce que fait votre score, contrairement à aujourd'hui.

### 6.6 Licences : ce qu'il faut faire, précisément

**Le point juridique :** votre code peut être sous MIT, ça ne « contamine » ni ne « couvre » les données embarquées. Elles gardent leur propre licence. Il n'y a **pas de conflit**, mais il y a une **obligation d'attribution**. Créez `backend/src/data/LICENCES.md` :

```markdown
Les fichiers de src/data/ ne sont PAS couverts par la licence du code.

## rome/ — Licence Ouverte 2.0 (Etalab)
Source : Répertoire Opérationnel des Métiers et des Emplois (ROME) 4.0, France Travail, v4.61 (juin 2026).
https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois
Modifications : extraction, réduction et reformatage en JSON UTF-8.

## geo/ — Licence Ouverte 2.0 — Base officielle des codes postaux, La Poste.
## fr/stopwords.json — MIT — stopwords-iso/stopwords-fr.
```
+ un lien depuis le `README.md` et une mention « Données : ROME 4.0 (France Travail) » en pied de page du frontend.

---

## 7. Le mode « sans clé API »

> ### Argument commercial, à mettre en tête du README
>
> **Mew fonctionne sans compte OpenAI.** Vous téléchargez, vous lancez, ça marche : votre CV est analysé, noté, comparé aux offres, et vos candidatures sont suivies — **en local, gratuitement, instantanément, et sans qu'aucune de vos données personnelles ne quitte votre machine**.
>
> Une clé API n'ajoute que **trois choses**, toutes de la rédaction : la lettre de motivation, l'email d'approche, et la reformulation de vos phrases d'expérience. **Tout le reste est du calcul.**
>
> Et vous choisissez votre moteur : OpenAI, ou un modèle qui tourne sur votre propre ordinateur (Ollama, LM Studio) — **deux lignes dans le fichier `.env`, zéro ligne de code.**

**⚠️ Prérequis technique, à faire en premier — aujourd'hui c'est structurellement impossible :**
1. `server.js:11` met `OPENAI_API_KEY` dans `requiredEnvVars` et fait `process.exit(1)` sans elle → **le serveur refuse de démarrer**.
2. `aiService.js:9-13` instancie le client OpenAI **dans le constructeur**, et `module.exports = new AIService()` s'exécute **au chargement du module**. Idem pour Resend dans `emailService.js`. Sans clé, ce n'est pas la fonctionnalité qui tombe, c'est le `require` qui crashe.

→ Retirer `OPENAI_API_KEY` des variables requises + instancier les clients **paresseusement** (à la première utilisation). Tant que ce n'est pas fait, tout ce tableau est théorique.

| Outil | Sans clé | Ce qui marche **entièrement** | Ce qui manque, et son remplacement |
|---|---:|---|---|
| **Suivi de candidatures** | **100 %** | CRUD, statuts, relances J+8 en jours ouvrés, bandeau « X relances à faire », statistiques (taux de réponse, cadence hebdo, candidatures dormantes) | rien — **zéro LLM aujourd'hui déjà** |
| **Historique des outils** | **100 %** | tout | rien |
| **Relance de candidature** | **100 %** | l'email complet, par gabarit | rien — le prompt actuel ne laisse déjà **aucune** liberté au modèle |
| **Analyseur de CV** | **100 %** | parsing du CV, compétences détectées, ancienneté calculée, 6-10 métiers ROME classés, score d'adéquation **explicable ligne par ligne**, points forts et lacunes **exacts**, mots-clés de recherche | le *conseil actionnable* rédigé → phrase à trous : « Pour viser ce poste, concentre-toi sur Docker et Kubernetes. » |
| **Mode Découverte** | **100 %** | métiers + mots-clés ROME + scraping WTTJ/Indeed/HelloWork/APEC/France Travail + **tri par score** (qui n'existe pas aujourd'hui) | rien — le scraping n'a **jamais** eu besoin d'une clé OpenAI |
| **Matcher — score et écarts** | **100 %** | extraction de l'offre (JSON-LD), score reproductible, liste exacte des mots-clés de l'offre absents du CV, checklist « 7 exigences sur 10 couvertes » | — |
| **Optimiseur de CV** | **~90 %** | score ATS complet **et détaillé critère par critère**, sections manquantes, bullets sans verbe d'action, bullets sans chiffre, résumé trop long, alerte « PDF scanné, aucun ATS ne peut le lire » | la réécriture des bullets → on affiche la consigne actionnable à la place |
| **Matcher — CV personnalisé** | **~60 %** | titre adapté, expériences réordonnées par pertinence, compétences réordonnées selon l'offre, manques signalés | la reformulation au vocabulaire de l'offre |
| **Candidature spontanée** | **100 % de la mécanique** | envoi Resend avec CV en pièce jointe, enregistrement dans le tracker, date de relance, **brouillon éditable avant envoi** (ce qui est un progrès : aujourd'hui l'email part sans que personne ne l'ait relu) | la rédaction du corps → gabarit à partir des 3 compétences détectées |
| **Matcher — lettre de motivation** | **0 %** | (un modèle pré-rempli éditable, honnêtement moyen) | **la lettre : c'est LE vrai cas LLM** |

**Résumé vendable : sans aucune clé API, 5 outils sur 6 restent pleinement utilisables**, et le 6ᵉ garde toute sa mécanique. Ce qui nécessite vraiment une clé se réduit à **trois tâches d'écriture**.

**Comment le code le gère :** `llm/client.ask()` prend un paramètre `fallback` et retourne `{ ok, data, degraded }`. Le service appelant n'a **pas** de `if (process.env.OPENAI_API_KEY)` partout — il passe la valeur de repli, et le champ `degraded: true` remonte jusqu'au frontend qui affiche « Généré sans IA — à personnaliser ». Le mode dégradé se déclenche aussi sur **erreur** et sur **timeout**, pas seulement sur absence de clé.

---

## 8. Le plan de migration

> Chaque étape est **livrable seule** et **testable seule**. Elles sont ordonnées par (valeur immédiate ÷ risque), pas par ordre logique de l'architecture.

---

### Étape 1 — Arrêter l'hémorragie invisible et commencer à mesurer
**Effort : S (une demi-journée) · Risque : nul · Gain : immédiat**

| Fichiers touchés | Ce qu'on fait |
|---|---|
| `matcherService.js:31`, `:86`, `routes/matcher.js:251` | `generateIdealCV = true` → `false`. **2 caractères.** Plus aucun appel gpt-4o pour un document que personne ne voit. |
| `scraperService.js:302` | `MAX_TEXT_LENGTH` 50 000 → **15 000**. Une ligne, −70 % sur le pire cas. |
| `aiService.js:36-37`, `:62-63` | Lire `response.usage`, journaliser `{model, tokens_in, tokens_out, cout_eur}`. |
| `cvService.js:36`, `:40`, `:72`, `:76`, `:107`, `:111` | Ajouter `temperature: 0.2` (aujourd'hui absente donc = 1.0). |
| `aiService.js:96` | `.replace('{{GENERATED_TEXT}}', () => texte)` — corrige le bug `$&`. |
| `cvService.js:116`, `ToolHistory.jsx` | `\|\| null` → `?? null` et `score_ats &&` → `score_ats != null &&`. |
| `helpers.js` | Les 2 `JSON.stringify(…, null, 2)` → formatage ligne à ligne. |
| `ResultsDisplay.jsx:42-47` | **Ajouter un commentaire** « compatibilité avec les analyses archivées, ne pas supprimer ». |

**Comment je sais que c'est fait :** je lance une analyse et je vois dans la console `[coût] gpt-4.1-mini · 2 840 in · 2 210 out · 0,0043 €`. Je relance la même analyse deux fois : les scores ne bougent presque plus. Je lance un matcher en mode URL : la console montre **4 appels, pas 6**.

---

### Étape 2 — Le socle : tests + utilitaires texte + réparation JSON
**Effort : S · Risque : nul (aucun code existant modifié)**

| Fichiers | Rôle |
|---|---|
| `backend/package.json` | `"test": "node --test"` — **Node ≥18 embarque son lanceur, zéro dépendance à installer**. Il n'existe aujourd'hui **aucun test dans le repo**. |
| `core/texte/normaliser.js`, `tokeniser.js`, `similarite.js` | Les briques de tout le reste. |
| `data/fr/stopwords.json` | ~690 mots vides FR (MIT). |
| `llm/reparerJson.js` | Fences ```` ```json ````, coupe avant `{` / après `}`, virgules traînantes. |
| `aiService.js:65-79` | Brancher `reparerJson` **avant** le retry payant. |

**Comment je sais que c'est fait :** `npm test` affiche « 12 pass, 0 fail ». Et dans les logs, le message « JSON parse échoué, retry… » disparaît quasi complètement.

---

### Étape 3 — Supprimer les conversions JSON les moins risquées
**Effort : S · Risque : faible · Gain : −4 appels sur le parcours complet, −5 à 8 s d'attente**

| Fichiers | Ce qu'on fait |
|---|---|
| `llm/parseurs/emailSpontane.js` (nouveau) | Découpage `SUBJECT:` / `---` en 8 lignes, **avec les tolérances** (OBJET, gras markdown, séparateur absent). |
| `candidatureSpontaneeService.js:32-44` | `generateThenConvert` → `generate` + `parseEmailGenere`. |
| `matcherService.js:186`, `:256` (lettre) | **Retourner la lettre en texte brut**, supprimer `coverLetterToJSON`. Adapter `formatLetterText` (`page.js:201-210`) — 3 lignes. |
| `core/gabarits/relance.js` + `moteur.js` + `core/suivi/relances.js` | La relance devient 100 % locale. Retirer `aiRateLimiter` de cette route. |
| Migration Supabase | `ADD COLUMN candidate_name TEXT DEFAULT '', ADD COLUMN original_subject TEXT DEFAULT ''` + les remplir à la création + arrêter de parser `notes`. |

**Comment je sais que c'est fait :** je génère une relance → réponse en **moins de 100 ms**, signée du **vrai nom du candidat**. Je génère une candidature spontanée → **1 appel** dans les logs, pas 2. La lettre s'affiche exactement comme avant.

---

### Étape 4 — La porte unique `llm/` et le démarrage sans clé
**Effort : M · Risque : moyen (touche les 5 outils) · Gain : débloque tout le mode dégradé**

| Fichiers | Ce qu'on fait |
|---|---|
| `llm/config.js` | Rôles `redaction` / `extraction` / `jugement` + `baseURL` + `isAvailable()`. Les **25** noms de modèles codés en dur disparaissent des services. |
| `llm/client.js` | `ask({role, prompt, schema, fallback, timeoutMs})` → `{ok, data, degraded, usage}`. Escalier de retry complet. |
| `llm/cout.js` | Tarifs + journalisation. |
| `server.js:11` | Retirer `OPENAI_API_KEY` de `requiredEnvVars`. |
| `aiService.js:9-13`, `emailService.js` | **Instanciation paresseuse** des clients. |
| `middleware/rateLimiter.js` + `server.js:43-44` | Déplacer le limiteur sur les **seules** routes qui appellent encore OpenAI (sinon un utilisateur se verra refuser un calcul gratuit et local). Abaisser `max` à 5 en attendant un vrai budget par utilisateur. |

**Comment je sais que c'est fait :** je renomme `backend/src/.env` en `.env.bak`, je lance `npm run dev` → **le serveur démarre**, `/api/health` répond, le tracker fonctionne, et une analyse renvoie `degraded: true` au lieu d'un 500.

---

### Étape 5 — Le parseur d'offre (JSON-LD) : le plus gros gain de tokens
**Effort : L · Risque : moyen · Gain : −80 % de tokens sur le matcher**

| Fichiers | Ce qu'on fait |
|---|---|
| `core/offre/extraireJsonLd.js`, `extraireOffre.js`, `extraireExigences.js` (nouveaux) | Cascade JSON-LD → meta → heuristique, avec champ `confiance`. |
| `scraperService.js:110`, `:163-176` | **Conserver le HTML** (aujourd'hui il est jeté immédiatement). |
| `scraperService.js:285` | Déclencheur Puppeteer : « pas de `JobPosting` **OU** texte court ». **Prérequis non négociable** — sans lui, WTTJ et Indeed n'auront jamais de JSON-LD à lire. |
| `scraperService.js:199-247` | Remplacer `basicParse` (titre par 30 mots-clés écrits à la main, 25 villes en dur, `company: null`). |
| `prompts/scraper*.js` | Supprimer les blocs « Étape 1 : Extraire l'offre » (identiques ×2). |
| `tests/fixtures/offres/` | **10 pages HTML réelles** suffisent pour la v1. |

**Comment je sais que c'est fait :** `npm test` valide 10 pages ; sur une offre WTTJ, l'objet contient le **nom de l'entreprise** (impossible aujourd'hui) ; le log affiche `~800 tokens envoyés` au lieu de `~12 500`.

> **Reporté en v2 :** le fichier de sélecteurs CSS par site. C'est de la maintenance sans fin qui casse à chaque refonte de front, et il fait doublon avec les sélecteurs déjà écrits dans `jobDiscoveryService`. Les 3 niveaux ci-dessus couvrent l'essentiel.

---

### Étape 6 — Le score ATS déterministe
**Effort : M · Risque : faible · Gain : le score devient reproductible et actionnable**

| Fichiers | Ce qu'on fait |
|---|---|
| `data/fr/ats-bareme.json` | Les 10 règles de `optimiseCvPdf.js:26-56` en données, avec `poids`, `facilite`, `messageOk`, `messageAction`. |
| `data/rome/verbes-action.json` | **Généré depuis le ROME** (637 verbes), pas écrit à la main. |
| `core/score/ats.js`, `recommandations.js` | Barème + renormalisation + messages triés par (points perdus ÷ facilité). |
| `routes/solutions.js:78` | **Garde PDF scanné** : `< 200 caractères` → erreur claire. 3 lignes qui suppriment une catégorie entière de résultats faux. |
| `frontend-v2/components/cv/ScoreDetail.jsx` (nouveau) | Le détail critère par critère sous la jauge existante. |

**Comment je sais que c'est fait :** j'uploade **deux fois** le même CV → **exactement le même score**. Je clique sur le détail et je vois « Verbes d'action : 9/11 — 6 bullets sur 14 commencent par un verbe fort ». J'uploade un PDF scanné → message clair au lieu d'une analyse inventée.

---

### Étape 7 — Le parseur de CV + le cache PDF
**Effort : L · Risque : le plus élevé du plan** — c'est ici que le code peut vraiment mal se comporter

| Fichiers | Ce qu'on fait |
|---|---|
| `lib/cache/pdfCache.js` | **À faire en premier, indépendamment** : empreinte SHA-256 + `Map`, TTL 1 h. ~20 lignes, `crypto` natif. Divise par N les appels du mode Découverte. |
| `core/cv/decouperSections.js`, `extraireContact.js`, `extraireDates.js`, `experience.js`, `profil.js`, `normaliserSchema.js` | Le parseur en passes, **avec score de confiance**. |
| `data/fr/sections-cv.json`, `diplomes.json`, `data/geo/communes.json` | Dictionnaires. |
| `llm/taches/completerProfil.js` | Le filet, déclenché seulement en confiance basse, sur la section non résolue. |
| `jobDiscoveryService.js:54-59` | Renvoyer aussi le profil candidat structuré, pour éviter le re-upload du PDF. |
| `tests/fixtures/cv/` | **CV synthétiques uniquement** — ne jamais commiter le PDF d'une personne réelle (RGPD). Inclure **un CV d'infirmier** : c'est le cas qui casse tout. |

**Règle absolue** : les compétences sont **extraites** en prenant le contenu de la section et en le découpant sur les virgules/puces — **aucun filtrage par dictionnaire**. Sinon un infirmier (« pose de voie veineuse », « transmissions ciblées ») et un plombier (« soudure au chalumeau », « PER multicouche ») ressortent avec zéro compétence, en silence. Le dictionnaire sert à **canoniser** (`react js` / `ReactJS` → `React`), jamais à jeter.

**Comment je sais que c'est fait :** 8 CV sur 10 en fixtures sont entièrement résolus sans appel LLM, **y compris le CV d'infirmier**. J'adapte mon CV à 5 offres découvertes → **une seule** extraction dans les logs, pas 5.

---

### Étape 8 — Le moteur de matching et le tri des offres
**Effort : M · Risque : faible · Gain : l'amélioration la plus visible pour l'utilisateur**

| Fichiers | Ce qu'on fait |
|---|---|
| `core/score/matching.js`, `selectionnerExperiences.js`, `core/cv/diff.js` | Score à 4 signaux + neutralisation-redistribution + diff des modifications. |
| `data/fr/competences.json`, `synonymes-metiers.json` | Dictionnaires de canonisation. |
| `jobDiscoveryService.js:520-527` | **Trier les offres par score** après dédoublonnage. |
| `prompts/matcherCvPersonnalise.js`, `scraperCvPersonnalise.js` | Retirer la demande de `SCORE_MATCHING` et de `MODIFICATIONS`. |

**Comment je sais que c'est fait :** le mode Découverte affiche les offres **classées**, avec « 87 % — 8 des 9 compétences demandées » sur chaque carte. Je relance la même analyse → même score. La liste des modifications correspond **exactement** à ce qui a changé.

---

### Étape 9 — Le référentiel ROME et le scoring métiers
**Effort : L · Risque : moyen · C'est le chantier de données**

| Fichiers | Ce qu'on fait |
|---|---|
| `scripts/build-rome.js` | ⚠️ **Attention au latin1 et au double-encodage.** |
| `data/rome/*`, `data/LICENCES.md`, `data/VERSION.json` | Les 8 fichiers dérivés + l'attribution. |
| `core/score/metiers.js` | Métiers ROME classés + catégorie par seuil (≥65 / 40-64 / <40) + garde-fou : si < 3 métiers passent, abaisser à 25 et afficher les 3 meilleurs (**jamais un écran vide**). |
| `core/score/metiers.js` (chemin de secours) | Si < 3 compétences reconnues → mode « intitulé seul » via les codes ROME voisins, avec un bandeau honnête : « Analyse basée sur ton intitulé. Ajoute tes compétences pour un résultat précis. » |
| `AnalyzerForm.jsx` | Rendre `competences_principales` **obligatoire** (aujourd'hui seuls `prenom`, `nom` et `type_poste` le sont — un utilisateur peut légitimement envoyer un formulaire sans aucune compétence). |
| `jobDiscoveryService.js:229-236` | Ajouter le paramètre `codeROME` (aujourd'hui inexistant) et lire l'en-tête `Content-Range` pour le volume d'offres. |
| `llm/taches/conseilMetier.js` | Le conseil rédigé, **à la demande, au clic**, un métier à la fois — pas 8 d'avance dont l'utilisateur n'en déplie que 2. |

**Comment je sais que c'est fait :** j'analyse un CV d'infirmier → des métiers du soin, pas une page vide. Le même CV deux fois → **exactement les mêmes scores**. Sous la barre « marché emploi » s'affiche « source : BMO France Travail 2026 ».

---

### Étape 10 — La réécriture ciblée et le grand ménage
**Effort : M · Risque : faible (tout le reste est déjà en place)**

| Fichiers | Ce qu'on fait |
|---|---|
| `llm/taches/reformulerBullets.js`, `redigerLettreMotivation.js`, `redigerEmailSpontane.js` | Les 3 prompts courts finaux, avec les interdictions d'inventer. |
| `core/cv/fusionner.js` | Réinjection des bullets sans toucher aux faits. |
| `frontend-v2/components/cv/DiffAvantApres.jsx` | Le comparatif avant/après, qui **n'existe pas** aujourd'hui. |
| **Suppressions** | `prompts/jsonSchemas.js` (343 l.) · `optimiseCvPdf.js` · `analyseCvForm.js` · `analyseCvPdf.js` · `analyseProfileForJobs.js` · `spontaneFollowUp.js` · `matcherCvIdeal.js` · `scraperCvIdeal.js` · `aiService.generateThenConvert` · `generateIdealCVWorkflow` · `scraperIdealCVWorkflow` · `cvService.normalizeCategorie`. |
| `CLAUDE.md` | Inscrire la règle de partage (§2) et la règle d'or des couches (§5.1). |

**Comment je sais que c'est fait :** `grep -rn "require('openai')" backend/src/services/` ne renvoie **rien**. `grep -rn "model: 'gpt" backend/src/services/` ne renvoie **rien**. Le parcours complet fait **4 appels** et `npm test` reste vert.

---

### Récapitulatif du plan

| Étape | Titre | Effort | Appels supprimés (parcours complet) |
|---|---|---|---:|
| 1 | Mesurer + arrêter l'hémorragie | S | 0 (mais −70 % de tokens sur le pire cas) |
| 2 | Socle : tests + texte + réparation JSON | S | 0 |
| 3 | Conversions JSON les moins risquées | S | **−4** |
| 4 | Porte unique `llm/` + démarrage sans clé | M | 0 (débloque le mode dégradé) |
| 5 | Parseur d'offre JSON-LD | L | 0 (mais **−80 % de tokens**) |
| 6 | Score ATS déterministe | M | **−1** |
| 7 | Parseur de CV + cache PDF | L | **−1** (et −N sur le mode Découverte) |
| 8 | Moteur de matching + tri | M | 0 (mais débloque une fonctionnalité absente) |
| 9 | Référentiel ROME + scoring métiers | L | **−2** |
| 10 | Réécriture ciblée + ménage | M | **−1** |

---

## 9. Les tests

**Aucun test n'existe aujourd'hui.** `backend/package.json` n'a ni script `test` ni framework. Solution sans rien installer : `"test": "node --test"` — Node embarque son lanceur depuis la v18.

| # | Fichier de test | Ce qu'il verrouille | Exemple d'assertion |
|---|---|---|---|
| **1** | `tests/core/texte/normaliser.test.js` | La brique de tout le reste | `assert.equal(normaliser('DÉVELOPPEUSE Sénior'), 'developpeuse senior')` |
| **2** | `tests/core/texte/similarite.test.js` | **Le piège des faux positifs.** Jaro-Winkler bonifie le préfixe : sur des expressions il rapproche « chef de projet » et « chef de produit ». | `assert.ok(jaroWinkler('developpeur','developpeuse') > 0.9)`<br>`assert.ok(dice('chef de projet','chef de produit') < 0.7)`<br>`assert.ok(jaroWinkler('java','javascript') < 0.92 \|\| longueurTropDifferente)` |
| **3** | `tests/llm/reparerJson.test.js` | **Chaque succès ici = un appel LLM économisé** | `assert.deepEqual(reparerJson('```json\n{"a":1,}\n```'), {a:1})`<br>`assert.deepEqual(reparerJson('Voici :\n{"a":1}\nVoilà.'), {a:1})`<br>`assert.equal(reparerJson('pas du json'), null)` |
| **4** | `tests/llm/parseurs/emailSpontane.test.js` | Le remplaçant d'un appel API. **Les cas dégradés sont les plus importants.** | `assert.equal(parse('SUBJECT: Test\n---\nBonjour').subject, 'Test')`<br>`assert.equal(parse('**OBJET :** Test\n---\nBonjour').subject, 'Test')`<br>`assert.ok(parse('SUBJECT: X\nBonjour').body.length > 0)` *(séparateur absent → ne doit PAS échouer)* |
| **5** | `tests/core/cv/extraireContact.test.js` | Là où le code est **strictement supérieur** au LLM (qui reformate parfois un numéro) | `assert.equal(extraireContact('Tél : 06 12 34 56 78').telephone, '0612345678')`<br>`assert.equal(extraireContact('+33 6 12 34 56 78').telephone, '0612345678')` |
| **6** | `tests/core/cv/extraireDates.test.js` | **Le piège du freelance** : deux missions en parallèle ne font pas le double d'expérience | `assert.deepEqual(extraireDates('Jan 2022 - Mars 2024'), {debut:'2022-01', fin:'2024-03', mois:26})`<br>`assert.equal(extraireDates("2019 – aujourd'hui").fin, null)`<br>`assert.equal(totalMois([{d:'2020-01',f:'2021-01'},{d:'2020-06',f:'2021-06'}]), 18)` *(pas 24)* |
| **7** | `tests/core/cv/decouperSections.test.js` | Le cœur du parseur, **sur deux profils opposés** | `assert.equal(decouper(cvTech).experiences.length, 3)`<br>`assert.ok(decouper(cvInfirmier).competences.includes('transmissions ciblées'))` ← **le test qui prouve qu'on n'a pas fait un outil réservé aux développeurs** |
| **8** | `tests/core/score/ats.test.js` | **Le test le plus important : il prouve le déterminisme** | `assert.equal(scoreAts(cv).score, scoreAts(cv).score)` ← ce que le LLM ne garantit pas<br>`assert.equal(scoreAts(cvParfait).score, 100)`<br>`assert.ok(scoreAts(cvSansEmail).manques.some(m => m.includes('email')))`<br>`assert.equal(scoreAts(cvNonTech).pointsMaxApplicables, 86)` *(famille mots-clés neutralisée)* |
| **9** | `tests/core/score/matching.test.js` | Le remplaçant du score auto-décerné | `assert.ok(scoreMatching(offreReact, cvReact).score > 70)`<br>`assert.ok(scoreMatching(offreReact, cvReact).manquants.includes('kubernetes'))`<br>`assert.ok(scoreMatching(offreReact, cvComptable).score < 30)` |
| **10** | `tests/core/offre/extraireOffre.test.js` | Ce qui rend le nom d'entreprise enfin extractible | `assert.equal(extraireOffre(htmlWttj).entreprise, 'Acme')`<br>`assert.equal(extraireOffre(htmlWttj).source, 'jsonld')`<br>`assert.equal(extraireOffre(htmlSansJsonLd).confiance, 'faible')` |
| **11** | `tests/contratSortieAnalyse.test.js` | **Le filet qui garantit que la refonte reste invisible.** Vérifie que l'objet contient `metiers_proposes[]` avec `intitule`, `categorie`, `priorite`, `scores.{adequation_profil, marche_emploi, potentiel_evolution, global}`, `justifications`, `conseils`, `mots_cles`, plus `competences_cles` et `mots_cles_recherche`. | `assert.ok(Number.isInteger(r.metiers_proposes[0].scores.global))`<br>`assert.ok(r.metiers_proposes[0].scores.global >= 0 && <= 100)` |
| **12** | `tests/core/suivi/relances.test.js` | La règle métier | `assert.equal(prochaineRelance('2026-08-06').getDay(), 1)` *(J+8 tombe un samedi → lundi)* |

---

## 10. Les décisions à trancher

### Décision 1 — Envoi direct par Resend, ou brouillon `.eml` à relire ?

**Le problème, factuel :** `emailService.js` envoie depuis `onboarding@resend.dev` et le payload **ne contient aucun champ `reply_to`** (vérifié : `reply_to` / `replyTo` n'existent nulle part dans le backend). Le recruteur reçoit une candidature depuis une adresse de test ; s'il clique sur « Répondre », **sa réponse part dans le vide**. Et l'email part **sans que personne ne l'ait relu**.

| Option | Conséquence |
|---|---|
| **A.** Garder Resend + ajouter `reply_to` + mettre les coordonnées dans la signature | Correctif minimal, 30 minutes. Reste un problème de délivrabilité : envoyer *au nom* d'un candidat depuis votre domaine reste une usurpation d'expéditeur pour les filtres anti-spam. |
| **B.** Générer un fichier `.eml` téléchargeable | Un `.eml` est un simple fichier texte au format RFC 5322 (~60 lignes de code, zéro dépendance). L'utilisateur double-clique : Outlook/Thunderbird/Mail s'ouvre avec le destinataire, l'objet, le corps **et le CV déjà attaché**. Il relit, il envoie **depuis sa propre adresse**. Délivrabilité parfaite, réponse possible, aucun compte externe. |
| **C.** Les deux : `.eml` par défaut, « Envoyer directement » visible seulement si `RESEND_API_KEY` est configurée | — |

**Recommandation : C.** Faire **A** immédiatement (le bug est bloquant), **B** ensuite. Un email de candidature devrait *toujours* être relu avant envoi.
**Conséquence si on ne tranche pas :** l'outil envoie des candidatures auxquelles personne ne peut répondre.

---

### Décision 2 — Que fait-on de la 3ᵉ note, « potentiel d'évolution » ?

**Le problème :** `analyseCvForm.js:89-95` demande au modèle d'évaluer les « conditions de télétravail » et le « potentiel salarial ». Un LLM ne dispose d'aucune de ces données : il produit un chiffre plausible, pas un chiffre vrai, et l'application l'affiche comme une statistique.

| Option | Conséquence |
|---|---|
| **A.** Supprimer la 3ᵉ barre | Interface plus honnête, mais l'écran perd un élément visuel. |
| **B.** La remplacer par « Compétences maîtrisées : 9 / 12 » | **Un chiffre calculé, exact, et directement actionnable.** L'utilisateur sait quoi faire. Zéro donnée externe à maintenir. |
| **C.** La brancher sur les salaires médians par code ROME | Vrai, mais c'est un 3ᵉ jeu de données à récupérer, joindre et maintenir. |

**Recommandation : B.** Le même arbitrage vaut pour la note « marché emploi » : plan A = fichier BMO embarqué avec **source et année affichées** (un instantané vieillit, mais on sait de quand il date — c'est toute la différence avec le LLM) ; plan B = appel réel à l'API France Travail si les clés sont présentes.
**Conséquence si on ne tranche pas :** on remplace un chiffre inventé par un LLM par un chiffre inventé par un fichier, et on n'a rien gagné en crédibilité.

---

### Décision 3 — Structured Outputs (OpenAI) ou marqueurs texte (portable) ?

**Le contexte :** pour supprimer le 2ᵉ appel de conversion, deux voies.

| Option | Conséquence |
|---|---|
| **A. Structured Outputs** (`response_format: {type:'json_schema', strict:true}`) | Le schéma **contraint le décodage** : le modèle ne peut plus produire de JSON invalide ni oublier un champ. Le retry et `reparerJson` deviennent presque inutiles. ⚠️ **Piège** : `strict: true` impose `additionalProperties: false` **et** tous les champs dans `required`. Il faut donc déclarer requis les champs aujourd'hui optionnels (`localisation`, `linkedin`, `salary`…) en acceptant la chaîne vide. ❌ **Spécifique à OpenAI.** |
| **B. Marqueurs `###SECTION###`** découpés par un `split()` | Marche avec **n'importe quel** fournisseur, y compris un modèle local. Demande un plan de secours si un marqueur manque. |

**Recommandation : A pour les sorties structurées, B en tête si le but « tout en local » est ferme.** Le propriétaire a écrit « le tout en local » — si cela signifie un jour faire tourner le modèle sur sa machine (Ollama), **B est le bon choix stratégique**, même s'il est un peu moins confortable. Dans les deux cas, la **lettre et l'email restent en texte brut** : on ne bride pas la rédaction.
**Conséquence si on ne tranche pas :** on écrit des schémas OpenAI qu'il faudra tout réécrire le jour du passage en local.

---

### Décision 4 — ESCO : on l'embarque ou pas ?

**Le problème, et je préfère être honnête :** ESCO apporte 1 284 technologies en français que ROME ne couvre pas (`Haskell`, `Erlang`, `Maltego`…). La page de copyright officielle indique que **la majorité** du contenu est en CC BY 4.0, **mais** que les *Kompetenz- und Berufekarten* de la Bertelsmann Stiftung sont en **CC BY-SA 4.0** — une clause de « partage à l'identique », qui est contaminante. **Je ne suis pas capable de dire quelles lignes précises des CSV proviennent de ce composant.**

| Option | Conséquence |
|---|---|
| **A.** ROME seul en v1 | Couvre **tous** les métiers (1 911 fiches, tous secteurs), en Licence Ouverte, **sans aucune clause share-alike**. Manque le vocabulaire technique moderne (React, Docker, Kubernetes). |
| **B.** ROME + fichier maison de ~200 technos | Vous écrivez à la main les technos qui vous manquent. Zéro risque juridique, effort réel mais borné, et enrichissable au fil des retours utilisateurs. |
| **C.** ROME + ESCO `digitalSkillsCollection_fr.csv` | Le plus riche. Zone grise juridique non levée. |

**Recommandation : B.** Le référentiel ROME est le socle (Licence Ouverte, sans piège), et un petit fichier maison **n'ajoute que ce que le ROME ignore**. C'est l'inverse de l'approche initiale, qui consistait à tout écrire à la main : ici on peut **livrer avec une surcouche vide** et l'outil marche déjà partout, puis on l'enrichit métier par métier.
**Conséquence si on ne tranche pas :** on bâtit sur un dictionnaire tech écrit à la main, et l'outil ne marche que pour les développeurs.

---

### Décision 5 — Deux champs de formulaire à rendre obligatoires

**Le problème, factuel :** dans `AnalyzerForm.jsx`, seuls `prenom`, `nom` et `type_poste` portent `required` — `competences_principales`, `outils`, `soft_skills` et `experience` sont **optionnels**, et la validation backend (`routes/solutions.js:35-39`) ne vérifie que les trois premiers. Un utilisateur peut donc envoyer `{prenom, nom, type_poste: 'Infirmier'}` et rien d'autre. **Aujourd'hui le LLM répond quelque chose d'utile ; avec un moteur de scoring déterministe, l'écran serait vide.** Même logique pour le nom du candidat dans la candidature spontanée, aujourd'hui deviné par un LLM à partir du CV.

| Option | Conséquence |
|---|---|
| **A.** Ne rien changer | Il faut un chemin de secours « intitulé seul » (métiers voisins par code ROME + bandeau d'avertissement). Faisable, mais c'est du code en plus pour un cas qu'un `required` élimine. |
| **B.** Rendre `competences_principales` obligatoire + ajouter un champ « Votre prénom et nom » à la candidature spontanée | **Le correctif le moins cher de tout le projet** : deux attributs HTML. Un champ de formulaire est fiable à 100 %, contre une heuristique qui se trompe (beaucoup de CV commencent par le titre du poste en capitales, pas par le nom → `CV_Infirmier_Diplome_D_Etat.pdf`). |

**Recommandation : B, plus le chemin de secours de A** en filet. Le meilleur code déterministe, c'est celui qu'on n'écrit pas.
**Conséquence si on ne tranche pas :** on écrit une heuristique d'extraction de nom qui échouera silencieusement, et le mode formulaire renverra des écrans vides.

---

## En une phrase

Aujourd'hui, **11 appels à OpenAI** portent un parcours utilisateur, dont **5 ne font que reformater du texte** et **aucun score affiché n'est reproductible**. Demain, **4 appels** — trois tâches d'écriture et un filet — et **tout le reste est un calcul qu'on peut tester, expliquer à l'utilisateur, et exécuter sans réseau.**