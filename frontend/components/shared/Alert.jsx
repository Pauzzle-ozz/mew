/**
 * Bandeau de message : succes, erreur, avertissement, information.
 *
 * ACCESSIBILITE — pourquoi deux roles differents
 * Un message qui apparait apres coup dans la page n'est pas lu par un lecteur
 * d'ecran si rien ne le lui signale. Deux facons de le signaler :
 *
 *   role="alert"  interrompt immediatement ce qui est en cours de lecture.
 *                 Reserve a ce qui bloque la personne : une erreur.
 *   role="status" attend une pause avant d'annoncer.
 *                 Pour tout le reste (« Compte cree », « Copie »), qu'il
 *                 serait grossier de faire passer en force.
 *
 * Utiliser role="alert" partout finirait par rendre les vraies erreurs
 * indiscernables du bruit.
 *
 * `annonce={false}` retire le role et aria-live. A n'utiliser QUE lorsque
 * l'appelant fournit deja une region d'annonce autour de l'Alert : deux
 * regions imbriquees font annoncer le message deux fois par certains lecteurs
 * d'ecran, ou pas du tout. C'est le cas d'ErrorMessage, qui monte sa propre
 * region en permanence (voir ErrorMessage.jsx).
 */
export default function Alert({
  variant = 'info',
  children,
  onClose,
  className = '',
  annonce = true,
}) {
  const styles = {
    success: 'bg-success/8 border-success/20 text-success',
    error: 'bg-error/8 border-error/20 text-error',
    warning: 'bg-warning/8 border-warning/20 text-warning',
    info: 'bg-info/8 border-info/20 text-info',
  };

  const icons = {
    success: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  const estErreur = variant === 'error';

  return (
    <div
      role={annonce ? (estErreur ? 'alert' : 'status') : undefined}
      aria-live={annonce ? (estErreur ? 'assertive' : 'polite') : undefined}
      className={`flex items-start gap-3 p-4 rounded-xl border ${styles[variant]} ${className}`}
    >
      {icons[variant]}
      <div className="flex-1 text-sm font-medium">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="opacity-50 hover:opacity-100 transition-opacity cursor-pointer text-lg leading-none"
          aria-label="Fermer ce message"
        >
          &times;
        </button>
      )}
    </div>
  );
}
