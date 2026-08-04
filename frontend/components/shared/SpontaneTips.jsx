'use client';

import { useId, useState } from 'react';
import { IconChevronRight } from '@/components/shared/icons';

/**
 * Conseils pour trouver l'adresse email d'un recruteur.
 *
 * POURQUOI CE FICHIER A ETE REPRIS
 * Il etait ecrit en couleurs fixes (text-white, bg-white/5, text-gray-300),
 * heritees d'une epoque ou l'application n'avait qu'un theme sombre. En theme
 * clair, le fond de l'application est creme (#FFFBF5) : du texte blanc dessus
 * est litteralement invisible. Tout passe donc par les variables de theme, qui
 * changent de valeur avec le theme choisi — c'est la seule facon d'etre
 * correct dans les deux sens sans ecrire deux fois le composant.
 */

const CONSEILS = [
  {
    titre: "Trouver l'email du recruteur sur LinkedIn",
    contenu:
      'Cherchez le nom du DRH ou du responsable du departement vise sur LinkedIn. Consultez son profil — beaucoup indiquent leur email professionnel dans la section "Coordonnees". Sinon, utilisez le format commun : prenom.nom@entreprise.com',
  },
  {
    titre: "Utiliser le site de l'entreprise",
    contenu:
      'Les pages "Nous contacter", "A propos" ou "Recrutement" contiennent souvent un email generique RH (recrutement@, rh@, jobs@). C\'est une bonne cible de depart si vous n\'avez pas de contact direct.',
  },
  {
    titre: 'Hunter.io et Email Finder',
    contenu:
      "Des outils comme Hunter.io, Apollo.io ou Rocketreach permettent de trouver des emails professionnels a partir du nom de domaine d'une entreprise. Hunter offre 25 recherches gratuites par mois.",
  },
  {
    titre: 'Cibler le bon interlocuteur',
    contenu:
      'Pour les petites entreprises (moins de 50 salaries), contactez directement le CEO ou le fondateur. Pour les moyennes et grandes entreprises, ciblez le responsable du departement (par exemple : Responsable Marketing) plutot que le service RH generique.',
  },
  {
    titre: 'Le timing ideal',
    contenu:
      'Les mardis et jeudis matin entre 8h30 et 10h sont statistiquement les meilleurs moments pour envoyer un email de candidature spontanee. Evitez les lundis (surcharge post-weekend) et les vendredis (veille de weekend).',
  },
];

export default function SpontaneTips() {
  const [ouvert, setOuvert] = useState(null);
  const idBase = useId();

  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-5 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">Comment trouver le bon email ?</h3>

      <div className="space-y-2">
        {CONSEILS.map((conseil, index) => {
          const estOuvert = ouvert === index;
          const idPanneau = `${idBase}-conseil-${index}`;
          const idBouton = `${idPanneau}-bouton`;

          return (
            <div key={conseil.titre} className="overflow-hidden rounded-xl border border-border/60">
              {/* aria-expanded et aria-controls : sans eux, un lecteur d'ecran
                  annonce un bouton sans dire s'il ouvre ou ferme quelque chose,
                  ni ou se trouve le texte qui apparait. */}
              <button
                type="button"
                id={idBouton}
                aria-expanded={estOuvert}
                aria-controls={idPanneau}
                onClick={() => setOuvert(estOuvert ? null : index)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 bg-surface px-4 py-2.5 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              >
                <span>{conseil.titre}</span>
                {/* Le chevron pivote au lieu d'alterner deux caracteres :
                    un triangle textuel se lit « pointant vers le bas » par
                    certains lecteurs d'ecran, ce qui est du bruit. */}
                <IconChevronRight
                  className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${
                    estOuvert ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {estOuvert && (
                <div
                  id={idPanneau}
                  role="region"
                  aria-labelledby={idBouton}
                  className="border-t border-border/60 bg-surface-elevated/50 px-4 py-3 text-sm leading-relaxed text-text-secondary"
                >
                  {conseil.contenu}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
