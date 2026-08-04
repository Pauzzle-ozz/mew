const multer = require('multer');

/**
 * Reception des CV au format PDF.
 *
 * Cette configuration etait ecrite trois fois, dans trois routes, avec
 * DEUX limites de taille differentes (2 Mo et 5 Mo) : le meme CV etait
 * accepte par un outil et refuse par un autre, sans explication.
 *
 * Le fichier reste en memoire : il n'est jamais ecrit sur le disque.
 * C'est voulu — un CV contient des donnees personnelles, il n'a aucune
 * raison de trainer dans un dossier temporaire apres la requete.
 */

const TAILLE_MAX_MO = 5;

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX_MO * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
      return;
    }
    // Un code d'erreur, pas seulement un message : le gestionnaire global
    // de server.js le reconnait de facon fiable. Avant, il testait
    // `err.message.includes('PDF')`, ce qui ne tenait que par chance.
    const erreur = new Error('Seuls les fichiers PDF sont acceptes');
    erreur.code = 'FICHIER_NON_PDF';
    cb(erreur);
  }
});

module.exports = { uploadPdf, TAILLE_MAX_MO };
