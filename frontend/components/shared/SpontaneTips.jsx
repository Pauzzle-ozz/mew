'use client';

import { useState } from 'react';

const tips = [
  {
    title: "Trouver l'email du recruteur sur LinkedIn",
    content: "Cherchez le nom du DRH ou du responsable du departement vise sur LinkedIn. Consultez son profil — beaucoup indiquent leur email professionnel dans la section \"Coordonnees\". Sinon, utilisez le format commun : prenom.nom@entreprise.com"
  },
  {
    title: "Utiliser le site de l'entreprise",
    content: "Les pages \"Nous contacter\", \"A propos\" ou \"Recrutement\" contiennent souvent un email generique RH (recrutement@, rh@, jobs@). C'est une bonne cible de depart si vous n'avez pas de contact direct."
  },
  {
    title: 'Hunter.io et Email Finder',
    content: "Des outils comme Hunter.io, Apollo.io ou Rocketreach permettent de trouver des emails professionnels a partir du nom de domaine d'une entreprise. Hunter offre 25 recherches gratuites par mois."
  },
  {
    title: 'Cibler le bon interlocuteur',
    content: "Pour les petites entreprises (<50 salaries), contactez directement le CEO ou fondateur. Pour les moyennes et grandes entreprises, ciblez le responsable du departement (ex: Responsable Marketing) plutot que le service RH generique."
  },
  {
    title: 'Le timing ideal',
    content: "Les mardis et jeudis matin entre 8h30 et 10h sont statistiquement les meilleurs moments pour envoyer un email de candidature spontanee. Evitez les lundis (surcharge post-weekend) et les vendredis (veille de weekend)."
  }
];

export default function SpontaneTips() {
  const [open, setOpen] = useState(null);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        Comment trouver le bon email ?
      </h3>
      <div className="space-y-2">
        {tips.map((tip, i) => (
          <div key={i} className="border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-white hover:bg-white/5 transition-colors"
            >
              <span>{tip.title}</span>
              <span className="text-gray-400 text-xs ml-2">{open === i ? '▲' : '▼'}</span>
            </button>
            {open === i && (
              <div className="px-4 py-3 text-sm text-gray-300 border-t border-white/10 bg-white/5">
                {tip.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
