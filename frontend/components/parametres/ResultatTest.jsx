'use client';

import Alert from '@/components/shared/Alert';

/**
 * Etape 4 : ce qu'a donne le test, en detail.
 *
 * POURQUOI TESTER AVANT D'ENREGISTRER
 * Une configuration fausse ne se voit pas : elle se decouvre trois ecrans plus
 * loin, au milieu d'une lettre de motivation, sous la forme d'une erreur
 * incomprehensible. Le test fait le vrai trajet — connexion, cle, modele,
 * reponse — et le raconte ici avant que quoi que ce soit ne soit enregistre.
 *
 * L'AVERTISSEMENT LE PLUS IMPORTANT DE CET ECRAN
 * Un modele peut repondre parfaitement et rester mal adapte a Mew : le projet
 * lui demande d'ecrire « SUBJECT: », une ligne de tirets, puis le corps. Les
 * petits modeles improvisent souvent autour de cette consigne. Ce n'est pas
 * une panne — d'ou le bandeau orange et non rouge — mais il faut le DIRE,
 * sinon la personne enregistrera un modele qui produira des textes mal
 * decoupes sans jamais comprendre pourquoi.
 *
 * ACCESSIBILITE : la region d'annonce est montee en permanence (la div
 * exterieure est toujours rendue). Un lecteur d'ecran n'annonce pas le contenu
 * d'une region live creee en meme temps que son contenu. Les Alert internes
 * recoivent donc `annonce={false}` : sans ca, le message serait annonce deux
 * fois, ou pas du tout.
 */
export default function ResultatTest({ resultat, enCours }) {
  return (
    <div role="status" aria-live="polite" className="min-h-[1px]">
      {enCours && (
        <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
          />
          Test en cours : on ecrit une consigne courte au modele et on attend sa reponse...
        </p>
      )}

      {!enCours && resultat && (
        resultat.ok ? <Succes resultat={resultat} /> : <Echec resultat={resultat} />
      )}
    </div>
  );
}

function Succes({ resultat }) {
  const irregulier = !resultat.suitLesConsignes;

  return (
    <Alert variant={irregulier ? 'warning' : 'success'} annonce={false}>
      <p className="font-semibold">
        {irregulier
          ? 'Le modele repond, mais il ne suit pas le format demande'
          : 'La connexion fonctionne'}
      </p>

      {/* Le backend redige deja une phrase complete et sans jargon : on
          l'affiche telle quelle plutot que d'en inventer une deuxieme. */}
      {resultat.message && <p className="mt-1 text-sm font-normal">{resultat.message}</p>}

      {irregulier && (
        <p className="mt-2 text-sm font-normal">
          Tu peux l&apos;enregistrer quand meme : les textes seront corrects, mais Mew aura parfois
          du mal a les decouper (objet de l&apos;email, sections du CV). Un modele plus gros regle
          generalement ce probleme.
        </p>
      )}

      <Avertissement texte={resultat.avertissement} />
      <Details resultat={resultat} />
    </Alert>
  );
}

function Echec({ resultat }) {
  const conseil = CONSEILS[resultat.code] || null;

  return (
    <Alert variant="error" annonce={false}>
      <p className="font-semibold">
        Le test a echoue{resultat.etape ? ` — ${ETAPES[resultat.etape] || resultat.etape}` : ''}
      </p>

      <p className="mt-1 text-sm font-normal">
        {resultat.message || "Le fournisseur n'a pas repondu comme attendu."}
      </p>

      {conseil && <p className="mt-2 text-sm font-normal opacity-90">{conseil}</p>}

      <Details resultat={resultat} />
    </Alert>
  );
}

/**
 * Les etapes du test, traduites.
 * Le backend renvoie des mots de code ; ils sont deja en francais mais pas
 * forcement parlants seuls.
 */
const ETAPES = {
  connexion: 'la connexion au service',
  authentification: 'la verification de la cle',
  format: 'la lecture de la reponse',
};

/**
 * Ce qu'on peut ajouter au message du backend.
 * Le backend explique CE QUI s'est passe ; ces phrases disent QUOI FAIRE.
 * Les codes sont ceux imposes aux adaptateurs (backend/src/llm/adapters/).
 */
const CONSEILS = {
  CLE_INVALIDE:
    "Verifie que la cle est collee en entier (elles sont longues) et qu'elle vient bien de ce "
    + 'fournisseur : une cle OpenAI ne marche pas chez Anthropic.',
  QUOTA_DEPASSE:
    "Soit le compte n'a plus de credit, soit tu as fait trop de requetes en peu de temps. "
    + 'Regarde ton solde chez le fournisseur, ou attends une minute.',
  MODELE_INTROUVABLE:
    'Ce fournisseur ne connait pas ce nom de modele. Utilise « Chercher les modeles disponibles » '
    + "pour voir ce qu'il propose vraiment.",
  TIMEOUT:
    "Le fournisseur n'a pas repondu a temps. Avec un modele local, le tout premier appel peut etre "
    + "tres lent : le modele doit d'abord etre charge en memoire. Reessaie une fois.",
  RESEAU:
    "L'adresse est injoignable. Si c'est un modele local, verifie que le logiciel est lance et que "
    + "le port de l'adresse est le bon.",
  FOURNISSEUR:
    "Le fournisseur a repondu quelque chose d'inattendu. Si ca se reproduit, essaie un autre "
    + 'modele chez lui.',
};

/** Les remarques du backend (modele substitue, separateur absent...). */
function Avertissement({ texte }) {
  if (!texte) return null;
  return <p className="mt-2 text-sm font-normal opacity-90">{texte}</p>;
}

/** Latence, cout, modele reellement utilise. Rien de tout ca n'est garanti. */
function Details({ resultat }) {
  const morceaux = [];

  if (resultat.modele) morceaux.push(`modele : ${resultat.modele}`);
  if (resultat.latenceMs) morceaux.push(`reponse en ${formaterLatence(resultat.latenceMs)}`);

  if (resultat.usage) {
    const { tokensEntree, tokensSortie } = resultat.usage;
    if (tokensEntree || tokensSortie) {
      morceaux.push(`${tokensEntree || 0} tokens envoyes, ${tokensSortie || 0} recus`);
    }
  }

  if (resultat.cout && resultat.cout.eur !== null) {
    morceaux.push(
      resultat.cout.eur === 0
        ? 'cout : nul (modele local, gratuit, ou tarif inconnu du catalogue)'
        : `cout de ce test : environ ${resultat.cout.eur.toFixed(4).replace('.', ',')} EUR`
    );
  }

  if (morceaux.length === 0) return null;

  return <p className="mt-2 text-xs font-normal opacity-80">{morceaux.join(' · ')}</p>;
}

function formaterLatence(millisecondes) {
  if (millisecondes < 1000) return `${Math.round(millisecondes)} ms`;
  return `${(millisecondes / 1000).toFixed(1).replace('.', ',')} s`;
}
