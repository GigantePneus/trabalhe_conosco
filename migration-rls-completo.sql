-- ========================================
-- SOLUÇÃO COMPLETA RLS - COPIE E EXECUTE TUDO
-- ========================================

-- 1. DESABILITAR RLS TEMPORARIAMENTE (para debug)
ALTER TABLE public.candidates DISABLE ROW LEVEL SECURITY;

-- 2. REMOVER TODAS AS POLÍTICAS ANTIGAS
DROP POLICY IF EXISTS "Candidatos insert public" ON public.candidates;
DROP POLICY IF EXISTS "Admin vê candidatos" ON public.candidates;
DROP POLICY IF EXISTS "Admin atualiza candidatos" ON public.candidates;

-- 3. REABILITAR RLS
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- 4. CRIAR POLÍTICAS CORRETAS

-- Permitir INSERÇÃO para todos (anon e authenticated)
CREATE POLICY "public_insert_candidates" 
ON public.candidates 
FOR INSERT 
TO public
WITH CHECK (true);

-- Permitir LEITURA apenas para autenticados
CREATE POLICY "authenticated_select_candidates" 
ON public.candidates 
FOR SELECT 
TO authenticated
USING (true);

-- Permitir UPDATE apenas para autenticados
CREATE POLICY "authenticated_update_candidates" 
ON public.candidates 
FOR UPDATE 
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. VERIFICAR SE FUNCIONOU
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'candidates';

-- Você deve ver 3 políticas listadas acima
