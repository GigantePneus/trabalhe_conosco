# Guia de Boas Práticas de Segurança - Gigante Pneus

Para garantir a integridade dos dados e evitar invasões no sistema de recrutamento, recomendamos a implementação das seguintes práticas de segurança.

## 1. Row Level Security (RLS) no Supabase
O RLS é a primeira linha de defesa. Atualmente, parte da segurança é feita no código front-end (serviço), o que pode ser burlado por usuários avançados.
> [!IMPORTANT]
> **Ação Recomendada:** Habilite o RLS em todas as tabelas (`candidates`, `stores`, `job_roles`, `admin_users`) e crie políticas específicas:
> - **candidates:** Apenas `admin_master` pode ver tudo; `franqueado` pode ver apenas candidatos das suas lojas autorizadas.
> - **admin_users:** Apenas o próprio usuário ou um `admin_master` pode ler/editar.

## 2. Autenticação nas Edge Functions
As funções `manage-users` e `upload-resume` (especialmente a ação de delete) devem validar quem está fazendo a requisição.
> [!WARNING]
> **Ação Recomendada:** Adicione a verificação do JWT (Token de Usuário) nas funções.
> ```typescript
> const authHeader = req.headers.get('Authorization');
> const token = authHeader?.replace('Bearer ', '');
> const { data: { user } } = await supabaseAdmin.auth.getUser(token);
> if (!user) throw new Error('Acesso negado');
> ```

## 3. Proteção de Chaves de API
Nunca exponha a `SERVICE_ROLE_KEY` no front-end. Ela dá acesso total ao banco ignorando o RLS.
- **VITE_SUPABASE_ANON_KEY:** Segura para o front-end (limitada pelo RLS).
- **SUPABASE_SERVICE_ROLE_KEY:** Deve ser configurada **apenas como Secret no Supabase** para uso dentro das Edge Functions.

## 4. Políticas de CORS Restritivas
Atualmente, as funções usam `'Access-Control-Allow-Origin': '*'`.
- **Ação Recomendada:** Quando o sistema estiver em produção, altere o `*` para a URL real do seu site na Vercel (ex: `https://seu-sistema.vercel.app`). Isso evita que outros sites chamem suas funções.

## 5. Auditoria de Permissões (Roles)
O sistema utiliza dois níveis: `admin_master` e `franqueado`.
- **Admin Master:** Deve ser restrito a pouquíssimas pessoas, pois pode criar e deletar outros gestores.
- **Franqueado:** Sempre deve ter as listas `lojas_permitidas` e `cargos_permitidos` preenchidas para evitar vazamento de dados de outras unidades.

## 6. Saneamento de Inputs
Sempre valide os dados recebidos nas Edge Functions antes de processá-los no banco ou no Google Drive para evitar injeções ou uploads de arquivos maliciosos.

## 7. Verificação de Logs
Verifique periodicamente os logs no painel do Supabase (**Edge Functions > Logs**) para identificar tentativas de acesso inválidas ou erros inesperados que possam indicar tentativas de invasão.

---
*Este documento serve como roteiro para a evolução contínua da segurança do seu ecossistema digital.*
