/**
 * Avertissement quand le texte du PDF a mal ete extrait.
 *
 * POURQUOI ON L'AFFICHE PLUTOT QUE DE LE CACHER
 * pdf-parse rend un PDF en une seule colonne de texte. Un CV sur deux colonnes
 * (les modeles Canva et Word le sont presque tous) ressort donc avec les lignes
 * des deux colonnes entrelacees, et aucune analyse ne peut rattraper ca. Le
 * backend le detecte et le signale via `confiance_lecture`.
 * Le dire est utile a la personne : un vrai logiciel de tri de candidatures
 * lira le meme fichier de la meme facon. Le probleme n'est pas notre analyse,
 * c'est le PDF — et c'est une information qui peut lui faire gagner un
 * entretien.
 *
 * PARTAGE : l'analyseur de CV le lit dans `result.profil.confiance_lecture`,
 * l'optimiseur dans `resultat.profil_extrait.confiance`. Meme structure, meme
 * discours. Il vivait dans components/cv/ResultsDisplay.jsx, ce qui obligeait
 * l'optimiseur a importer depuis un composant d'analyse : il est ici.
 *
 * @param {object} confiance  { niveau: 'haute'|'moyenne'|'faible', raisons: [] }
 */
export default function AvertissementLecturePdf({ confiance, className = '' }) {
  // Absent sur les analyses archivees et sur les analyses par formulaire :
  // dans ces deux cas on n'affiche rien, ce qui est le comportement correct.
  if (!confiance || confiance.niveau !== 'faible') return null

  const raisons = Array.isArray(confiance.raisons) ? confiance.raisons : []

  return (
    <div className={`rounded-xl border border-warning/30 bg-warning/8 p-4 ${className}`}>
      <h3 className="text-sm font-bold text-warning">Ce PDF a ete difficile a lire</h3>
      <p className="mt-1.5 text-sm text-text-secondary">
        Le texte extrait de ton fichier est incomplet ou desordonne. C&apos;est presque toujours le
        signe d&apos;un CV sur deux colonnes, d&apos;un CV scanne, ou d&apos;un CV enregistre comme
        une image. Les resultats ci-dessous restent indicatifs.
      </p>
      <p className="mt-1.5 text-sm text-text-secondary">
        Ce n&apos;est pas un detail : les logiciels de tri des recruteurs lisent ton PDF de la meme
        maniere. Un CV sur une seule colonne, exporte en PDF depuis un traitement de texte, sera
        mieux lu partout.
      </p>

      {raisons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {raisons.map((raison, i) => (
            <li key={i} className="flex gap-2 text-xs text-text-muted">
              <span aria-hidden="true">-</span>
              <span>{raison}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
