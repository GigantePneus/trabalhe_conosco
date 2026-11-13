export type Cargo = string;

export interface ExperienciaProfissional {
  tipo_experiencia?: 'com_experiencia' | 'primeiro_emprego';
  primeiro_emprego?: boolean;
  ultima_empresa?: string;
  cargo_funcao?: string;
  area_atuacao?: string;
  tempo_experiencia?: string;
  principais_atividades?: string;
  habilidades?: string[];
  disponibilidade_inicio?: string;
  observacoes?: string;
}

export interface Candidato {
  id: string;
  nome: string;
  email: string;
  cpf_mascarado?: string;
  telefone: string;
  cidade: string;
  estado?: string;
  vaga_interesse: string;
  escolaridade?: string;
  linkedin_url?: string;
  aceita_outras_vagas?: boolean;
  tecnologias?: string;
  resumo?: string;
  apresentacao_pessoal?: string;
  experiencia_profissional?: ExperienciaProfissional;
  curriculo_url?: string; // URL do MinIO / Google Drive (opcional na V1)
  curriculo_id?: string;
  curriculo_file_id?: string;
  curriculo_nome_arquivo?: string;
  possui_curriculo?: boolean;
  candidatura_id?: string;
  cargo_id?: string | null;
  status_candidatura?: string;
  loja_id?: string;
  loja_nome?: string;
  loja_cidade?: string;
  loja_estado?: string;
  candidato_cidade?: string;
  candidato_estado?: string;
  cidade_residencia?: string;
  unidade_pretendida?: string;
  protocolo?: string;
  dados_formulario?: Record<string, any>;
  created_at: string;
}

export interface VagaOpcao {
  cargo_id?: string | null;
  loja_id?: string | null;
  vaga_interesse: string;
}

export interface ConfigItem {
  id: string;
  nome: string;
  titulo?: string;
  departamento?: string | null;
  loja_id?: string | null;
  ativo?: boolean;
  publicada?: boolean;
  requisitos?: string | null;
  created_at: string;
}

export interface JobLandingContent {
  published: boolean;
  slug: string;
  title: string;
  heroImageUrl: string;
  location: string;
  workModel: string;
  shortDescription: string;
  salary: string;
  benefits: string[];
  responsibilities: string[];
  requirements: string[];
  agentContext: string;
}

export interface KPIStats {
  total: number;
  porCidade: Record<string, number>;
  porCargo: Record<string, number>;
  porDia: Record<string, number>;
}

export interface AccessLog {
  id: string;
  user_id: string;
  user_email: string;
  candidato_id: string;
  action: 'view' | 'download';
  timestamp: string;
}

export type TipoPergunta = 'texto_curto' | 'texto_longo' | 'multipla_escolha' | 'nota';

export interface Pergunta {
  id: string;
  tipo: TipoPergunta;
  enunciado: string;
  opcoes?: string[]; // Usado apenas para múltipla escolha
  obrigatoria: boolean;
}

export interface Pesquisa {
  id: string;
  titulo: string;
  descricao: string;
  slug?: string;
  perguntas: Pergunta[];
  ativa?: boolean;
  is_active?: boolean;
  loja_id?: string | null;
  created_at: string;
}
