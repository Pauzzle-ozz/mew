# Sécurité

## Signaler une faille

Ouvrez une [issue GitHub](https://github.com/Pauzzle-ozz/mew/issues) en décrivant le problème. Si la faille permet d'accéder aux données de quelqu'un, utilisez plutôt l'onglet **Security → Report a vulnerability** du dépôt, pour ne pas la rendre publique avant qu'elle soit corrigée.

## Ce que vous devez savoir avant d'exposer Mew sur internet

Mew est conçu pour tourner **sur votre machine**, pour vous seul. Dans ce cadre, il est sûr. Exposé à plusieurs personnes, il ne l'est qu'à une condition, décrite juste en dessous.

### L'authentification côté serveur existe, mais elle est désactivée par défaut

Le backend a deux modes, choisis par `AUTH_MODE` dans `backend/.env`.

**`AUTH_MODE=local` (valeur par défaut).** Le serveur accepte l'identifiant utilisateur envoyé par le navigateur, sans vérifier aucun jeton. N'importe qui connaissant l'identifiant de quelqu'un d'autre peut lire et modifier ses candidatures. C'est **assumé, pas oublié** : en usage personnel il n'y a qu'une seule personne, et le serveur n'écoute que sur `127.0.0.1`, donc personne d'autre ne peut lui parler. Ce n'est plus vrai dès que vous changez `HOST` ou que vous placez Mew derrière un proxy : dans ce cas le serveur affiche un avertissement au démarrage, et vous devriez passer au mode ci-dessous.

**`AUTH_MODE=supabase`.** Chaque requête touchant vos données doit porter un en-tête `Authorization: Bearer <jeton>`. Le jeton est vérifié auprès de Supabase, et l'identifiant utilisé est celui du jeton vérifié — celui envoyé dans le corps de la requête est ignoré. Sans jeton valide, la réponse est un 401. Il faut renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY` ; s'ils manquent, **toutes** les requêtes sont refusées plutôt que laissées ouvertes.

La règle derrière tout ça, écrite en tête de [`backend/src/middleware/auth.js`](backend/src/middleware/auth.js) : *une donnée envoyée par le client ne prouve jamais son identité ; seul un jeton signé, vérifié côté serveur, le fait.*

Ce qui reste à faire, honnêtement :

- Les routes qui n'exposent pas de données personnelles (analyse de CV, matcher, scraping) ne sont pas authentifiées, même en mode `supabase`. Quelqu'un qui atteint le port peut donc consommer votre clé d'IA.
- Les routes de configuration de l'IA (`/api/ia/*`) ne sont pas authentifiées non plus. Elles ne peuvent pas relire votre clé, mais elles peuvent la remplacer ou l'effacer. C'est le premier endroit à protéger si Mew est exposé.
- Le mode `supabase` n'a pas encore été éprouvé en conditions réelles avec plusieurs comptes.
- Il n'y a pas de journal des accès : si quelqu'un lisait vos données, rien n'en garderait la trace.

Par précaution, le serveur écoute par défaut sur `127.0.0.1`, c'est-à-dire uniquement depuis votre machine. Ne changez `HOST` que si vous savez ce que vous faites — et si vous le faites, mettez `AUTH_MODE=supabase`.

### Votre clé API d'IA est stockée en clair sur le disque

Quand vous enregistrez un fournisseur depuis l'écran Paramètres, votre clé est écrite **en clair** dans `backend/data/config-ia.json`. Elle n'est ni chiffrée, ni hachée : le serveur doit pouvoir la relire pour appeler le fournisseur.

**C'est acceptable pour une application locale mono-utilisateur.** Un fichier `.env` fait exactement la même chose depuis toujours, et chiffrer un secret avec une clé rangée juste à côté ne protège de rien. Mais il faut le savoir, parce que ça implique trois choses :

- Le fichier est ignoré par git (`backend/data/` est dans `.gitignore`) — **ne le forcez jamais dans un commit.**
- Sur Linux et macOS, il est écrit en mode `0600` : lisible par votre seul compte. **Windows ignore ces permissions** — sur une machine Windows partagée entre plusieurs comptes, un autre compte administrateur peut le lire.
- N'importe quel programme tournant sous votre session peut le lire. C'est vrai de vos clés SSH aussi ; ça ne rend pas la chose anodine.

Pour retirer votre clé de cette machine : le bouton **Effacer** de l'écran Paramètres supprime le fichier, clé comprise. Supprimer `backend/data/config-ia.json` à la main fait la même chose.

### N'hébergez pas Mew pour plusieurs personnes avec une clé enregistrée

C'est la limite la plus importante de cette fonctionnalité, et elle est structurelle.

La clé est enregistrée **côté serveur**, dans un fichier unique. Il n'y a pas une clé par compte. Donc si vous exposez une installation de Mew à plusieurs personnes :

- **Tout le monde utilise votre clé**, et toute la consommation est facturée sur votre compte.
- Rien ne limite ce que chacun consomme, au-delà du limiteur global de requêtes.
- **N'importe qui atteignant le port peut modifier ou effacer votre configuration** : les routes `/api/ia/*` ne sont pas derrière l'authentification, comme `/api/capacites`. Elles ne peuvent pas relire votre clé (voir le point suivant), mais elles peuvent la remplacer.

**Notre recommandation est franche : ne faites pas ça** tant que Mew ne sait pas gérer une clé par compte. Si vous hébergez Mew pour un groupe, ou bien vous assumez de payer pour tout le monde et vous mettez la clé dans le `.env` (elle devient alors verrouillée, personne ne peut la changer depuis l'interface), ou bien vous laissez chacun installer Mew chez soi.

### La clé d'IA ne repart jamais vers le navigateur

Ce qui est garanti, en revanche :

- Une seule fonction du projet a le droit de décrire la configuration à l'extérieur, et elle ne rend la clé que **masquée** : `sk-p...4f2a`. Assez pour reconnaître laquelle est enregistrée, inutilisable pour s'en servir. En dessous de 12 caractères, elle est masquée entièrement.
- Aucune route ne renvoie la clé en clair, même pas celle qui vient de l'enregistrer.
- **La clé n'est jamais journalisée** : les routes de configuration ne loguent pas le corps des requêtes, et les erreurs sont loguées par leur message seul, jamais l'objet complet.
- Une clé ne transite **jamais dans une URL** — c'est pourquoi la route qui liste les modèles d'un fournisseur existe en `POST` en plus du `GET` : une clé dans une URL finirait dans les journaux du serveur et dans l'historique du navigateur.
- L'écriture du fichier est **atomique** (fichier temporaire créé en `0600`, puis renommé) : une coupure de courant ne peut pas laisser une clé à moitié écrite.

### Ce que vous envoyez, et à qui

Le fournisseur que vous choisissez reçoit les textes des tâches de rédaction : selon l'outil, votre CV ou une offre. Deux avertissements que le catalogue affiche déjà dans l'interface, répétés ici :

- **Google (Gemini)** : sur le palier gratuit, Google exploite vos requêtes pour améliorer ses produits. N'y envoyez pas un CV que vous ne publieriez pas.
- **DeepSeek** : les serveurs sont en Chine, sous une juridiction différente de la vôtre.

Avec **Ollama, LM Studio ou llama.cpp**, rien ne sort de votre machine. C'est l'option la plus sûre pour un CV, et elle est gratuite.

### La clé `SUPABASE_SERVICE_KEY` contourne toute la sécurité

Si vous utilisez le mode Supabase, cette clé donne un accès complet à la base et ignore les règles de sécurité au niveau des lignes (RLS). Elle ne doit jamais quitter le backend, ni figurer dans une variable `NEXT_PUBLIC_*` — tout ce qui commence par `NEXT_PUBLIC_` est envoyé au navigateur et lisible par n'importe qui.

### Les URL d'offres sont filtrées

L'outil qui lit une offre depuis son URL refuse les adresses pointant vers un réseau privé (`127.0.0.1`, `192.168.x`, `10.x`, `169.254.x`, IPv6 locales), et revalide après chaque redirection. Sans ce filtre, quelqu'un pourrait faire lire à votre serveur les pages de votre réseau local, ou les métadonnées de votre hébergeur cloud.

Le filtre est dans [`backend/src/lib/urlSecurity.js`](backend/src/lib/urlSecurity.js). Si vous le modifiez, gardez le test qui l'accompagne.

## Vos données

- Candidatures et historique : `backend/data/mew.json`, sur votre disque. Ce fichier est ignoré par git.
- Choix du fournisseur d'IA et clé API : `backend/data/config-ia.json`, en clair, ignoré par git (voir plus haut).
- Les CV sont lus en mémoire et jamais écrits sur le disque.
- Les journaux ne contiennent ni nom, ni email, ni contenu de CV, ni clé API. Les adresses email tracées pour le débogage sont masquées (`r***@exemple.fr`).
- Si vous configurez un fournisseur en ligne, les textes des tâches de rédaction lui sont envoyés. C'est le seul cas où des données sortent de votre machine — et avec un modèle local, il n'existe pas.

## Ne commitez jamais

- Vos fichiers `.env` (ils sont dans `.gitignore`, mais vérifiez avant de pousser)
- Votre vrai CV, ni celui de quelqu'un d'autre — les `*.pdf` sont ignorés par git, gardez-le ainsi
- Le contenu de `backend/data/` — il contient `config-ia.json`, donc **votre clé API en clair**
- Une clé API, où que ce soit : dans un rapport de bug, une capture d'écran, un test. Si vous en avez publié une par accident, révoquez-la chez le fournisseur immédiatement — la retirer d'un commit ne suffit pas.
