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

- Les routes qui n'exposent pas de données personnelles (analyse de CV, matcher, scraping) ne sont pas authentifiées, même en mode `supabase`. Quelqu'un qui atteint le port peut donc consommer votre clé OpenAI.
- Le mode `supabase` n'a pas encore été éprouvé en conditions réelles avec plusieurs comptes.
- Il n'y a pas de journal des accès : si quelqu'un lisait vos données, rien n'en garderait la trace.

Par précaution, le serveur écoute par défaut sur `127.0.0.1`, c'est-à-dire uniquement depuis votre machine. Ne changez `HOST` que si vous savez ce que vous faites — et si vous le faites, mettez `AUTH_MODE=supabase`.

### La clé `SUPABASE_SERVICE_KEY` contourne toute la sécurité

Si vous utilisez le mode Supabase, cette clé donne un accès complet à la base et ignore les règles de sécurité au niveau des lignes (RLS). Elle ne doit jamais quitter le backend, ni figurer dans une variable `NEXT_PUBLIC_*` — tout ce qui commence par `NEXT_PUBLIC_` est envoyé au navigateur et lisible par n'importe qui.

### Les URL d'offres sont filtrées

L'outil qui lit une offre depuis son URL refuse les adresses pointant vers un réseau privé (`127.0.0.1`, `192.168.x`, `10.x`, `169.254.x`, IPv6 locales), et revalide après chaque redirection. Sans ce filtre, quelqu'un pourrait faire lire à votre serveur les pages de votre réseau local, ou les métadonnées de votre hébergeur cloud.

Le filtre est dans [`backend/src/lib/urlSecurity.js`](backend/src/lib/urlSecurity.js). Si vous le modifiez, gardez le test qui l'accompagne.

## Vos données

- Candidatures et historique : `backend/data/mew.json`, sur votre disque. Ce fichier est ignoré par git.
- Les CV sont lus en mémoire et jamais écrits sur le disque.
- Les journaux ne contiennent ni nom, ni email, ni contenu de CV. Les adresses email tracées pour le débogage sont masquées (`r***@exemple.fr`).
- Si vous configurez une clé OpenAI, les textes des trois tâches de rédaction sont envoyés à OpenAI. C'est le seul cas où des données sortent de votre machine.

## Ne commitez jamais

- Vos fichiers `.env` (ils sont dans `.gitignore`, mais vérifiez avant de pousser)
- Votre vrai CV, ni celui de quelqu'un d'autre — les `*.pdf` sont ignorés par git, gardez-le ainsi
- Le contenu de `backend/data/`
