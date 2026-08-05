'use client';

import Link from 'next/link';
import Button from '@/components/shared/Button';
import CopyButton from '@/components/shared/CopyButton';
import {
  IconAcademicCap,
  IconBolt,
  IconBriefcase,
  IconCheckCircle,
  IconDocument,
  IconEnvelope,
  IconGlobe,
  IconTag,
  IconUsers,
} from '@/components/shared/icons';
import MatcherTransparency from '@/components/matcher/MatcherTransparency';

/**
 * Etape 2 du mode matching : le score explique, le texte optimise a copier,
 * la lettre, et l'ajout au suivi de candidatures.
 *
 * Sorti de app/solutions/matcher-offres/page.js.
 */
export default function MatcherStepResultats({
  score,
  correspondance,
  modifications,
  cvDataOriginal,
  cvDataOptimized,
  coverLetterResult,
  error,
  onModifier,
  onRecommencer,
}) {
  const lettre = formatLetterText(coverLetterResult?.letterData);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
      <MatcherTransparency
        score={score}
        correspondance={correspondance}
        modifications={modifications}
        cvDataOriginal={cvDataOriginal}
        cvDataOptimized={cvDataOptimized}
        onBack={onModifier}
      />

      {/* ── Le texte a recopier dans son CV ─────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-text-primary">
            Texte optimise, a copier dans ton CV
          </h3>
          <CopyButton texte={assemblerCv(cvDataOptimized)} label="Copier tout" />
        </div>

        <SectionOptimisee
          titre="Titre du poste"
          icone={<IconTag className="h-5 w-5 text-primary" />}
          texte={cvDataOptimized?.titre_poste}
        />
        <SectionOptimisee
          titre="Resume professionnel"
          icone={<IconDocument className="h-5 w-5 text-info" />}
          texte={cvDataOptimized?.resume}
        />
        <SectionOptimisee
          titre="Experiences"
          icone={<IconBriefcase className="h-5 w-5 text-warning" />}
          texte={formaterExperiences(cvDataOptimized?.experiences)}
        />
        <SectionOptimisee
          titre="Formations"
          icone={<IconAcademicCap className="h-5 w-5 text-accent" />}
          texte={formaterFormations(cvDataOptimized?.formations)}
        />
        <SectionOptimisee
          titre="Competences metier"
          icone={<IconBolt className="h-5 w-5 text-warning" />}
          texte={cvDataOptimized?.competences_techniques}
        />
        <SectionOptimisee
          titre="Qualites personnelles"
          icone={<IconUsers className="h-5 w-5 text-success" />}
          texte={cvDataOptimized?.competences_soft}
        />
        <SectionOptimisee
          titre="Langues"
          icone={<IconGlobe className="h-5 w-5 text-info" />}
          texte={cvDataOptimized?.langues}
        />
      </div>

      {/* ── La lettre de motivation ─────────────────────────────── */}
      {lettre && (
        <div className="space-y-3 rounded-2xl border border-info/25 bg-info/8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <IconEnvelope className="h-5 w-5 text-info" />
              <h3 className="font-display text-sm font-semibold text-info">Lettre de motivation</h3>
            </div>
            <CopyButton texte={lettre} label="Copier la lettre" />
          </div>

          <div className="rounded-xl border border-border/60 bg-surface p-3">
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">{lettre}</p>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-error/25 bg-error/8 p-4">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" size="md" onClick={onModifier} className="flex-1">
          &larr; Modifier
        </Button>
        <Button variant="outline" size="md" onClick={onRecommencer} className="flex-1">
          Nouvelle analyse
        </Button>
      </div>
    </div>
  );
}

/* ── Une section de texte copiable ─────────────────────────────────── */

function SectionOptimisee({ titre, icone, texte }) {
  if (!texte) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icone}
          <h3 className="font-display text-sm font-semibold text-text-primary">{titre}</h3>
        </div>
        <CopyButton texte={texte} label={`Copier ${titre.toLowerCase()}`} />
      </div>

      <div className="rounded-xl border border-border/60 bg-surface-elevated p-3">
        <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">{texte}</p>
      </div>
    </div>
  );
}

/* ── Mise en forme des textes ──────────────────────────────────────── */

/**
 * La lettre arrive maintenant en texte brut (`letterData.texte`). On payait
 * auparavant un second appel a l'IA pour la decouper en cinq champs... que
 * cette fonction recollait aussitot avec des sauts de ligne.
 *
 * Les champs greeting / introduction / body / conclusion / closing restent
 * geres : l'historique rejoue des lettres archivees a l'ancien format, et
 * elles doivent continuer de s'afficher entierement.
 */
export function formatLetterText(letterData) {
  if (!letterData) return '';
  if (letterData.texte) return letterData.texte;

  return [
    letterData.greeting,
    letterData.introduction,
    letterData.body,
    letterData.conclusion,
    letterData.closing,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formaterExperiences(experiences) {
  if (!experiences?.length) return '';
  return experiences
    .map((experience) => {
      const lignes = [];
      if (experience.poste) lignes.push(experience.poste);
      const meta = [
        experience.entreprise,
        experience.localisation,
        [experience.date_debut, experience.date_fin].filter(Boolean).join(' - '),
      ]
        .filter(Boolean)
        .join(' | ');
      if (meta) lignes.push(meta);
      if (experience.description) lignes.push(experience.description);
      return lignes.join('\n');
    })
    .join('\n\n');
}

function formaterFormations(formations) {
  if (!formations?.length) return '';
  return formations
    .map((formation) => {
      const lignes = [];
      if (formation.diplome) lignes.push(formation.diplome);
      const meta = [formation.etablissement, formation.localisation, formation.date_fin].filter(Boolean).join(' | ');
      if (meta) lignes.push(meta);
      return lignes.join('\n');
    })
    .join('\n\n');
}

/** Tout le CV en un bloc, pour le bouton « Copier tout ». */
function assemblerCv(cvData) {
  if (!cvData) return '';
  return [
    cvData.titre_poste && `Titre : ${cvData.titre_poste}`,
    cvData.resume && `\nResume :\n${cvData.resume}`,
    cvData.experiences?.length && `\nExperiences :\n${formaterExperiences(cvData.experiences)}`,
    cvData.formations?.length && `\nFormations :\n${formaterFormations(cvData.formations)}`,
    cvData.competences_techniques && `\nCompetences metier :\n${cvData.competences_techniques}`,
    cvData.competences_soft && `\nQualites personnelles :\n${cvData.competences_soft}`,
    cvData.langues && `\nLangues :\n${cvData.langues}`,
  ]
    .filter(Boolean)
    .join('\n');
}
