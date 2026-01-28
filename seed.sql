-- INSERIR LOJAS INICIAIS
insert into public.stores (nome_loja, cidade, estado, ativo) values
('Matriz - São Paulo', 'São Paulo', 'SP', true),
('Gigante Pneus - Curitiba', 'Curitiba', 'PR', true),
('Gigante Pneus - Rio de Janeiro', 'Rio de Janeiro', 'RJ', true),
('Gigante Pneus - Belo Horizonte', 'Belo Horizonte', 'MG', true);

-- INSERIR CARGOS INICIAIS
insert into public.job_roles (nome, ativo) values
('Vendedor Técnico', true),
('Mecânico Alinhador', true),
('Auxiliar Financeiro', true),
('Gerente de Loja', true),
('Recepcionista', true),
('Estoquista', true);
