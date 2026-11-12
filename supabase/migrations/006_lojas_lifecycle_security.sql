-- ==============================================================================
-- MIGRATION 006: Gestão do Ciclo de Vida e Segurança de Unidades (Lojas)
-- PROMPT 51: Desativação, reativação, auditoria e proibição categórica de exclusão.
-- ==============================================================================

-- 1. Colunas de auditoria e rastreabilidade para desativação
ALTER TABLE public.lojas 
ADD COLUMN IF NOT EXISTS motivo_desativacao TEXT,
ADD COLUMN IF NOT EXISTS desativado_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS desativado_por UUID REFERENCES auth.users(id);

-- 2. Proibição definitiva de DELETE na tabela lojas
REVOKE DELETE ON public.lojas FROM anon, authenticated, public;
DROP POLICY IF EXISTS rls_lojas_delete ON public.lojas;

CREATE OR REPLACE FUNCTION public.block_lojas_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE EXCEPTION 'EXCLUSAO_PROIBIDA: A exclusão definitiva de unidades é terminantemente proibida. Desative a unidade para preservar o histórico de vagas e candidaturas.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_lojas_deletion ON public.lojas;
CREATE TRIGGER trg_prevent_lojas_deletion
BEFORE DELETE ON public.lojas
FOR EACH ROW
EXECUTE FUNCTION public.block_lojas_deletion();

-- 3. Função RPC para consulta prévia de impacto (vagas e candidaturas vinculadas)
CREATE OR REPLACE FUNCTION public.obter_resumo_desativacao_unidade(p_loja_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_total_vagas INT := 0;
    v_vagas_publicadas INT := 0;
    v_total_candidaturas INT := 0;
    v_loja_nome TEXT;
    v_loja_ativa BOOLEAN;
BEGIN
    IF public.current_user_role() NOT IN ('franqueadora_admin', 'rh_corporativo') THEN
        RAISE EXCEPTION 'ACESSO_NEGADO: Apenas gestores corporativos podem consultar resumo da unidade.';
    END IF;

    SELECT nome, ativa INTO v_loja_nome, v_loja_ativa
    FROM public.lojas
    WHERE id = p_loja_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNIDADE_NAO_ENCONTRADA: Unidade % não existe.', p_loja_id;
    END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE publicada = true)
    INTO v_total_vagas, v_vagas_publicadas
    FROM public.cargos
    WHERE loja_id = p_loja_id;

    SELECT COUNT(*)
    INTO v_total_candidaturas
    FROM public.candidaturas
    WHERE loja_id = p_loja_id;

    RETURN jsonb_build_object(
        'loja_id', p_loja_id,
        'nome', v_loja_nome,
        'ativa', v_loja_ativa,
        'total_vagas', v_total_vagas,
        'vagas_publicadas', v_vagas_publicadas,
        'total_candidaturas', v_total_candidaturas
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.obter_resumo_desativacao_unidade(UUID) TO authenticated;

-- 4. Função RPC atômica para desativação de unidade
CREATE OR REPLACE FUNCTION public.desativar_unidade(p_loja_id UUID, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_vagas_despublicadas INT := 0;
    v_loja_nome TEXT;
    v_dados_anteriores JSONB;
BEGIN
    IF public.current_user_role() != 'franqueadora_admin' THEN
        RAISE EXCEPTION 'ACESSO_NEGADO: Apenas o Gestor Master (franqueadora_admin) tem permissão para desativar unidades.';
    END IF;

    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RAISE EXCEPTION 'MOTIVO_OBRIGATORIO: É necessário informar o motivo da desativação da unidade.';
    END IF;

    SELECT to_jsonb(l.*), nome INTO v_dados_anteriores, v_loja_nome
    FROM public.lojas l
    WHERE id = p_loja_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNIDADE_NAO_ENCONTRADA: Unidade % não encontrada.', p_loja_id;
    END IF;

    -- Desativar a loja e registrar motivo e autor
    UPDATE public.lojas
    SET ativa = false,
        motivo_desativacao = TRIM(p_motivo),
        desativado_em = TIMEZONE('utc', NOW()),
        desativado_por = auth.uid(),
        atualizado_em = TIMEZONE('utc', NOW())
    WHERE id = p_loja_id;

    -- Despublicar vagas ativas daquela unidade (preserva integridade e evita republicação automática)
    WITH despublicadas AS (
        UPDATE public.cargos
        SET publicada = false,
            atualizado_em = TIMEZONE('utc', NOW())
        WHERE loja_id = p_loja_id
          AND publicada = true
        RETURNING id
    )
    SELECT COUNT(*) INTO v_vagas_despublicadas FROM despublicadas;

    -- Auditoria administrativa
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
        'lojas',
        'UPDATE',
        p_loja_id,
        v_dados_anteriores,
        jsonb_build_object(
            'acao', 'desativacao_unidade',
            'ativa', false,
            'motivo', TRIM(p_motivo),
            'vagas_despublicadas', v_vagas_despublicadas,
            'desativado_em', TIMEZONE('utc', NOW())
        ),
        '127.0.0.1'
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'loja_id', p_loja_id,
        'nome', v_loja_nome,
        'ativa', false,
        'motivo', TRIM(p_motivo),
        'vagas_despublicadas', v_vagas_despublicadas
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.desativar_unidade(UUID, TEXT) TO authenticated;

-- 5. Função RPC atômica para reativação de unidade
CREATE OR REPLACE FUNCTION public.reativar_unidade(p_loja_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_loja_nome TEXT;
    v_dados_anteriores JSONB;
BEGIN
    IF public.current_user_role() != 'franqueadora_admin' THEN
        RAISE EXCEPTION 'ACESSO_NEGADO: Apenas o Gestor Master (franqueadora_admin) tem permissão para reativar unidades.';
    END IF;

    SELECT to_jsonb(l.*), nome INTO v_dados_anteriores, v_loja_nome
    FROM public.lojas l
    WHERE id = p_loja_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNIDADE_NAO_ENCONTRADA: Unidade % não encontrada.', p_loja_id;
    END IF;

    -- Reativar a unidade (vagas antigas NÃO são republicadas automaticamente)
    UPDATE public.lojas
    SET ativa = true,
        atualizado_em = TIMEZONE('utc', NOW())
    WHERE id = p_loja_id;

    -- Auditoria administrativa
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
        'lojas',
        'UPDATE',
        p_loja_id,
        v_dados_anteriores,
        jsonb_build_object(
            'acao', 'reativacao_unidade',
            'ativa', true,
            'reativado_em', TIMEZONE('utc', NOW())
        ),
        '127.0.0.1'
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'loja_id', p_loja_id,
        'nome', v_loja_nome,
        'ativa', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reativar_unidade(UUID) TO authenticated;
