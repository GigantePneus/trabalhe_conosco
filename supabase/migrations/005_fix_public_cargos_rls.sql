-- ==============================================================================
-- MIGRATION 005: Correção de RLS e Permissões Públicas para Cargos e Lojas
-- Objetivo: Garantir que o perfil 'anon' consiga consultar vagas ativas e publicadas
-- através da view public.cargos_publicos sem bloqueio de RLS silencioso.
-- ==============================================================================

-- 1. Conceder permissões SELECT nos objetos públicos para os papéis anon e authenticated
GRANT SELECT ON public.cargos TO anon, authenticated;
GRANT SELECT ON public.lojas TO anon, authenticated;
GRANT SELECT ON public.cargos_publicos TO anon, authenticated;

-- 2. Política permissiva de SELECT para cargos públicos e ativos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'cargos' 
          AND policyname = 'rls_cargos_public_select'
    ) THEN
        CREATE POLICY rls_cargos_public_select ON public.cargos
            FOR SELECT TO anon, authenticated
            USING (ativo = true AND publicada = true);
    END IF;
END $$;

-- 3. Política permissiva de SELECT para lojas ativas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'lojas' 
          AND policyname = 'rls_lojas_public_select'
    ) THEN
        CREATE POLICY rls_lojas_public_select ON public.lojas
            FOR SELECT TO anon, authenticated
            USING (ativa = true);
    END IF;
END $$;

