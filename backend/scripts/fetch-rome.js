#!/usr/bin/env node
/**
 * Telecharge l'archive open data du ROME dans .cache/rome/.
 *
 * A relancer environ 2 fois par an (France Travail publie en juin et en
 * decembre). Le diff git des fichiers construits montre alors les nouveaux
 * metiers : c'est interessant a relire avant de valider.
 *
 * Les fichiers CONSTRUITS (src/data/rome/) sont commites, pas l'archive.
 * Trois raisons : l'application doit demarrer sans reseau, un npm install
 * qui telecharge 5 Mo chez France Travail est fragile, et un resultat
 * reproductible evite qu'un bug apparaisse chez un utilisateur et pas chez toi.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const URL_ROME = 'https://api.francetravail.fr/api-nomenclatureemploi/v1/open-data/json';
const DOSSIER_CACHE = path.join(__dirname, '..', '..', '.cache');
const ARCHIVE = path.join(DOSSIER_CACHE, 'rome.zip');
const DOSSIER_ROME = path.join(DOSSIER_CACHE, 'rome');

async function telecharger() {
  fs.mkdirSync(DOSSIER_CACHE, { recursive: true });

  console.log('\nTelechargement du referentiel ROME...');
  console.log(`  ${URL_ROME}`);

  const reponse = await fetch(URL_ROME, { signal: AbortSignal.timeout(180000) });
  if (!reponse.ok) {
    console.error(`\nEchec : le serveur a repondu ${reponse.status}.`);
    console.error('Verifie ta connexion, ou telecharge l\'archive a la main depuis :');
    console.error('https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois-rome\n');
    process.exit(1);
  }

  const contenu = Buffer.from(await reponse.arrayBuffer());
  fs.writeFileSync(ARCHIVE, contenu);
  console.log(`  recu : ${(contenu.length / 1024 / 1024).toFixed(1)} Mo`);

  // Node n'a pas de decompresseur zip integre. Plutot que d'ajouter une
  // dependance pour un script lance deux fois par an, on utilise l'outil
  // du systeme.
  console.log('  extraction...');
  fs.rmSync(DOSSIER_ROME, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER_ROME, { recursive: true });

  try {
    if (process.platform === 'win32') {
      execFileSync('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path '${ARCHIVE}' -DestinationPath '${DOSSIER_ROME}' -Force`
      ], { stdio: 'inherit' });
    } else {
      execFileSync('unzip', ['-o', '-q', ARCHIVE, '-d', DOSSIER_ROME], { stdio: 'inherit' });
    }
  } catch (_) {
    console.error(`\nImpossible d'extraire l'archive automatiquement.`);
    console.error(`Extrais ${ARCHIVE} a la main dans ${DOSSIER_ROME}, puis relance npm run data:build\n`);
    process.exit(1);
  }

  const fichiers = fs.readdirSync(DOSSIER_ROME);
  console.log(`  ${fichiers.length} fichiers extraits dans .cache/rome/`);
  console.log('\nEtape suivante : npm run data:build\n');
}

telecharger().catch((erreur) => {
  console.error('\nErreur :', erreur.message, '\n');
  process.exit(1);
});
