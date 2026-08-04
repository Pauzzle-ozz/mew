/**
 * Helpers pour la gestion des fichiers
 * Validation
 */

/**
 * Valider un fichier PDF
 */
export function validatePDF(file) {
  const maxSize = 2 * 1024 * 1024; // 2 Mo

  if (!file) {
    throw new Error('Aucun fichier sélectionné');
  }

  if (file.type !== 'application/pdf') {
    throw new Error('Seuls les fichiers PDF sont acceptés');
  }

  if (file.size > maxSize) {
    throw new Error('Le fichier est trop volumineux (max 2 Mo)');
  }

  return true;
}
