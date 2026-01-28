
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
  UserPlus
} from 'lucide-react';

interface ManagementProps {
  user: AdminUser;
  onLogout: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

interface ManageUser {
  id: string;
  name: string;
  email: string;
  role: 'admin_master' | 'franqueado';
  lojas_permitidas: string[];
  cargos_permitidos: string[];
}

const Management: React.FC<ManagementProps> = ({ user, onLogout, theme, onToggleTheme }) => {
  const [activeTab, setActiveTab] = useState<'stores' | 'roles' | 'users'>('stores');
  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [users, setUsers] = useState<ManageUser[]>([
    { id: '1', name: 'Alex Ignacio', email: 'alexignaciomkt@gmail.com.br', role: 'admin_master', lojas_permitidas: [], cargos_permitidos: [] }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form States
  const [storeForm, setStoreForm] = useState({ nome_loja: '', cidade: '', estado: '' });
  const [roleForm, setRoleForm] = useState({ nome: '' });
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'franqueado' as 'admin_master' | 'franqueado',
    lojas_permitidas: [] as string[],
    cargos_permitidos: [] as string[]
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [s, r, u] = await Promise.all([
      supabaseService.getStores(),
      supabaseService.getRoles(),
      supabaseService.getUsers()
    ]);
    setStores(s);
    setRoles(r);
    // @ts-ignore - Adapter simples para alinhar tipos se necessário, ou cast
    setUsers(u.map(x => ({ ...x, name: x.nome, lojas_permitidas: x.lojas_permitidas || [], cargos_permitidos: x.cargos_permitidos || [] })));
    setLoading(false);
  };

  const handleSaveStore = async () => {
    if (!storeForm.nome_loja || !storeForm.cidade) return alert("Preencha todos os campos.");
    try {
      if (editingId) {
        await supabaseService.updateStore(editingId, storeForm);
      } else {
        await supabaseService.saveStore(storeForm);
      }
      setStoreForm({ nome_loja: '', cidade: '', estado: '' });
      setEditingId(null);
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      alert("Erro ao salvar loja.");
      console.error(error);
    }
  };

  const handleDeleteStore = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta loja?")) return;
    await supabaseService.deleteStore(id);
    loadData();
  };

  const handleEditStore = (store: Store) => {
    setStoreForm({
      nome_loja: store.nome_loja,
      cidade: store.cidade,
      estado: store.estado
    });
    setEditingId(store.id);
    setActiveTab('stores');
    setIsModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleForm.nome) return alert("Preencha o nome do cargo.");
    try {
      if (editingId) {
        await supabaseService.updateRole(editingId, roleForm);
      } else {
        await supabaseService.saveRole(roleForm);
      }
      setRoleForm({ nome: '' });
      setEditingId(null);
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      alert("Erro ao salvar cargo.");
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este cargo?")) return;
    await supabaseService.deleteRole(id);
    loadData();
  };

  const handleEditRole = (role: JobRole) => {
    setRoleForm({ nome: role.nome });
    setEditingId(role.id);
    setActiveTab('roles');
    setIsModalOpen(true);
  };

  // --- USERS HANDLERS ---
  const handleSaveUser = async () => {
    // Nota: Para criar usuário REAIS do Supabase Auth, precisa da service_role key ou fazer no painel.
    // Aqui estamos apenas editando os metadados na tabela admin_users
    if (!userForm.email || !userForm.name) return alert("Preencha nome e email");

    // Se for edição
    if (editingId) {
      // Atualizar
      // @ts-ignore
      await supabaseService.saveUser({
        id: editingId,
        nome: userForm.name,
        email: userForm.email,
        role: userForm.role,
        lojas_permitidas: userForm.lojas_permitidas,
        cargos_permitidos: userForm.cargos_permitidos
      });
    } else {
      alert("Para criar novos usuários, por favor utilize o painel de Autenticação do Supabase primeiro para gerar o ID, ou solicite ao administrador mestre.");
      return;
      // O fluxo correto seria: Criar no Auth -> Pegar ID -> Criar na tabela admin_users
    }

    setEditingId(null);
    setUserForm({ name: '', email: '', role: 'franqueado', lojas_permitidas: [], cargos_permitidos: [] });
    setIsModalOpen(false);
    loadData();
  };

  const handleEditUser = (u: ManageUser) => {
    setUserForm({
      name: u.name,
      email: u.email,
      role: u.role,
      lojas_permitidas: u.lojas_permitidas,
      cargos_permitidos: u.cargos_permitidos
    });
    setEditingId(u.id);
    setActiveTab('users');
    setIsModalOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover o acesso deste usuário?")) return;
    await supabaseService.deleteUser(id);
    loadData();
  };

  const togglePermission = (type: 'store' | 'role', id: string) => {
    const field = type === 'store' ? 'lojas_permitidas' : 'cargos_permitidos';
    setUserForm(prev => {
      const current = prev[field];
      const exists = current.includes(id);
      return { ...prev, [field]: exists ? current.filter(i => i !== id) : [...current, id] };
    });
  };

  return (
    <div className="flex bg-[#F8F9FA] dark:bg-zinc-950 min-h-screen">
      <AdminSidebar user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />

      <main className="flex-grow ml-64 p-10 animate-fade-in">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Gestão da Rede</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">Configuração de infraestrutura e acessos</p>
          </div>
          <button
            onClick={() => {
              setEditingId(null);
              setStoreForm({ nome_loja: '', cidade: '', estado: '' });
              setRoleForm({ nome: '' });
              setUserForm({ name: '', email: '', role: 'franqueado', lojas_permitidas: [], cargos_permitidos: [] });
              setIsModalOpen(true);
            }}
            className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-8 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-3 hover:bg-gigante-red hover:text-white transition-all shadow-premium"
          >
            <Plus size={20} />
            {activeTab === 'stores' ? 'Nova Unidade' : activeTab === 'roles' ? 'Novo Cargo' : 'Novo Usuário'}
          </button>
        </header>

        {/* Tabs Clean */}
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
              <h4 className="font-bold text-slate-900 dark:text-white text-lg">{store.nome_loja}</h4>
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
              <h4 className="font-bold text-slate-900 dark:text-white text-lg">{role.nome}</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cargo Ativo</p>
            </div>
          ))}

          {activeTab === 'users' && users.map(u => (
            <div key={u.id} className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-premium border border-slate-100 dark:border-white/5 group hover:border-gigante-red/20 transition-all">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-slate-900 text-white font-bold flex items-center justify-center rounded-2xl shadow-lg dark:bg-white dark:text-slate-900">
                  {u.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <h4 className="font-bold text-slate-900 dark:text-white truncate">{u.name}</h4>
                  <p className="text-xs text-slate-400 truncate font-medium">{u.email}</p>
                </div>
              </div>
              <div className="flex justify-between items-center pt-6 border-t border-slate-50 dark:border-white/5">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${u.role === 'admin_master' ? 'bg-red-50 text-gigante-red' : 'bg-slate-50 text-slate-500'} dark:bg-white/5`}>
                  {u.role.replace('_', ' ')}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => handleEditUser(u)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"><Edit3 size={18} /></button>
                  <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-slate-400 hover:text-gigante-red transition-all"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Clean Redesigned */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
              <div className="p-8 border-b border-slate-50 dark:border-white/5 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  {activeTab === 'stores' && <><StoreIcon size={20} className="text-gigante-red" /> Nova Unidade</>}
                  {activeTab === 'roles' && <><Briefcase size={20} className="text-gigante-red" /> Novo Cargo</>}
                  {activeTab === 'users' && <><UserPlus size={20} className="text-gigante-red" /> Novo Usuário</>}
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
                        <input type="text" placeholder="Ex: São Paulo" className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-gigante-red/10 outline-none dark:text-white" value={storeForm.cidade} onChange={e => setStoreForm(p => ({ ...p, cidade: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                        <input type="text" placeholder="Ex: SP" className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-gigante-red/10 outline-none dark:text-white" value={storeForm.estado} onChange={e => setStoreForm(p => ({ ...p, estado: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Loja</label>
                      <input type="text" placeholder="Ex: Gigante Pneus - Matriz" className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-gigante-red/10 outline-none dark:text-white" value={storeForm.nome_loja} onChange={e => setStoreForm(p => ({ ...p, nome_loja: e.target.value }))} />
                    </div>
                    <button onClick={handleSaveStore} className="w-full bg-gigante-red text-white py-4 rounded-2xl font-bold text-sm shadow-xl hover:opacity-90 transition-all">Cadastrar Unidade</button>
                  </div>
                )}

                {activeTab === 'roles' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome do Cargo</label>
                      <input type="text" placeholder="Ex: Técnico de Alinhamento" className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-gigante-red/10 outline-none dark:text-white" value={roleForm.nome} onChange={e => setRoleForm({ nome: e.target.value })} />
                    </div>
                    <button onClick={handleSaveRole} className="w-full bg-gigante-red text-white py-4 rounded-2xl font-bold text-sm shadow-xl hover:opacity-90 transition-all">Cadastrar Cargo</button>
                  </div>
                )}

                {activeTab === 'users' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                        <input type="text" className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white" value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                        <input type="email" className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Acesso</label>
                      <select
                        value={userForm.role}
                        onChange={e => setUserForm(p => ({ ...p, role: e.target.value as any }))}
                        className="w-full px-6 py-3.5 bg-slate-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-semibold outline-none dark:text-white appearance-none"
                      >
                        <option value="admin_master">Administrador Master (Acesso Total)</option>
                        <option value="franqueado">Franqueado / Gestor (Acesso Restrito)</option>
                      </select>
                    </div>

                    {userForm.role === 'franqueado' && (
                      <div className="animate-fade-in space-y-8 border-t border-slate-50 dark:border-white/5 pt-8">
                        <div className="space-y-4">
                          <h4 className="text-[11px] font-bold text-gigante-red uppercase tracking-[0.3em] flex items-center gap-2">
                            <ShieldCheck size={16} /> Lojas Autorizadas
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {stores.map(s => (
                              <button
                                key={s.id}
                                onClick={() => togglePermission('store', s.id)}
                                className={`px-5 py-3.5 rounded-2xl text-xs font-bold transition-all border flex justify-between items-center ${userForm.lojas_permitidas.includes(s.id) ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white' : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200 dark:bg-zinc-800'}`}
                              >
                                {s.nome_loja}
                                {userForm.lojas_permitidas.includes(s.id) && <CheckCircle2 size={14} />}
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
                                onClick={() => togglePermission('role', r.id)}
                                className={`px-5 py-3.5 rounded-2xl text-xs font-bold transition-all border flex justify-between items-center ${userForm.cargos_permitidos.includes(r.id) ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white' : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200 dark:bg-zinc-800'}`}
                              >
                                {r.nome}
                                {userForm.cargos_permitidos.includes(r.id) && <CheckCircle2 size={14} />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <button onClick={handleSaveUser} className="w-full bg-gigante-red text-white py-4 rounded-2xl font-bold text-sm shadow-xl hover:opacity-90 transition-all flex items-center justify-center gap-2">
                      <Save size={18} /> {editingId ? 'Salvar Alterações' : 'Criar Usuário'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Management;
