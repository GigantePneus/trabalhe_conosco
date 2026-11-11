-- ==============================================================================
-- GIGANTE PNEUS — MULTI-LOJAS
-- SCRIPT DE ROLLBACK CIRÚRGICO E SEGURO (PROMPT 35)
-- FINALIDADE: Remover exclusivamente os objetos da aplicação Trabalhe Conosco,
-- sem afetar o schema public, extensões ou objetos nativos gerenciados do Supabase.
-- ==============================================================================

-- 1. VIEWS PÚBLICAS
DROP VIEW IF EXISTS public.cargos_publicos CASCADE;
DROP VIEW IF EXISTS public.lojas_publicas CASCADE;

-- 2. POLÍTICAS RLS (Removidas automaticamente com DROP TABLE CASCADE, mas listadas para limpeza explícita)
DROP POLICY IF EXISTS rls_configuracoes_select ON public.configuracoes_sistema;
DROP POLICY IF EXISTS rls_configuracoes_update ON public.configuracoes_sistema;
DROP POLICY IF EXISTS rls_lojas_select ON public.lojas;
DROP POLICY IF EXISTS rls_lojas_insert ON public.lojas;
DROP POLICY IF EXISTS rls_lojas_update ON public.lojas;
DROP POLICY IF EXISTS rls_lojas_delete ON public.lojas;
DROP POLICY IF EXISTS rls_perfis_select ON public.perfis;
DROP POLICY IF EXISTS rls_perfis_insert ON public.perfis;
DROP POLICY IF EXISTS rls_perfis_update ON public.perfis;
DROP POLICY IF EXISTS rls_perfis_delete ON public.perfis;
DROP POLICY IF EXISTS rls_usuario_lojas_select ON public.usuario_lojas;
DROP POLICY IF EXISTS rls_usuario_lojas_insert ON public.usuario_lojas;
DROP POLICY IF EXISTS rls_usuario_lojas_delete ON public.usuario_lojas;
DROP POLICY IF EXISTS rls_cargos_select ON public.cargos;
DROP POLICY IF EXISTS rls_cargos_insert ON public.cargos;
DROP POLICY IF EXISTS rls_cargos_update ON public.cargos;
DROP POLICY IF EXISTS rls_cargos_delete ON public.cargos;
DROP POLICY IF EXISTS rls_candidatos_select ON public.candidatos;
DROP POLICY IF EXISTS rls_candidato_curriculos_select ON public.candidato_curriculos;
DROP POLICY IF EXISTS rls_candidaturas_select ON public.candidaturas;
DROP POLICY IF EXISTS rls_compartilhamentos_select ON public.candidato_compartilhamentos;
DROP POLICY IF EXISTS rls_compartilhamentos_insert ON public.candidato_compartilhamentos;
DROP POLICY IF EXISTS rls_compartilhamentos_update ON public.candidato_compartilhamentos;
DROP POLICY IF EXISTS rls_compartilhamentos_delete ON public.candidato_compartilhamentos;
DROP POLICY IF EXISTS rls_pendencias_identidade_select ON public.candidatura_pendencias_identidade;
DROP POLICY IF EXISTS rls_pendencias_identidade_update ON public.candidatura_pendencias_identidade;
DROP POLICY IF EXISTS rls_pesquisas_select ON public.pesquisas;
DROP POLICY IF EXISTS rls_pesquisas_admin ON public.pesquisas;
DROP POLICY IF EXISTS rls_respostas_select ON public.respostas;
DROP POLICY IF EXISTS rls_respostas_insert ON public.respostas;
DROP POLICY IF EXISTS rls_upload_transacoes_admin ON public.upload_transacoes;
DROP POLICY IF EXISTS rls_logs_acesso_select ON public.logs_acesso_curriculos;
DROP POLICY IF EXISTS rls_auditoria_select ON public.auditoria_administrativa;

-- 3. TRIGGERS OPERACIONAIS
DROP TRIGGER IF EXISTS trg_check_candidatura_cargo_loja ON public.candidaturas;
DROP TRIGGER IF EXISTS trg_protect_logs_acesso_curriculos ON public.logs_acesso_curriculos;
DROP TRIGGER IF EXISTS trg_protect_auditoria_administrativa ON public.auditoria_administrativa;
DROP TRIGGER IF EXISTS trg_audit_lojas_mutations ON public.lojas;
DROP TRIGGER IF EXISTS trg_audit_cargos_mutations ON public.cargos;
DROP TRIGGER IF EXISTS trg_block_perfis_mutation ON public.perfis;
DROP TRIGGER IF EXISTS trg_block_usuario_lojas_mutation ON public.usuario_lojas;
DROP TRIGGER IF EXISTS trg_protect_cargo_update ON public.cargos;
DROP TRIGGER IF EXISTS trg_protect_candidaturas_mutation ON public.candidaturas;

-- 4. FUNÇÕES OPERACIONAIS E RPCS
DROP FUNCTION IF EXISTS public.registrar_candidatura_transacional(character varying, character varying, character varying, character varying, character varying, text, character varying, character varying, character varying, character varying, character varying, boolean, boolean, jsonb, text, character varying, character varying, character varying, character varying, bigint, character varying, character varying, character varying);
DROP FUNCTION IF EXISTS public.atualizar_status_candidatura(uuid, character varying, text);
DROP FUNCTION IF EXISTS public.trg_validate_candidatura_cargo_loja();
DROP FUNCTION IF EXISTS public.trg_block_audit_mutation();
DROP FUNCTION IF EXISTS public.trg_auto_audit_admin_mutation();
DROP FUNCTION IF EXISTS public.before_update_cargo_protect();
DROP FUNCTION IF EXISTS public.trg_block_client_perfis_mutation();
DROP FUNCTION IF EXISTS public.trg_block_client_candidaturas_mutation();
DROP FUNCTION IF EXISTS public.can_read_curriculo(uuid);
DROP FUNCTION IF EXISTS public.can_read_candidato(uuid);
DROP FUNCTION IF EXISTS public.can_read_candidatura(uuid);
DROP FUNCTION IF EXISTS public.can_update_candidatura(uuid);
DROP FUNCTION IF EXISTS public.can_manage_vaga(uuid);
DROP FUNCTION IF EXISTS public.user_has_loja_access(uuid);
DROP FUNCTION IF EXISTS public.current_user_role();
DROP FUNCTION IF EXISTS public.uuid_generate_v4();

-- 5. TABELAS DA APLICAÇÃO (Ordem reversa de dependência estrangeira)
DROP TABLE IF EXISTS public.auditoria_administrativa CASCADE;
DROP TABLE IF EXISTS public.logs_acesso_curriculos CASCADE;
DROP TABLE IF EXISTS public.upload_transacoes CASCADE;
DROP TABLE IF EXISTS public.respostas CASCADE;
DROP TABLE IF EXISTS public.pesquisas CASCADE;
DROP TABLE IF EXISTS public.candidatura_pendencias_identidade CASCADE;
DROP TABLE IF EXISTS public.candidato_compartilhamentos CASCADE;
DROP TABLE IF EXISTS public.candidaturas CASCADE;
DROP TABLE IF EXISTS public.candidato_curriculos CASCADE;
DROP TABLE IF EXISTS public.candidatos CASCADE;
DROP TABLE IF EXISTS public.cargos CASCADE;
DROP TABLE IF EXISTS public.usuario_lojas CASCADE;
DROP TABLE IF EXISTS public.perfis CASCADE;
DROP TABLE IF EXISTS public.lojas CASCADE;
DROP TABLE IF EXISTS public.configuracoes_sistema CASCADE;

-- 6. TIPOS CUSTOMIZADOS (ENUMS)
DROP TYPE IF EXISTS public.compartilhamento_permissao CASCADE;
DROP TYPE IF EXISTS public.drive_upload_status CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- FIM DO SCRIPT DE ROLLBACK CIRÚRGICO
-- Schema public, extensões (uuid-ossp, pgcrypto), autenticação (auth.users) e configurações nativas do Supabase permanecem 100% preservados.

