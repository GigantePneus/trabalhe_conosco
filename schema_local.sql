-- Habilita extensão para UUIDs se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Criação da tabela Cidades
CREATE TABLE IF NOT EXISTS public.cidades (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  nome VARCHAR(255) NOT NULL
);

-- 2. Criação da tabela Lojas
CREATE TABLE IF NOT EXISTS public.lojas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  nome_loja VARCHAR(255) NOT NULL,
  cidade_id UUID REFERENCES public.cidades(id) ON DELETE SET NULL,
  estado VARCHAR(2) NOT NULL,
  gemini_api_key TEXT,
  ativo BOOLEAN DEFAULT TRUE NOT NULL
);

-- 3. Criação da tabela Cargos (Vagas)
CREATE TABLE IF NOT EXISTS public.cargos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  requisitos TEXT, -- JSON de configurações da landing page serializado
  ativo BOOLEAN DEFAULT TRUE NOT NULL
);

-- 4. Criação da tabela Usuários Administrativos
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'franqueado' CHECK (role IN ('admin_master', 'franqueado')) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE NOT NULL
);

-- 5. Criação da tabela de permissões de Usuários x Lojas
CREATE TABLE IF NOT EXISTS public.usuario_lojas (
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, loja_id)
);

-- 6. Criação da tabela Candidatos (Banco de Currículos)
CREATE TABLE IF NOT EXISTS public.candidatos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefone VARCHAR(50) NOT NULL,
  cidade VARCHAR(255) NOT NULL,
  vaga_interesse VARCHAR(255) NOT NULL,
  cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE SET NULL,
  resumo TEXT,
  curriculo_url TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'novo' CHECK (status IN ('novo', 'visualizado', 'em análise', 'aprovado', 'descartado')) NOT NULL,
  avaliacao_ia TEXT, -- JSON analítico da IA serializado
  curriculo_drive_id VARCHAR(255)
);

-- 7. Criação da tabela Pesquisas (Clima / Engajamento por Loja)
CREATE TABLE IF NOT EXISTS public.pesquisas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  perguntas TEXT NOT NULL DEFAULT '[]' -- JSON array de perguntas serializado
);

-- 8. Criação da tabela Respostas (Respostas das pesquisas de clima)
CREATE TABLE IF NOT EXISTS public.respostas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  pesquisa_id UUID REFERENCES public.pesquisas(id) ON DELETE CASCADE NOT NULL,
  respostas_json TEXT NOT NULL DEFAULT '{}' -- JSON de respostas serializado
);

-- Inserção de dados iniciais para testes (Opcional - Seed)
INSERT INTO public.cidades (nome) VALUES ('Ribeirão Preto'), ('Campinas'), ('São Paulo') ON CONFLICT DO NOTHING;
