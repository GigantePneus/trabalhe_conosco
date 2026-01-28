-- Corrigir política RLS para permitir inserção pública de candidatos
-- Execute este SQL no Supabase SQL Editor

-- 1. Remover política antiga (se existir)
DROP POLICY IF EXISTS "Candidatos insert public" ON public.candidates;

-- 2. Criar nova política que permite inserção anônima
CREATE POLICY "Candidatos insert public" 
ON public.candidates 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- 3. Verificar se RLS está habilitado
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- Comentário explicativo
COMMENT ON POLICY "Candidatos insert public" ON public.candidates IS 
'Permite que usuários anônimos (formulário público) e autenticados insiram candidatos';
