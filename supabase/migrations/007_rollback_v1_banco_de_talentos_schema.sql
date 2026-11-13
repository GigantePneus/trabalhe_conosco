-- ==============================================================================
-- ROLLBACK MIGRATION 007: V1 DEFINITIVA DO BANCO DE TALENTOS
-- Reverte a função RPC V2 e as constraints adicionadas pela migration 007
-- ==============================================================================

BEGIN;

-- 1. Remoção segura da RPC V2 (sem afetar a RPC v1 legada)
DROP FUNCTION IF EXISTS public.registrar_candidatura_transacional_v2(
    VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR,
    BOOLEAN, BOOLEAN, JSONB, TEXT, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, BIGINT, VARCHAR, VARCHAR, VARCHAR
);

-- 2. Remoção da restrição de tamanho na apresentação pessoal
ALTER TABLE public.candidaturas 
DROP CONSTRAINT IF EXISTS chk_candidaturas_apresentacao_length;

-- NOTA: As colunas adicionadas 'apresentacao_pessoal' e 'experiencia_profissional' 
-- podem ser mantidas ou removidas se estritamente necessário:
-- ALTER TABLE public.candidaturas DROP COLUMN IF EXISTS apresentacao_pessoal;
-- ALTER TABLE public.candidaturas DROP COLUMN IF EXISTS experiencia_profissional;

COMMIT;
