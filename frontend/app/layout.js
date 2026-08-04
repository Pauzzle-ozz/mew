import { Syne, Outfit } from "next/font/google";
import { ThemeProvider } from "@/context/ThemeContext";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

// Le titre et la description sont ce qu'on lit dans l'onglet du navigateur et
// dans un lien partage : ils doivent decrire le projet tel qu'il est, pas tel
// qu'une page de vente le presenterait. Mew tourne sur la machine de la
// personne, sans compte et sans abonnement — c'est ca, l'information utile.
//
// Le champ `keywords` a ete retire : les moteurs de recherche l'ignorent
// depuis des annees, il ne servait qu'a se donner l'illusion d'un referencement.
export const metadata = {
  title: "Mew — des outils de recherche d'emploi qui tournent chez vous",
  description:
    "Analysez votre CV, optimisez-le pour les logiciels de tri, adaptez-le a une offre et suivez vos candidatures. Logiciel libre, installe sur votre machine : votre CV ne part sur aucun serveur, il n'y a pas de compte a creer et une cle IA n'est pas obligatoire.",
};

// Script constant, sans aucune donnee utilisateur : rien a injecter ici.
// Il doit s'executer AVANT le premier rendu, sinon la page s'affiche une
// fraction de seconde en theme clair avant de basculer en sombre.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('mew-theme');
    var d = (!t || t === 'system')
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : t === 'dark';
    if (d) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e) {}
})()
`;

export default function RootLayout({ children }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${syne.variable} ${outfit.variable} antialiased bg-background text-foreground`}>
        <ErrorBoundary>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
