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

## Les 5 outils

| Outil | Ce qu'il fait |
|---|---|
| **Analyseur de CV** | Lit votre CV (PDF ou formulaire) et propose les métiers qui correspondent à votre profil |
| **Optimiseur de CV** | Note votre CV face aux logiciels de tri des recruteurs (ATS) et liste ce qu'il faut corriger |
| **Matcher d'offres** | Adapte votre CV à une offre précise, et découvre des offres qui vous correspondent |
| **Candidature spontanée** | Rédige un email d'approche et l'envoie avec votre CV en pièce jointe |
| **Suivi de candidatures** | Vos candidatures, leur statut, et les relances à faire |

## Fonctionne sans clé API

Une clé OpenAI n'est **pas** obligatoire. Sans elle, tout ce qui relève du calcul continue de fonctionner ; seule la rédaction assistée est désactivée. Le serveur vous annonce au démarrage ce qui est actif.

Ajouter une clé débloque trois choses, et seulement trois : la lettre de motivation, l'email de candidature, et la reformulation de vos phrases d'expérience.

Vous pouvez aussi pointer Mew vers un modèle qui tourne sur votre propre ordinateur (Ollama, LM Studio) : c'est une ligne dans le fichier de configuration, aucun code à modifier.

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
- **Les journaux ne contiennent aucune donnée identifiante** : ni nom, ni email, ni contenu de CV.
- Si vous configurez une clé OpenAI, les textes envoyés au modèle partent évidemment chez OpenAI. C'est le seul cas, et il est limité aux trois tâches de rédaction.

## Configuration avancée

<details>
<summary><b>Utiliser un modèle local (Ollama, LM Studio)</b></summary>

Dans `backend/.env` :

```env
OPENAI_BASE_URL=http://localhost:11434/v1
AI_MODEL_REDACTION=llama3.1:8b
AI_MODEL_EXTRACTION=llama3.1:8b
```

Aucune clé n'est nécessaire : Mew en envoie une factice, que les serveurs locaux ignorent.
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
   ├── storage/    fichier local (défaut) ou Supabase
   ├── prompts/    les textes envoyés au modèle
   ├── config/     un seul endroit qui lit la configuration
   └── lib/        utilitaires (journaux, sécurité des URL)
```

**La règle qui guide le découpage** : si deux personnes avec la même information sous les yeux arriveraient forcément au même résultat, c'est du code — pas un appel au modèle.

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | Le serveur répond-il |
| GET | `/api/capacites` | Ce qui est actif selon votre configuration |
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
| POST · GET · PUT · DELETE | `/api/applications` · `/user/:userId` · `/:id` · `/:id` | Suivi des candidatures |
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
