-- ==============================================================================
-- PROJETO: Trabalhe Conosco — Gigante Pneus
-- ARQUIVO: 001_initial_schema.sql
-- VERSÃO: v1.3.9 (SQL Puro - PostgreSQL 15+ / Supabase)
-- ==============================================================================

-- 1. EXTENSÕES E FUNÇÕES NATIVAS DE UUID
-- No PostgreSQL moderno (v13+), gen_random_uuid() é nativo do core.
-- Asseguramos suporte nativo e fallback gracioso caso extensões adicionais estejam ou não presentes.
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS UUID
LANGUAGE sql
VOLATILE
AS $$
    SELECT gen_random_uuid();
$$;

-- 2. TIPOS CUSTOMIZADOS (ENUMS)
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM (
        'franqueadora_admin',
        'rh_corporativo',
        'franqueado',
        'gerente'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.drive_upload_status AS ENUM (
        'iniciado',
        'concluido',
        'falho',
        'expirado',
        'reconciliado_removido'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.compartilhamento_permissao AS ENUM (
        'leitura',
        'triagem'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. TABELA: CONFIGURACOES_SISTEMA
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
    chave VARCHAR(100) PRIMARY KEY,
    valor JSONB NOT NULL,
    descricao TEXT,
    atualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
    ('lgpd_retencao_padrao_meses', '12'::jsonb, 'Prazo padrão de retenção de dados cadastrais conforme consentimento'),
    ('termo_lgpd_versao_atual', '"2026.1"'::jsonb, 'Versão vigente dos termos de privacidade e LGPD'),
    ('max_upload_size_bytes', '4194304'::jsonb, 'Limite de tamanho do arquivo de currículo: 4,0 MB (4.194.304 bytes)')
ON CONFLICT (chave) DO NOTHING;

-- 4. TABELA: LOJAS
CREATE TABLE IF NOT EXISTS public.lojas (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    estado VARCHAR(2) NOT NULL,
    google_drive_folder_id VARCHAR(120), -- Protegido, invisível ao público
    email_contato VARCHAR(255),
    telefone_contato VARCHAR(50),
    ativa BOOLEAN DEFAULT true NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. TABELA: PERFIS (Vinculado estritamente a auth.users)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role public.app_role NOT NULL,
    ativo BOOLEAN DEFAULT true NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. TABELA: USUARIO_LOJAS
CREATE TABLE IF NOT EXISTS public.usuario_lojas (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_usuario_loja UNIQUE (user_id, loja_id)
);

-- 7. TABELA: CARGOS / VAGAS (com campos ativo e publicada separados)
CREATE TABLE IF NOT EXISTS public.cargos (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    titulo VARCHAR(150) NOT NULL,
    departamento VARCHAR(100),
    descricao TEXT,
    requisitos TEXT,
    loja_id UUID REFERENCES public.lojas(id) ON DELETE RESTRICT, -- RESTRICT preserva histórico
    tipo_vaga VARCHAR(50) DEFAULT 'Presencial',
    ativo BOOLEAN DEFAULT true NOT NULL,       -- Cadastro interno ativo
    publicada BOOLEAN DEFAULT false NOT NULL,  -- Divulgação pública ativa
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_cargo_loja_id UNIQUE (id, loja_id)
);

-- 8. TABELA: CANDIDATOS (Base Cadastral Civil Centralizada)
CREATE TABLE IF NOT EXISTS public.candidatos (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    cpf_hash VARCHAR(64) NOT NULL UNIQUE,
    cpf_mascarado VARCHAR(14) NOT NULL,
    cpf_criptografado TEXT,
    telefone VARCHAR(30) NOT NULL,
    cidade VARCHAR(100),
    estado VARCHAR(2),
    escolaridade VARCHAR(100),
    linkedin_url VARCHAR(255),
    aceita_outras_vagas BOOLEAN NOT NULL DEFAULT false,
    consentimento_lgpd BOOLEAN NOT NULL DEFAULT false,
    consentimento_versao VARCHAR(50) NOT NULL,
    consentimento_em TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    retencao_meses INTEGER NOT NULL DEFAULT 12,
    retencao_ate TIMESTAMPTZ NOT NULL,
    origem VARCHAR(50) DEFAULT 'Portal Trabalhe Conosco',
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 9. TABELA: CANDIDATO_CURRICULOS (Arquivos no Google Drive - N:M com Candidaturas)
CREATE TABLE IF NOT EXISTS public.candidato_curriculos (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    candidato_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    google_drive_file_id VARCHAR(150) NOT NULL UNIQUE,
    google_drive_folder_id VARCHAR(150),
    nome_arquivo VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    tamanho_bytes BIGINT NOT NULL,
    md5_checksum VARCHAR(64),
    upload_status public.drive_upload_status DEFAULT 'concluido' NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT chk_curriculo_mime CHECK (
        mime_type IN (
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    ),
    CONSTRAINT chk_curriculo_tamanho CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10485760)
);

-- 10. TABELA: CANDIDATURAS (Inscrições por Vaga e Unidade)
CREATE TABLE IF NOT EXISTS public.candidaturas (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
    cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
    loja_id UUID REFERENCES public.lojas(id) ON DELETE RESTRICT, -- NULL = Corporativo
    curriculo_id UUID REFERENCES public.candidato_curriculos(id) ON DELETE SET NULL,
    vaga_interesse VARCHAR(150) NOT NULL,
    status VARCHAR(50) DEFAULT 'Recebido' NOT NULL,
    observacoes_operacionais TEXT,
    pontuacao_ia INTEGER DEFAULT 0,
    resumo_ia TEXT,
    parecer_ia TEXT,
    classificacao_ia VARCHAR(50),
    habilidades_identificadas JSONB DEFAULT '[]'::jsonb,
    dados_formulario JSONB NOT NULL DEFAULT '{}'::jsonb,
    dados_extras JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_candidato_cargo UNIQUE (candidato_id, cargo_id),
    CONSTRAINT chk_status_candidatura CHECK (
        status IN (
            'Recebido',
            'Em Triagem',
            'Entrevista Agendada',
            'Aprovado',
            'Reprovado',
            'Desistente',
            'Banco de Talentos'
        )
    )
);

-- Unicidade estrita para candidaturas espontâneas ativas por loja
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_candidato_loja_espontanea 
ON public.candidaturas (candidato_id, loja_id) 
WHERE cargo_id IS NULL AND status IN ('Recebido', 'Em Triagem', 'Banco de Talentos');

-- Trigger de Integridade Estrita entre cargo_id e loja_id da candidatura
CREATE OR REPLACE FUNCTION public.trg_validate_candidatura_cargo_loja()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cargo_loja_id UUID;
    v_cargo_titulo VARCHAR(150);
BEGIN
    IF NEW.cargo_id IS NOT NULL THEN
        SELECT loja_id, titulo INTO v_cargo_loja_id, v_cargo_titulo
        FROM public.cargos
        WHERE id = NEW.cargo_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INTEGRIDADE VIOLADA: Vaga especificada (cargo_id %) não existe.', NEW.cargo_id;
        END IF;

        IF v_cargo_loja_id IS DISTINCT FROM NEW.loja_id THEN
            RAISE EXCEPTION 'INTEGRIDADE VIOLADA: A loja da candidatura (%) diverge da loja cadastrada na vaga (%).', NEW.loja_id, v_cargo_loja_id;
        END IF;

        IF NEW.vaga_interesse IS NULL OR NEW.vaga_interesse = '' THEN
            NEW.vaga_interesse := v_cargo_titulo;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_check_candidatura_cargo_loja
        BEFORE INSERT OR UPDATE OF cargo_id, loja_id ON public.candidaturas
        FOR EACH ROW EXECUTE FUNCTION public.trg_validate_candidatura_cargo_loja();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 11. TABELA: CANDIDATO_COMPARTILHAMENTOS
CREATE TABLE IF NOT EXISTS public.candidato_compartilhamentos (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
    candidatura_id UUID NOT NULL REFERENCES public.candidaturas(id) ON DELETE CASCADE,
    loja_destino_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    compartilhado_por UUID NOT NULL REFERENCES public.perfis(id),
    permissao public.compartilhamento_permissao NOT NULL DEFAULT 'leitura',
    motivo TEXT,
    expira_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_candidatura_loja_destino UNIQUE (candidatura_id, loja_destino_id)
);

-- 12. TABELA: CANDIDATURA_PENDENCIAS_IDENTIDADE (Fila Segura de Divergências)
CREATE TABLE IF NOT EXISTS public.candidatura_pendencias_identidade (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    protocolo VARCHAR(50) NOT NULL UNIQUE,
    tipo_conflito VARCHAR(50) NOT NULL,
    candidato_existente_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    cpf_hash VARCHAR(64) NOT NULL,
    cpf_mascarado VARCHAR(14) NOT NULL,
    cpf_criptografado TEXT,
    dados_submissao JSONB NOT NULL,
    curriculo_id UUID REFERENCES public.candidato_curriculos(id) ON DELETE SET NULL,
    vagas_pretendidas JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'Pendente',
    resolvido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolvido_em TIMESTAMPTZ,
    parecer_resolucao TEXT,
    ip_origem VARCHAR(64),
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT chk_status_pendencia CHECK (
        status IN ('Pendente', 'Resolvido_Associado', 'Resolvido_Novo_Candidato', 'Descartado')
    )
);

-- 12. TABELA: PESQUISAS
CREATE TABLE IF NOT EXISTS public.pesquisas (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
    perguntas JSONB NOT NULL DEFAULT '[]'::jsonb,
    ativa BOOLEAN DEFAULT true NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 13. TABELA: RESPOSTAS DE PESQUISAS
CREATE TABLE IF NOT EXISTS public.respostas (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    pesquisa_id UUID NOT NULL REFERENCES public.pesquisas(id) ON DELETE CASCADE,
    candidato_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    candidatura_id UUID REFERENCES public.candidaturas(id) ON DELETE SET NULL,
    respostas_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 14. TABELA: UPLOAD_TRANSACOES (Gestão de Sessões do Google Drive)
CREATE TABLE IF NOT EXISTS public.upload_transacoes (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    sessao_token_hash VARCHAR(64) NOT NULL UNIQUE,
    google_drive_file_id VARCHAR(150),
    google_drive_folder_id VARCHAR(150),
    nome_arquivo VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    tamanho_bytes BIGINT NOT NULL,
    status public.drive_upload_status DEFAULT 'iniciado' NOT NULL,
    tentativas_reconciliacao INTEGER DEFAULT 0 NOT NULL,
    erro_reconciliacao TEXT,
    ip_origem VARCHAR(64),
    expira_em TIMESTAMPTZ NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    concluido_em TIMESTAMPTZ
);

-- 15. TABELA: LOGS_ACESSO_CURRICULOS (Append-Only)
CREATE TABLE IF NOT EXISTS public.logs_acesso_curriculos (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    candidato_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    curriculo_id UUID REFERENCES public.candidato_curriculos(id) ON DELETE SET NULL,
    candidato_email_hash VARCHAR(64) NOT NULL,
    google_drive_file_id VARCHAR(150) NOT NULL,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_role VARCHAR(50),
    ip_origem VARCHAR(64),
    user_agent TEXT,
    motivo_acesso VARCHAR(150) DEFAULT 'Triagem de Candidato',
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 16. TABELA: AUDITORIA_ADMINISTRATIVA (Append-Only)
CREATE TABLE IF NOT EXISTS public.auditoria_administrativa (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    executado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tabela_afetada VARCHAR(100) NOT NULL,
    operacao VARCHAR(20) NOT NULL,
    registro_id UUID,
    dados_anteriores JSONB,
    dados_novos JSONB,
    ip_origem VARCHAR(64),
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 17. ÍNDICES DE PERFORMANCE E INTEGRIDADE
CREATE INDEX IF NOT EXISTS idx_candidatos_email ON public.candidatos(email);
CREATE INDEX IF NOT EXISTS idx_candidatos_cpf_hash ON public.candidatos(cpf_hash);
CREATE INDEX IF NOT EXISTS idx_candidaturas_candidato ON public.candidaturas(candidato_id);
CREATE INDEX IF NOT EXISTS idx_candidaturas_loja ON public.candidaturas(loja_id);
CREATE INDEX IF NOT EXISTS idx_candidaturas_curriculo ON public.candidaturas(curriculo_id);
CREATE INDEX IF NOT EXISTS idx_candidato_curriculos_cand ON public.candidato_curriculos(candidato_id);
CREATE INDEX IF NOT EXISTS idx_candidato_curriculos_drive ON public.candidato_curriculos(google_drive_file_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_identidade_status ON public.candidatura_pendencias_identidade(status, criado_em);
CREATE INDEX IF NOT EXISTS idx_usuario_lojas_user ON public.usuario_lojas(user_id);
CREATE INDEX IF NOT EXISTS idx_usuario_lojas_loja ON public.usuario_lojas(loja_id);
CREATE INDEX IF NOT EXISTS idx_upload_transacoes_status ON public.upload_transacoes(status, expira_em);
CREATE INDEX IF NOT EXISTS idx_logs_acesso_candidato ON public.logs_acesso_curriculos(candidato_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON public.auditoria_administrativa(tabela_afetada, criado_em);

-- 18. TRIGGERS DE IMUTABILIDADE PARA AUDITORIA (Append-Only)
CREATE OR REPLACE FUNCTION public.trg_block_audit_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'VIOLAÇÃO DE AUDITORIA: Registros de auditoria são estritamente imutáveis.';
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_protect_logs_acesso_curriculos
        BEFORE UPDATE OR DELETE ON public.logs_acesso_curriculos
        FOR EACH ROW EXECUTE FUNCTION public.trg_block_audit_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_protect_auditoria_administrativa
        BEFORE UPDATE OR DELETE ON public.auditoria_administrativa
        FOR EACH ROW EXECUTE FUNCTION public.trg_block_audit_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger de Registro Automático de Operações Administrativas Críticas (lojas, cargos)
CREATE OR REPLACE FUNCTION public.trg_auto_audit_admin_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_operacao VARCHAR(20) := TG_OP;
    v_registro_id UUID;
    v_old JSONB := NULL;
    v_new JSONB := NULL;
BEGIN
    IF v_operacao = 'DELETE' THEN
        v_registro_id := OLD.id;
        v_old := to_jsonb(OLD);
    ELSIF v_operacao = 'INSERT' THEN
        v_registro_id := NEW.id;
        v_new := to_jsonb(NEW);
    ELSE
        v_registro_id := NEW.id;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    END IF;

    -- Mascaramento de segurança: nunca persistir credenciais/chaves internas em texto puro nos logs
    IF TG_TABLE_NAME = 'lojas' THEN
        IF v_old ? 'google_drive_folder_id' AND v_old->>'google_drive_folder_id' IS NOT NULL THEN
            v_old := v_old || jsonb_build_object('google_drive_folder_id', '[MASCARADO_SEGURANCA]');
        END IF;
        IF v_new ? 'google_drive_folder_id' AND v_new->>'google_drive_folder_id' IS NOT NULL THEN
            v_new := v_new || jsonb_build_object('google_drive_folder_id', '[MASCARADO_SEGURANCA]');
        END IF;
    END IF;

    INSERT INTO public.auditoria_administrativa (
        executado_por,
        tabela_afetada,
        operacao,
        registro_id,
        dados_anteriores,
        dados_novos,
        ip_origem
    ) VALUES (
        auth.uid(),
        TG_TABLE_NAME,
        v_operacao,
        v_registro_id,
        v_old,
        v_new,
        inet_client_addr()::text
    );

    IF v_operacao = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FALHA DE AUDITORIA: Falha ao registrar trilha administrativa: %', SQLERRM;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_lojas_mutations
        AFTER INSERT OR UPDATE OR DELETE ON public.lojas
        FOR EACH ROW EXECUTE FUNCTION public.trg_auto_audit_admin_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_cargos_mutations
        AFTER INSERT OR UPDATE OR DELETE ON public.cargos
        FOR EACH ROW EXECUTE FUNCTION public.trg_auto_audit_admin_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 19. VIEWS PÚBLICAS SEGURAS (SECURITY DEFINER PADRÃO POSTGRES DO OWNER)
-- NOTA ARQUITETURAL: Criadas com a semântica padrão do PostgreSQL (security definer do owner postgres).
-- Isso permite expor uma projeção pública estrita (sem google_drive_folder_id) para visitantes anon
-- sem exigir que o papel anon tenha SELECT direto na tabela base lojas ou cargos protegidos por RLS.
CREATE OR REPLACE VIEW public.lojas_publicas AS
SELECT 
    id,
    nome,
    cidade,
    estado,
    ativa
FROM public.lojas
WHERE ativa = true;

CREATE OR REPLACE VIEW public.cargos_publicos AS
SELECT 
    c.id,
    c.titulo,
    c.departamento,
    c.descricao,
    c.requisitos,
    c.loja_id,
    l.nome AS loja_nome,
    l.cidade AS loja_cidade,
    l.estado AS loja_estado,
    c.tipo_vaga,
    c.ativo,
    c.publicada
FROM public.cargos c
LEFT JOIN public.lojas l ON l.id = c.loja_id
WHERE c.ativo = true 
  AND c.publicada = true
  AND (c.loja_id IS NULL OR l.ativa = true);
