
export type UserRole = 'admin_master' | 'franqueado';

export type CandidateStatus = 'novo' | 'visualizado' | 'em análise' | 'aprovado' | 'descartado';

export interface Store {
  id: string;
  nome_loja: string;
  cidade: string;
  estado: string;
  ativo: boolean;
}

export interface JobRole {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface Candidate {
  id: string;
  nome: string;
  telefone: string;
  cidade_loja_id: string;
  cargo_id: string;
  apresentacao: string;
  curriculo_url: string;
  curriculo_drive_id: string;
  status: CandidateStatus;
  created_at: string;
  // Joins
  cidade_loja?: Store;
  cargo?: JobRole;
}

export interface AdminUser {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  lojas_permitidas?: string[]; // IDs das lojas autorizadas
  cargos_permitidos?: string[]; // IDs dos cargos autorizados
}

export interface Permission {
  id: string;
  usuario_id: string;
  cidade_loja_id?: string;
  cargo_id?: string;
}
