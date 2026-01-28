
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ApplicationForm from './pages/ApplicationForm';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import CandidatesList from './pages/CandidatesList';
import Management from './pages/Management';
import { AdminUser } from './types';
import { supabaseService } from './services/supabase';

const App: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('gigante_theme');
    // Verifica preferência do sistema se não houver salvo
    if (!saved) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    const initSession = async () => {
      const currentUser = await supabaseService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }
      setLoading(false);
    };
    initSession();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('gigante_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const login = (userData: AdminUser) => {
    setUser(userData);
    localStorage.setItem('gigante_admin_user', JSON.stringify(userData));
  };

  const logout = async () => {
    await supabaseService.logout();
    setUser(null);
    localStorage.removeItem('gigante_admin_user');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gigante-gray">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-gigante-yellow"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/candidatar" element={<ApplicationForm theme={theme} onToggleTheme={toggleTheme} />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={user ? <Navigate to="/admin/dashboard" /> : <AdminLogin onLogin={login} />} />

        <Route
          path="/admin/dashboard"
          element={user ? <AdminDashboard user={user} onLogout={logout} theme={theme} onToggleTheme={toggleTheme} /> : <Navigate to="/admin/login" />}
        />

        <Route
          path="/admin/candidatos"
          element={user ? <CandidatesList user={user} onLogout={logout} theme={theme} onToggleTheme={toggleTheme} /> : <Navigate to="/admin/login" />}
        />

        <Route
          path="/admin/configuracoes"
          element={user?.role === 'admin_master' ? <Management user={user} onLogout={logout} theme={theme} onToggleTheme={toggleTheme} /> : <Navigate to="/admin/dashboard" />}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

export default App;
