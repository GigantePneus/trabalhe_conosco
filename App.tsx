import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import PublicForm from './components/PublicForm';
import PublicSurvey from './components/PublicSurvey';
import PublicJobsBoard from './components/PublicJobsBoard';
import PublicJobDetails from './components/PublicJobDetails';
import AdminDashboard from './components/AdminDashboard';
import Login from './components/Login';
import ResetPassword from './components/ResetPassword';
import GoogleConnectAdmin from './components/GoogleConnectAdmin';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
import { FileText, LogIn, LogOut, LayoutDashboard, Sun, Moon, UserCircle } from 'lucide-react';
import logoDark from './imagens/logo gigante dark.png';
import logoLight from './imagens/logo whitemode.png';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    // 1. Tratamento e captura de tokens de recuperação e convite do Supabase
    const handleUrlTokensAndRecovery = async () => {
      const fullUrl = window.location.href;
      const pathname = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash || '';

      // Extrai parâmetros do fragmento hash caso existam (#access_token=...&type=invite)
      let hashParams = new URLSearchParams();
      if (hash.includes('#')) {
        const parts = hash.split('#');
        for (const p of parts) {
          if (p.includes('=')) {
            const sp = new URLSearchParams(p);
            sp.forEach((v, k) => hashParams.set(k, v));
          }
        }
      }

      // Detecção de tokens explícitos de convite ou recuperação na URL
      const paramType = searchParams.get('type') || hashParams.get('type');
      const isInviteToken = paramType === 'invite' || fullUrl.includes('type=invite') || fullUrl.includes('type=signup');
      const isRecoveryToken = paramType === 'recovery' || fullUrl.includes('type=recovery');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const code = searchParams.get('code');

      const hasAuthTokens = Boolean(accessToken || code || isInviteToken || isRecoveryToken);

      // Se o usuário está acessando intencionalmente a rota de login, desarma qualquer modo de recuperação pendente
      if (hash === '#/login' || hash.startsWith('#/login') || pathname === '/login') {
        setIsPasswordRecoveryMode(false);
        sessionStorage.removeItem('gigante_recovery_mode');
        if (pathname !== '/' && (pathname.startsWith('/reset-password') || pathname.startsWith('/definir-senha'))) {
          window.history.replaceState(null, '', '/#/login');
        }
        return;
      }

      // Se há tokens de autenticação válidos para convite ou recuperação
      if (hasAuthTokens && (isInviteToken || isRecoveryToken)) {
        setIsPasswordRecoveryMode(true);
        sessionStorage.setItem('gigante_recovery_mode', 'true');

        // Se o Supabase enviou tokens no hash, inicializa explicitamente a sessão
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
        }

        // Se o Supabase enviou código PKCE (?code=...)
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        // Normaliza imediatamente a URL removendo tokens expostos e pathnames residuais do browser
        window.history.replaceState(null, '', '/#/reset-password');
        window.location.hash = '#/reset-password';
      } else {
        // Se NÃO há tokens de convite ou recuperação na URL:
        // Limpa qualquer pathname residual do servidor (/reset-password -> /#...)
        if (
          pathname === '/reset-password' ||
          pathname.startsWith('/reset-password') ||
          pathname === '/definir-senha' ||
          pathname.startsWith('/definir-senha') ||
          pathname === '/redefinir-senha' ||
          pathname.startsWith('/redefinir-senha')
        ) {
          const targetHash = window.location.hash || '#/login';
          window.history.replaceState(null, '', `/${targetHash}`);
        }

        // Se o hash não for de reset-password, garante que o modo de recuperação não fique ativo
        if (hash !== '#/reset-password' && hash !== '#/definir-senha' && hash !== '#/redefinir-senha') {
          setIsPasswordRecoveryMode(false);
          sessionStorage.removeItem('gigante_recovery_mode');
        }
      }
    };

    handleUrlTokensAndRecovery();

    // 2. Ouvinte de hashchange: se o usuário navegar para o login, cancela o modo de recovery
    const handleHashChange = () => {
      const currentHash = window.location.hash || '';
      if (currentHash === '#/login' || currentHash.startsWith('#/login')) {
        setIsPasswordRecoveryMode(false);
        sessionStorage.removeItem('gigante_recovery_mode');
      }
    };
    window.addEventListener('hashchange', handleHashChange);

    // 3. Consulta a sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 4. Listener para eventos de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecoveryMode(true);
        sessionStorage.setItem('gigante_recovery_mode', 'true');
        window.history.replaceState(null, '', '/#/reset-password');
        window.location.hash = '#/reset-password';
      }

      if (event === 'SIGNED_OUT') {
        setIsPasswordRecoveryMode(false);
        sessionStorage.removeItem('gigante_recovery_mode');
      }
    });

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsPasswordRecoveryMode(false);
    sessionStorage.removeItem('gigante_recovery_mode');
    localStorage.removeItem('abucci_mock_user');
  };

  const activeUser = user;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors">
        {/* Navigation Bar */}
        <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-20 items-center">
              <Link to="/" className="flex items-center space-x-2 group h-full">
                {/* Logo dinâmico baseado no modo escuro */}
                <div className="h-12 flex items-center">
                   <img 
                    src={darkMode ? logoDark : logoLight} 
                    alt="Gigante Pneus" 
                    className="h-10 w-auto object-contain"
                   />
                </div>
              </Link>
              
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
                  title="Alternar Tema"
                >
                  {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>

                {activeUser && !isPasswordRecoveryMode ? (
                  <div className="flex items-center gap-4">
                    <Link to="/admin" className="text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1 text-sm font-semibold">
                      <LayoutDashboard className="h-4 w-4" />
                      Painel RH
                    </Link>
                    <button 
                      onClick={handleLogout}
                      className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      Sair
                    </button>
                  </div>
                ) : (
                  <Link 
                    to="/login" 
                    className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md flex items-center gap-2"
                  >
                    <LogIn className="h-4 w-4" />
                    Entrar (RH)
                  </Link>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Content */}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<PublicJobsBoard />} />
            <Route path="/vagas/:slug" element={<PublicJobDetails />} />
            <Route path="/candidatar/:slug" element={<PublicForm />} />
            <Route path="/cadastro" element={<PublicForm />} />
            <Route path="/pesquisa/:id" element={<PublicSurvey />} />
            <Route path="/admin/google-connect" element={<GoogleConnectAdmin />} />
            {/* Suporte simultâneo a /reset-password, /redefinir-senha e /definir-senha (convite) */}
            <Route 
              path="/reset-password" 
              element={<ResetPassword onSuccess={() => setIsPasswordRecoveryMode(false)} />} 
            />
            <Route 
              path="/redefinir-senha" 
              element={<ResetPassword onSuccess={() => setIsPasswordRecoveryMode(false)} />} 
            />
            <Route 
              path="/definir-senha" 
              element={<ResetPassword onSuccess={() => setIsPasswordRecoveryMode(false)} />} 
            />
            <Route 
              path="/login" 
              element={
                activeUser && !isPasswordRecoveryMode ? (
                  <Navigate to="/admin" replace />
                ) : (
                  <Login />
                )
              } 
            />
            <Route 
              path="/admin" 
              element={
                isPasswordRecoveryMode ? (
                  <Navigate to="/reset-password" replace />
                ) : activeUser ? (
                  <AdminDashboard />
                ) : (
                  <Navigate to="/login" replace />
                )
              } 
            />
            <Route path="*" element={<PublicJobsBoard />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              &copy; {new Date().getFullYear()} Gigante Pneus. Brasil.
            </p>
            <div className="flex gap-6">
              <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">Unidades em todo o Brasil</span>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
};

export default App;
