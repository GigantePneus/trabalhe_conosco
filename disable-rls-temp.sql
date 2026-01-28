-- ⚡ SOLUÇÃO EMERGENCIAL - DESABILITAR RLS
-- Execute este comando AGORA para permitir testes imediatos

ALTER TABLE public.candidates DISABLE ROW LEVEL SECURITY;

-- ✅ Pronto! Agora você pode testar o formulário sem problemas.

-- ⚠️ ANTES DO DEPLOY EM PRODUÇÃO, reabilite o RLS executando:
-- 
-- ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "public_insert" ON public.candidates 
-- FOR INSERT TO public WITH CHECK (true);
-- 
-- CREATE POLICY "auth_select" ON public.candidates 
-- FOR SELECT TO authenticated USING (true);
-- 
-- CREATE POLICY "auth_update" ON public.candidates 
-- FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
