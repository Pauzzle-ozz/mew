'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * LA BARRE D'ONGLETS DE L'ESPACE PARAMETRES.
 *
 * POURQUOI DE VRAIS LIENS ET PAS UN ETAT REACT
 * Chaque onglet est une adresse a lui. On peut donc revenir en arriere, garder
 * un onglet en favori, ou envoyer « va dans /parametres/outils » a quelqu'un.
 * Un `useState` aurait rendu ces trois choses impossibles, et le bouton retour
 * du navigateur aurait quitte les parametres au lieu de changer d'onglet.
 *
 * ACCESSIBILITE : c'est une <nav> avec `aria-current="page"` sur l'onglet
 * ouvert. La couleur et le trait sous l'onglet ne portent donc pas
 * l'information a eux seuls.
 *
 * DEBORDEMENT : sur telephone, quatre onglets ne tiennent pas. La barre defile
 * horizontalement plutot que de passer a la ligne — un onglet coupe en deux se
 * lit encore, un onglet empile sur trois lignes ne ressemble plus a rien.
 */
const ONGLETS = [
  {
    href: '/parametres',
    libelle: 'Mes IA',
    description: 'Les fournisseurs chez qui tu as un acces, et tes cles.',
  },
  {
    href: '/parametres/outils',
    libelle: 'Outils & modeles',
    description: 'Pour chaque outil : ce qui passe par l\'IA, et avec quel modele.',
  },
  {
    href: '/parametres/donnees',
    libelle: 'Donnees & confidentialite',
    description: 'Ou sont tes donnees, et comment tout effacer.',
  },
  {
    href: '/parametres/apparence',
    libelle: 'Apparence',
    description: 'Le theme clair ou sombre.',
  },
];

export default function OngletsParametres() {
  const chemin = usePathname();

  return (
    <nav aria-label="Sections des parametres" className="border-b border-border/60">
      {/* -mb-px : le trait de l'onglet actif recouvre exactement la bordure du
          conteneur, sinon on voit deux lignes superposees d'un pixel. */}
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {ONGLETS.map((onglet) => {
          // Comparaison exacte : /parametres/outils ne doit pas allumer
          // /parametres, qui est le prefixe de tous les autres.
          const actif = chemin === onglet.href;

          return (
            <li key={onglet.href} className="shrink-0">
              <Link
                href={onglet.href}
                aria-current={actif ? 'page' : undefined}
                title={onglet.description}
                className={`block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  actif
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:border-border-light hover:text-text-primary'
                }`}
              >
                {onglet.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
