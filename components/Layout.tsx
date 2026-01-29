
import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Briefcase, Sun, Moon } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, theme, onToggleTheme }) => {
  return (
    <div className="flex flex-col min-h-screen transition-colors duration-300 dark:bg-zinc-950 dark:text-white">
      {/* Header Minimalist */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-slate-100 dark:border-white/5">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
              alt="Gigante Pneus"
              className="h-8 md:h-10 w-auto"
            />
          </Link>

          <div className="hidden md:flex items-center gap-10 font-bold text-xs uppercase tracking-widest">
            <Link to="/" className="text-slate-400 hover:text-gigante-red transition-colors">Início</Link>
            <a href="#quem-somos" className="text-slate-400 hover:text-gigante-red transition-colors">Sobre</a>

            <button
              onClick={onToggleTheme}
              className="p-2 rounded-full bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-gigante-red transition-all"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <Link
              to="/candidatar"
              className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-xl hover:bg-gigante-red hover:text-white transition-all shadow-lg"
            >
              Candidatar-se
            </Link>
          </div>

          <div className="md:hidden flex items-center gap-4">
            <button onClick={onToggleTheme} className="p-2 text-slate-400"><Moon size={18} /></button>
            <Link to="/candidatar" className="bg-gigante-red p-3 rounded-xl text-white shadow-lg"><Briefcase size={20} /></Link>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {children}
      </main>

      {/* Footer Clean */}
      <footer className="bg-white dark:bg-zinc-950 py-20 border-t border-slate-100 dark:border-white/5">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-16">
            <div className="max-w-sm">
              <img
                src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
                alt="Gigante Pneus"
                className="h-12 w-auto"
              />
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm">
                Comprometidos com a excelência automotiva e o desenvolvimento de nossos colaboradores em todo o território nacional.
              </p>
            </div>

            <div className="flex flex-wrap gap-16 md:gap-32">
              <div>
                <h4 className="font-bold text-[11px] uppercase tracking-[0.3em] text-slate-900 dark:text-white mb-8">Empresa</h4>
                <ul className="space-y-4 text-slate-400 text-sm font-semibold">
                  <li><Link to="/" className="hover:text-gigante-red transition-colors">Home</Link></li>
                  <li><Link to="/candidatar" className="hover:text-gigante-red transition-colors">Candidatar-se</Link></li>
                  <li><Link to="/admin/login" className="hover:text-gigante-red transition-colors text-xs opacity-50">Portal do Gestor</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-[11px] uppercase tracking-[0.3em] text-slate-900 dark:text-white mb-8">Redes Sociais</h4>
                <div className="flex gap-4">
                  <a href="https://www.instagram.com/gigantepneus" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center hover:bg-gigante-red hover:text-white transition-all text-slate-400">
                    <Instagram size={20} />
                  </a>
                  <a href="https://www.facebook.com/gigantepneusfranquia/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center hover:bg-gigante-red hover:text-white transition-all text-slate-400">
                    <Facebook size={20} />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 dark:border-white/5 flex justify-between items-center text-[11px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">
            <p>&copy; {new Date().getFullYear()} GIGANTE PNEUS.</p>
            <p>DESIGN CLEAN & PROFISSIONAL</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
