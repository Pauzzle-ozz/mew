'use client';

import { useState, useEffect, useCallback } from 'react';
import { getUser, signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';

/**
 * Utilisateur courant + deconnexion.
 *
 * POURQUOI CE HOOK
 * Les six pages de l'application avaient chacune leur propre copie de
 * « je verifie qui est la, sinon je renvoie vers /login », et leur propre
 * copie de handleLogout. Six copies, c'est six occasions de diverger : il
 * suffisait d'en oublier une pour qu'une page reste accessible sans session.
 *
 * `logout` est renvoye par le hook plutot qu'importe depuis lib/auth parce
 * que la deconnexion a besoin du router pour rediriger : en faire une
 * fonction libre obligerait chaque appelant a re-ecrire la redirection,
 * c'est-a-dire exactement le probleme qu'on essaie de supprimer.
 *
 * @returns {{ user: object|null, loading: boolean, logout: () => Promise<void> }}
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Garde-fou contre le composant demonte pendant l'attente reseau :
    // sans lui, React signale une mise a jour d'etat sur un composant mort.
    let monte = true;

    const verifier = async () => {
      try {
        const utilisateur = await getUser();
        if (!monte) return;

        if (!utilisateur) router.push('/login');
        else setUser(utilisateur);
      } catch {
        // Une erreur ici (Supabase injoignable, jeton illisible) veut dire
        // qu'on ne sait pas qui parle : on traite ca comme « pas connecte ».
        if (monte) router.push('/login');
      } finally {
        if (monte) setLoading(false);
      }
    };

    verifier();

    return () => { monte = false; };
  }, [router]);

  const logout = useCallback(async () => {
    // signOut() renvoie false en mode local : il n'y a aucune session a
    // fermer. Rediriger vers /login enfermerait la personne dans une page
    // qui la renvoie aussitot au tableau de bord.
    if (await signOut()) router.push('/login');
  }, [router]);

  return { user, loading, logout };
}
