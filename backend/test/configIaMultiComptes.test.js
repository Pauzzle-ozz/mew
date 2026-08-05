/**
 * PLUSIEURS FOURNISSEURS A LA FOIS, ET UN MODELE PAR TACHE.
 *
 * CE QUE CE FICHIER GARANTIT
 * La promesse de l'ecran Parametres est precise : « je veux que tel modele
 * lise mes CV et que tel autre redige mes lettres », y compris quand les deux
 * ne sont pas chez le meme fournisseur. Ca ne marche que si CHAQUE tache
 * remonte sa propre cle jusqu'a l'adaptateur. Une cle qui suivrait mal son
 * fournisseur donnerait un « 401 » incomprehensible en pleine candidature.
 *
 * On verifie aussi les trois choses qui, si elles cassaient, feraient perdre
 * quelque chose a l'utilisateur sans qu'il comprenne :
 *   - un ancien fichier de reglages est repris sans perdre la cle ;
 *   - couper une tache ne coupe QUE cette tache, et le dit autrement qu'une
 *     panne ;
 *   - retirer un acces ne laisse pas des taches braquees sur un compte
 *     disparu.
 *
 * Tout passe par un FAUX adaptateur et un fichier jetable : ces tests doivent
 * tourner en integration continue, ou il n'y a ni cle ni internet.
 */

// Avant tout require : un OPENAI_API_KEY qui traine dans le shell prendrait
// la priorite sur le fichier de reglages et rendrait ces tests incoherents.
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;
process.env.LOG_LEVEL = 'error';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ai = require('../src/services/aiService');
const configUtilisateur = require('../src/llm/configUtilisateur');
const { fournisseurs, guideFournisseur, noteModele } = require('../src/llm/providers');
const { IDS: IDS_TACHES, TACHES, OUTILS } = require('../src/llm/taches');

const CLE_OPENAI = 'sk-proj-cle-openai-de-test-0000';
const CLE_ANTHROPIC = 'sk-ant-cle-anthropic-de-test-1111';

/* ------------------------------------------------------------------ */
/* Outillage                                                           */
/* ------------------------------------------------------------------ */

/** Un adaptateur qui n'appelle personne : il note ce qu'on lui demande. */
function fauxAdaptateur() {
  const appels = [];
  return {
    appels,
    async completer(options) {
      appels.push(options);
      return { texte: 'ok', usage: { tokensEntree: 0, tokensSortie: 0 }, modele: options.modele };
    },
    async listerModeles() { return null; }
  };
}

/**
 * Un dossier jetable et un faux adaptateur, remis en place a la fin.
 * REGLE ABSOLUE : on ne touche JAMAIS a backend/data/config-ia.json, qui
 * contient la vraie cle de la personne qui fait tourner Mew.
 */
function bancDEssai(t) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-multi-'));
  const fichier = path.join(dossier, 'config-ia.json');
  const origine = configUtilisateur.interne.fichier();

  configUtilisateur.interne.definirFichier(fichier);
  const faux = fauxAdaptateur();
  ai._utiliserConfiguration(null);
  ai._utiliserAdaptateur(faux);

  t.after(() => {
    ai._utiliserConfiguration(null);
    ai._utiliserAdaptateur(null);
    configUtilisateur.interne.definirFichier(origine);
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  return { fichier, faux };
}

/** Les deux acces du scenario principal : OpenAI et Anthropic cote a cote. */
async function deuxComptes() {
  await configUtilisateur.ecrireCompte({ fournisseur: 'openai', cleApi: CLE_OPENAI });
  await configUtilisateur.ecrireCompte({ fournisseur: 'anthropic', cleApi: CLE_ANTHROPIC });
}

/* ------------------------------------------------------------------ */
/* LE test : deux fournisseurs, chacun sa tache                        */
/* ------------------------------------------------------------------ */

test('deux fournisseurs a la fois : chaque tache part avec SA cle et SON modele', async (t) => {
  const { faux } = bancDEssai(t);
  await deuxComptes();

  // « GPT-5.6 Sol lit mes CV, Claude Opus 5 redige mes lettres. »
  await configUtilisateur.ecrireTaches({
    'profil-cv': { actif: true, fournisseur: 'openai', modele: 'gpt-5.6-sol' },
    lettre: { actif: true, fournisseur: 'anthropic', modele: 'claude-opus-5' }
  });

  await ai.generate('Lis ce CV', { tache: 'profil-cv', role: 'extraction' });
  await ai.generate('Ecris la lettre', { tache: 'lettre', role: 'redaction' });

  const [lecture, redaction] = faux.appels;

  assert.equal(lecture.modele, 'gpt-5.6-sol');
  assert.equal(lecture.cleApi, CLE_OPENAI);
  assert.equal(lecture.baseURL, 'https://api.openai.com/v1');

  assert.equal(redaction.modele, 'claude-opus-5');
  assert.equal(redaction.cleApi, CLE_ANTHROPIC, 'la cle doit suivre le fournisseur de la tache');
  assert.equal(redaction.baseURL, 'https://api.anthropic.com');
});

test('la memoire interne ne melange pas deux taches qui alternent', async (t) => {
  const { faux } = bancDEssai(t);
  await deuxComptes();

  await configUtilisateur.ecrireTaches({
    'profil-cv': { actif: true, fournisseur: 'openai', modele: 'gpt-4o-mini' },
    lettre: { actif: true, fournisseur: 'anthropic', modele: 'claude-opus-5' }
  });

  // Aller-retour : une memoire a une seule case se ferait ecraser a chaque
  // changement et finirait par servir la mauvaise cle.
  await ai.generate('a', { tache: 'profil-cv' });
  await ai.generate('b', { tache: 'lettre' });
  await ai.generate('c', { tache: 'profil-cv' });
  await ai.generate('d', { tache: 'lettre' });

  assert.deepEqual(
    faux.appels.map((a) => a.cleApi),
    [CLE_OPENAI, CLE_ANTHROPIC, CLE_OPENAI, CLE_ANTHROPIC]
  );
});

test('une tache sans modele choisi suit le reglage general du meme compte', async (t) => {
  const { faux } = bancDEssai(t);
  await deuxComptes();

  await configUtilisateur.ecrireTaches({
    lettre: { actif: true, fournisseur: 'anthropic', modele: 'claude-opus-5' },
    // Meme role (redaction), meme compte, mais aucun modele precise.
    'email-spontane': { actif: true, fournisseur: 'anthropic', modele: '' }
  });

  await ai.generate('Ecris l email', { tache: 'email-spontane', role: 'redaction' });
  assert.equal(faux.appels[0].modele, 'claude-opus-5');
  assert.equal(faux.appels[0].cleApi, CLE_ANTHROPIC);
});

test('une tache sans modele ET sans voisine retombe sur le catalogue du BON fournisseur', async (t) => {
  const { faux } = bancDEssai(t);
  await configUtilisateur.ecrireCompte({ fournisseur: 'mistral', cleApi: 'cle-mistral-de-test' });

  await configUtilisateur.ecrireTaches({
    lettre: { actif: true, fournisseur: 'mistral', modele: '' }
  });

  await ai.generate('Ecris', { tache: 'lettre', role: 'redaction' });

  // Le premier modele de redaction du catalogue Mistral — surtout pas un nom
  // de modele venu d'un autre fournisseur.
  assert.equal(faux.appels[0].modele, 'mistral-medium-3.5');
  assert.equal(faux.appels[0].baseURL, 'https://api.mistral.ai/v1');
});

/* ------------------------------------------------------------------ */
/* Couper une tache                                                    */
/* ------------------------------------------------------------------ */

test('couper une tache ne coupe QUE celle-la', async (t) => {
  bancDEssai(t);
  await deuxComptes();

  await configUtilisateur.ecrireTaches({
    'cv-optimise': { actif: false, fournisseur: 'openai', modele: 'gpt-4o-mini' },
    lettre: { actif: true, fournisseur: 'anthropic', modele: 'claude-opus-5' }
  });

  assert.equal(ai.estDisponible('cv-optimise'), false);
  assert.equal(ai.estDisponible('lettre'), true, 'les autres taches continuent');
});

test('une tache coupee se distingue d une panne : ce n est pas la faute de la cle', async (t) => {
  bancDEssai(t);
  await deuxComptes();
  await configUtilisateur.ecrireTaches({ lettre: { actif: false, fournisseur: 'anthropic', modele: 'claude-opus-5' } });

  assert.equal(ai.raisonIndisponible('lettre'), 'coupee');

  await assert.rejects(
    () => ai.generate('Ecris', { tache: 'lettre' }),
    (erreur) => {
      assert.equal(erreur.code, 'IA_DESACTIVEE');
      // Le message doit envoyer au bon endroit, pas verifier une cle qui va bien.
      assert.match(erreur.message, /Parametres/);
      assert.doesNotMatch(erreur.message, /cle API/);
      return true;
    }
  );
});

test('sans aucun acces, la raison est « non configuree », pas « coupee »', async (t) => {
  bancDEssai(t);
  assert.equal(ai.raisonIndisponible('lettre'), 'non-configuree');
  assert.equal(ai.estDisponible('lettre'), false);
});

/* ------------------------------------------------------------------ */
/* Reprise d'un ancien fichier                                         */
/* ------------------------------------------------------------------ */

test('un fichier de reglages a l ancienne forme est repris sans perdre la cle', async (t) => {
  const { fichier, faux } = bancDEssai(t);

  // Exactement ce qu'ecrivait la version precedente de Mew.
  fs.writeFileSync(fichier, JSON.stringify({
    fournisseur: 'anthropic',
    cleApi: CLE_ANTHROPIC,
    baseURL: 'https://api.anthropic.com',
    modeles: { redaction: 'claude-opus-5', extraction: 'claude-haiku-4-5' }
  }), 'utf8');
  configUtilisateur.interne.viderCache();

  // Rien a ressaisir : tout est deja la, et reparti par role.
  assert.equal(configUtilisateur.estConfigure(), true);

  const etat = configUtilisateur.lireEtat();
  assert.equal(etat.comptes.length, 1);
  assert.equal(etat.comptes[0].fournisseur, 'anthropic');
  assert.equal(etat.taches.lettre.modele, 'claude-opus-5');
  assert.equal(etat.taches['cv-optimise'].modele, 'claude-haiku-4-5');

  await ai.generate('Ecris', { tache: 'lettre', role: 'redaction' });
  assert.equal(faux.appels[0].cleApi, CLE_ANTHROPIC);
  assert.equal(faux.appels[0].modele, 'claude-opus-5');
});

/* ------------------------------------------------------------------ */
/* Retirer un acces                                                    */
/* ------------------------------------------------------------------ */

test('retirer un acces libere les taches qui pointaient dessus', async (t) => {
  bancDEssai(t);
  await deuxComptes();
  await configUtilisateur.ecrireTaches({
    lettre: { actif: true, fournisseur: 'anthropic', modele: 'claude-opus-5' },
    'profil-cv': { actif: true, fournisseur: 'openai', modele: 'gpt-4o-mini' }
  });

  const { supprime, etat } = await configUtilisateur.supprimerCompte('anthropic');
  assert.equal(supprime, true);

  // La tache ne reste pas braquee sur un compte disparu : elle repasse en
  // « suis mon reglage general », et OpenAI prend le relais.
  assert.equal(etat.taches.lettre.fournisseur, '');
  assert.equal(etat.taches.lettre.fournisseurEffectif, 'openai');
  // Celle qui ne le visait pas n'a pas bouge.
  assert.equal(etat.taches['profil-cv'].modele, 'gpt-4o-mini');
});

test('retirer un acces inexistant n est pas une erreur', async (t) => {
  bancDEssai(t);
  const { supprime } = await configUtilisateur.supprimerCompte('groq');
  assert.equal(supprime, false);
});

/* ------------------------------------------------------------------ */
/* Refus explicites                                                    */
/* ------------------------------------------------------------------ */

test('une tache reglee sur un fournisseur sans acces est refusee, en francais', async (t) => {
  bancDEssai(t);
  await configUtilisateur.ecrireCompte({ fournisseur: 'openai', cleApi: CLE_OPENAI });

  await assert.rejects(
    () => configUtilisateur.ecrireTaches({
      lettre: { actif: true, fournisseur: 'anthropic', modele: 'claude-opus-5' }
    }),
    (erreur) => {
      assert.equal(erreur.code, 'CONFIG_INVALIDE');
      assert.match(erreur.message, /Anthropic/);
      assert.match(erreur.message, /Mes IA/);
      return true;
    }
  );
});

test('un acces chez un fournisseur qui exige une cle est refuse sans cle', async (t) => {
  bancDEssai(t);
  await assert.rejects(
    () => configUtilisateur.ecrireCompte({ fournisseur: 'openai', cleApi: '' }),
    (erreur) => erreur.code === 'CONFIG_INVALIDE'
  );
});

test('un acces local s enregistre sans la moindre cle', async (t) => {
  bancDEssai(t);
  const { etat } = await configUtilisateur.ecrireCompte({ fournisseur: 'ollama' });

  assert.equal(etat.comptes[0].fournisseur, 'ollama');
  assert.equal(etat.comptes[0].aUneCle, false);
  assert.equal(etat.comptes[0].utilisable, true);
});

test('reenregistrer un acces sans cle garde celle qui etait deja la', async (t) => {
  bancDEssai(t);
  await configUtilisateur.ecrireCompte({ fournisseur: 'openai', cleApi: CLE_OPENAI });

  // L'interface ne recoit jamais la cle : elle ne peut pas la renvoyer. Une
  // cle absente veut donc dire « je ne change pas ma cle ».
  await configUtilisateur.ecrireCompte({ fournisseur: 'openai', baseURL: 'https://proxy.exemple.fr/v1' });

  const comptes = configUtilisateur.lireV2().comptes;
  assert.equal(comptes[0].cleApi, CLE_OPENAI);
  assert.equal(comptes[0].baseURL, 'https://proxy.exemple.fr/v1');
});

/* ------------------------------------------------------------------ */
/* LA regle : aucune cle ne repart vers le navigateur                   */
/* ------------------------------------------------------------------ */

/** Cherche une chaine dans TOUTES les valeurs d'un objet, aussi profond soit-il. */
function contientQuelquePart(valeur, aiguille) {
  if (typeof valeur === 'string') return valeur.includes(aiguille);
  if (valeur && typeof valeur === 'object') {
    return Object.values(valeur).some((v) => contientQuelquePart(v, aiguille));
  }
  return false;
}

test('lireEtat ne laisse JAMAIS passer une cle en clair, meme avec plusieurs comptes', async (t) => {
  bancDEssai(t);
  await deuxComptes();

  const etat = configUtilisateur.lireEtat();

  assert.equal(contientQuelquePart(etat, CLE_OPENAI), false, 'la cle OpenAI a fuit');
  assert.equal(contientQuelquePart(etat, CLE_ANTHROPIC), false, 'la cle Anthropic a fuit');
  // Mais on reconnait bien LAQUELLE de ses cles est enregistree.
  assert.match(etat.comptes[0].cleMasquee, /^sk-p\.\.\./);
  assert.equal(etat.comptes[0].aUneCle, true);
});

/* ------------------------------------------------------------------ */
/* Les donnees : taches, outils, guides                                */
/* ------------------------------------------------------------------ */

test('chaque tache appartient a un outil qui existe', () => {
  const idsOutils = OUTILS.map((o) => o.id);
  TACHES.forEach((tache) => {
    assert.ok(idsOutils.includes(tache.outil), `outil inconnu pour ${tache.id} : ${tache.outil}`);
    assert.ok(tache.nom && tache.description && tache.sansIa, `texte manquant pour ${tache.id}`);
    assert.ok(['redaction', 'extraction'].includes(tache.role), `role invalide pour ${tache.id}`);
  });

  // Les identifiants sont ecrits dans le fichier de reglages : deux fois le
  // meme ferait perdre silencieusement un reglage.
  assert.equal(new Set(IDS_TACHES).size, IDS_TACHES.length);
});

test('chaque fournisseur du catalogue a un guide complet', () => {
  fournisseurs().forEach((f) => {
    const guide = guideFournisseur(f.id);
    assert.ok(guide, `aucun guide pour ${f.id}`);
    assert.ok(guide.atouts.length > 0, `aucun atout pour ${f.id}`);
    // Un guide qui ne dit que du bien n'aide personne a choisir.
    assert.ok(guide.limites.length > 0, `aucune limite pour ${f.id}`);
    assert.ok(guide.confidentialite, `rien sur la confidentialite pour ${f.id}`);
    assert.ok(guide.cle.etapes.length > 0, `aucune marche a suivre pour ${f.id}`);
  });
});

test('les notes de modeles suivent aussi les identifiants prefixes des revendeurs', () => {
  // Chez OpenRouter, « anthropic/claude-opus-5 » est le MEME modele que
  // « claude-opus-5 » chez Anthropic : il merite la meme note.
  assert.ok(noteModele('claude-opus-5'));
  assert.deepEqual(noteModele('anthropic/claude-opus-5'), noteModele('claude-opus-5'));
  // Et un identifiant inconnu ne fait pas tomber la fonction.
  assert.equal(noteModele('modele-jamais-vu'), null);
  assert.equal(noteModele(null), null);
  assert.equal(noteModele('__proto__'), null);
});
