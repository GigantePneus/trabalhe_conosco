
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  ChevronLeft
} from 'lucide-react';
import { AdminUser } from '../types';

interface AdminSidebarProps {
  user: AdminUser;
  onLogout: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ user, onLogout, theme, onToggleTheme }) => {
  const location = useLocation();

  const menuItems = [
    { icon: <LayoutDashboard size={18} />, label: 'Overview', path: '/admin/dashboard' },
    { icon: <Users size={18} />, label: 'Candidatos', path: '/admin/candidatos' },
  ];

  if (user.role === 'admin_master') {
    menuItems.push({ icon: <Settings size={18} />, label: 'Gestão', path: '/admin/configuracoes' });
  }

  return (
    <aside className="w-64 bg-white dark:bg-zinc-950 min-h-screen flex flex-col fixed left-0 top-0 z-40 border-r border-slate-100 dark:border-white/5 shadow-sm">
      <div className="p-8">
        <Link to="/admin/dashboard" className="block mb-10">
          <img
            src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
            alt="Gigante Pneus"
            className="h-8 w-auto"
          />
        </Link>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 ml-4">Menu Principal</p>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between p-3.5 rounded-xl transition-all group ${isActive
                    ? 'bg-gigante-red text-white shadow-lg shadow-red-500/20'
                    : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span className="text-[13px] font-bold">{item.label}</span>
                </div>
                {isActive && <ChevronRight size={14} />}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-auto p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
        <div className="flex items-center gap-4 mb-6 px-2">
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center text-gigante-red font-bold shadow-sm border border-slate-100 dark:border-white/5">
            {user.nome.charAt(0)}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-none mb-1">{user.nome}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase truncate tracking-widest">{user.role === 'admin_master' ? 'Master' : 'Franqueado'}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onToggleTheme}
            className="flex-grow flex items-center justify-center gap-2 p-3 rounded-xl bg-white dark:bg-zinc-800 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all border border-slate-100 dark:border-white/5"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={onLogout}
            className="p-3 rounded-xl bg-white dark:bg-zinc-800 text-slate-400 hover:text-gigante-red transition-all border border-slate-100 dark:border-white/5"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
