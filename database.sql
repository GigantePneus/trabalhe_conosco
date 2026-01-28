-- TABELA DE LOJAS
create table public.stores (
  id uuid default gen_random_uuid() primary key,
  nome_loja text not null,
  cidade text not null,
  estado text not null,
  ativo boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE CARGOS
create table public.job_roles (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  ativo boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE CANDIDATOS
create table public.candidates (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  telefone text,
  cidade_loja_id uuid references public.stores(id),
  cargo_id uuid references public.job_roles(id),
  apresentacao text,
  curriculo_url text, -- Link para download direto/visualização
  curriculo_drive_id text, -- ID do arquivo no Google Drive
  lgpd boolean default true, -- Aceite LGPD
  status text default 'novo' check (status in ('novo', 'visualizado', 'em análise', 'aprovado', 'descartado')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE USUÁRIOS ADMINISTRATIVOS
-- Esta tabela estende os dados do usuário do Supabase Auth
create table public.admin_users (
  id uuid not null references auth.users(id) on delete cascade primary key,
  nome text not null,
  email text not null,
  role text not null default 'franqueado' check (role in ('admin_master', 'franqueado')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABELA DE PERMISSÕES (Para franqueados acessarem apenas certas lojas)
create table public.permissions (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid references public.admin_users(id) on delete cascade not null,
  cidade_loja_id uuid references public.stores(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ROW LEVEL SECURITY (RLS) - SEGURANÇA
-- Habilitar RLS em todas as tabelas
alter table public.stores enable row level security;
alter table public.job_roles enable row level security;
alter table public.candidates enable row level security;
alter table public.admin_users enable row level security;
alter table public.permissions enable row level security;

-- POLÍTICAS SIMPLIFICADAS PARA INÍCIO

-- 1. Qualquer um pode ler Lojas e Cargos (necessário para o formulário público)
create policy "Lojas públicas" on public.stores for select using (true);
create policy "Cargos públicos" on public.job_roles for select using (true);

-- 2. Qualquer um pode INSERIR Candidatos (Formulário público)
create policy "Candidatos insert public" on public.candidates 
for insert to anon, authenticated with check (true);

-- 3. Apenas autenticados podem LER candidatos
create policy "Admin vê candidatos" on public.candidates for select using (auth.role() = 'authenticated');
create policy "Admin atualiza candidatos" on public.candidates for update using (auth.role() = 'authenticated');

-- 4. Apenas autenticados podem gerenciar Lojas/Cargos (Escrita)
create policy "Admin gerencia lojas" on public.stores for all using (auth.role() = 'authenticated');
create policy "Admin gerencia cargos" on public.job_roles for all using (auth.role() = 'authenticated');

-- 5. Usuários Admin
create policy "Admin vê users" on public.admin_users for select using (auth.role() = 'authenticated');
