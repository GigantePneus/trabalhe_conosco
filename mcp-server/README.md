# MCP Server — Gigante Pneus Trabalhe Conosco

Servidor MCP (Model Context Protocol) administrativo para integração do **ChatGPT** com o sistema **Trabalhe Conosco — Gigante Pneus Multi-Lojas**.

Disponibiliza suporte a dois modos de transporte:
1. **STDIO (Local):** Para clientes locais como Claude Desktop ou ChatGPT Desktop com conector stdio.
2. **Streamable HTTP / SSE (Remoto):** Especificação oficial MCP para clientes remotos (ChatGPT, Claude Web, conectores remotos, MCP Inspector) e especificação OpenAPI 3.0 para Custom GPT Actions.

---

## 1. Arquitetura e Segurança

- **Transportes Suportados:**
  - `stdio`: Execução via processo filho em linha de comando.
  - `Streamable HTTP` (`/mcp`): Transporte HTTP moderno com suporte a sessões (`mcp-session-id`), streaming SSE e POST JSON-RPC.
  - `OpenAPI REST` (`/openapi.json`): Especificação OpenAPI 3.0 compatível com ChatGPT Custom Actions.
- **Autenticação:** Baseada em tokens **Bearer JWT** emitidos pelo Supabase Auth.
- **Fail-Safe:** Nenhuma chave estática compartilhada é aceita. O token identifica o operador administrativo (`franqueadora_admin`, `rh_corporativo`, `franqueado` ou `gerente`).
- **Isolamento de Identidade Multi-Tenant:**
  - No modo remoto, o `AsyncLocalStorage` vincula a identidade do operador por requisição, garantindo que requisições simultâneas não vazem privilégios entre franqueados e franqueadora.
  - Franqueados têm visibilidade e atuação estritamente restritas às suas 6 unidades vinculadas.
  - Gerentes têm acesso somente leitura (mutações são bloqueadas com HTTP 403).
- **Proteção contra Ações Acidentais de IA:**
  - `criar_vaga`: Cria novas vagas **obrigatoriamente como Rascunho**.
  - `publicar_vaga`: Exige parâmetro de confirmação explícita (`confirmacao: true`).
  - `desativar_vaga`: Exige parâmetro de confirmação explícita (`confirmacao: true`).
- **Auditoria Administrativa:** Toda operação de mutação gera registro auditável estruturado em logs com identificação do operador, timestamp e recurso afetado.

---

## 2. Instalação e Compilação

Na pasta do MCP:

```bash
cd mcp-server
npm install
npm run build
```

Artefatos compilados em `dist/`:
- `dist/index.js` — Servidor STDIO (local)
- `dist/remote.js` — Servidor Streamable HTTP (remoto)
- `dist/tools.js` — Lógica centralizada das 7 ferramentas

---

## 3. Variáveis de Ambiente

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `GIGANTE_API_URL` | `http://localhost:3000` | URL base da API do sistema Trabalhe Conosco |
| `GIGANTE_AUTH_TOKEN` | *Vazio* | Token JWT padrão (opcional no modo remoto, obrigatório no modo STDIO) |
| `MCP_REMOTE_PORT` | `3001` | Porta HTTP para o servidor remoto |
| `MCP_REMOTE_HOST` | `0.0.0.0` | Host de escuta do servidor remoto |

---

## 4. Como Executar

### A. Modo Remoto (Streamable HTTP + OpenAPI)

```bash
cd mcp-server
npm run start:remote
```

O servidor iniciará exibindo:
- **Healthcheck:** `http://localhost:3001/health`
- **Endpoint MCP:** `http://localhost:3001/mcp`
- **OpenAPI Spec:** `http://localhost:3001/openapi.json`

### B. Modo STDIO (Local)

```bash
cd mcp-server
$env:GIGANTE_API_URL="http://localhost:3000"
$env:GIGANTE_AUTH_TOKEN="<SEU_TOKEN_JWT>"
npm run start
```

---

## 5. As 7 Ferramentas Administrativas

1. **`listar_lojas`**: Lista as unidades ativas da rede que o operador autenticado pode acessar (6 unidades para Franqueado, todas para Franqueadora Master).
2. **`listar_vagas`**: Lista vagas administrativas com paginação e filtros (`lojaId`, `cidade`, `titulo`, `departamento`, `status`).
3. **`consultar_vaga`**: Consulta detalhes completos de uma vaga por ID (`vagaId`).
4. **`criar_vaga`**: Cria nova vaga como **RASCUNHO** (nunca publicada diretamente).
5. **`editar_vaga`**: Edita informações e requisitos de vaga existente sem alterar ciclo de vida.
6. **`publicar_vaga`**: Altera visibilidade pública no portal. Exige `confirmacao: true`.
7. **`desativar_vaga`**: Arquiva e desativa a vaga do portal. Exige `confirmacao: true`.

---

## 6. Disponibilização via HTTPS e Conexão ao ChatGPT

O ChatGPT exige endpoints acessíveis via **HTTPS**. Durante desenvolvimento e homologação:

### Método 1: Cloudflare Tunnel (Recomendado — Gratuito e Instantâneo)

```bash
# Instale ou execute cloudflared
cloudflared tunnel --url http://localhost:3001
```

A Cloudflare gerará uma URL HTTPS pública (ex: `https://exemplo-random.trycloudflare.com`).

### Método 2: ngrok

```bash
ngrok http 3001
```

---

## 7. Instruções Exatas para Conectar ao ChatGPT

### Opção A: ChatGPT com MCP Remoto (Suporte a MCP Streamable HTTP)

1. No conector MCP do ChatGPT, adicione um novo servidor remoto.
2. Defina a URL: `https://<SEU_TUNNEL_HTTPS>/mcp`.
3. Configure o cabeçalho de autenticação:
   - Header: `Authorization`
   - Valor: `Bearer <SEU_TOKEN_JWT_ADMIN>`

### Opção B: OpenAI Custom GPT Actions (OpenAPI 3.0)

1. Acesse **ChatGPT > Explore GPTs > Create**.
2. Na aba **Configure**, clique em **Create new action**.
3. Em **Authentication**:
   - Type: `API Key`
   - Auth Type: `Bearer`
   - Insira o token JWT do operador administrativo do Supabase.
4. Em **Schema**, clique em **Import from URL** e informe:
   `https://<SEU_TUNNEL_HTTPS>/openapi.json`
5. O ChatGPT importará automaticamente as operações administrativas com esquema de dados e validações.

---

## 8. Pendências para Conexão em Produção

1. **Túnel HTTPS / Deploy na Vercel:** Para homologação local, é necessário iniciar o túnel HTTPS (Cloudflare Tunnel ou ngrok). Para produção definitiva, a rota `/mcp` deve ser empacotada como Serverless Function no domínio oficial `https://trabalheconosco.gigantepneus.com.br/api/mcp`.
2. **Servidor OAuth 2.1 Dedicado:** Para permitir que qualquer usuário faça login diretamente na interface do ChatGPT sem precisar copiar manualmente o token JWT de sessão.
