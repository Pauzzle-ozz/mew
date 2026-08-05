# Mew — des outils de recherche d'emploi qui tournent chez vous

> *English speakers: this project is intentionally French-only — it targets the French job market (ROME job repository, France Travail, CDI/CDD contracts). The interface, the code and the docs are in French.*

Mew est une boîte à outils libre pour chercher un emploi : analyser son CV, l'optimiser pour les robots de recrutement, l'adapter à une offre, écrire une candidature spontanée et suivre ses relances.

**Tout tourne sur votre machine.** Votre CV n'est pas téléversé sur un serveur qui vous appartient pas, il n'y a pas de compte à créer, et il n'y a rien à payer.

## Pourquoi ce projet

La plupart des outils de CV « propulsés par l'IA » envoient votre nom, votre téléphone, votre adresse et votre parcours complet à un service tiers — pour vous rendre, la plupart du temps, un score inventé qui change à chaque fois que vous cliquez.

Mew part du principe inverse :

> **Ce qui est calculable est calculé, en local, par du code qu'on peut lire et tester.
> Un modèle de langage n'est appelé que pour ce qu'aucun calcul ne sait faire : écrire un texte destiné à être lu par un humain.**

Concrètement : un score ATS obtenu deux fois sur le même CV donne deux fois le même résultat, et on peut vous montrer le détail du calcul, critère par critère.

## Les 4 outils

| Outil | Ce qu'il fait |
|---|---|
| **Analyseur de CV** | Lit votre CV (PDF ou formulaire) et propose les métiers qui correspondent à votre profil |
| **Optimiseur de CV** | Note votre CV face aux logiciels de tri des recruteurs (ATS) et liste ce qu'il faut corriger |
| **Matcher d'offres** | Adapte votre CV à une offre précise, et découvre des offres qui vous correspondent |
| **Candidature spontanée** | Rédige un email d'approche, l'envoie avec votre CV en pièce jointe, et vous rappelle de relancer |

## Choisissez votre fournisseur et votre modèle

Mew ne vous impose **aucun** fournisseur d'IA. Vous choisissez le vôtre, et le modèle précis que vous voulez : ChatGPT, Claude, Gemini, Kimi, Mistral, DeepSeek, Grok, ou un modèle qui tourne sur votre propre ordinateur. La seule condition : **vous apportez votre clé** (sauf pour les modèles locaux, qui n'en demandent pas).

**Tout se fait dans l'écran Paramètres**, à l'adresse http://localhost:3000/parametres. Plus besoin d'ouvrir un fichier de configuration dans un éditeur de texte. Le parcours tient en cinq temps : chez qui → votre clé → vos modèles → un test → enregistrer.

Le bouton **Tester** ne se contente pas de vérifier que la clé passe. Il envoie au modèle une demande miniature (quelques dizaines de tokens, moins d'un dixième de centime) au format exact que Mew utilise en production, et découpe la réponse avec le vrai code du projet. Vous savez donc avant d'enregistrer si ce modèle-là sait suivre les consignes — un petit modèle local peut très bien répondre `200 OK` et ignorer complètement le format demandé.

### Fournisseurs proposés

| Fournisseur | Clé requise | Gratuit | Remarque |
|---|:---:|:---:|---|
| **Ollama** | non | ✅ local | Rien ne sort de votre machine. Doit être lancé. |
| **LM Studio** | non | ✅ local | Activez le serveur local (onglet *Developer*). |
| **llama.cpp** | non | ✅ local | `llama-server`, port 8080 par défaut. |
| **OpenAI** | oui | non | Le plus répandu. |
| **Anthropic (Claude)** | oui | non | Excellent en rédaction. |
| **Google (Gemini)** | oui | ✅ palier gratuit | Google exploite les requêtes gratuites : n'y envoyez pas un CV sensible. |
| **Mistral AI** | oui | ✅ palier gratuit | Français, données hébergées en Europe. |
| **Moonshot (Kimi)** | oui | non | Bon rapport qualité/prix. |
| **DeepSeek** | oui | non | Parmi les moins chers. Serveurs en Chine. |
| **xAI (Grok)** | oui | non | |
| **Groq** | oui | ✅ palier gratuit | Modèles ouverts, très rapide. |
| **Cerebras** | oui | ✅ palier gratuit | Palier gratuit quotidien. |
| **Together AI** | oui | non | Revendeur de modèles ouverts. |
| **Fireworks AI** | oui | non | Revendeur de modèles ouverts. |
| **OpenRouter** | oui | ✅ palier gratuit | Une seule clé, des centaines de modèles. Bon point d'entrée si vous hésitez. |
| **Autre (compatible OpenAI)** | au choix | — | Vous saisissez l'adresse vous-même. Aucun service n'est hors de portée. |

Le catalogue affiche pour chaque modèle son tarif (dollars par million de tokens) et la taille de sa fenêtre de contexte. **Ces prix sont des ordres de grandeur**, vérifiés le 4 août 2026 : les fournisseurs changent leurs grilles sans prévenir, seul le fournisseur fait foi.

Chez Ollama, LM Studio, llama.cpp et OpenRouter, la liste des modèles est demandée **en direct** au service : elle correspond à ce que vous avez réellement installé ou à ce qui est réellement disponible.

### Deux modèles, deux rôles

Mew désigne les modèles par **rôle**, jamais par nom dans le code :

- **rédaction** — écrire un texte lu par un humain (lettre, email). La qualité prime.
- **extraction** — structurer, reformater (lire un CV, en sortir un profil). La rapidité et le coût priment.

Vous pouvez en choisir un par rôle, ou le même pour les deux si vous ne voulez pas vous poser de questions.

### Fonctionne sans aucune clé

Aucune clé n'est obligatoire. Sans configuration, tout ce qui relève du calcul continue de fonctionner ; seule la rédaction assistée est désactivée. **Le serveur démarre toujours** et vous annonce au démarrage ce qui est actif.

### Ce qui est calculé, ce qui est rédigé

| Calculé en local, gratuitement, sans réseau | Rédigé par un modèle |
|---|---|
| Métiers correspondants (référentiel ROME) | Lettre de motivation |
| Score ATS, critère par critère | Email de candidature spontanée |
| Correspondance CV ↔ offre | Reformulation des phrases d'expérience |
| Extraction d'offre depuis une page web | |
| Lecture et structuration du CV | |
| Classement des offres découvertes | |
| Relances, jours ouvrés, statistiques | |

Un même CV analysé deux fois donne **exactement le même résultat**, et chaque note peut être expliquée ligne par ligne.

Il ne reste que **6 appels à un modèle dans tout le projet**, tous de la rédaction. C'est aussi pourquoi le choix du fournisseur vous appartient sans risque : moins il y a d'appels, moins vous êtes lié à qui que ce soit — et moins ça vous coûte.

> **Refonte en cours.** Le projet vient d'un modèle où *tout* passait par OpenAI, scores compris. L'état des lieux et le plan restant sont dans [docs/refonte/](docs/refonte/).

## Installation

**Prérequis** : [Node.js](https://nodejs.org/) 20.9 ou plus récent. C'est tout.

```bash
git clone https://github.com/Pauzzle-ozz/mew.git
cd mew

cd backend && npm install
cd ../frontend && npm install
```

> `npm install` du backend télécharge Chromium (~1,3 Go), utilisé pour lire les offres sur les sites qui ont besoin de JavaScript. Pour l'éviter :
> `PUPPETEER_SKIP_DOWNLOAD=true npm install`. Tout le reste fonctionne sans.

### Configuration (facultative)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Les deux fichiers sont commentés ligne par ligne. **Aucune variable n'est obligatoire** : sans configuration, Mew démarre en mode local avec le stockage sur fichier.

> Le fournisseur d'IA, lui, **ne se configure plus ici** : il se choisit dans l'écran Paramètres. Le `.env` reste possible et reste prioritaire, pour qui installe Mew pour d'autres — voir *Configuration avancée* plus bas.

### Lancer

Deux terminaux :

```bash
# Terminal 1 — le serveur
cd backend && npm run dev

# Terminal 2 — l'interface
cd frontend && npm run dev
```

Puis ouvrez **http://localhost:3000**. Vous arrivez directement sur le tableau de bord, sans écran de connexion.

Pour vérifier que le serveur répond : http://localhost:5000/api/capacites vous dit ce qui est actif.

> Sur macOS, le port 5000 est occupé par AirPlay. Mettez `PORT=5001` dans `backend/.env` et adaptez `NEXT_PUBLIC_API_URL` dans `frontend/.env.local`.

## Vos données

- **Elles restent chez vous.** Candidatures et historique sont enregistrés dans `backend/data/mew.json`, un fichier que vous pouvez ouvrir, sauvegarder ou supprimer.
- **Votre CV n'est jamais écrit sur le disque.** Il est lu en mémoire, traité, puis oublié à la fin de la requête.
- **Les journaux ne contiennent aucune donnée identifiante** : ni nom, ni email, ni contenu de CV. Votre clé API n'y figure jamais non plus.
- **Votre clé API ne repart jamais vers le navigateur.** L'écran Paramètres n'en reçoit qu'une version masquée (`sk-p...4f2a`), juste assez pour reconnaître laquelle est enregistrée.
- Si vous choisissez un fournisseur en ligne, les textes des tâches de rédaction partent évidemment chez lui. C'est le seul cas où des données sortent de votre machine — et avec un modèle local (Ollama, LM Studio, llama.cpp), ce cas n'existe pas du tout.

Détails, et ce qu'il faut savoir avant d'héberger Mew pour plusieurs personnes : [SECURITY.md](SECURITY.md).

## Configuration avancée

<details>
<summary><b>Imposer un fournisseur depuis le <code>.env</code> (installation partagée)</b></summary>

L'écran Paramètres enregistre votre choix dans `backend/data/config-ia.json`. Mais quelqu'un peut installer Mew **pour d'autres** (serveur partagé, association, centre de formation) et vouloir imposer sa configuration. L'ordre est donc :

1. `backend/.env`, s'il définit `OPENAI_API_KEY` — **prioritaire, toujours**
2. `backend/data/config-ia.json`, le choix fait dans l'écran Paramètres
3. rien du tout — et Mew démarre quand même

Quand le `.env` gagne, l'écran Paramètres affiche le choix comme **verrouillé**, au lieu de laisser croire qu'on peut le changer. Pour rendre la main à l'utilisateur : retirez `OPENAI_API_KEY` du `.env` et relancez le serveur.

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=http://localhost:11434/v1   # vide = OpenAI
AI_MODEL_REDACTION=llama3.1:8b
AI_MODEL_EXTRACTION=llama3.1:8b
```

Cette voie ne parle que le protocole **compatible OpenAI**. Anthropic et Google, qui ont leur propre format d'API, ne sont accessibles que par l'écran Paramètres.

⚠️ Une clé mise dans le `.env` (ou enregistrée depuis l'écran Paramètres) est **partagée par tous les utilisateurs** de cette installation, et c'est vous qui payez. Lisez [SECURITY.md](SECURITY.md) avant.
</details>

<details>
<summary><b>Héberger Mew en ligne pour plusieurs personnes</b></summary>

Le mode par défaut est mono-utilisateur et sans mot de passe : il est prévu pour une machine personnelle. Pour un usage partagé, basculez sur Supabase (comptes + base PostgreSQL).

Dans `backend/.env` : `STORAGE_DRIVER=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
Dans `frontend/.env.local` : `NEXT_PUBLIC_AUTH_MODE=supabase` + `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Le SQL des deux tables :

```sql
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_title TEXT NOT NULL,
  company TEXT DEFAULT '',
  offer_url TEXT DEFAULT '',
  location TEXT DEFAULT '',
  contract_type TEXT DEFAULT '',
  status TEXT DEFAULT 'a_postuler', -- a_postuler | postule | entretien | offre | refuse
  notes TEXT DEFAULT '',
  recipient_email TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  candidature_type TEXT DEFAULT 'offre', -- offre | spontanee
  candidate_name TEXT DEFAULT '',
  original_subject TEXT DEFAULT '',
  follow_up_date TIMESTAMPTZ,
  follow_up_sent BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tool_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL, -- analyse-cv | optimiseur-cv | matcher-offres
  title TEXT,
  input_summary JSONB,
  result_summary JSONB,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_usage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own applications"
  ON job_applications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own history"
  ON tool_usage_history FOR ALL USING (auth.uid() = user_id);
```

⚠️ **Le backend n'authentifie pas encore les requêtes** : il fait confiance à l'identifiant utilisateur envoyé par le navigateur. C'est sans conséquence en usage local mono-utilisateur, mais **n'exposez pas cette installation sur internet en l'état**. Voir [SECURITY.md](SECURITY.md).
</details>

<details>
<summary><b>Découverte d'offres</b></summary>

France Travail expose une API officielle et gratuite : créez un compte sur [francetravail.io](https://francetravail.io) et renseignez `FT_CLIENT_ID` / `FT_CLIENT_SECRET`.

Le scraping des autres sites (Welcome to the Jungle, Indeed, HelloWork, APEC) est **désactivé par défaut** (`SCRAPING_ENABLED=false`). Si vous l'activez, vérifiez les conditions d'utilisation de ces sites : c'est votre responsabilité.
</details>

<details>
<summary><b>Envoi d'emails</b></summary>

La candidature spontanée peut envoyer l'email pour vous via [Resend](https://resend.com). Sans clé, l'email est quand même rédigé : vous le copiez dans votre messagerie.

⚠️ L'adresse d'expédition par défaut (`onboarding@resend.dev`) est une adresse de test qui **n'écrit qu'au titulaire du compte Resend**. Pour écrire à un vrai recruteur, vérifiez votre propre domaine chez Resend et renseignez `EMAIL_FROM`.
</details>

## Comment c'est fait

```
frontend/          Next.js 16, React 19, Tailwind 4     -> port 3000
   |
   | appels HTTP via lib/api/
   v
backend/           Express 5                            -> port 5000
   ├── routes/     entrées HTTP
   ├── services/   orchestration
   ├── llm/        le choix du fournisseur (catalogue, adaptateurs, réglages)
   ├── core/       le calcul : scores, parseurs, ROME — zéro réseau
   ├── storage/    fichier local (défaut) ou Supabase
   ├── prompts/    les textes envoyés au modèle
   ├── config/     un seul endroit qui lit la configuration
   └── lib/        utilitaires (journaux, sécurité des URL)
```

Le dossier `llm/` est ce qui rend Mew portable. `llm/providers/catalogue.js` est de la **donnée** — ajouter un fournisseur compatible OpenAI, c'est copier une entrée, sans toucher à une ligne de code. `llm/adapters/` ne compte que trois fichiers : `openaiCompatible` (la quasi-totalité des services), `anthropic` et `google`, qui ont leur propre format.

Les sorties structurées passent par des **marqueurs texte découpés en JavaScript** (`SUBJECT:`, une ligne de tirets, le corps), jamais par les *Structured Outputs* d'OpenAI. C'est ce qui permet à un petit modèle local de fonctionner : il ne sait pas produire du JSON contraint, mais il sait suivre une consigne de mise en forme.

**La règle qui guide le découpage** : si deux personnes avec la même information sous les yeux arriveraient forcément au même résultat, c'est du code — pas un appel au modèle.

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | Le serveur répond-il |
| GET | `/api/capacites` | Ce qui est actif selon votre configuration |
| GET | `/api/ia/fournisseurs` | Le catalogue : fournisseurs, modèles, tarifs |
| GET · PUT · DELETE | `/api/ia/config` | Lire (masquée), enregistrer, effacer votre choix |
| POST | `/api/ia/tester` | Tester une configuration **sans** l'enregistrer |
| GET · POST | `/api/ia/modeles/:fournisseur` | Demander sa liste de modèles au fournisseur |
| POST | `/api/solutions/analyse-cv` | Analyse depuis le formulaire |
| POST | `/api/solutions/analyse-cv-pdf-complete` | Analyse depuis un PDF |
| POST | `/api/solutions/optimiser-cv-pdf` | Score ATS + optimisation |
| POST | `/api/matcher/scraper-url` | Lire une offre depuis son URL |
| POST | `/api/matcher/analyser` | Adapter le CV (saisie manuelle) |
| POST | `/api/matcher/analyser-scraper` | Adapter le CV (offre lue depuis une URL) |
| POST | `/api/matcher/generer-complet` | Mode rapide : CV + URL |
| POST | `/api/matcher/adapter-rapide` | Adapter à une offre découverte |
| POST | `/api/matcher/decouvrir-offres` | CV → métiers + offres |
| POST | `/api/matcher/extraire-candidat-pdf` | Extraire le profil d'un CV |
| POST | `/api/candidature-spontanee/envoyer` | Rédiger et envoyer |
| POST | `/api/candidature-spontanee/generer-relance` | Rédiger une relance |
| PUT | `/api/candidature-spontanee/:id/relance-envoyee` | Marquer la relance faite |
| GET | `/api/applications/user/:userId/statistiques` | Relances à faire sur les candidatures spontanées |
| POST · GET · DELETE | `/api/historique/sauvegarder` · `/:userId` · `/:entryId` | Historique des outils |

Les routes qui appellent le modèle sont limitées à 200 requêtes par quart d'heure (réglable avec `AI_RATE_LIMIT_MAX`, `0` pour désactiver).

## Données métiers

Mew embarque le **ROME 4.0** de France Travail : 1 911 fiches métier, 14 301 appellations et les compétences associées à chacune. C'est le référentiel officiel du service public de l'emploi, publié en Licence Ouverte.

C'est ce qui permet de proposer des métiers et de calculer une adéquation **sans demander à un modèle d'inventer une liste** — et ça marche aussi bien pour un aide-soignant ou un plombier que pour un développeur.

Pour mettre à jour (France Travail publie environ deux fois par an) :

```bash
cd backend && npm run data:update
```

Attribution et licences détaillées : [backend/src/data/LICENCES.md](backend/src/data/LICENCES.md).

## Contribuer

Les contributions sont bienvenues. Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les conventions et par où commencer.

Une faille de sécurité ? [SECURITY.md](SECURITY.md).

## Licence

Le code est sous [MIT](LICENSE) — faites-en ce que vous voulez.

Les données de `backend/src/data/rome/` restent sous **Licence Ouverte 2.0 (Etalab)**.
Données métiers : ROME 4.0 — France Travail.
