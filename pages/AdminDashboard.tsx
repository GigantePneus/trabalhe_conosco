
import React, { useState, useEffect, useRef } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabaseService } from '../services/supabase';
import { AdminUser, Store, JobRole } from '../types';
import {
  Users,
  Store as StoreIcon,
  Briefcase,
  Clock,
  Filter,
  X,
  Calendar,
  ChevronDown,
  RefreshCw,
  Search
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell
} from 'recharts';

interface AdminDashboardProps {
  user: AdminUser;
  onLogout: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout, theme, onToggleTheme }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);

  const dateStartRef = useRef<HTMLInputElement>(null);
  const dateEndRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState({
    dateStart: '',
    dateEnd: '',
    storeId: '',
    roleId: ''
  });

  useEffect(() => {
    // Default to last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    setFilters(f => ({
      ...f,
      dateStart: start.toISOString().split('T')[0],
      dateEnd: end.toISOString().split('T')[0]
    }));

    loadInitialData();
  }, []);

  useEffect(() => {
    refreshStats();
  }, [filters]);

  const loadInitialData = async () => {
    const [s, r] = await Promise.all([
      supabaseService.getStores(),
      supabaseService.getRoles()
    ]);
    setStores(s);
    setRoles(r);
  };

  const refreshStats = async () => {
    setLoading(true);
    const s = await supabaseService.getStats(filters);
    setStats(s);
    setLoading(false);
  };

  const openDatePicker = (ref: React.RefObject<HTMLInputElement>) => {
    if (ref.current && 'showPicker' in HTMLInputElement.prototype) {
      ref.current.showPicker();
    } else {
      ref.current?.focus();
    }
  };

  if (!stats) return null;

  return (
    <div className="flex bg-[#F8F9FA] dark:bg-zinc-950 min-h-screen">
      <AdminSidebar user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />

      <main className="flex-grow ml-64 p-10 animate-fade-in">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              Dashboard Analítico
              {loading && <RefreshCw size={18} className="animate-spin text-gigante-red" />}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">
              Monitoramento de talentos e rede Gigante Pneus
            </p>
          </div>
          <div className="flex items-center gap-3 mt-4 md:mt-0">
            <div className="bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-lg shadow-premium border border-slate-100 dark:border-white/5 flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <Calendar size={16} className="text-gigante-red" />
              {new Date().toLocaleDateString('pt-BR')}
            </div>
          </div>
        </header>

        {/* Filters Section - Cleaner Design with Enhanced Date Selectors */}
        <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-premium border border-slate-100 dark:border-white/5 mb-8 flex flex-wrap items-end gap-6">
          <div className="flex-grow min-w-[280px] space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Período de Análise</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-grow">
                <input
                  type="date"
                  ref={dateStartRef}
                  value={filters.dateStart}
                  onChange={e => setFilters(f => ({ ...f, dateStart: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border-none rounded-lg pl-10 pr-4 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-gigante-red/20 outline-none dark:text-white transition-all cursor-pointer"
                />
                <Calendar
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  onClick={() => openDatePicker(dateStartRef)}
                />
              </div>
              <span className="text-slate-300 font-bold">/</span>
              <div className="relative flex-grow">
                <input
                  type="date"
                  ref={dateEndRef}
                  value={filters.dateEnd}
                  onChange={e => setFilters(f => ({ ...f, dateEnd: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border-none rounded-lg pl-10 pr-4 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-gigante-red/20 outline-none dark:text-white transition-all cursor-pointer"
                />
                <Calendar
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  onClick={() => openDatePicker(dateEndRef)}
                />
              </div>
            </div>
          </div>

          <div className="flex-grow min-w-[200px] space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Unidade</label>
            <div className="relative">
              <select
                value={filters.storeId}
                onChange={e => setFilters(f => ({ ...f, storeId: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-zinc-800 border-none rounded-lg px-4 py-2.5 text-xs font-semibold appearance-none focus:ring-2 focus:ring-gigante-red/20 outline-none dark:text-white"
              >
                <option value="">Todas as Unidades</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.nome_loja}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>

          <div className="flex-grow min-w-[200px] space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Função</label>
            <div className="relative">
              <select
                value={filters.roleId}
                onChange={e => setFilters(f => ({ ...f, roleId: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-zinc-800 border-none rounded-lg px-4 py-2.5 text-xs font-semibold appearance-none focus:ring-2 focus:ring-gigante-red/20 outline-none dark:text-white"
              >
                <option value="">Todas as Funções</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>

          <button
            onClick={() => setFilters({ dateStart: '', dateEnd: '', storeId: '', roleId: '' })}
            className="p-3 text-slate-400 hover:text-gigante-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
            title="Limpar Filtros"
          >
            <X size={20} />
          </button>
        </section>

        {/* Indicators Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Filtrado" value={stats.total} icon={<Users size={20} />} trend="+12% que ontem" />
          <StatCard title="Novos Candidatos" value="12" icon={<Clock size={20} />} trend="Hoje" color="red" />
          <StatCard title="Unidades" value={stores.length} icon={<StoreIcon size={20} />} />
          <StatCard title="Vagas Ativas" value={roles.length} icon={<Briefcase size={20} />} />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-premium border border-slate-100 dark:border-white/5">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gigante-red"></div>
                Currículos ao longo do tempo
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.byTime}>
                  <defs>
                    <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E30613" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#E30613" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="v" stroke="#E30613" strokeWidth={3} fill="url(#colorArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-premium border border-slate-100 dark:border-white/5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-10 flex items-center gap-2">
              <Clock size={16} className="text-slate-400" /> Volume por Horário
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byHour}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 8 }} interval={3} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '10px' }} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                    {stats.byHour.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry.v > 0 ? '#E30613' : '#F1F5F9'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <RankList title="Candidatos por Unidade" data={stats.byStore} total={stats.total} />
          <RankList title="Candidatos por Cargo" data={stats.byRole} total={stats.total} color="slate" />
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, color = 'slate' }: any) => (
  <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-premium border border-slate-100 dark:border-white/5 group hover:border-gigante-red/20 transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2.5 rounded-xl ${color === 'red' ? 'bg-red-50 text-gigante-red' : 'bg-slate-50 text-slate-400'} dark:bg-white/5 transition-colors`}>
        {icon}
      </div>
      {trend && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">{trend}</span>}
    </div>
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{value}</p>
    </div>
  </div>
);

const RankList = ({ title, data, total, color = 'red' }: any) => (
  <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-premium border border-slate-100 dark:border-white/5">
    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-8">{title}</h3>
    <div className="space-y-6">
      {data.map((item: any, i: number) => (
        <div key={i}>
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item.name}</span>
            <span className="text-[11px] font-bold text-slate-400">{item.count}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-50 dark:bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${color === 'red' ? 'bg-gigante-red' : 'bg-slate-900 dark:bg-white'}`}
              style={{ width: `${total > 0 ? (item.count / total) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default AdminDashboard;
