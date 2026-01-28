-- Adicionar coluna LGPD à tabela de candidatos (se necessário)
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE public.candidates 
ADD COLUMN IF NOT EXISTS lgpd boolean DEFAULT true;

COMMENT ON COLUMN public.candidates.lgpd IS 'Aceite dos termos LGPD pelo candidato';
