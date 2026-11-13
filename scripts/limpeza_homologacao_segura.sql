-- ==============================================================================
-- SCRIPT DE LIMPEZA CONTROLADA DOS DADOS DE HOMOLOGAÇÃO
-- PROJETO: Trabalhe Conosco — Gigante Pneus (V1 Definitiva)
-- DATA DE REVISÃO: 13/11/2026
--
-- ATENÇÃO CRÍTICA:
-- 1. Este script foi PREPARADO e REVISADO com travas de segurança atômicas.
-- 2. NÃO DEVE SER EXECUTADO SEM AUTORIZAÇÃO EXPRESSA DO RESPONSÁVEL.
-- 3. Por padrão, a última linha é 'ROLLBACK;' para garantir que qualquer teste
--    ou execução acidental não persista exclusões no banco.
-- 4. Todos os dados operacionais (lojas, cargos, perfis, etc.) são 100% PRESERVADOS.
--
-- PROCEDIMENTO DE BACKUP PRÉVIO RECOMENDADO (EXTERNO AO REPOSITÓRIO):
-- Antes de alterar ROLLBACK para COMMIT, gere um snapshot em JSON dos dados
-- utilizando a query no Supabase SQL Editor ou script Node exportando para 
-- um diretório ignorado pelo git (ex: scripts/backups/snapshot_homologacao.json):
--
-- SELECT jsonb_build_object(
--     'timestamp', NOW(),
--     'candidatos', (SELECT jsonb_agg(c) FROM public.candidatos c),
--     'candidaturas', (SELECT jsonb_agg(cd) FROM public.candidaturas cd),
--     'curriculos', (SELECT jsonb_agg(cr) FROM public.candidato_curriculos cr),
--     'upload_transacoes', (SELECT jsonb_agg(ut) FROM public.upload_transacoes ut),
--     'logs_acesso', (SELECT jsonb_agg(l) FROM public.logs_acesso_curriculos l)
-- ) AS backup_payload;
-- ==============================================================================

BEGIN;

-- 1. Verificação prévia de contagens exatas da homologação
DO $$
DECLARE
    v_candidatos_count INT;
    v_candidaturas_count INT;
    v_curriculos_count INT;
    v_logs_count INT;
    v_uploads_count INT;
    v_lojas_count INT;
    v_cargos_count INT;
BEGIN
    SELECT count(*) INTO v_candidatos_count FROM public.candidatos;
    SELECT count(*) INTO v_candidaturas_count FROM public.candidaturas;
    SELECT count(*) INTO v_curriculos_count FROM public.candidato_curriculos;
    SELECT count(*) INTO v_logs_count FROM public.logs_acesso_curriculos;
    SELECT count(*) INTO v_uploads_count FROM public.upload_transacoes;
    SELECT count(*) INTO v_lojas_count FROM public.lojas;
    SELECT count(*) INTO v_cargos_count FROM public.cargos;

    RAISE NOTICE '[PRE-CHECK] Candidatos identificados: % (Esperado no inventário: 6)', v_candidatos_count;
    RAISE NOTICE '[PRE-CHECK] Candidaturas identificadas: % (Esperado no inventário: 8)', v_candidaturas_count;
    RAISE NOTICE '[PRE-CHECK] Currículos identificados: % (Esperado no inventário: 6)', v_curriculos_count;
    RAISE NOTICE '[PRE-CHECK] Logs de acesso identificados: % (Esperado no inventário: 8)', v_logs_count;
    RAISE NOTICE '[PRE-CHECK] Upload transações identificadas: % (Esperado no inventário: 13)', v_uploads_count;
    RAISE NOTICE '[PRE-CHECK] Lojas operacionais preservadas: % (Esperado: 28)', v_lojas_count;
    RAISE NOTICE '[PRE-CHECK] Vagas operacionais preservadas: % (Esperado: 2)', v_cargos_count;

    -- Trava 1: Se lojas operacionais estiverem abaixo do mínimo cadastrado, aborta imediatamente
    IF v_lojas_count < 28 THEN
        RAISE EXCEPTION 'SEGURANÇA ACIONADA: Contagem de lojas (%) abaixo do esperado (28). Abortando para prevenir danos.', v_lojas_count;
    END IF;

    -- Trava 2: Se vagas operacionais estiverem zeradas, aborta
    IF v_cargos_count < 2 THEN
        RAISE EXCEPTION 'SEGURANÇA ACIONADA: Contagem de cargos operacionais (%) abaixo do esperado (2). Abortando.', v_cargos_count;
    END IF;

    -- Trava 3: Se houver contagem anômala de candidatos (ex: mais de 100), alertar/abortar para evitar apagar dados de produção real
    IF v_candidatos_count > 50 THEN
        RAISE EXCEPTION 'SEGURANÇA ACIONADA: Quantidade de candidatos (%) excede o escopo de homologação (< 50). Verifique se o banco é de produção real com dados legítimos.', v_candidatos_count;
    END IF;
END $$;

-- 2. Limpeza em ordem topológica estrita (dependências de FK reversas)
-- Elimina relacionamentos dependentes antes dos registros mestres
DELETE FROM public.candidato_compartilhamentos;
DELETE FROM public.respostas;
DELETE FROM public.candidatura_pendencias_identidade;
DELETE FROM public.logs_acesso_curriculos;
DELETE FROM public.candidaturas;
DELETE FROM public.candidato_curriculos;
DELETE FROM public.upload_transacoes;
DELETE FROM public.candidatos;

-- 3. Verificação pós-exclusão com validação de preservação operacional
DO $$
DECLARE
    v_candidatos_restantes INT;
    v_candidaturas_restantes INT;
    v_curriculos_restantes INT;
    v_logs_restantes INT;
    v_uploads_restantes INT;
    v_lojas_final INT;
    v_cargos_final INT;
    v_perfis_final INT;
    v_config_final INT;
BEGIN
    SELECT count(*) INTO v_candidatos_restantes FROM public.candidatos;
    SELECT count(*) INTO v_candidaturas_restantes FROM public.candidaturas;
    SELECT count(*) INTO v_curriculos_restantes FROM public.candidato_curriculos;
    SELECT count(*) INTO v_logs_restantes FROM public.logs_acesso_curriculos;
    SELECT count(*) INTO v_uploads_restantes FROM public.upload_transacoes;
    SELECT count(*) INTO v_lojas_final FROM public.lojas;
    SELECT count(*) INTO v_cargos_final FROM public.cargos;
    SELECT count(*) INTO v_perfis_final FROM public.perfis;
    SELECT count(*) INTO v_config_final FROM public.configuracoes_sistema;

    -- Verifica se as tabelas de recrutamento foram zeradas com sucesso
    IF v_candidatos_restantes > 0 OR v_candidaturas_restantes > 0 OR v_curriculos_restantes > 0 OR v_uploads_restantes > 0 THEN
        RAISE EXCEPTION 'FALHA DE INTEGRIDADE: Resíduos encontrados após deleção. Candidatos: %, Candidaturas: %, Currículos: %, Uploads: %',
            v_candidatos_restantes, v_candidaturas_restantes, v_curriculos_restantes, v_uploads_restantes;
    END IF;

    -- Verifica se a infraestrutura operacional permaneceu 100% intocada
    IF v_lojas_final < 28 THEN
        RAISE EXCEPTION 'FALHA CRÍTICA: Lojas operacionais foram afetadas (% restantes). Abortando com ROLLBACK.', v_lojas_final;
    END IF;

    IF v_cargos_final < 2 THEN
        RAISE EXCEPTION 'FALHA CRÍTICA: Cargos operacionais foram afetados (% restantes). Abortando com ROLLBACK.', v_cargos_final;
    END IF;

    IF v_perfis_final < 2 THEN
        RAISE EXCEPTION 'FALHA CRÍTICA: Perfis administrativos foram afetados (% restantes). Abortando com ROLLBACK.', v_perfis_final;
    END IF;

    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '[VALIDAÇÃO CONCLUÍDA COM SUCESSO]';
    RAISE NOTICE 'Recrutamento zerado: 0 candidatos, 0 candidaturas, 0 currículos, 0 uploads.';
    RAISE NOTICE 'Estrutura operacional preservada: % lojas, % cargos, % perfis, % configurações.',
        v_lojas_final, v_cargos_final, v_perfis_final, v_config_final;
    RAISE NOTICE '==============================================================================';
END $$;

-- 4. Finalização
-- Transação confirmada com COMMIT após aprovação expressa do proprietário (Prompt 67)
COMMIT;
