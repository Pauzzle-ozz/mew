'use client';

/**
 * L'adresse de l'API, quand elle ne peut pas etre devinee.
 *
 * QUAND CE CHAMP APPARAIT
 *   - « Autre fournisseur » : le catalogue ne connait aucune adresse, c'est
 *     l'utilisateur qui la donne. Sans elle, rien ne peut fonctionner.
 *   - fournisseurs locaux : l'adresse par defaut est la bonne dans 95 % des
 *     cas, mais quelqu'un qui a lance Ollama sur un autre port doit pouvoir
 *     la corriger. Le champ est donc pre-rempli, pas vide.
 *
 * Pour les fournisseurs en ligne il reste cache : leur adresse est fixe, et
 * la modifier ne pourrait que casser la configuration.
 *
 * @param {object} fournisseur
 * @param {string} valeur
 * @param {Function} onChange
 */
export default function ChampAdresse({ fournisseur, valeur, onChange }) {
  const obligatoire = !fournisseur.baseURL;

  return (
    <div className="space-y-2">
      <label htmlFor="base-url" className="block text-sm font-semibold text-text-primary">
        Adresse de l&apos;API {obligatoire && <span className="text-error">*</span>}
      </label>

      <input
        id="base-url"
        type="url"
        inputMode="url"
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
        placeholder={fournisseur.baseURL || 'http://localhost:11434/v1'}
        autoComplete="off"
        spellCheck="false"
        aria-describedby="base-url-aide"
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-sm text-text-primary placeholder:font-body placeholder:text-text-muted focus:border-primary focus:outline-none"
      />

      <p id="base-url-aide" className="text-xs leading-relaxed text-text-muted">
        {fournisseur.local
          ? "Change-la seulement si tu as lance le serveur sur un autre port que celui propose."
          : "Elle se termine presque toujours par /v1 (c'est ce que demande le format d'API d'OpenAI, que la plupart des fournisseurs reprennent)."}
      </p>
    </div>
  );
}
