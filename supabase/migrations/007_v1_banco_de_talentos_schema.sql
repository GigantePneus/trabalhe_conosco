-- ==============================================================================
-- MIGRATION 007: V1 DEFINITIVA DO BANCO DE TALENTOS GIGANTE PNEUS
-- APRESENTAÇÃO PESSOAL OBRIGATÓRIA (80-2000 CHARS), CURRÍCULO OPCIONAL E
-- EXPERIÊNCIA PROFISSIONAL ESTRUTURADA COM RPC VERSIONADA (V2)
--
-- DATA DE REVISÃO: 13/11/2026
-- ESTRATÉGIA DE SEGURANÇA:
-- 1. Criação da RPC versionada 'registrar_candidatura_transacional_v2'.
-- 2. Preservação integral da RPC legada 'registrar_candidatura_transacional' (v1).
-- 3. NENHUM uso de DROP FUNCTION ou CASCADE - risco de regressão zero.
-- 4. PostgREST sem ambiguidade de sobrecarga de assinaturas.
-- ==============================================================================

BEGIN;

-- 1. Evolução do Schema da tabela 'candidaturas'
ALTER TABLE public.candidaturas 
ADD COLUMN IF NOT EXISTS apresentacao_pessoal TEXT,
ADD COLUMN IF NOT EXISTS experiencia_profissional JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Restrição de tamanho na apresentação pessoal (permite NULL para compatibilidade com RPC legada v1 e registros históricos)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_candidaturas_apresentacao_length'
    ) THEN
        ALTER TABLE public.candidaturas 
        ADD CONSTRAINT chk_candidaturas_apresentacao_length 
        CHECK (
            apresentacao_pessoal IS NULL OR (
                LENGTH(TRIM(apresentacao_pessoal)) >= 80 AND 
                LENGTH(apresentacao_pessoal) <= 2000
            )
        );
    END IF;
END $$;

-- 3. Criação da Função Transacional Versionada V2
CREATE OR REPLACE FUNCTION public.registrar_candidatura_transacional_v2(
    p_nome VARCHAR,
    p_email VARCHAR,
    p_cpf_limpo VARCHAR,
    p_cpf_hash VARCHAR,
    p_cpf_mascarado VARCHAR,
    p_cpf_criptografado TEXT,
    p_telefone VARCHAR,
    p_cidade VARCHAR,
    p_estado VARCHAR,
    p_escolaridade VARCHAR,
    p_linkedin_url VARCHAR,
    p_aceita_outras_vagas BOOLEAN,
    p_consentimento_lgpd BOOLEAN,
    p_vagas JSONB,
    p_apresentacao_pessoal TEXT,
    p_experiencia_profissional JSONB DEFAULT '{}'::jsonb,
    p_google_drive_file_id VARCHAR DEFAULT NULL,
    p_google_drive_folder_id VARCHAR DEFAULT NULL,
    p_nome_arquivo VARCHAR DEFAULT NULL,
    p_mime_type VARCHAR DEFAULT NULL,
    p_tamanho_bytes BIGINT DEFAULT NULL,
    p_md5_checksum VARCHAR DEFAULT NULL,
    p_protocolo VARCHAR DEFAULT NULL,
    p_ip_origem VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_candidato_id UUID := NULL;
    v_curriculo_id UUID := NULL;
    v_upload_id UUID := NULL;
    v_sessao_hash VARCHAR(64);
    
    -- Diagnóstico de conflitos cadastrais de identidade
    v_cand_por_cpf_id UUID := NULL;
    v_cand_por_cpf_email VARCHAR(255) := NULL;
    v_cand_por_cpf_nome VARCHAR(150) := NULL;
    
    v_cand_por_email_id UUID := NULL;
    v_cand_por_email_cpf_hash VARCHAR(64) := NULL;
    v_cand_por_email_nome VARCHAR(150) := NULL;

    v_tipo_conflito VARCHAR(50) := NULL;
    v_pendencia_id UUID := NULL;

    -- Iteração de vagas
    v_vaga JSONB;
    v_cargo_id UUID;
    v_loja_id UUID;
    v_vaga_interesse VARCHAR(150);
    v_cargo_loja_id UUID;
    v_cargo_ativo BOOLEAN;
    v_cargo_publicada BOOLEAN;
    v_cargo_titulo VARCHAR(150);
    v_loja_ativa BOOLEAN;
    v_dup_cand_id UUID;
    v_candidatura_id UUID;
    v_total_criadas INTEGER := 0;
    v_vagas_duplicadas TEXT[] := ARRAY[]::TEXT[];
    v_candidaturas_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    -- 1. Validações preliminares obrigatórias de segurança
    IF p_consentimento_lgpd IS NOT TRUE THEN
        RAISE EXCEPTION 'CONSENTIMENTO_LGPD_OBRIGATORIO: Candidato deve consentir com os termos da LGPD.';
    END IF;

    IF p_nome IS NULL OR LENGTH(TRIM(p_nome)) < 2 THEN
        RAISE EXCEPTION 'DADO_INVALIDO: Nome completo é obrigatório (mínimo 2 caracteres).';
    END IF;

    IF p_email IS NULL OR p_email NOT LIKE '%@%.%' THEN
        RAISE EXCEPTION 'DADO_INVALIDO: Endereço de e-mail inválido.';
    END IF;

    IF p_cpf_hash IS NULL OR LENGTH(TRIM(p_cpf_hash)) < 32 THEN
        RAISE EXCEPTION 'DADO_INVALIDO: Hash de identificação do CPF é obrigatório.';
    END IF;

    IF p_cpf_mascarado IS NULL OR LENGTH(TRIM(p_cpf_mascarado)) < 11 THEN
        RAISE EXCEPTION 'DADO_INVALIDO: CPF mascarado é obrigatório.';
    END IF;

    IF p_telefone IS NULL OR LENGTH(TRIM(p_telefone)) < 8 THEN
        RAISE EXCEPTION 'DADO_INVALIDO: Telefone de contato é obrigatório.';
    END IF;

    -- Validação rigorosa da Apresentação Pessoal ("Conte um pouco sobre você")
    IF p_apresentacao_pessoal IS NULL OR LENGTH(TRIM(p_apresentacao_pessoal)) < 80 THEN
        RAISE EXCEPTION 'APRESENTACAO_INSUFICIENTE: A apresentação pessoal deve conter no mínimo 80 caracteres.';
    END IF;

    IF LENGTH(p_apresentacao_pessoal) > 2000 THEN
        RAISE EXCEPTION 'APRESENTACAO_LONGA: A apresentação pessoal não pode exceder 2.000 caracteres.';
    END IF;

    IF p_vagas IS NULL OR jsonb_typeof(p_vagas) != 'array' OR jsonb_array_length(p_vagas) = 0 THEN
        RAISE EXCEPTION 'VAGAS_OBRIGATORIAS: Selecione ao menos uma vaga ou opção de candidatura.';
    END IF;

    -- 2. Lock Consultivo Transacional por CPF Hash (prevenção contra submissões concorrentes)
    PERFORM pg_advisory_xact_lock(hashtext('cpf_' || p_cpf_hash));

    -- 3. Diagnóstico de integridade de identidade civil (CPF vs E-mail)
    SELECT id, email, nome INTO v_cand_por_cpf_id, v_cand_por_cpf_email, v_cand_por_cpf_nome
    FROM public.candidatos
    WHERE cpf_hash = p_cpf_hash;

    SELECT id, cpf_hash, nome INTO v_cand_por_email_id, v_cand_por_email_cpf_hash, v_cand_por_email_nome
    FROM public.candidatos
    WHERE email = LOWER(TRIM(p_email));

    IF (v_cand_por_cpf_id IS NOT NULL AND v_cand_por_cpf_email != LOWER(TRIM(p_email))) OR
       (v_cand_por_email_id IS NOT NULL AND v_cand_por_email_cpf_hash != p_cpf_hash) THEN
        
        IF v_cand_por_cpf_id IS NOT NULL AND v_cand_por_email_id IS NOT NULL THEN
            v_tipo_conflito := 'CPF_E_EMAIL_PERTENCEM_A_CADASTROS_DISTINTOS';
        ELSIF v_cand_por_cpf_id IS NOT NULL THEN
            v_tipo_conflito := 'CPF_EXISTENTE_EMAIL_DIVERGENTE';
        ELSE
            v_tipo_conflito := 'EMAIL_EXISTENTE_CPF_DIVERGENTE';
        END IF;

        -- Se houver currículo anexado no conflito, registra na tabela de currículos
        IF p_google_drive_file_id IS NOT NULL AND p_google_drive_file_id != '' THEN
            INSERT INTO public.candidato_curriculos (
                candidato_id,
                google_drive_file_id,
                google_drive_folder_id,
                nome_arquivo,
                mime_type,
                tamanho_bytes,
                md5_checksum,
                upload_status
            ) VALUES (
                NULL,
                p_google_drive_file_id,
                p_google_drive_folder_id,
                p_nome_arquivo,
                p_mime_type,
                p_tamanho_bytes,
                p_md5_checksum,
                'concluido'
            ) RETURNING id INTO v_curriculo_id;
        END IF;

        INSERT INTO public.candidatura_pendencias_identidade (
            protocolo,
            tipo_conflito,
            candidato_existente_id,
            cpf_hash,
            cpf_mascarado,
            cpf_criptografado,
            dados_submissao,
            curriculo_id,
            vagas_pretendidas,
            status,
            ip_origem
        ) VALUES (
            p_protocolo,
            v_tipo_conflito,
            COALESCE(v_cand_por_cpf_id, v_cand_por_email_id),
            p_cpf_hash,
            p_cpf_mascarado,
            p_cpf_criptografado,
            jsonb_build_object(
                'nome', TRIM(p_nome),
                'email', LOWER(TRIM(p_email)),
                'telefone', TRIM(p_telefone),
                'cidade', TRIM(p_cidade),
                'estado', TRIM(p_estado),
                'escolaridade', TRIM(p_escolaridade),
                'linkedin_url', TRIM(p_linkedin_url),
                'aceita_outras_vagas', p_aceita_outras_vagas,
                'apresentacao_pessoal', TRIM(p_apresentacao_pessoal),
                'experiencia_profissional', p_experiencia_profissional,
                'ip_origem', p_ip_origem,
                'submetido_em', NOW()
            ),
            v_curriculo_id,
            p_vagas,
            'Pendente',
            p_ip_origem
        ) RETURNING id INTO v_pendencia_id;

        RETURN jsonb_build_object(
            'sucesso', true,
            'status_processamento', 'recebido_para_analise',
            'protocolo', p_protocolo,
            'curriculo_id', v_curriculo_id,
            'mensagem', 'Sua solicitação foi recebida com sucesso e está em análise pelo departamento de Recursos Humanos.'
        );
    END IF;

    -- 4. Gravação ou Reutilização do Cadastro Central do Candidato
    IF v_cand_por_cpf_id IS NULL AND v_cand_por_email_id IS NULL THEN
        INSERT INTO public.candidatos (
            nome,
            email,
            cpf_hash,
            cpf_mascarado,
            cpf_criptografado,
            telefone,
            cidade,
            estado,
            escolaridade,
            linkedin_url,
            aceita_outras_vagas,
            consentimento_lgpd,
            consentimento_versao,
            consentimento_em,
            retencao_meses,
            retencao_ate,
            origem
        ) VALUES (
            TRIM(p_nome),
            LOWER(TRIM(p_email)),
            p_cpf_hash,
            p_cpf_mascarado,
            p_cpf_criptografado,
            TRIM(p_telefone),
            NULLIF(TRIM(p_cidade), ''),
            NULLIF(UPPER(TRIM(p_estado)), ''),
            NULLIF(TRIM(p_escolaridade), ''),
            NULLIF(TRIM(p_linkedin_url), ''),
            COALESCE(p_aceita_outras_vagas, false),
            true,
            'v2.0-centralizado',
            NOW(),
            12,
            NOW() + INTERVAL '12 months',
            'Portal Trabalhe Conosco'
        )
        RETURNING id INTO v_candidato_id;
    ELSE
        v_candidato_id := v_cand_por_cpf_id;
    END IF;

    -- 4.1 Pré-verificação de duplicidade para as vagas solicitadas
    IF v_cand_por_cpf_id IS NOT NULL THEN
        FOR v_vaga IN SELECT * FROM jsonb_array_elements(p_vagas)
        LOOP
            v_cargo_id := NULLIF(v_vaga->>'cargo_id', '')::UUID;
            v_loja_id := NULLIF(v_vaga->>'loja_id', '')::UUID;
            v_vaga_interesse := COALESCE(NULLIF(TRIM(v_vaga->>'vaga_interesse'), ''), 'Candidatura Espontânea');

            IF v_cargo_id IS NOT NULL THEN
                SELECT id INTO v_dup_cand_id
                FROM public.candidaturas
                WHERE candidato_id = v_candidato_id AND cargo_id = v_cargo_id;
                IF v_dup_cand_id IS NOT NULL THEN
                    v_vagas_duplicadas := array_append(v_vagas_duplicadas, v_vaga_interesse);
                END IF;
            ELSE
                SELECT id INTO v_dup_cand_id
                FROM public.candidaturas
                WHERE candidato_id = v_candidato_id
                  AND cargo_id IS NULL
                  AND loja_id IS NOT DISTINCT FROM v_loja_id
                  AND status IN ('Recebido', 'Em Triagem', 'Banco de Talentos');
                IF v_dup_cand_id IS NOT NULL THEN
                    v_vagas_duplicadas := array_append(v_vagas_duplicadas, v_vaga_interesse);
                END IF;
            END IF;
        END LOOP;

        IF array_length(v_vagas_duplicadas, 1) = jsonb_array_length(p_vagas) THEN
            RETURN jsonb_build_object(
                'sucesso', true,
                'status_processamento', 'todas_vagas_duplicadas',
                'candidato_id', v_candidato_id,
                'curriculo_id', NULL,
                'candidaturas_criadas', 0,
                'vagas_duplicadas_ignoradas', to_jsonb(v_vagas_duplicadas),
                'protocolo', p_protocolo,
                'mensagem', 'Você já possui inscrição ativa em todas as vagas selecionadas.'
            );
        END IF;

        v_vagas_duplicadas := ARRAY[]::TEXT[];
    END IF;

    -- 5. Upload do Currículo no Google Drive (CONDICIONAL — Somente se arquivo foi anexado)
    IF p_google_drive_file_id IS NOT NULL AND p_google_drive_file_id != '' THEN
        INSERT INTO public.candidato_curriculos (
            candidato_id,
            google_drive_file_id,
            google_drive_folder_id,
            nome_arquivo,
            mime_type,
            tamanho_bytes,
            md5_checksum,
            upload_status
        ) VALUES (
            v_candidato_id,
            p_google_drive_file_id,
            p_google_drive_folder_id,
            p_nome_arquivo,
            p_mime_type,
            p_tamanho_bytes,
            p_md5_checksum,
            'concluido'
        )
        RETURNING id INTO v_curriculo_id;

        -- Registro da sessão de upload
        v_sessao_hash := encode(sha256((p_google_drive_file_id || '-' || clock_timestamp()::text)::bytea), 'hex');
        INSERT INTO public.upload_transacoes (
            sessao_token_hash,
            google_drive_file_id,
            google_drive_folder_id,
            nome_arquivo,
            mime_type,
            tamanho_bytes,
            status,
            ip_origem,
            expira_em,
            concluido_em
        ) VALUES (
            v_sessao_hash,
            p_google_drive_file_id,
            p_google_drive_folder_id,
            p_nome_arquivo,
            p_mime_type,
            p_tamanho_bytes,
            'concluido',
            p_ip_origem,
            NOW() + INTERVAL '24 hours',
            NOW()
        ) RETURNING id INTO v_upload_id;
    ELSE
        -- Sem arquivo anexado: curriculo_id permanece NULL
        v_curriculo_id := NULL;
        v_upload_id := NULL;
    END IF;

    -- 6. Criação atômica das candidaturas em lote para as vagas selecionadas
    FOR v_vaga IN SELECT * FROM jsonb_array_elements(p_vagas)
    LOOP
        v_cargo_id := NULLIF(v_vaga->>'cargo_id', '')::UUID;
        v_loja_id := NULLIF(v_vaga->>'loja_id', '')::UUID;
        v_vaga_interesse := COALESCE(NULLIF(TRIM(v_vaga->>'vaga_interesse'), ''), 'Candidatura Espontânea');

        -- Validação de Cargo
        IF v_cargo_id IS NOT NULL THEN
            SELECT loja_id, ativo, publicada, titulo
            INTO v_cargo_loja_id, v_cargo_ativo, v_cargo_publicada, v_cargo_titulo
            FROM public.cargos
            WHERE id = v_cargo_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'VAGA_INEXISTENTE: Vaga % não encontrada.', v_cargo_id;
            END IF;

            IF v_cargo_ativo IS NOT TRUE OR v_cargo_publicada IS NOT TRUE THEN
                RAISE EXCEPTION 'VAGA_INATIVA: A vaga "%" não está aberta para novas candidaturas.', v_cargo_titulo;
            END IF;

            IF v_cargo_loja_id IS DISTINCT FROM v_loja_id THEN
                RAISE EXCEPTION 'UNIDADE_INCOMPATIVEL: A loja da candidatura diverge da loja cadastrada na vaga.';
            END IF;

            v_vaga_interesse := v_cargo_titulo;
        END IF;

        -- Validação de Loja
        IF v_loja_id IS NOT NULL THEN
            SELECT ativa INTO v_loja_ativa
            FROM public.lojas
            WHERE id = v_loja_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'UNIDADE_INEXISTENTE: Unidade % não encontrada.', v_loja_id;
            END IF;

            IF v_loja_ativa IS NOT TRUE THEN
                RAISE EXCEPTION 'UNIDADE_INATIVA: A unidade selecionada está temporariamente inativa.';
            END IF;
        END IF;

        -- 7. Prevenção permanente de duplicidades por vaga e por loja
        IF v_cargo_id IS NOT NULL THEN
            SELECT id INTO v_dup_cand_id
            FROM public.candidaturas
            WHERE candidato_id = v_candidato_id AND cargo_id = v_cargo_id;

            IF v_dup_cand_id IS NOT NULL THEN
                v_vagas_duplicadas := array_append(v_vagas_duplicadas, v_vaga_interesse);
                CONTINUE;
            END IF;
        ELSE
            SELECT id INTO v_dup_cand_id
            FROM public.candidaturas
            WHERE candidato_id = v_candidato_id
              AND cargo_id IS NULL
              AND loja_id IS NOT DISTINCT FROM v_loja_id
              AND status IN ('Recebido', 'Em Triagem', 'Banco de Talentos');

            IF v_dup_cand_id IS NOT NULL THEN
                v_vagas_duplicadas := array_append(v_vagas_duplicadas, v_vaga_interesse);
                CONTINUE;
            END IF;
        END IF;

        -- 8. Inserção da Candidatura com Snapshot Imutável da Inscrição
        INSERT INTO public.candidaturas (
            candidato_id,
            cargo_id,
            loja_id,
            curriculo_id,
            vaga_interesse,
            status,
            apresentacao_pessoal,
            experiencia_profissional,
            dados_formulario,
            dados_extras
        ) VALUES (
            v_candidato_id,
            v_cargo_id,
            v_loja_id,
            v_curriculo_id,
            v_vaga_interesse,
            'Recebido',
            TRIM(p_apresentacao_pessoal),
            COALESCE(p_experiencia_profissional, '{}'::jsonb),
            jsonb_build_object(
                'nome', TRIM(p_nome),
                'email', LOWER(TRIM(p_email)),
                'cpf_mascarado', p_cpf_mascarado,
                'telefone', TRIM(p_telefone),
                'cidade', TRIM(p_cidade),
                'estado', TRIM(p_estado),
                'escolaridade', TRIM(p_escolaridade),
                'linkedin_url', TRIM(p_linkedin_url),
                'aceita_outras_vagas', p_aceita_outras_vagas,
                'apresentacao_pessoal', TRIM(p_apresentacao_pessoal),
                'experiencia_profissional', p_experiencia_profissional,
                'possui_curriculo_anexado', (v_curriculo_id IS NOT NULL),
                'protocolo', p_protocolo,
                'submetido_em', NOW()
            ),
            jsonb_build_object(
                'origem_ip', p_ip_origem,
                'protocolo', p_protocolo,
                'resumo_candidato', TRIM(p_apresentacao_pessoal)
            )
        ) RETURNING id INTO v_candidatura_id;

        v_total_criadas := v_total_criadas + 1;
        v_candidaturas_ids := array_append(v_candidaturas_ids, v_candidatura_id);
    END LOOP;

    -- 9. Retorno Estruturado com Metadados
    RETURN jsonb_build_object(
        'sucesso', true,
        'status_processamento', 'efetivado',
        'candidato_id', v_candidato_id,
        'curriculo_id', v_curriculo_id,
        'possui_curriculo_anexado', (v_curriculo_id IS NOT NULL),
        'upload_id', v_upload_id,
        'candidaturas_criadas', v_total_criadas,
        'candidaturas_ids', to_jsonb(v_candidaturas_ids),
        'vagas_duplicadas_ignoradas', to_jsonb(v_vagas_duplicadas),
        'protocolo', p_protocolo,
        'mensagem', CASE 
            WHEN v_curriculo_id IS NOT NULL THEN 'Candidatura e currículo recebidos e vinculados com sucesso.'
            ELSE 'Candidatura com apresentação e histórico recebida com sucesso no Banco de Talentos.'
        END
    );
END;
$function$;

-- 4. Permissões de Execução Estritas
REVOKE ALL ON FUNCTION public.registrar_candidatura_transacional_v2 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_candidatura_transacional_v2 TO postgres, service_role;

COMMIT;
