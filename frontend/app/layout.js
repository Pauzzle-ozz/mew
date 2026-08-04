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

export const metadata = {
  title: "Mew — L'IA qui vous propulse",
  description: "Des outils IA pour chaque etape de votre recherche d'emploi : analyse de CV, optimisation, matching d'offres et candidatures spontanees.",
  keywords: "IA, intelligence artificielle, CV, recherche emploi, candidature, offres d'emploi",
};

// Static theme restoration script — no user input, safe to inline
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
