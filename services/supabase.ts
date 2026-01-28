
import { createClient } from '@supabase/supabase-js';
import { Store, JobRole, Candidate, CandidateStatus, AdminUser } from '../types';

// Configuração do Cliente Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializa o cliente apenas se as chaves existirem
const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// --- DADOS MOCK (FALLBACK) ---
// Mantidos para garantir funcionamento visual até a conexão real estar ativa
let MOCK_STORES: Store[] = [
  { id: '1', nome_loja: 'Loja Matriz', cidade: 'São Paulo', estado: 'SP', ativo: true },
  { id: '2', nome_loja: 'Gigante Pneus Curitiba', cidade: 'Curitiba', estado: 'PR', ativo: true },
];

let MOCK_ROLES: JobRole[] = [
  { id: '1', nome: 'Vendedor Técnico', ativo: true },
  { id: '2', nome: 'Mecânico Alinhador', ativo: true },
  { id: '3', nome: 'Auxiliar de Serviços Gerais', ativo: true },
];

let MOCK_CANDIDATES: Candidate[] = [];

export const supabaseService = {
  // --- LOJAS ---
  getStores: async (): Promise<Store[]> => {
    if (supabase) {
      const { data, error } = await supabase.from('stores').select('*').eq('ativo', true);
      if (!error && data) return data;
    }
    return MOCK_STORES; // Fallback
  },

  saveStore: async (store: Omit<Store, 'id' | 'ativo'>) => {
    if (supabase) {
      const { data, error } = await supabase.from('stores').insert([{ ...store, ativo: true }]).select().single();
      if (!error && data) return data;
      throw new Error(error?.message || 'Erro ao salvar loja');
    }
    // Mock Fallback
    const newStore = { ...store, id: Math.random().toString(36).substr(2, 9), ativo: true };
    MOCK_STORES.push(newStore);
    return newStore;
  },

  updateStore: async (id: string, data: Partial<Store>) => {
    if (supabase) {
      const { error } = await supabase.from('stores').update(data).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    // Mock
    MOCK_STORES = MOCK_STORES.map(s => s.id === id ? { ...s, ...data } : s);
  },

  deleteStore: async (id: string) => {
    // Soft delete
    if (supabase) {
      const { error } = await supabase.from('stores').update({ ativo: false }).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    // Mock
    MOCK_STORES = MOCK_STORES.filter(s => s.id !== id);
  },

  // --- CARGOS ---
  getRoles: async (): Promise<JobRole[]> => {
    if (supabase) {
      const { data, error } = await supabase.from('job_roles').select('*').eq('ativo', true);
      if (!error && data) return data;
    }
    return MOCK_ROLES;
  },

  saveRole: async (role: Omit<JobRole, 'id' | 'ativo'>) => {
    if (supabase) {
      const { data, error } = await supabase.from('job_roles').insert([{ ...role, ativo: true }]).select().single();
      if (!error && data) return data;
      throw new Error(error?.message || 'Erro ao salvar cargo');
    }
    // Mock Fallback
    const newRole = { ...role, id: Math.random().toString(36).substr(2, 9), ativo: true };
    MOCK_ROLES.push(newRole);
    return newRole;
  },

  updateRole: async (id: string, data: Partial<JobRole>) => {
    if (supabase) {
      const { error } = await supabase.from('job_roles').update(data).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    // Mock
    MOCK_ROLES = MOCK_ROLES.map(r => r.id === id ? { ...r, ...data } : r);
  },

  deleteRole: async (id: string) => {
    // Soft delete
    if (supabase) {
      const { error } = await supabase.from('job_roles').update({ ativo: false }).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    // Mock
    MOCK_ROLES = MOCK_ROLES.filter(r => r.id !== id);
  },

  // --- CANDIDATOS ---
  submitCandidate: async (data: Omit<Candidate, 'id' | 'created_at' | 'status'>) => {
    if (supabase) {
      const { data: result, error } = await supabase.from('candidates').insert([{
        ...data,
        status: 'novo'
      }]).select().single();

      if (!error && result) return result;
      throw new Error(error?.message || 'Erro ao enviar candidatura');
    }
    // Mock Fallback
    const newCandidate = { ...data, id: Math.random().toString(36).substr(2, 9), created_at: new Date().toISOString(), status: 'novo' as CandidateStatus };
    MOCK_CANDIDATES.unshift(newCandidate);
    return newCandidate;
  },

  getCandidates: async (filters?: { storeId?: string, roleId?: string, status?: string, search?: string }) => {
    if (supabase) {
      let query = supabase.from('candidates').select('*, cidade_loja:stores(*), cargo:job_roles(*)');

      if (filters?.storeId) query = query.eq('cidade_loja_id', filters.storeId);
      if (filters?.roleId) query = query.eq('cargo_id', filters.roleId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.search) query = query.ilike('nome', `%${filters.search}%`);

      const { data, error } = await query;
      if (!error && data) return data;
    }
    // Mock Fallback (Simplificado para brevidade)
    return MOCK_CANDIDATES;
  },

  updateCandidateStatus: async (id: string, status: CandidateStatus) => {
    if (supabase) {
      const { error } = await supabase.from('candidates').update({ status }).eq('id', id);
      return !error;
    }
    MOCK_CANDIDATES = MOCK_CANDIDATES.map(c => c.id === id ? { ...c, status } : c);
    return true;
  },

  // --- DASHBOARD ---
  getStats: async (filters: { dateStart?: string, dateEnd?: string, storeId?: string, roleId?: string } = {}) => {
    if (!supabase) {
      return { total: 0, byStore: [], byRole: [], byTime: [], byHour: [] };
    }

    let query = supabase.from('candidates').select('*, cidade_loja:stores(nome_loja), cargo:job_roles(nome)');

    // Apply Date Filters (Assuming Filter dates are YYYY-MM-DD from UI)
    // We adjust UI dates to cover the full day in UTC to catch relevant records
    if (filters.dateStart) {
      query = query.gte('created_at', `${filters.dateStart}T00:00:00.000Z`); // Start of day UTC (approx, simple filter)
    }
    if (filters.dateEnd) {
      query = query.lte('created_at', `${filters.dateEnd}T23:59:59.999Z`); // End of day UTC
    }

    if (filters.storeId) query = query.eq('cidade_loja_id', filters.storeId);
    if (filters.roleId) query = query.eq('cargo_id', filters.roleId);

    const { data: candidates, error } = await query;
    const items = candidates || [];

    // --- AGGREGATION LOGIC ---

    // Helper to get Brazil Time Date Object
    const getBrazilDate = (utcIsoString: string) => {
      const date = new Date(utcIsoString);
      // Subtract 3 hours manually for aggregation (since we want to count it in BRT bucket)
      date.setHours(date.getHours() - 3);
      return date;
    };

    // 1. By Store
    const byStoreMap = new Map<string, number>();
    // 2. By Role
    const byRoleMap = new Map<string, number>();
    // 3. By Status
    // const byStatusMap = new Map<string, number>(); // Not requested but good to have logic ready

    // 4. By Time (Daily) & By Hour
    const byTimeMap = new Map<string, number>();
    const byHourMap = new Array(24).fill(0).map((_, i) => ({ name: `${i}h`, v: 0 }));

    items.forEach(c => {
      // Store Agg
      const storeName = c.cidade_loja?.nome_loja || 'Indefinido';
      byStoreMap.set(storeName, (byStoreMap.get(storeName) || 0) + 1);

      // Role Agg
      const roleName = c.cargo?.nome || 'Indefinido';
      byRoleMap.set(roleName, (byRoleMap.get(roleName) || 0) + 1);

      // Time Aggs (UTC-3)
      if (c.created_at) {
        const brDate = getBrazilDate(c.created_at);

        // Day (DD/MM)
        const dayStr = brDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        byTimeMap.set(dayStr, (byTimeMap.get(dayStr) || 0) + 1);

        // Hour (0-23)
        const hour = brDate.getHours();
        if (hour >= 0 && hour < 24) {
          byHourMap[hour].v += 1;
        }
      }
    });

    // Format for Recharts
    const byStore = Array.from(byStoreMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const byRole = Array.from(byRoleMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    // Fill missing dates in the range for smoother chart? 
    // For now, simple map to array sorted by date
    // Note: To sort correctly by date using DD/MM string is tricky, but usually works for short periods if same year.
    // Better to sort by timestamp logic if needed, but keeping simple for now.
    const byTime = Array.from(byTimeMap.entries()).map(([name, v]) => ({ name, v }));
    // Ideally sort byTime by actual date, but let's assume map insertion order for "close enough" or sort:
    // (A proper implementation would generate all dates in range and fill 0)

    return {
      total: items.length,
      byStore,
      byRole,
      byTime,
      byHour: byHourMap
    };
  },

  // --- AUTH & USERS ---
  login: async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No user returned');

    const { data: profile, error: profileError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('Error fetching admin profile:', profileError);
      return {
        id: authData.user.id,
        nome: authData.user.user_metadata.full_name || email.split('@')[0],
        email: email,
        role: 'franqueado' as const,
      };
    }

    return profile;
  },

  logout: async () => {
    if (supabase) await supabase.auth.signOut();
  },

  getCurrentUser: async () => {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data: profile } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    return profile || {
      id: session.user.id,
      nome: session.user.email?.split('@')[0] || 'User',
      email: session.user.email || '',
      role: 'franqueado'
    };
  },

  getUsers: async (): Promise<AdminUser[]> => {
    if (supabase) {
      const { data, error } = await supabase.from('admin_users').select('*');
      if (!error && data) return data as AdminUser[];
    }
    return [
      { id: '1', nome: 'Alex Ignacio', email: 'alexignaciomkt@gmail.com.br', role: 'admin_master' }
    ];
  },

  saveUser: async (user: Omit<AdminUser, 'id' | 'created_at'> & { id?: string }) => {
    if (supabase) {
      const { data, error } = await supabase
        .from('admin_users')
        .upsert([{
          id: user.id,
          ...user
        }])
        .select()
        .single();

      if (!error && data) return data;
      throw new Error(error?.message || 'Erro ao salvar usuário');
    }
    return user as AdminUser;
  },

  deleteUser: async (id: string) => {
    if (supabase) {
      const { error } = await supabase.from('admin_users').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
  },

  // --- DELETE CANDIDATE (DB + DRIVE) ---
  deleteCandidate: async (id: string, driveId?: string) => {
    if (!supabase) {
      // Mock deletion
      MOCK_CANDIDATES = MOCK_CANDIDATES.filter(c => c.id !== id);
      return;
    }

    try {
      // 1. Delete from Google Drive (if exists) via Edge Function
      if (driveId) {
        console.log('🗑️ Apagando do Drive:', driveId);

        // Edge Function agora age como proxy para o Apps Script
        const { error: driveError } = await supabase.functions.invoke('upload-resume', {
          body: {
            action: 'delete', // Identifica que é uma deleção
            fileId: driveId
          }
        });

        if (driveError) {
          console.error('❌ Erro ao apagar do Drive (Edge Function):', driveError);
          // Não impedimos a deleção do banco, apenas logamos o erro
          // throw new Error('Erro ao apagar arquivo do Drive'); 
        }
      }

      // 2. Delete from Supabase Database
      console.log('🗑️ Apagando do Banco de Dados:', id);
      const { error: dbError } = await supabase
        .from('candidates')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

    } catch (error: any) {
      console.error('Erro ao excluir candidato:', error);
      throw new Error(error.message || 'Erro ao excluir candidato');
    }
  }
};
