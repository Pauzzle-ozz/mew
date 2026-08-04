'use client';

/**
 * Etape 1 : chez qui tourne le modele.
 *
 * POURQUOI DES GROUPES ET PAS UNE LISTE DEROULANTE
 * Le catalogue compte une quinzaine de fournisseurs. Mis a plat, ils se
 * ressemblent tous et le choix devient un tirage au sort. Regroupes, ils
 * racontent la seule chose qui compte pour quelqu'un qui debute :
 *
 *   « Sur ta machine »  gratuit, sans cle, et ton CV ne quitte pas ton
 *                       ordinateur. C'est le groupe montre EN PREMIER, parce
 *                       que c'est le plus respectueux et que personne n'y
 *                       pense spontanement.
 *   « En ligne »        il faut une cle et ca coute quelques centimes, mais
 *                       la qualite est au rendez-vous.
 *   « Autre »           la porte de sortie : n'importe quelle adresse
 *                       compatible OpenAI. Aucun modele n'est hors de portee.
 *
 * ACCESSIBILITE
 * Ce sont de VRAIS boutons radio, cachés visuellement (`sr-only`) sous une
 * carte dessinee. On garde ainsi gratuitement ce qu'une div cliquable oblige
 * a reecrire a la main : navigation aux fleches a l'interieur du groupe,
 * annonce « 3 sur 12 » par le lecteur d'ecran, et l'etat coche. Le
 * `<fieldset>`/`<legend>` rattache chaque carte a son groupe.
 */

/** Un groupe d'affichage : son titre, sa phrase d'explication, son filtre. */
const GROUPES = [
  {
    cle: 'local',
    titre: 'Sur ta machine',
    explication:
      "Gratuit, sans cle, et ton CV ne sort jamais de ton ordinateur. Le logiciel doit tourner de son cote.",
    filtre: (f) => f.local,
  },
  {
    cle: 'ligne',
    titre: 'En ligne',
    explication:
      'Il te faut un compte chez eux et ta propre cle. Compte quelques centimes par lettre de motivation.',
    filtre: (f) => !f.local && f.id !== 'personnalise',
  },
  {
    cle: 'autre',
    titre: 'Autre fournisseur',
    explication:
      "Pour tout le reste : tu saisis toi-meme l'adresse de l'API. Aucun modele n'est hors de portee.",
    filtre: (f) => f.id === 'personnalise',
  },
];

export default function ChoixFournisseur({ fournisseurs, valeur, onChange }) {
  return (
    <div className="space-y-8">
      {GROUPES.map((groupe) => {
        const liste = fournisseurs.filter(groupe.filtre);
        if (liste.length === 0) return null;

        return (
          <fieldset key={groupe.cle} className="border-0 p-0 m-0">
            <legend className="mb-1 font-display text-base font-bold text-text-primary">
              {groupe.titre}
            </legend>
            <p className="mb-4 text-sm text-text-muted">{groupe.explication}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liste.map((fournisseur) => (
                <CarteFournisseur
                  key={fournisseur.id}
                  fournisseur={fournisseur}
                  choisi={valeur === fournisseur.id}
                  onChange={onChange}
                />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function CarteFournisseur({ fournisseur, choisi, onChange }) {
  const idChamp = `fournisseur-${fournisseur.id}`;

  return (
    <div className="relative">
      {/* L'input EST le bouton radio : il precede la carte pour que les
          variantes `peer-*` de la carte puissent reagir a son etat. */}
      <input
        type="radio"
        id={idChamp}
        name="fournisseur"
        value={fournisseur.id}
        checked={choisi}
        onChange={() => onChange(fournisseur.id)}
        className="peer sr-only"
      />
      <label
        htmlFor={idChamp}
        className="flex h-full cursor-pointer flex-col rounded-2xl border border-border/60 bg-surface p-4 transition-all hover:border-primary/40 hover:bg-primary-light peer-checked:border-primary peer-checked:bg-primary-light peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="font-display text-sm font-bold text-text-primary">
            {fournisseur.nom}
          </span>
          {/* La pastille de selection double la couleur de bordure : la couleur
              seule ne doit jamais porter l'information (daltonisme). */}
          <span
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
              choisi ? 'border-primary bg-primary' : 'border-border-light'
            }`}
          />
        </span>

        <Etiquettes fournisseur={fournisseur} />

        {fournisseur.note && (
          <span className="mt-2 text-xs leading-relaxed text-text-muted">{fournisseur.note}</span>
        )}
      </label>
    </div>
  );
}

/**
 * Les deux ou trois mots qui decident a la place d'une notice.
 * On se limite volontairement : cinq etiquettes ne se lisent plus.
 */
function Etiquettes({ fournisseur }) {
  const etiquettes = [];

  if (fournisseur.local) {
    etiquettes.push({ texte: 'Rien ne sort de chez toi', ton: 'succes' });
  }
  if (!fournisseur.cleRequise) {
    etiquettes.push({ texte: 'Sans cle', ton: 'succes' });
  }
  if (fournisseur.paliergratuit && !fournisseur.local) {
    etiquettes.push({ texte: 'Palier gratuit', ton: 'accent' });
  }
  if (fournisseur.cleRequise && !fournisseur.paliergratuit) {
    etiquettes.push({ texte: 'Cle payante', ton: 'neutre' });
  }

  if (etiquettes.length === 0) return null;

  const tons = {
    succes: 'bg-success/10 text-success',
    accent: 'bg-accent-light text-accent',
    neutre: 'bg-surface-elevated text-text-muted',
  };

  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {etiquettes.map((etiquette) => (
        <span
          key={etiquette.texte}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${tons[etiquette.ton]}`}
        >
          {etiquette.texte}
        </span>
      ))}
    </span>
  );
}
