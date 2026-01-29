
import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabaseService } from '../services/supabase';
import { Candidate, CandidateStatus, AdminUser } from '../types';
import { Search, Download, ExternalLink, Phone, Briefcase, Eye, X, MapPin, ChevronRight, User, Trash2, LayoutGrid, List as ListIcon, Mail, Store as StoreIcon, Filter, ChevronDown, Calendar } from 'lucide-react';
import { Store, JobRole } from '../types';

const CandidatesList: React.FC<{ user: AdminUser, onLogout: () => void, theme?: 'light' | 'dark', onToggleTheme?: () => void }> = ({ user, onLogout, theme, onToggleTheme }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [filters, setFilters] = useState({
    storeId: '',
    roleId: '',
    status: ''
  });

  useEffect(() => {
    Promise.all([
      supabaseService.getCandidates(undefined, user),
      supabaseService.getStores(user),
      supabaseService.getRoles(user)
    ]).then(([c, s, r]) => {
      setCandidates(c);
      setStores(s);
      setRoles(r);
      setLoading(false);
    });
  }, [user]);

  const getStatusBadge = (s: CandidateStatus) => {
    const styles: Record<CandidateStatus, string> = {
      'novo': 'bg-red-50 text-gigante-red border-red-100',
      'em análise': 'bg-amber-50 text-amber-600 border-amber-100',
      'aprovado': 'bg-emerald-50 text-emerald-600 border-emerald-100',
      'visualizado': 'bg-blue-50 text-blue-600 border-blue-100',
      'descartado': 'bg-slate-50 text-slate-500 border-slate-100',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[s]}`}>
        {s}
      </span>
    );
  };

  const filtered = candidates.filter(c => {
    const matchesSearch = c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStore = filters.storeId ? c.cidade_loja_id === filters.storeId : true;
    const matchesRole = filters.roleId ? c.cargo_id === filters.roleId : true;
    const matchesStatus = filters.status ? c.status === filters.status : true;

    return matchesSearch && matchesStore && matchesRole && matchesStatus;
  });

  return (
    <div className="flex bg-[#F8F9FA] dark:bg-zinc-950 min-h-screen">
      <AdminSidebar user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />
      <main className="flex-grow ml-64 p-10 animate-fade-in">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Gestão de Candidaturas</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Gerencie e analise perfis de candidatos</p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-xl flex gap-1 mr-4">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-800 text-gigante-red shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                title="Visualização em Cards"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-zinc-800 text-gigante-red shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                title="Visualização em Lista"
              >
                <ListIcon size={18} />
              </button>
            </div>

            <div className="relative flex-grow md:flex-grow-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar candidato..."
                className="pl-10 pr-6 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-xl text-sm font-medium w-full md:w-64 focus:ring-2 focus:ring-gigante-red/10 outline-none dark:text-white shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-premium">
              <Download size={16} /> Exportar
            </button>
          </div>
        </header>

        {/* Filters Section */}
        <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-premium border border-slate-100 dark:border-white/5 mb-8 flex flex-wrap items-end gap-6">
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

          <div className="flex-grow min-w-[200px] space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Status</label>
            <div className="relative">
              <select
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-zinc-800 border-none rounded-lg px-4 py-2.5 text-xs font-semibold appearance-none focus:ring-2 focus:ring-gigante-red/20 outline-none dark:text-white"
              >
                <option value="">Todos os Status</option>
                <option value="novo">Novo</option>
                <option value="em análise">Em Análise</option>
                <option value="aprovado">Aprovado</option>
                <option value="visualizado">Visualizado</option>
                <option value="descartado">Descartado</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>

          <button
            onClick={() => setFilters({ storeId: '', roleId: '', status: '' })}
            className="p-3 text-slate-400 hover:text-gigante-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
            title="Limpar Filtros"
          >
            <X size={20} />
          </button>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gigante-red/20 border-t-gigante-red"></div>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Carregando candidatos...</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map(c => (
              <div key={c.id} className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-premium border border-slate-100 dark:border-white/5 group hover:border-gigante-red/20 transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 font-black flex items-center justify-center rounded-2xl border border-slate-200 dark:border-white/5 text-xl">
                    {c.nome.charAt(0)}
                  </div>
                  {getStatusBadge(c.status)}
                </div>

                <h4 className="font-bold text-lg tracking-tight mb-1 truncate text-slate-900 dark:text-white">{c.nome}</h4>
                <p className="text-xs text-slate-400 font-medium mb-6 flex items-center gap-1 opacity-70">
                  <Mail size={12} /> {c.email}
                </p>

                <div className="space-y-4 pt-6 border-t border-slate-50 dark:border-white/5">
                  <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <StoreIcon size={14} className="text-gigante-red" /> {c.cidade_loja?.nome_loja}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    <Briefcase size={14} className="text-gigante-red" /> {c.cargo?.nome}
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase leading-tight">
                      {(() => {
                        const date = new Date(c.created_at || Date.now());
                        date.setHours(date.getHours() - 3);
                        return date.toLocaleDateString('pt-BR');
                      })()}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase leading-tight">
                      {(() => {
                        const date = new Date(c.created_at || Date.now());
                        date.setHours(date.getHours() - 3);
                        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      })()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelected(c)}
                      className="p-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl hover:bg-gigante-red hover:text-white transition-all shadow-lg"
                      title="Ver Perfil"
                    >
                      <Eye size={18} />
                    </button>
                    <a
                      href={c.curriculo_url}
                      target="_blank"
                      className="p-3 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-2xl hover:bg-gigante-red hover:text-white transition-all shadow-sm border border-slate-200 dark:border-white/5"
                      title="Ver Currículo"
                    >
                      <ExternalLink size={18} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-premium border border-slate-100 dark:border-white/5 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-white/5 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="px-8 py-5">Candidato</th>
                  <th className="px-8 py-5">Vaga / Unidade</th>
                  <th className="px-8 py-5">Data / Hora</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:bg-gigante-red/10 group-hover:text-gigante-red transition-all">
                          <User size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 dark:text-white text-sm">{c.nome}</p>
                          <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                            <Mail size={10} /> {c.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{c.cargo?.nome}</p>
                      <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                        <MapPin size={10} /> {c.cidade_loja?.nome_loja}
                      </p>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {(() => {
                            const date = new Date(c.created_at || Date.now());
                            date.setHours(date.getHours() - 3);
                            return date.toLocaleDateString('pt-BR');
                          })()}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                          {(() => {
                            const date = new Date(c.created_at || Date.now());
                            date.setHours(date.getHours() - 3);
                            return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                          })()}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      {getStatusBadge(c.status)}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                          title="Excluir Candidato"
                          onClick={async () => {
                            if (window.confirm(`Tem certeza que deseja EXCLUIR o candidato ${c.nome}?\n\nIsso apagará o registro do sistema e o currículo do Drive permanentemente.`)) {
                              try {
                                await supabaseService.deleteCandidate(c.id, c.curriculo_drive_id);
                                setCandidates(prev => prev.filter(cand => cand.id !== c.id));
                                alert('Candidato excluído com sucesso!');
                              } catch (err: any) {
                                alert(`Erro ao excluir: ${err.message}`);
                              }
                            }
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                        <button
                          onClick={() => setSelected(c)}
                          className="p-2.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all"
                          title="Ver Perfil"
                        >
                          <Eye size={18} />
                        </button>
                        <a
                          href={c.curriculo_url}
                          target="_blank"
                          className="p-2.5 text-slate-400 hover:text-gigante-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                          title="Ver Currículo"
                        >
                          <ExternalLink size={18} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Clean */}
        {
          selected && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
              <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20">
                <div className="p-8 border-b border-slate-50 dark:border-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gigante-red/5 text-gigante-red flex items-center justify-center">
                      <User size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selected.nome}</h2>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <MapPin size={12} /> {selected.cidade_loja?.nome_loja}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-10 space-y-8">
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sobre o Candidato</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-white/5 p-6 rounded-2xl italic">
                      "{selected.apresentacao}"
                    </p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button className="flex-grow bg-gigante-red text-white py-4 px-6 rounded-2xl font-bold text-sm hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2">
                      Aceitar Perfil <ChevronRight size={18} />
                    </button>
                    <button className="flex-grow bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 py-4 px-6 rounded-2xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }
      </main >
    </div >
  );
};

export default CandidatesList;
