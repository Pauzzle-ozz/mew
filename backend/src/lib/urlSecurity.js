const dns = require('dns/promises');
const net = require('net');

/**
 * Protection contre les SSRF (Server-Side Request Forgery).
 *
 * Le principe de l'attaque, en une phrase : un utilisateur ne peut pas
 * atteindre ton reseau local depuis internet, alors il demande a TON
 * serveur de le faire a sa place.
 *
 * Concretement, l'outil « analyser une offre depuis son URL » accepte
 * n'importe quelle adresse. Sans ce filtre, quelqu'un peut envoyer :
 *   http://127.0.0.1:5000/api/historique/<id>   -> lire l'API interne
 *   http://192.168.1.1/                         -> l'interface de ta box
 *   http://169.254.169.254/latest/meta-data/    -> les identifiants du
 *                                                  serveur cloud qui heberge Mew
 * et le contenu de la page lui est renvoye.
 *
 * On resout donc le nom de domaine et on refuse toute adresse IP privee,
 * locale ou reservee. Il faut aussi revalider apres CHAQUE redirection :
 * un site distant parfaitement legitime peut repondre « 302 vers
 * http://127.0.0.1 », et le client HTTP suivrait sans rien dire.
 */

const PLAGES_INTERDITES_V4 = [
  { nom: 'loopback (cette machine)', test: (o) => o[0] === 127 },
  { nom: 'reseau prive 10.x', test: (o) => o[0] === 10 },
  { nom: 'reseau prive 172.16-31.x', test: (o) => o[0] === 172 && o[1] >= 16 && o[1] <= 31 },
  { nom: 'reseau prive 192.168.x', test: (o) => o[0] === 192 && o[1] === 168 },
  { nom: 'lien local / metadonnees cloud', test: (o) => o[0] === 169 && o[1] === 254 },
  { nom: 'partage entre operateurs', test: (o) => o[0] === 100 && o[1] >= 64 && o[1] <= 127 },
  { nom: 'adresse « ce reseau »', test: (o) => o[0] === 0 },
  { nom: 'reservee', test: (o) => o[0] >= 240 }
];

function raisonInterdictionV4(ip) {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o))) return 'adresse IPv4 illisible';
  const plage = PLAGES_INTERDITES_V4.find((p) => p.test(octets));
  return plage ? plage.nom : null;
}

function raisonInterdictionV6(ip) {
  const normalise = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalise === '::1' || normalise === '::') return 'loopback IPv6';
  // fc00::/7 = adresses locales uniques, fe80::/10 = lien local
  if (/^f[cd]/.test(normalise)) return 'reseau prive IPv6';
  if (/^fe[89ab]/.test(normalise)) return 'lien local IPv6';
  // IPv6 encapsulant une IPv4 : ::ffff:127.0.0.1
  const v4 = normalise.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return raisonInterdictionV4(v4[1]);
  return null;
}

function raisonInterdiction(ip) {
  const version = net.isIP(ip);
  if (version === 4) return raisonInterdictionV4(ip);
  if (version === 6) return raisonInterdictionV6(ip);
  return 'adresse IP illisible';
}

function erreurInterdite(message) {
  const erreur = new Error(message);
  erreur.code = 'URL_INTERDITE';
  return erreur;
}

/**
 * Verifie qu'une URL pointe vers une vraie ressource publique.
 * Leve une erreur `URL_INTERDITE` sinon.
 *
 * @param {string} url
 * @returns {Promise<URL>} l'URL analysee
 */
async function verifierUrlPublique(url) {
  if (!url || typeof url !== 'string') {
    throw erreurInterdite('URL manquante');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw erreurInterdite(`URL invalide : ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw erreurInterdite("L'URL doit commencer par http:// ou https://");
  }

  const hote = parsed.hostname.replace(/^\[|\]$/g, '');

  // Si l'utilisateur a ecrit directement une adresse IP, on la teste telle quelle.
  if (net.isIP(hote)) {
    const raison = raisonInterdiction(hote);
    if (raison) {
      throw erreurInterdite(`Cette adresse pointe vers un reseau prive (${raison}). Seules les offres publiques peuvent etre analysees.`);
    }
    return parsed;
  }

  // « localhost » et compagnie ne resolvent pas toujours : on les bloque de front.
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i.test(hote)) {
    throw erreurInterdite('Cette adresse designe une machine locale. Seules les offres publiques peuvent etre analysees.');
  }

  let adresses;
  try {
    adresses = await dns.lookup(hote, { all: true });
  } catch (_) {
    throw erreurInterdite(`Nom de domaine introuvable : ${hote}`);
  }

  // Toutes les adresses doivent etre publiques : un domaine peut resoudre
  // vers plusieurs IP, il suffit d'une seule privee pour que ce soit exploitable.
  for (const { address } of adresses) {
    const raison = raisonInterdiction(address);
    if (raison) {
      throw erreurInterdite(`Ce domaine pointe vers un reseau prive (${raison}). Seules les offres publiques peuvent etre analysees.`);
    }
  }

  return parsed;
}

module.exports = { verifierUrlPublique, raisonInterdiction };
