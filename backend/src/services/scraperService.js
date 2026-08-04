const axios = require('axios');
const { verifierUrlPublique } = require('../lib/urlSecurity');
const { extraireOffre } = require('../core/offre/extraireOffre');
const { trouverJobPosting } = require('../core/offre/extraireJsonLd');

const AXIOS_TIMEOUT = 10000;    // 10s pour la requête HTTP simple
const PUPPETEER_TIMEOUT = 15000; // 15s pour le rendu JS
const MIN_TEXT_LENGTH = 200;    // Seuil minimum pour considérer l'extraction réussie
const MAX_REDIRECTIONS = 5;

/**
 * Puppeteer est une dependance OPTIONNELLE : il telecharge ~1,3 Go de
 * Chromium a l'installation. On le charge donc a la demande, et son
 * absence desactive simplement le rendu JavaScript au lieu de faire
 * planter tout le service au chargement du fichier.
 */
let puppeteerCharge;
function chargerPuppeteer() {
  if (puppeteerCharge !== undefined) return puppeteerCharge;
  try {
    puppeteerCharge = require('puppeteer');
  } catch (_) {
    console.warn(
      '[ScraperService] Puppeteer absent : les pages qui ont besoin de JavaScript '
      + 'ne pourront pas etre lues. Installe-le avec `npm install puppeteer` dans backend/.'
    );
    puppeteerCharge = null;
  }
  return puppeteerCharge;
}

// Sites qui nécessitent une authentification → scraping direct voué à l'échec
const RESTRICTED_SITES = [
  'linkedin.com/jobs',
  'linkedin.com/in/',
  'glassdoor.fr',
  'glassdoor.com',
];

// User-Agent qui ressemble à un navigateur Chrome récent
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

class ScraperService {

  // ─────────────────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────────────────

  /**
   * Verifie que l'URL est utilisable ET qu'elle ne pointe pas vers le
   * reseau prive de la machine qui heberge Mew.
   *
   * L'ancienne version ne verifiait QUE le protocole : le serveur allait
   * chercher n'importe quelle adresse, y compris 127.0.0.1 et 192.168.x,
   * et renvoyait le contenu a l'utilisateur. Voir lib/urlSecurity.js.
   */
  async validateUrl(url) {
    return verifierUrlPublique(url);
  }

  isRestrictedSite(url) {
    return RESTRICTED_SITES.some(site => url.includes(site));
  }

  // ─────────────────────────────────────────────────────────
  // EXTRACTION DE TEXTE DEPUIS HTML
  // ─────────────────────────────────────────────────────────

  extractTextFromHtml(html) {
    let text = html;

    // Supprimer les blocs script et style entiers
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

    // Supprimer les commentaires HTML
    text = text.replace(/<!--[\s\S]*?-->/g, ' ');

    // Remplacer les balises de mise en page par des sauts de ligne
    text = text.replace(/<(br|p|div|li|h[1-6]|tr|td|th)[^>]*>/gi, '\n');

    // Supprimer toutes les balises HTML restantes
    text = text.replace(/<[^>]+>/g, ' ');

    // Décoder les entités HTML courantes
    const entities = {
      '&amp;': '&', '&lt;': '<', '&gt;': '>',
      '&quot;': '"', '&#39;': "'", '&apos;': "'",
      '&nbsp;': ' ', '&eacute;': 'é', '&egrave;': 'è',
      '&ecirc;': 'ê', '&euml;': 'ë', '&agrave;': 'à',
      '&acirc;': 'â', '&auml;': 'ä', '&icirc;': 'î',
      '&iuml;': 'ï', '&ocirc;': 'ô', '&ouml;': 'ö',
      '&ucirc;': 'û', '&uuml;': 'ü', '&ccedil;': 'ç',
      '&OElig;': 'Œ', '&oelig;': 'œ', '&laquo;': '«',
      '&raquo;': '»', '&mdash;': '—', '&ndash;': '–',
      '&hellip;': '…', '&euro;': '€',
    };
    for (const [entity, char] of Object.entries(entities)) {
      text = text.replace(new RegExp(entity, 'gi'), char);
    }
    text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Normaliser les espaces et sauts de ligne
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  // ─────────────────────────────────────────────────────────
  // MÉTHODE 1 : AXIOS (rapide, sans rendu JS)
  // ─────────────────────────────────────────────────────────

  async scrapeWithAxios(url) {
    try {
      let cible = url;

      // On suit les redirections NOUS-MEMES, en revalidant a chaque saut.
      // Avec `maxRedirects: 5`, axios suivait un « 302 vers http://127.0.0.1 »
      // sans rien demander a personne : le filtre de depart etait contourne
      // par n'importe quel site distant.
      for (let saut = 0; saut <= MAX_REDIRECTIONS; saut++) {
        const response = await axios.get(cible, {
          timeout: AXIOS_TIMEOUT,
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
          },
          maxRedirects: 0,
          responseType: 'text',
          validateStatus: (statut) => statut >= 200 && statut < 400,
        });

        const redirection = response.status >= 300 && response.headers?.location;
        if (!redirection) {
          // On conserve le HTML : c'est lui qui contient le bloc JSON-LD
          // ou les sites d'emploi publient deja titre, entreprise et lieu.
          // Il etait jusqu'ici jete immediatement, et on payait un modele
          // de langage pour redeviner ces champs dans le texte aplati.
          return { texte: this.extractTextFromHtml(response.data), html: response.data };
        }

        cible = new URL(response.headers.location, cible).toString();
        await verifierUrlPublique(cible);
      }

      console.log('[ScraperService] Trop de redirections');
      return null;
    } catch (error) {
      // Une URL interdite doit remonter jusqu'a l'utilisateur, pas etre
      // avalee comme un simple echec de scraping.
      if (error.code === 'URL_INTERDITE') throw error;
      console.log(`[ScraperService] Axios echoue : ${error.message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────
  // MÉTHODE 2 : PUPPETEER (lent, gère le rendu JS)
  // ─────────────────────────────────────────────────────────

  async scrapeWithPuppeteer(url) {
    const puppeteer = chargerPuppeteer();
    if (!puppeteer) return null;

    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
        ],
      });

      const page = await browser.newPage();

      await page.setUserAgent(BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'fr-FR,fr;q=0.9',
      });

      // Bloquer les ressources inutiles pour aller plus vite
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: PUPPETEER_TIMEOUT,
      });

      // Laisser 2s au JS pour finir son rendu
      await new Promise(resolve => setTimeout(resolve, 2000));

      const html = await page.content();

      const text = await page.evaluate(() => {
        const selectors = [
          'script', 'style', 'nav', 'header', 'footer', 'noscript',
          '[class*="cookie"]', '[id*="cookie"]',
          '[class*="gdpr"]', '[class*="consent"]',
          '[class*="modal"]', '[class*="popup"]',
          '[class*="banner"]', '[aria-hidden="true"]',
        ];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });

        return document.body.innerText || document.body.textContent || '';
      });

      return {
        texte: text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
        html
      };

    } catch (error) {
      console.log(`[ScraperService] Puppeteer echoue : ${error.message}`);
      return null;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // PARSING LOCAL BASIQUE (pour pré-remplissage du formulaire)
  // ─────────────────────────────────────────────────────────

  /**
   * Extraction approximative depuis le texte aplati.
   * Ne sert plus que de dernier recours : core/offre/extraireOffre.js lit
   * d'abord le JSON-LD de la page, bien plus fiable.
   * (L'ancien commentaire attribuait cette extraction a « des workflows
   * n8n » : c'etait faux, elle etait faite par OpenAI.)
   */
  basicParse(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    // Titre : souvent dans les premières lignes, contient des mots-clés métier
    let title = null;
    const titleKeywords = /développeur|developer|ingénieur|chef de projet|manager|consultant|designer|analyste|commercial|technicien|responsable|directeur|data|fullstack|full.?stack|frontend|backend|devops|product|marketing|rh|comptable/i;
    for (const line of lines.slice(0, 20)) {
      if (titleKeywords.test(line) && line.length < 100) {
        title = line;
        break;
      }
    }

    // Type de contrat
    let contract_type = null;
    const contractMatch = rawText.match(/\b(CDI|CDD|Freelance|Stage|Alternance|Intérim)\b/i);
    if (contractMatch) {
      contract_type = contractMatch[1].toUpperCase() === 'FREELANCE' ? 'Freelance' :
                      contractMatch[1].toUpperCase() === 'STAGE' ? 'Stage' :
                      contractMatch[1].toUpperCase() === 'ALTERNANCE' ? 'Alternance' :
                      contractMatch[1].toUpperCase();
    }

    // Salaire
    let salary = null;
    const salaryMatch = rawText.match(/(\d{2,3}\s*[-–à]\s*\d{2,3}\s*[kK]€?|\d{2,3}\s*[kK]€?\s*(brut|net|annuel)?)/);
    if (salaryMatch) {
      salary = salaryMatch[0].trim();
    }

    // Localisation (ville française courante)
    let location = null;
    const locationMatch = rawText.match(/\b(Paris|Lyon|Marseille|Toulouse|Nice|Nantes|Strasbourg|Montpellier|Bordeaux|Lille|Rennes|Reims|Toulon|Grenoble|Dijon|Angers|Le Mans|Aix-en-Provence|Brest|Limoges|Tours|Amiens|Metz|Rouen|Remote|Télétravail|Full remote)\b/i);
    if (locationMatch) {
      location = locationMatch[0];
    }

    // Description : les 500 premiers caractères du texte principal
    const description = rawText.substring(0, 500).trim();

    return {
      title,
      company: null, // Trop difficile à extraire par regex
      location,
      contract_type,
      salary,
      description,
    };
  }

  // ─────────────────────────────────────────────────────────
  // MÉTHODE PRINCIPALE
  // ─────────────────────────────────────────────────────────

  /**
   * Scrape une URL et retourne le texte brut + un parsing basique
   *
   * Stratégie :
   *   1. Valider l'URL + rejeter les sites avec authentification
   *   2. Essayer Axios (rapide, ~1-2s)
   *   3. Si résultat insuffisant → Puppeteer (~5-10s)
   *   4. Parsing basique local (pour pré-remplissage)
   *   5. Retourner rawText (pour les prompts IA) + basicOffer (pour le formulaire)
   *
   * @param {string} url
   * @returns {{ rawText, url, basicOffer, _meta }}
   */
  async scrapeOffer(url) {
    // 1. Validation (protocole + refus des adresses du reseau prive)
    await this.validateUrl(url);

    // 2. Sites avec auth obligatoire
    if (this.isRestrictedSite(url)) {
      const err = new Error('Ce site nécessite une connexion. Copiez-collez le texte de l\'offre manuellement.');
      err.code = 'AUTH_REQUIRED';
      throw err;
    }

    let capture = null;
    let method = 'axios';

    // 3. Tentative Axios (rapide)
    console.log(`[ScraperService] Lecture via Axios : ${url}`);
    capture = await this.scrapeWithAxios(url);

    // 4. Bascule vers Puppeteer.
    //
    // Le declencheur teste maintenant AUSSI l'absence de bloc JobPosting.
    // Avec le seul critere « texte trop court », Welcome to the Jungle et
    // Indeed passaient au travers : ce sont des applications JavaScript qui
    // renvoient a Axios une coquille de plus de 200 caracteres, mais qui ne
    // contient ni l'offre ni son JSON-LD. Sans ce correctif, tout le gain de
    // l'extraction structuree tombait a plat sur les deux sites les plus
    // utilises.
    const texteCourt = !capture || (capture.texte || '').length < MIN_TEXT_LENGTH;
    const sansDonneesStructurees = !capture || !trouverJobPosting(capture.html || '');

    if (texteCourt || sansDonneesStructurees) {
      console.log(`[ScraperService] ${texteCourt ? 'Texte insuffisant' : 'Pas de donnees structurees'}, essai avec Puppeteer`);
      const rendu = await this.scrapeWithPuppeteer(url);
      // On ne garde le rendu Puppeteer que s'il apporte vraiment quelque chose.
      if (rendu && (rendu.texte || '').length >= (capture?.texte || '').length) {
        capture = rendu;
        method = 'puppeteer';
      }
    }

    let rawText = capture?.texte || null;
    const html = capture?.html || '';

    // 5. Échec total
    if (!rawText || rawText.length < MIN_TEXT_LENGTH) {
      const err = new Error('Impossible de lire cette page. Utilisez la saisie manuelle.');
      err.code = 'SCRAPING_FAILED';
      throw err;
    }

    console.log(`✅ [ScraperService] ${rawText.length} chars extraits via ${method}`);

    // Borne le texte : évite de dépasser la limite JSON du backend au retour
    // et plafonne le coût des prompts OpenAI
    // Une offre d'emploi ne fait jamais 50 000 caracteres : au-dela, on payait
    // au token le menu de navigation et le pied de page du site.
    const MAX_TEXT_LENGTH = 15000;
    if (rawText.length > MAX_TEXT_LENGTH) {
      rawText = rawText.substring(0, MAX_TEXT_LENGTH);
    }

    // 6. Extraction structuree de l'offre.
    //
    // On lit d'abord le JSON-LD que le site publie pour Google for Jobs
    // (titre, entreprise, lieu, contrat, salaire), puis les balises meta,
    // puis seulement en dernier recours l'ancienne heuristique sur le texte
    // aplati — celle qui devinait le titre avec 30 mots-cles ecrits a la
    // main, connaissait 25 villes, et renoncait sur l'entreprise.
    const structuree = extraireOffre(html, url);
    const approximative = this.basicParse(rawText);

    const basicOffer = {
      title: structuree.titre || approximative.title,
      company: structuree.entreprise || approximative.company,
      location: structuree.lieu || approximative.location,
      contract_type: structuree.contrat || approximative.contract_type,
      salary: structuree.salaire || approximative.salary,
      description: structuree.description || approximative.description,
      // La confiance permet a l'interface de dire honnetement « verifie ces
      // champs » quand la lecture n'est pas sure, au lieu de les presenter
      // tous avec le meme aplomb.
      confiance: structuree.confiance,
      source_extraction: structuree.source
    };

    return {
      rawText,
      url,
      basicOffer,
      _meta: {
        method,
        textLength: rawText.length,
        extraction: structuree.source,
        confiance: structuree.confiance
      },
    };
  }
}

module.exports = new ScraperService();
