import Alert from './Alert';

/**
 * Message d'erreur, affiche seulement s'il y a quelque chose a dire.
 *
 * POURQUOI CE FICHIER N'EST PLUS QU'UNE ENVELOPPE
 * Il dessinait exactement le meme bandeau qu'<Alert variant="error"> : meme
 * couleurs, meme icone, meme bouton de fermeture — mais en double, donc les
 * deux ont derive (bordures differentes, un seul des deux annoncait l'erreur
 * aux lecteurs d'ecran). Plutot que de supprimer ce composant et de casser
 * les pages qui l'utilisent, il delegue desormais a Alert. Une seule
 * apparence a maintenir, aucun appelant a modifier.
 *
 * Ce qu'il ajoute encore par rapport a Alert, et qui justifie de le garder :
 *   - il n'affiche RIEN quand `message` est vide, ce qui evite le
 *     `{erreur && <Alert…>}` recopie a chaque appel ;
 *   - il porte la marge basse attendue par les formulaires ;
 *   - il monte sa region d'annonce en permanence (voir ci-dessous).
 *
 * ACCESSIBILITE — la region est TOUJOURS montee
 * Un lecteur d'ecran n'annonce le contenu d'une region live que si la region
 * existait deja avant que le contenu n'y apparaisse. Une region creee en meme
 * temps que son message passe donc silencieuse. Le conteneur ci-dessous est
 * rendu meme quand il n'y a rien a dire (div vide, hauteur nulle, aucun effet
 * visuel), et c'est l'Alert a l'interieur qui va et vient.
 *
 * L'Alert recoit `annonce={false}` : sans ca, elle porterait sa propre
 * region imbriquee dans celle-ci, et le message serait annonce deux fois.
 *
 * @param {string} message  texte a afficher ; vide ou null = rien du tout
 * @param {Function} [onClose]  si fourni, affiche une croix de fermeture
 */
export default function ErrorMessage({ message, onClose }) {
  return (
    <div role="alert" aria-live="assertive">
      {message && (
        <Alert variant="error" onClose={onClose} className="mb-4" annonce={false}>
          {message}
        </Alert>
      )}
    </div>
  );
}
