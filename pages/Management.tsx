
import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { AdminUser, Store, JobRole } from '../types';
import { supabaseService } from '../services/supabase';
import {
  Store as StoreIcon,
  Briefcase,
  ShieldCheck,
  Plus,
  Trash2,
  Edit3,
  X,
  Save,
  Mail,
  User,
  ShieldAlert,
  CheckCircle2,
  MapPin,
  ChevronRight,
  UserPlus,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';

interface ManagementProps {
  user: AdminUser;
  onLogout: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

interface ManageUser {
  id: string;
  nome: string;
  email: string;
  role: 'admin_master' | 'franqueado';
  lojas_permitidas: string[];
  cargos_permitidos: string[];
}

const Management: React.FC<ManagementProps> = ({ user, onLogout, theme, onToggleTheme }) => {
  const [activeTab, setActiveTab] = useState<'stores' | 'roles' | 'users'>('stores');
  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [users, setUsers] = useState<ManageUser[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Individual Form States (to avoid object-state freezing issues)
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<'admin_master' | 'franqueado'>('franqueado');
  const [userPass, setUserPass] = useState('');
  const [userStores, setUserStores] = useState<string[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  const [storeNome, setStoreNome] = useState('');
  const [storeCidade, setStoreCidade] = useState('');
  const [storeEstado, setStoreEstado] = useState('');

  const [roleNome, setRoleNome] = useState('');

  // Password Reset State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ userId: '', newPassword: '' });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, r, u] = await Promise.all([
        supabaseService.getStores(user),
        supabaseService.getRoles(user),
        supabaseService.getUsers()
      ]);
      setStores(s);
      setRoles(r);
      // @ts-ignore
      setUsers(u.map(x => ({
        id: x.id,
        nome: x.nome,
        email: x.email,
        role: x.role,
        lojas_permitidas: x.lojas_permitidas || [],
        cargos_permitidos: x.cargos_permitidos || []
      })));
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStore = async () => {
    if (!storeNome || !storeCidade) return alert("Preencha todos os campos.");
    setIsSaving(true);
    try {
      if (editingId) {
        await supabaseService.updateStore(editingId, { nome_loja: storeNome, cidade: storeCidade, estado: storeEstado });
      } else {
        await supabaseService.saveStore({ nome_loja: storeNome, cidade: storeCidade, estado: storeEstado });
      }
      setStoreNome('');
      setStoreCidade('');
      setStoreEstado('');
      setEditingId(null);
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      alert("Erro ao salvar loja.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStore = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta loja?")) return;
    try {
      await supabaseService.deleteStore(id);
      loadData();
    } catch (e) {
      alert("Erro ao remover loja.");
    }
  };

  const handleEditStore = (store: Store) => {
    setStoreNome(store.nome_loja);
    setStoreCidade(store.cidade);
    setStoreEstado(store.estado);
    setEditingId(store.id);
    setActiveTab('stores');
    setIsModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleNome) return alert("Preencha o nome do cargo.");
    setIsSaving(true);
    try {
      if (editingId) {
        await supabaseService.updateRole(editingId, { nome: roleNome });
      } else {
        await supabaseService.saveRole({ nome: roleNome });
      }
      setRoleNome('');
      setEditingId(null);
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      alert("Erro ao salvar cargo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este cargo?")) return;
    try {
      await supabaseService.deleteRole(id);
      loadData();
    } catch (e) {
      alert("Erro ao remover cargo.");
    }
  };

  const handleEditRole = (role: JobRole) => {
    setRoleNome(role.nome);
    setEditingId(role.id);
    setActiveTab('roles');
    setIsModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!userName || !userEmail) return alert("Preencha nome e email");

    setIsSaving(true);
    try {
      if (editingId) {
        await supabaseService.saveUser({
          id: editingId,
          nome: userName,
          email: userEmail,
          role: userRole,
          lojas_permitidas: userStores,
          cargos_permitidos: userRoles
        });
      } else {
        if (!userPass) return alert("Defina uma senha para o novo usuário.");

        await supabaseService.createUser({
          nome: userName,
          email: userEmail,
          role: userRole,
          lojas_permitidas: userStores,
          cargos_permitidos: userRoles
        }, userPass);
      }

      alert(editingId ? "Usuário atualizado!" : "Usuário criado com sucesso!");
      setEditingId(null);
      resetUserForm();
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      alert("Erro ao salvar: " + (error.message || "Erro desconhecido"));
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const resetUserForm = () => {
    setUserName('');
    setUserEmail('');
    setUserRole('franqueado');
    setUserPass('');
    setUserStores([]);
    setUserRoles([]);
  };

  const handleChangePassword = async () => {
    if (!passwordForm.newPassword) return alert("Digite a nova senha.");
    setIsSaving(true);
    try {
      await supabaseService.updateUserPassword(passwordForm.userId, passwordForm.newPassword);
      alert("Senha atualizada com sucesso!");
      setIsPasswordModalOpen(false);
      setPasswordForm({ userId: '', newPassword: '' });
    } catch (error: any) {
      alert("Erro ao atualizar senha: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditUser = (u: ManageUser) => {
    setUserName(u.nome);
    setUserEmail(u.email);
    setUserRole(u.role);
    setUserStores(u.lojas_permitidas);
    setUserRoles(u.cargos_permitidos);
    setUserPass('');
    setEditingId(u.id);
    setActiveTab('users');
    setIsModalOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover o acesso deste usuário?")) return;
    try {
      await supabaseService.deleteUser(id);
      loadData();
    } catch (e) {
      alert("Erro ao remover usuário.");
    }
  };



  return (
    <div className="flex bg-[#F8F9FA] dark:bg-zinc-950 min-h-screen">
      <AdminSidebar user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />

      <main className="flex-grow ml-64 p-10 animate-fade-in text-slate-900 dark:text-white">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold">Gestão da Rede</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">Configuração de infraestrutura e acessos</p>
          </div>
          <div className="flex items-center gap-3 mt-4 md:mt-0">
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
            <button
              onClick={() => {
                setEditingId(null);
                setStoreNome('');
                setStoreCidade('');
                setStoreEstado('');
                setRoleNome('');
                resetUserForm();
                setIsModalOpen(true);
              }}
              className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-8 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-3 hover:bg-gigante-red hover:text-white transition-all shadow-premium"
            >
              <Plus size={20} />
              {activeTab === 'stores' ? 'Nova Unidade' : activeTab === 'roles' ? 'Novo Cargo' : 'Novo Usuário'}
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-10 bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl w-fit">
          {(['stores', 'roles', 'users'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              {tab === 'stores' ? 'Unidades' : tab === 'roles' ? 'Cargos' : 'Usuários'}
            </button>
          ))}
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gigante-red/20 border-t-gigante-red"></div>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Carregando dados...</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {activeTab === 'stores' && stores.map(store => (
              <div key={store.id} className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-premium border border-slate-100 dark:border-white/5 group hover:border-gigante-red/20 transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-red-50 dark:bg-red-500/10 text-gigante-red rounded-2xl">
                    <StoreIcon size={24} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleEditStore(store)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"><Edit3 size={18} /></button>
                    <button onClick={() => handleDeleteStore(store.id)} className="p-2 text-slate-400 hover:text-gigante-red"><Trash2 size={18} /></button>
                  </div>
                </div>
                <h4 className="font-bold text-lg">{store.nome_loja}</h4>
                <p className="text-xs font-semibold text-slate-400 mt-1 flex items-center gap-1">
                  <MapPin size={12} className="text-gigante-red" /> {store.cidade} / {store.estado}
                </p>
              </div>
            ))}

            {activeTab === 'roles' && roles.map(role => (
              <div key={role.id} className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-premium border border-slate-100 dark:border-white/5 group hover:border-gigante-red/20 transition-all">
                <div className="flex justify-between items-center mb-4">
                  <div className="p-3 bg-slate-50 dark:bg-white/5 text-slate-400 rounded-2xl">
                    <Briefcase size={24} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleEditRole(role)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"><Edit3 size={18} /></button>
                    <button onClick={() => handleDeleteRole(role.id)} className="p-2 text-slate-400 hover:text-gigante-red"><Trash2 size={18} /></button>
                  </div>
                </div>
                <h4 className="font-bold text-lg">{role.nome}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cargo Ativo</p>
              </div>
            ))}

            {activeTab === 'users' && users.map(u => (
              <div key={u.id} className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-premium border border-slate-100 dark:border-white/5 group hover:border-gigante-red/20 transition-all">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 font-black flex items-center justify-center rounded-2xl border border-slate-200 dark:border-white/5 text-xl shadow-inner">
                    {u.nome.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-bold text-lg tracking-tight text-slate-800 dark:text-white truncate">{u.nome}</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate font-medium flex items-center gap-1">
                      <Mail size={12} /> {u.email}
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-white/5">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] border ${u.role === 'admin_master'
                      ? 'bg-red-50 text-gigante-red border-red-100 dark:bg-red-500/10 dark:border-red-500/20'
                      : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'
                      }`}>
                      {u.role.replace('_', ' ')}
                    </span>

                    {u.role === 'franqueado' && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="px-3 py-1.5 rounded-xl text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 flex items-center gap-2" title="Unidades Autorizadas">
                          <StoreIcon size={12} /> {u.lojas_permitidas?.length || 0}
                        </span>
                        <span className="px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-500 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2" title="Cargos Autorizados">
                          <Briefcase size={12} /> {u.cargos_permitidos?.length || 0}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 sm:ml-auto w-full sm:w-auto justify-center sm:justify-end mt-2 sm:mt-0">
                      <button onClick={() => { setPasswordForm({ userId: u.id, newPassword: '' }); setIsPasswordModalOpen(true); }} className="p-2 text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 bg-slate-50 dark:bg-white/5 rounded-xl border border-transparent hover:border-amber-200 dark:hover:border-amber-500/30 transition-all" title="Alterar Senha">
                        <ShieldCheck size={16} />
                      </button>
                      <button onClick={() => handleEditUser(u)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-white/5 rounded-xl border border-transparent hover:border-slate-300 dark:hover:border-white/20 transition-all">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 dark:bg-white/5 rounded-xl border border-transparent hover:border-red-200 dark:hover:border-red-500/30 transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-premium border border-slate-100 dark:border-white/5 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-white/5 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  {activeTab === 'users' ? (
                    <>
                      <th className="px-8 py-5">Usuário</th>
                      <th className="px-8 py-5 text-center">Acesso</th>
                      <th className="px-8 py-5 text-center">Permissões</th>
                      <th className="px-8 py-5 text-right">Ações</th>
                    </>
                  ) : activeTab === 'stores' ? (
                    <>
                      <th className="px-8 py-5">Unidade</th>
                      <th className="px-8 py-5">Localização</th>
                      <th className="px-8 py-5 text-right">Ações</th>
                    </>
                  ) : (
                    <>
                      <th className="px-8 py-5">Nome do Cargo</th>
                      <th className="px-8 py-5 text-center">Status</th>
                      <th className="px-8 py-5 text-right">Ações</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">
                {activeTab === 'users' && users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 flex items-center justify-center font-bold text-xs uppercase">
                          {u.nome.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-sm tracking-tight">{u.nome}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-medium">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border ${u.role === 'admin_master' ? 'bg-red-50 text-gigante-red border-red-100' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5'}`}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center gap-2">
                        {u.role === 'franqueado' ? (
                          <>
                            <span className="text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-100 dark:border-red-500/20">
                              {u.lojas_permitidas?.length || 0} UNIDADES
                            </span>
                            <span className="text-[10px] font-black text-slate-500 bg-slate-50 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10">
                              {u.cargos_permitidos?.length || 0} CARGOS
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">ACESSO TOTAL</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setPasswordForm({ userId: u.id, newPassword: '' }); setIsPasswordModalOpen(true); }} className="p-2 text-slate-400 hover:text-amber-500"><ShieldCheck size={16} /></button>
                        <button onClick={() => handleEditUser(u)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeTab === 'stores' && stores.map(store => (
                  <tr key={store.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-8 py-5 font-bold text-sm tracking-tight">{store.nome_loja}</td>
                    <td className="px-8 py-5 text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-2">
                      <MapPin size={12} className="text-gigante-red" /> {store.cidade} / {store.estado}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleEditStore(store)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={() => handleDeleteStore(store.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeTab === 'roles' && roles.map(role => (
                  <tr key={role.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-8 py-5 font-bold text-sm tracking-tight">{role.nome}</td>
                    <td className="px-8 py-5 text-center">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">Ativo</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleEditRole(role)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={() => handleDeleteRole(role.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Overlay */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
              <div className="p-8 border-b border-slate-50 dark:border-white/5 flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-3">
                  {activeTab === 'stores' && <><StoreIcon size={20} className="text-gigante-red" /> {editingId ? 'Editar Unidade' : 'Nova Unidade'}</>}
                  {activeTab === 'roles' && <><Briefcase size={20} className="text-gigante-red" /> {editingId ? 'Editar Cargo' : 'Novo Cargo'}</>}
                  {activeTab === 'users' && <><UserPlus size={20} className="text-gigante-red" /> {editingId ? 'Editar Usuário' : 'Novo Usuário'}</>}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>

              <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto">
                {activeTab === 'stores' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cidade</label>
                        <input
                          type="text"
                          placeholder="Ex: São Paulo"
                          className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20"
                          value={storeCidade}
                          onChange={e => setStoreCidade(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                        <input
                          type="text"
                          placeholder="Ex: SP"
                          className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20"
                          value={storeEstado}
                          onChange={e => setStoreEstado(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Loja</label>
                      <input
                        type="text"
                        placeholder="Ex: Gigante Pneus - Matriz"
                        className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20"
                        value={storeNome}
                        onChange={e => setStoreNome(e.target.value)}
                      />
                    </div>
                    <button onClick={handleSaveStore} disabled={isSaving} className={`w-full bg-gigante-red text-white py-4 rounded-2xl font-bold text-sm shadow-xl transition-all flex items-center justify-center ${isSaving ? 'opacity-50' : 'hover:opacity-90'}`}>
                      {isSaving ? <span className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white"></span> : (editingId ? 'Salvar Unidade' : 'Cadastrar Unidade')}
                    </button>
                  </div>
                )}

                {activeTab === 'roles' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome do Cargo</label>
                      <input
                        type="text"
                        placeholder="Ex: Técnico de Alinhamento"
                        className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20"
                        value={roleNome}
                        onChange={e => setRoleNome(e.target.value)}
                      />
                    </div>
                    <button onClick={handleSaveRole} disabled={isSaving} className={`w-full bg-gigante-red text-white py-4 rounded-2xl font-bold text-sm shadow-xl transition-all flex items-center justify-center ${isSaving ? 'opacity-50' : 'hover:opacity-90'}`}>
                      {isSaving ? <span className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white"></span> : (editingId ? 'Salvar Cargo' : 'Cadastrar Cargo')}
                    </button>
                  </div>
                )}

                {activeTab === 'users' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                        <input
                          type="text"
                          className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20"
                          value={userName}
                          onChange={e => setUserName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                        <input
                          type="email"
                          className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20"
                          value={userEmail}
                          onChange={e => setUserEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    {!editingId && (
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Senha Inicial</label>
                        <input
                          type="password"
                          className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20"
                          value={userPass}
                          onChange={e => setUserPass(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Acesso</label>
                      <select
                        value={userRole}
                        onChange={e => setUserRole(e.target.value as any)}
                        className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white appearance-none focus:ring-2 focus:ring-gigante-red/20"
                      >
                        <option value="admin_master">Administrador Master (Acesso Total)</option>
                        <option value="franqueado">Franqueado / Gestor (Acesso Restrito)</option>
                      </select>
                    </div>

                    {userRole === 'franqueado' && (
                      <div className="space-y-8 border-t border-slate-50 dark:border-white/5 pt-8">
                        <div className="space-y-4">
                          <h4 className="text-[11px] font-bold text-gigante-red uppercase tracking-[0.3em] flex items-center gap-2">
                            <ShieldCheck size={16} /> Lojas Autorizadas
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {stores.map(s => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  const exists = userStores.includes(s.id);
                                  setUserStores(exists ? userStores.filter(i => i !== s.id) : [...userStores, s.id]);
                                }}
                                className={`px-5 py-3.5 rounded-2xl text-xs font-bold transition-all border flex justify-between items-center ${userStores.includes(s.id) ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white' : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200 dark:bg-zinc-800'}`}
                              >
                                {s.nome_loja}
                                {userStores.includes(s.id) && <CheckCircle2 size={14} />}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-[11px] font-bold text-gigante-red uppercase tracking-[0.3em] flex items-center gap-2">
                            <Briefcase size={16} /> Cargos Visíveis
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {roles.map(r => (
                              <button
                                key={r.id}
                                onClick={() => {
                                  const exists = userRoles.includes(r.id);
                                  setUserRoles(exists ? userRoles.filter(i => i !== r.id) : [...userRoles, r.id]);
                                }}
                                className={`px-5 py-3.5 rounded-2xl text-xs font-bold transition-all border flex justify-between items-center ${userRoles.includes(r.id) ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white' : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200 dark:bg-zinc-800'}`}
                              >
                                {r.nome}
                                {userRoles.includes(r.id) && <CheckCircle2 size={14} />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={handleSaveUser}
                      disabled={isSaving}
                      className={`w-full bg-gigante-red text-white py-4 rounded-2xl font-bold text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${isSaving ? 'opacity-50' : 'hover:opacity-90'}`}
                    >
                      {isSaving ? (
                        <span className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white"></span>
                      ) : (
                        <Save size={18} />
                      )}
                      {editingId ? 'Salvar Alterações' : 'Criar Usuário'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Password Reset Modal */}
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 border border-white/20">
              <h3 className="text-lg font-bold mb-6">Redefinir Senha</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nova Senha</label>
                  <input type="password" placeholder="Mínimo 6 caracteres" className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white focus:ring-2 focus:ring-gigante-red/20" value={passwordForm.newPassword} onChange={e => { const val = e.target.value; setPasswordForm(p => ({ ...p, newPassword: val })); }} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setIsPasswordModalOpen(false)} className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all">Cancelar</button>
                  <button onClick={handleChangePassword} disabled={isSaving} className={`flex-1 bg-gigante-yellow text-slate-900 py-3.5 rounded-2xl font-bold text-sm shadow-lg transition-all flex items-center justify-center ${isSaving ? 'opacity-50' : 'hover:opacity-90'}`}>
                    {isSaving ? <span className="animate-spin rounded-full h-5 w-5 border-2 border-slate-900/20 border-t-slate-900"></span> : 'Salvar Senha'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Management;
