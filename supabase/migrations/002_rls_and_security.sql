-- ==============================================================================
-- PROJETO: Trabalhe Conosco — Gigante Pneus
-- ARQUIVO: 002_rls_and_security.sql
-- VERSÃO: v1.3.9 (SQL Puro - PostgreSQL 15+ / Supabase)
-- ==============================================================================

-- 1. FUNÇÕES AUXILIARES DE RLS (SECURITY DEFINER COM SEARCH_PATH ESTÁVEL)

CREATE OR REPLACE FUNCTION public.current_user_profile()
RETURNS public.perfis
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT * 
    FROM public.perfis 
    WHERE id = auth.uid() 
      AND ativo = true 
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role 
    FROM public.perfis 
    WHERE id = auth.uid() 
      AND ativo = true 
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_loja_access(target_loja_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE 
        WHEN public.current_user_role() IS NULL THEN false
        WHEN public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo') THEN true
        WHEN target_loja_id IS NULL THEN false -- Escopo corporativo inacessível a lojas
        ELSE EXISTS (
            SELECT 1 
            FROM public.usuario_lojas ul
            INNER JOIN public.perfis p ON p.id = ul.user_id
            WHERE ul.user_id = auth.uid() 
              AND ul.loja_id = target_loja_id
              AND p.ativo = true
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_vaga(target_loja_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE 
        WHEN public.current_user_role() IS NULL THEN false
        WHEN public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo') THEN true
        WHEN public.current_user_role() = 'gerente' THEN false
        WHEN public.current_user_role() = 'franqueado' THEN (
            target_loja_id IS NOT NULL AND EXISTS (
                SELECT 1 
                FROM public.usuario_lojas ul
                INNER JOIN public.perfis p ON p.id = ul.user_id
                WHERE ul.user_id = auth.uid() 
                  AND ul.loja_id = target_loja_id
                  AND p.ativo = true
            )
        )
        ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_candidatura(target_candidatura_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE 
        WHEN public.current_user_role() IS NULL THEN false
        WHEN public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo') THEN true
        ELSE EXISTS (
            SELECT 1 
            FROM public.candidaturas c
            WHERE c.id = target_candidatura_id
              AND (
                  (c.loja_id IS NOT NULL AND public.user_has_loja_access(c.loja_id))
                  OR EXISTS (
                      SELECT 1 
                      FROM public.candidato_compartilhamentos cc
                      WHERE cc.candidatura_id = c.id
                        AND public.user_has_loja_access(cc.loja_destino_id)
                        AND (cc.expira_em IS NULL OR cc.expira_em > TIMEZONE('utc'::text, NOW()))
                  )
              )
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_update_candidatura(target_candidatura_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE 
        WHEN public.current_user_role() IS NULL THEN false
        WHEN public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo') THEN true
        ELSE EXISTS (
            SELECT 1 
            FROM public.candidaturas c
            WHERE c.id = target_candidatura_id
              AND (
                  (c.loja_id IS NOT NULL AND public.user_has_loja_access(c.loja_id))
                  OR EXISTS (
                      SELECT 1 
                      FROM public.candidato_compartilhamentos cc
                      WHERE cc.candidatura_id = c.id
                        AND public.user_has_loja_access(cc.loja_destino_id)
                        AND cc.permissao = 'triagem'
                        AND (cc.expira_em IS NULL OR cc.expira_em > TIMEZONE('utc'::text, NOW()))
                  )
              )
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_candidato(target_candidato_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE 
        WHEN public.current_user_role() IS NULL THEN false
        WHEN public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo') THEN true
        ELSE EXISTS (
            SELECT 1 
            FROM public.candidaturas c
            WHERE c.candidato_id = target_candidato_id
              AND public.can_read_candidatura(c.id)
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_curriculo(target_curriculo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE 
        WHEN public.current_user_role() IS NULL THEN false
        WHEN public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo') THEN true
        ELSE EXISTS (
            SELECT 1 
            FROM public.candidaturas c
            WHERE c.curriculo_id = target_curriculo_id
              AND public.can_read_candidatura(c.id)
        )
    END;
$$;

-- 2. TRIGGER DE PROTEÇÃO DE CARGOS / VAGAS
CREATE OR REPLACE FUNCTION public.before_update_cargo_protect()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role());
BEGIN
    -- Bypass estrito: apenas para service_role ou superuser de manutenção sem claim de usuário
    IF v_jwt_role = 'service_role' OR (session_user IN ('postgres', 'supabase_admin') AND (v_jwt_role IS NULL OR v_jwt_role = '')) THEN
        RETURN NEW;
    END IF;

    IF public.current_user_role() IS NULL THEN
        RAISE EXCEPTION 'Acesso não autenticado ou sem perfil ativo.';
    END IF;

    IF NEW.id != OLD.id OR NEW.loja_id IS DISTINCT FROM OLD.loja_id OR NEW.criado_em != OLD.criado_em THEN
        RAISE EXCEPTION 'OPERAÇÃO PROIBIDA: A loja vinculada, o ID e a data de criação da vaga são estritamente imutáveis.';
    END IF;

    NEW.atualizado_em := TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_protect_cargo_scope
        BEFORE UPDATE ON public.cargos
        FOR EACH ROW EXECUTE FUNCTION public.before_update_cargo_protect();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. TRIGGER DE ADMINISTRAÇÃO DE PERFIS E VÍNCULOS
CREATE OR REPLACE FUNCTION public.trg_block_client_perfis_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role());
BEGIN
    -- Permitido exclusivamente para service_role ou migração local de superuser sem contexto de cliente
    IF (session_user IN ('postgres', 'supabase_admin') AND (v_jwt_role IS NULL OR v_jwt_role = '')) OR v_jwt_role = 'service_role' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION 'ACESSO NEGADO: Alterações em perfis e vínculos só podem ser realizadas pelo backend administrativo seguro.';
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_protect_perfis_admin
        BEFORE INSERT OR UPDATE OR DELETE ON public.perfis
        FOR EACH ROW EXECUTE FUNCTION public.trg_block_client_perfis_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_protect_usuario_lojas_admin
        BEFORE INSERT OR UPDATE OR DELETE ON public.usuario_lojas
        FOR EACH ROW EXECUTE FUNCTION public.trg_block_client_perfis_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. TRIGGER DE IMUTABILIDADE EM CANDIDATURAS
CREATE OR REPLACE FUNCTION public.before_update_candidatura_protect()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role public.app_role;
    v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role());
BEGIN
    -- Bypass estrito: apenas para service_role ou superuser sem claim de cliente
    IF v_jwt_role = 'service_role' OR (session_user IN ('postgres', 'supabase_admin') AND (v_jwt_role IS NULL OR v_jwt_role = '')) THEN
        RETURN NEW;
    END IF;

    v_role := public.current_user_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Acesso não autenticado ou sem perfil ativo.';
    END IF;

    IF v_role = 'franqueadora_admin' THEN
        NEW.atualizado_em := TIMEZONE('utc'::text, NOW());
        RETURN NEW;
    END IF;

    -- Bloqueio estrito de campos estruturais e de IA
    IF NEW.id != OLD.id OR
       NEW.candidato_id != OLD.candidato_id OR
       NEW.loja_id IS DISTINCT FROM OLD.loja_id OR
       NEW.cargo_id IS DISTINCT FROM OLD.cargo_id OR
       NEW.curriculo_id IS DISTINCT FROM OLD.curriculo_id OR
       NEW.vaga_interesse != OLD.vaga_interesse OR
       NEW.criado_em != OLD.criado_em OR
       NEW.pontuacao_ia IS DISTINCT FROM OLD.pontuacao_ia OR
       NEW.resumo_ia IS DISTINCT FROM OLD.resumo_ia OR
       NEW.parecer_ia IS DISTINCT FROM OLD.parecer_ia OR
       NEW.classificacao_ia IS DISTINCT FROM OLD.classificacao_ia OR
       NEW.habilidades_identificadas IS DISTINCT FROM OLD.habilidades_identificadas OR
       NEW.dados_formulario IS DISTINCT FROM OLD.dados_formulario OR
       NEW.dados_extras IS DISTINCT FROM OLD.dados_extras THEN
        RAISE EXCEPTION 'OPERAÇÃO PROIBIDA: Gerentes e colaboradores só podem atualizar campos operacionais (status e observações).';
    END IF;

    -- Bloqueio de reabertura de candidaturas encerradas
    IF OLD.status IN ('Aprovado', 'Reprovado', 'Desistente') AND NEW.status != OLD.status AND v_role != 'rh_corporativo' THEN
        RAISE EXCEPTION 'OPERAÇÃO PROIBIDA: Candidatura finalizada não pode ter seu status alterado por usuários de unidade.';
    END IF;

    NEW.atualizado_em := TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_protect_candidatura_scope
        BEFORE UPDATE ON public.candidaturas
        FOR EACH ROW EXECUTE FUNCTION public.before_update_candidatura_protect();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. RPC ÚNICA E SEGURA: ATUALIZAR STATUS CANDIDATURA (Revalidação pós-lock e JSONB)
-- Este é o ÚNICO caminho autorizado de atualização de candidaturas para todos os usuários autenticados.
CREATE OR REPLACE FUNCTION public.atualizar_status_candidatura(
    p_candidatura_id UUID,
    p_novo_status VARCHAR(50),
    p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_candidatura RECORD;
    v_role public.app_role;
BEGIN
    -- 1. Validação inicial de formato e status permitido
    IF p_novo_status NOT IN ('Recebido', 'Em Triagem', 'Entrevista Agendada', 'Aprovado', 'Reprovado', 'Desistente', 'Banco de Talentos') THEN
        RAISE EXCEPTION 'DADO INVÁLIDO: Status informado (%) não é reconhecido pelo sistema.', p_novo_status;
    END IF;

    -- 2. Lock de linha exclusivo (evita race conditions entre triagens simultâneas)
    SELECT * INTO v_candidatura
    FROM public.candidaturas 
    WHERE id = p_candidatura_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NÃO ENCONTRADO: Candidatura com id % não existe.', p_candidatura_id;
    END IF;

    -- 3. REVALIDAÇÃO PÓS-LOCK: confirma permissão efetiva com o estado mais recente
    IF NOT public.can_update_candidatura(p_candidatura_id) THEN
        RAISE EXCEPTION 'ACESSO NEGADO: Usuário não tem permissão para alterar esta candidatura.';
    END IF;

    v_role := public.current_user_role();

    -- 4. Validação de candidatura finalizada
    IF v_candidatura.status IN ('Aprovado', 'Reprovado', 'Desistente') AND v_role NOT IN ('franqueadora_admin', 'rh_corporativo') THEN
        RAISE EXCEPTION 'OPERAÇÃO PROIBIDA: Candidatura finalizada não pode ser alterada por colaboradores de unidade.';
    END IF;

    -- 5. Execução do UPDATE operacional
    UPDATE public.candidaturas
    SET 
        status = p_novo_status,
        observacoes_operacionais = COALESCE(p_observacoes, observacoes_operacionais),
        atualizado_em = TIMEZONE('utc'::text, NOW())
    WHERE id = p_candidatura_id;

    RETURN jsonb_build_object(
        'sucesso', true, 
        'candidatura_id', p_candidatura_id, 
        'status_anterior', v_candidatura.status,
        'status_novo', p_novo_status,
        'atualizado_em', TIMEZONE('utc'::text, NOW())
    );
END;
$$;

-- 6. HABILITAÇÃO EXPLÍCITA DE RLS EM TODAS AS TABELAS
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidato_curriculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidato_compartilhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatura_pendencias_identidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesquisas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso_curriculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_administrativa ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS RLS ESPECÍFICAS (DEFINIÇÃO CLARA E ISOLADA POR COMANDO)

-- Lojas: SELECT governado por user_has_loja_access; mutações cirurgicamente separadas
CREATE POLICY rls_lojas_select ON public.lojas
    FOR SELECT TO authenticated
    USING (public.user_has_loja_access(id));

CREATE POLICY rls_lojas_insert ON public.lojas
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() = 'franqueadora_admin');

CREATE POLICY rls_lojas_update ON public.lojas
    FOR UPDATE TO authenticated
    USING (public.current_user_role() = 'franqueadora_admin')
    WITH CHECK (public.current_user_role() = 'franqueadora_admin');

CREATE POLICY rls_lojas_delete ON public.lojas
    FOR DELETE TO authenticated
    USING (public.current_user_role() = 'franqueadora_admin');

-- Perfis
CREATE POLICY rls_perfis_select ON public.perfis
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() 
        OR public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo')
    );

-- Cargos (RLS separando SELECT e Mutações)
CREATE POLICY rls_cargos_select ON public.cargos
    FOR SELECT TO authenticated
    USING (public.user_has_loja_access(loja_id));

CREATE POLICY rls_cargos_insert ON public.cargos
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_vaga(loja_id));

CREATE POLICY rls_cargos_update ON public.cargos
    FOR UPDATE TO authenticated
    USING (public.can_manage_vaga(loja_id))
    WITH CHECK (public.can_manage_vaga(loja_id));

CREATE POLICY rls_cargos_delete ON public.cargos
    FOR DELETE TO authenticated
    USING (public.can_manage_vaga(loja_id));

-- Candidatos
CREATE POLICY rls_candidatos_select ON public.candidatos
    FOR SELECT TO authenticated
    USING (public.can_read_candidato(id));

-- Candidaturas: Leitura via RLS.
-- MUTAÇÃO VIA TABELA BASE: Bloqueada para todos os clientes authenticated (inclusive franqueadora_admin).
-- Toda mutação deve ocorrer exclusivamente através da RPC atualizar_status_candidatura.
CREATE POLICY rls_candidaturas_select ON public.candidaturas
    FOR SELECT TO authenticated
    USING (public.can_read_candidatura(id));

-- Candidato Currículos
CREATE POLICY rls_candidato_curriculos_select ON public.candidato_curriculos
    FOR SELECT TO authenticated
    USING (public.can_read_curriculo(id));

-- Compartilhamentos: Mutações isoladas (INSERT, UPDATE, DELETE)
CREATE POLICY rls_compartilhamentos_select ON public.candidato_compartilhamentos
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo')
        OR public.user_has_loja_access(loja_destino_id)
    );

CREATE POLICY rls_compartilhamentos_insert ON public.candidato_compartilhamentos
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo'));

CREATE POLICY rls_compartilhamentos_update ON public.candidato_compartilhamentos
    FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo'))
    WITH CHECK (public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo'));

CREATE POLICY rls_compartilhamentos_delete ON public.candidato_compartilhamentos
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo'));

-- Pesquisas e Respostas: Mutações isoladas (INSERT, UPDATE, DELETE)
CREATE POLICY rls_pesquisas_select ON public.pesquisas
    FOR SELECT TO authenticated
    USING (public.user_has_loja_access(loja_id));

CREATE POLICY rls_pesquisas_insert ON public.pesquisas
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_vaga(loja_id));

CREATE POLICY rls_pesquisas_update ON public.pesquisas
    FOR UPDATE TO authenticated
    USING (public.can_manage_vaga(loja_id))
    WITH CHECK (public.can_manage_vaga(loja_id));

CREATE POLICY rls_pesquisas_delete ON public.pesquisas
    FOR DELETE TO authenticated
    USING (public.can_manage_vaga(loja_id));

CREATE POLICY rls_respostas_select ON public.respostas
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo')
        OR EXISTS (
            SELECT 1 FROM public.pesquisas p 
            WHERE p.id = pesquisa_id AND public.user_has_loja_access(p.loja_id)
        )
    );

-- Pendências de Identidade: Acesso exclusivo ao RH Corporativo e Franqueadora Admin
CREATE POLICY rls_pendencias_select ON public.candidatura_pendencias_identidade
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo'));

CREATE POLICY rls_pendencias_update ON public.candidatura_pendencias_identidade
    FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo'))
    WITH CHECK (public.current_user_role() IN ('franqueadora_admin', 'rh_corporativo'));

-- Logs e Auditoria
CREATE POLICY rls_logs_select ON public.logs_acesso_curriculos
    FOR SELECT TO authenticated
    USING (public.current_user_role() = 'franqueadora_admin');

CREATE POLICY rls_auditoria_adm_select ON public.auditoria_administrativa
    FOR SELECT TO authenticated
    USING (public.current_user_role() = 'franqueadora_admin');

-- 8. MATRIZ DE CONCESSÃO E REVOGAÇÃO DE PRIVILÉGIOS (GRANTS E DEFAULTS)

-- Revogação de privilégios padrão globais de funções para evitar concessão acidental de EXECUTE
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;

-- Definição explícita do owner das views públicas como postgres
-- Isso assegura que a view opere com a semântica de privilégios do owner administrativo,
-- permitindo a leitura pública de lojas_publicas e cargos_publicos sem necessidade de
-- conceder SELECT nas tabelas base lojas ou cargos para anon.
ALTER VIEW public.lojas_publicas OWNER TO postgres;
ALTER VIEW public.cargos_publicos OWNER TO postgres;

-- Público (Anon): Somente views de divulgação segura
GRANT SELECT ON public.lojas_publicas TO anon, authenticated;
GRANT SELECT ON public.cargos_publicos TO anon, authenticated;

-- Usuários Autenticados:
-- TABELA LOJAS: Concedido ALL para authenticated, sendo o controle de quem pode gravar
-- estritamente imposto pelas policies rls_lojas_insert/update/delete (apenas franqueadora_admin pode escrever).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lojas TO authenticated;

-- DEMAIS TABELAS:
GRANT SELECT ON public.perfis TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargos TO authenticated;
REVOKE SELECT ON public.candidatos FROM authenticated;
GRANT SELECT (
    id, nome, email, cpf_mascarado, telefone, cidade, estado, 
    escolaridade, linkedin_url, aceita_outras_vagas, consentimento_lgpd, 
    consentimento_versao, consentimento_em, retencao_meses, retencao_ate, 
    origem, criado_em, atualizado_em
) ON public.candidatos TO authenticated;
GRANT SELECT ON public.candidaturas TO authenticated;
REVOKE UPDATE, INSERT, DELETE ON public.candidaturas FROM authenticated; -- Caminho único: RPC
GRANT SELECT ON public.candidato_curriculos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidato_compartilhamentos TO authenticated;
GRANT SELECT, UPDATE ON public.candidatura_pendencias_identidade TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pesquisas TO authenticated;
GRANT SELECT ON public.respostas TO authenticated;
GRANT SELECT ON public.logs_acesso_curriculos TO authenticated;
GRANT SELECT ON public.auditoria_administrativa TO authenticated;

-- RPCs seguras com GRANT EXECUTE cirúrgico
GRANT EXECUTE ON FUNCTION public.uuid_generate_v4() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_loja_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_vaga(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_candidatura(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_update_candidatura(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_candidato(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_curriculo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_candidatura(UUID, VARCHAR, TEXT) TO authenticated;
