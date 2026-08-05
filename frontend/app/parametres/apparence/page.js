'use client';

import { useTheme } from '@/context/ThemeContext';
import { useParametresIa } from '@/context/ParametresIaContext';

/**
 * ONGLET « APPARENCE ».
 *
 * POURQUOI UN ONGLET POUR UN SEUL REGLAGE
 * Le theme se changeait deja depuis l'icone de l'en-tete, mais rien ne disait
 * qu'un mode « suivre mon systeme » existait, ni lequel des trois etait actif.
 * Un espace Parametres dans lequel on ne retrouve pas le reglage le plus
 * evident de tous envoie un mauvais signal sur tout le reste.
 *
 * ACCESSIBILITE : trois vrais boutons radio dans un <fieldset>. On garde
 * gratuitement la navigation aux fleches et l'annonce « 2 sur 3 ».
 */
const CHOIX = [
  {
    valeur: 'system',
    titre: 'Suivre mon systeme',
    detail: 'Mew bascule tout seul quand ton ordinateur passe en sombre le soir.',
  },
  { valeur: 'light', titre: 'Clair', detail: 'Toujours clair, quelle que soit l\'heure.' },
  { valeur: 'dark', titre: 'Sombre', detail: 'Toujours sombre, plus reposant le soir.' },
];

export default function OngletApparence() {
  const { theme, setTheme } = useTheme();
  const { verifieLe } = useParametresIa();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-surface p-6">
        <fieldset className="border-0 p-0">
          <legend className="font-display mb-1 text-lg font-bold text-text-primary">Theme</legend>
          <p className="mb-4 text-sm text-text-muted">
            Ce reglage reste dans ton navigateur (et nulle part ailleurs).
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {CHOIX.map((choix) => (
              <label
                key={choix.valeur}
                className="flex cursor-pointer flex-col rounded-xl border border-border/60 bg-surface p-4 transition-all hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary-light"
              >
                <input
                  type="radio"
                  name="theme"
                  value={choix.valeur}
                  checked={theme === choix.valeur}
                  onChange={() => setTheme(choix.valeur)}
                  className="peer sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">{choix.titre}</span>
                  {/* La pastille double la couleur de bordure : la couleur
                      seule ne doit jamais porter l'information. */}
                  <span
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 ${
                      theme === choix.valeur ? 'border-primary bg-primary' : 'border-border-light'
                    }`}
                  />
                </span>
                <span className="mt-1.5 text-xs leading-relaxed text-text-muted">{choix.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-2xl border border-border/60 bg-surface p-6">
        <h2 className="font-display mb-3 text-lg font-bold text-text-primary">A propos</h2>
        <ul className="space-y-2 text-sm leading-relaxed text-text-secondary">
          <li>
            Mew est un logiciel libre (licence MIT) qui tourne sur ta machine. Aucun compte a
            creer, aucune donnee envoyee a qui que ce soit sans que tu l&apos;aies demande.
          </li>
          <li>
            Les scores, l&apos;analyse de CV et la correspondance avec les offres sont{' '}
            <strong className="text-text-primary">calcules par du code</strong>, pas devines par
            un modele : deux personnes avec le meme CV obtiennent le meme resultat, et le detail
            du calcul est affiche.
          </li>
          {verifieLe && (
            <li className="text-text-muted">
              Les tarifs affiches dans les guides ont ete verifies le {verifieLe}. Ils vieillissent
              vite : seul le fournisseur fait foi.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
