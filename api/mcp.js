// src-api/mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// mcp-server/src/tools.ts
import { z } from "zod";
async function apiRequest(config, method, path, body, queryParams) {
  const baseUrl = config.getApiUrl() || "http://localhost:3000";
  const token = config.getAuthToken() || "";
  const url = new URL(path, baseUrl);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== void 0 && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
  const fetchOptions = { method, headers };
  if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
    fetchOptions.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return {
      status: 0,
      data: {
        success: false,
        mensagem: `Erro de conex\xE3o com a API: ${error.message}. Verifique se o servidor est\xE1 rodando em ${baseUrl}`
      }
    };
  }
}
function formatResponse(result) {
  const prefix = result.status >= 200 && result.status < 300 ? "\u2705" : "\u274C";
  return {
    content: [{
      type: "text",
      text: `${prefix} [HTTP ${result.status}]
${JSON.stringify(result.data, null, 2)}`
    }]
  };
}
function registerGiganteTools(server, config) {
  server.tool(
    "listar_lojas",
    "Lista as unidades (lojas) da rede Gigante Pneus que o administrador autenticado tem acesso. Retorna id, nome, cidade, estado e status de ativa\xE7\xE3o.",
    {},
    async () => {
      const result = await apiRequest(config, "GET", "/api/admin/lojas");
      return formatResponse(result);
    }
  );
  server.tool(
    "listar_vagas",
    "Lista vagas administrativas com filtros opcionais por loja, cidade, t\xEDtulo, departamento, status (publicadas/rascunhos/desativadas/todas) e pagina\xE7\xE3o.",
    {
      lojaId: z.string().optional().describe("ID da loja para filtrar (UUID). Omita para ver todas as lojas autorizadas."),
      cidade: z.string().optional().describe("Filtrar vagas por cidade da unidade."),
      titulo: z.string().optional().describe("Buscar vagas por t\xEDtulo (parcial, case-insensitive)."),
      departamento: z.string().optional().describe("Filtrar por departamento (parcial, case-insensitive)."),
      status: z.enum(["todas", "publicadas", "rascunhos", "desativadas"]).optional().describe("Filtrar por status da vaga. Padr\xE3o: todas."),
      page: z.number().int().min(1).optional().describe("N\xFAmero da p\xE1gina. Padr\xE3o: 1."),
      limit: z.number().int().min(1).max(100).optional().describe("Itens por p\xE1gina (m\xE1x 100). Padr\xE3o: 20.")
    },
    async (params) => {
      const result = await apiRequest(config, "GET", "/api/admin/vagas", void 0, {
        lojaId: params.lojaId,
        cidade: params.cidade,
        titulo: params.titulo,
        departamento: params.departamento,
        status: params.status,
        page: params.page,
        limit: params.limit
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "consultar_vaga",
    "Consulta os detalhes completos de uma vaga espec\xEDfica pelo seu ID (UUID). Inclui dados de landing page, requisitos, benef\xEDcios e status.",
    {
      vagaId: z.string().describe("ID (UUID) da vaga a consultar.")
    },
    async (params) => {
      const result = await apiRequest(config, "GET", "/api/admin/vagas", void 0, {
        id: params.vagaId
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "criar_vaga",
    "Cria uma nova vaga de emprego. A vaga \xE9 criada SEMPRE como RASCUNHO (n\xE3o publicada) por seguran\xE7a. Para torn\xE1-la p\xFAblica no portal, use posteriormente a ferramenta publicar_vaga com confirma\xE7\xE3o.",
    {
      titulo: z.string().min(3).describe('T\xEDtulo da vaga (m\xEDn. 3 caracteres). Ex: "Mec\xE2nico Automotivo", "Vendedor(a)"'),
      lojaId: z.string().optional().describe("ID (UUID) da loja/unidade onde a vaga ser\xE1 aberta. Obrigat\xF3rio para franqueados."),
      departamento: z.string().optional().describe('Departamento. Ex: "Oficina Mec\xE2nica", "Vendas", "Administrativo". Padr\xE3o: "Operacional".'),
      tipoVaga: z.string().optional().describe('Modelo de trabalho. Ex: "Presencial", "H\xEDbrido". Padr\xE3o: "Presencial".'),
      descricao: z.string().optional().describe("Descri\xE7\xE3o detalhada da vaga e das atividades."),
      salary: z.string().optional().describe('Faixa salarial. Ex: "R$ 2.500 a R$ 3.500", "A combinar".'),
      shortDescription: z.string().optional().describe("Descri\xE7\xE3o curta para listagens e cards."),
      workModel: z.string().optional().describe("Modelo de trabalho detalhado para a landing page."),
      benefits: z.array(z.string()).optional().describe('Lista de benef\xEDcios. Ex: ["Vale alimenta\xE7\xE3o", "Plano de sa\xFAde"]'),
      responsibilities: z.array(z.string()).optional().describe("Lista de responsabilidades do cargo."),
      requirements: z.array(z.string()).optional().describe("Lista de requisitos e qualifica\xE7\xF5es.")
    },
    async (params) => {
      const result = await apiRequest(config, "POST", "/api/admin/vagas", {
        titulo: params.titulo,
        lojaId: params.lojaId,
        departamento: params.departamento,
        tipoVaga: params.tipoVaga,
        descricao: params.descricao,
        salary: params.salary,
        shortDescription: params.shortDescription,
        workModel: params.workModel,
        benefits: params.benefits,
        responsibilities: params.responsibilities,
        requirements: params.requirements
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "editar_vaga",
    "Edita informa\xE7\xF5es textuais ou estruturais de uma vaga existente. Envie apenas os campos que deseja alterar. O ciclo de vida da vaga (publica\xE7\xE3o/ativa\xE7\xE3o) n\xE3o \xE9 alterado por esta ferramenta.",
    {
      vagaId: z.string().describe("ID (UUID) da vaga a editar."),
      titulo: z.string().min(3).optional().describe("Novo t\xEDtulo da vaga."),
      lojaId: z.string().optional().describe("Novo ID da loja/unidade."),
      departamento: z.string().optional().describe("Novo departamento."),
      tipoVaga: z.string().optional().describe("Novo modelo de trabalho."),
      descricao: z.string().optional().describe("Nova descri\xE7\xE3o detalhada."),
      salary: z.string().optional().describe("Nova faixa salarial."),
      shortDescription: z.string().optional().describe("Nova descri\xE7\xE3o curta."),
      workModel: z.string().optional().describe("Novo modelo de trabalho para landing."),
      benefits: z.array(z.string()).optional().describe("Nova lista de benef\xEDcios."),
      responsibilities: z.array(z.string()).optional().describe("Nova lista de responsabilidades."),
      requirements: z.array(z.string()).optional().describe("Nova lista de requisitos.")
    },
    async (params) => {
      const result = await apiRequest(config, "PATCH", "/api/admin/vagas", {
        vagaId: params.vagaId,
        titulo: params.titulo,
        lojaId: params.lojaId,
        departamento: params.departamento,
        tipoVaga: params.tipoVaga,
        descricao: params.descricao,
        salary: params.salary,
        shortDescription: params.shortDescription,
        workModel: params.workModel,
        benefits: params.benefits,
        responsibilities: params.responsibilities,
        requirements: params.requirements
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "publicar_vaga",
    "Altera a visibilidade p\xFAblica de uma vaga no portal Trabalhe Conosco. Por seguran\xE7a, requer confirma\xE7\xE3o expl\xEDcita (confirmacao: true).",
    {
      vagaId: z.string().describe("ID (UUID) da vaga."),
      acao: z.enum(["publicar", "despublicar", "reativar"]).describe(
        '"publicar" = torna vis\xEDvel imediatamente no site. "despublicar" = retorna para rascunho (oculta do site). "reativar" = reativa uma vaga desativada como rascunho.'
      ),
      confirmacao: z.boolean().describe("Confirma\xE7\xE3o expl\xEDcita obrigat\xF3ria para evitar altera\xE7\xF5es acidentais. Deve ser true.")
    },
    async (params) => {
      if (params.confirmacao !== true) {
        return {
          content: [{
            type: "text",
            text: '\u26A0\uFE0F [A\xC7\xC3O BLOQUEADA \u2014 CONFIRMA\xC7\xC3O EXIGIDA]\n\nA altera\xE7\xE3o de status/visibilidade de uma vaga modifica o portal p\xFAblico Trabalhe Conosco. Para confirmar a opera\xE7\xE3o, informe explicitamente "confirmacao: true".'
          }]
        };
      }
      const result = await apiRequest(config, "PATCH", "/api/admin/vagas", {
        vagaId: params.vagaId,
        acao: params.acao
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "desativar_vaga",
    "Desativa e arquiva uma vaga, retirando-a imediatamente do ar. Por seguran\xE7a, requer confirma\xE7\xE3o expl\xEDcita (confirmacao: true).",
    {
      vagaId: z.string().describe("ID (UUID) da vaga a desativar."),
      confirmacao: z.boolean().describe("Confirma\xE7\xE3o expl\xEDcita obrigat\xF3ria para evitar arquivamentos acidentais. Deve ser true.")
    },
    async (params) => {
      if (params.confirmacao !== true) {
        return {
          content: [{
            type: "text",
            text: '\u26A0\uFE0F [A\xC7\xC3O BLOQUEADA \u2014 CONFIRMA\xC7\xC3O EXIGIDA]\n\nDesativar uma vaga remove-a do portal p\xFAblico e arquiva o registro. Para confirmar a opera\xE7\xE3o, informe explicitamente "confirmacao: true".'
          }]
        };
      }
      const result = await apiRequest(config, "PATCH", "/api/admin/vagas", {
        vagaId: params.vagaId,
        acao: "desativar"
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "listar_candidatos",
    "Lista candidatos cadastrados no Banco de Talentos com filtros opcionais por nome, e-mail, telefone, cidade, estado, loja (UUID), cargo pretendido, status da candidatura e pagina\xE7\xE3o.",
    {
      nome: z.string().optional().describe("Filtrar por nome do candidato (busca parcial, case-insensitive)."),
      email: z.string().optional().describe("Filtrar por e-mail exato ou parcial."),
      telefone: z.string().optional().describe("Filtrar por telefone ou WhatsApp."),
      cidade: z.string().optional().describe("Filtrar por cidade do candidato."),
      estado: z.string().length(2).optional().describe('Filtrar por estado (UF com 2 letras, ex: "GO", "SP").'),
      lojaId: z.string().optional().describe("ID (UUID) da loja para listar candidatos vinculados \xE0quela unidade."),
      cargo: z.string().optional().describe("Filtrar por cargo pretendido ou vaga de interesse."),
      status: z.string().optional().describe('Status da candidatura (ex: "Banco de Talentos", "Recebido", "Em Triagem", "Entrevista", "Aprovado", "Reprovado", "Desistente").'),
      origem: z.string().optional().describe('Origem do cadastro (ex: "migracao_drive", "portal").'),
      page: z.number().int().min(1).optional().describe("N\xFAmero da p\xE1gina. Padr\xE3o: 1."),
      limit: z.number().int().min(1).max(100).optional().describe("Itens por p\xE1gina (m\xE1x 100). Padr\xE3o: 20.")
    },
    async (params) => {
      const result = await apiRequest(config, "GET", "/api/admin/candidatos", void 0, {
        nome: params.nome,
        email: params.email,
        telefone: params.telefone,
        cidade: params.cidade,
        estado: params.estado,
        lojaId: params.lojaId,
        cargo: params.cargo,
        status: params.status,
        origem: params.origem,
        page: params.page,
        limit: params.limit
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "consultar_candidato",
    "Consulta os dados cadastrais completos de um candidato espec\xEDfico pelo seu ID (UUID), incluindo dados de contato, lojas vinculadas, candidaturas ativas e hist\xF3rico de curr\xEDculos anexados.",
    {
      candidatoId: z.string().describe("ID (UUID) do candidato a consultar.")
    },
    async (params) => {
      const result = await apiRequest(config, "GET", "/api/admin/candidatos", void 0, {
        id: params.candidatoId
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "verificar_duplicidade",
    "Verifica previamente se um candidato j\xE1 existe na base de dados por e-mail exato, telefone, CPF (ou hash) e nomes similares (hom\xF4nimos), prevenindo duplicidades acidentais antes da cria\xE7\xE3o.",
    {
      email: z.string().optional().describe("E-mail do candidato a verificar."),
      telefone: z.string().optional().describe("Telefone ou WhatsApp do candidato."),
      cpf: z.string().optional().describe("CPF do candidato (com ou sem pontua\xE7\xE3o)."),
      nome: z.string().optional().describe("Nome completo do candidato para verifica\xE7\xE3o de hom\xF4nimos.")
    },
    async (params) => {
      const result = await apiRequest(config, "POST", "/api/admin/candidatos", {
        acao: "verificar_duplicidade",
        email: params.email,
        telefone: params.telefone,
        cpf: params.cpf,
        nome: params.nome
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "criar_candidato",
    "Cadastra um novo candidato no Banco de Talentos da Gigante Pneus. Para curr\xEDculos antigos sem CPF, o sistema identifica internamente o candidato como registro de migra\xE7\xE3o com CPF pendente (origem: migracao_drive, cpf_status: pendente_migracao), sem gerar ou apresentar identificadores sint\xE9ticos como CPF verdadeiro. Permite vincular imediatamente a uma loja e cargo pretendido.",
    {
      nome: z.string().min(2).describe("Nome completo do candidato (m\xEDnimo 2 caracteres)."),
      email: z.string().email().describe("E-mail v\xE1lido do candidato."),
      telefone: z.string().min(8).describe("Telefone de contato ou WhatsApp (com DDD)."),
      cidade: z.string().optional().describe("Cidade de resid\xEAncia do candidato."),
      estado: z.string().length(2).optional().describe('UF da resid\xEAncia (2 letras, ex: "GO", "SP").'),
      bairro: z.string().optional().describe("Bairro de resid\xEAncia."),
      cpf: z.string().optional().describe("CPF do candidato (opcional caso o curr\xEDculo n\xE3o informe CPF; o registro ser\xE1 salvo como CPF pendente)."),
      lojaId: z.string().optional().describe("ID (UUID) da loja da Gigante Pneus para vincula\xE7\xE3o imediata da candidatura."),
      cargoPretendido: z.string().optional().describe('Cargo ou \xE1rea de interesse informada no curr\xEDculo (ex: "Mec\xE2nico Alinhador", "Vendedor").'),
      resumoProfissional: z.string().optional().describe("S\xEDntese de qualifica\xE7\xF5es e hist\xF3rico profissional do curr\xEDculo."),
      origem: z.string().optional().describe('Origem do registro. Padr\xE3o: "migracao_drive".')
    },
    async (params) => {
      const result = await apiRequest(config, "POST", "/api/admin/candidatos", {
        nome: params.nome,
        email: params.email,
        telefone: params.telefone,
        cidade: params.cidade,
        estado: params.estado,
        bairro: params.bairro,
        cpf: params.cpf,
        lojaId: params.lojaId,
        cargoPretendido: params.cargoPretendido,
        resumoProfissional: params.resumoProfissional,
        origem: params.origem || "migracao_drive"
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "editar_candidato",
    "Atualiza dados cadastrais de um candidato existente (nome, e-mail, telefone, cidade, estado, bairro, resumo ou CPF). Envie apenas os campos que deseja alterar.",
    {
      candidatoId: z.string().describe("ID (UUID) do candidato a editar."),
      nome: z.string().min(2).optional().describe("Novo nome completo."),
      email: z.string().email().optional().describe("Novo e-mail do candidato."),
      telefone: z.string().min(8).optional().describe("Novo telefone de contato."),
      cidade: z.string().optional().describe("Nova cidade."),
      estado: z.string().length(2).optional().describe("Nova UF (2 letras)."),
      bairro: z.string().optional().describe("Novo bairro."),
      resumoProfissional: z.string().optional().describe("Novo resumo profissional."),
      cpf: z.string().optional().describe("CPF do candidato (caso obtido posteriormente).")
    },
    async (params) => {
      const result = await apiRequest(config, "PATCH", "/api/admin/candidatos", {
        candidatoId: params.candidatoId,
        nome: params.nome,
        email: params.email,
        telefone: params.telefone,
        cidade: params.cidade,
        estado: params.estado,
        bairro: params.bairro,
        resumoProfissional: params.resumoProfissional,
        cpf: params.cpf
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "anexar_curriculo",
    "Faz o upload do arquivo bin\xE1rio de curr\xEDculo do candidato para armazenamento seguro no Google Drive institucional e vincula ao registro de candidato_curriculos. Aceita arquivos em Base64 (PDF, DOC ou DOCX).",
    {
      candidatoId: z.string().describe("ID (UUID) do candidato ao qual o curr\xEDculo pertence."),
      arquivoBase64: z.string().describe("Conte\xFAdo completo do arquivo codificado em Base64."),
      nomeArquivo: z.string().describe('Nome original do arquivo com extens\xE3o (ex: "curriculo_candidato.pdf").'),
      tipoMime: z.string().optional().describe('Tipo MIME do arquivo (ex: "application/pdf"). Se omitido, ser\xE1 inferido do arquivo.')
    },
    async (params) => {
      const result = await apiRequest(config, "POST", "/api/admin/candidatos", {
        acao: "anexar_curriculo",
        candidatoId: params.candidatoId,
        arquivoBase64: params.arquivoBase64,
        nomeArquivo: params.nomeArquivo,
        tipoMime: params.tipoMime
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "consultar_curriculos",
    "Lista todos os arquivos de curr\xEDculo anexados a um candidato, retornando metadados t\xE9cnicos (data, tamanho, MD5, status no Drive) e link seguro para visualiza\xE7\xE3o institucional.",
    {
      candidatoId: z.string().describe("ID (UUID) do candidato a consultar.")
    },
    async (params) => {
      const result = await apiRequest(config, "GET", "/api/admin/candidatos", void 0, {
        id: params.candidatoId,
        modo: "curriculos"
      });
      return formatResponse(result);
    }
  );
  server.tool(
    "vincular_candidato_loja",
    "Vincula formalmente um candidato a uma loja (unidade) no Banco de Talentos, permitindo que a equipe de RH e gerentes daquela unidade visualizem o candidato imediatamente em seu painel. O v\xEDnculo \xE9 estritamente no Banco de Talentos: N\xC3O conta como candidatura a vaga aberta espec\xEDfica nem altera contadores de vagas abertas, e N\xC3O dispara mensagens autom\xE1ticas (WhatsApp, SMS ou e-mail) ao candidato.",
    {
      candidatoId: z.string().describe("ID (UUID) do candidato."),
      lojaId: z.string().describe("ID (UUID) da loja da Gigante Pneus para vincular."),
      cargoPretendido: z.string().optional().describe('Cargo ou fun\xE7\xE3o de interesse na unidade (ex: "Mec\xE2nico", "Alinhador").'),
      cargoId: z.string().optional().describe("ID (UUID) de um cargo cadastrado no sistema, se conhecido."),
      apresentacaoPessoal: z.string().optional().describe("Nota de apresenta\xE7\xE3o ou observa\xE7\xF5es para os recrutadores da unidade.")
    },
    async (params) => {
      const result = await apiRequest(config, "POST", "/api/admin/candidatos", {
        acao: "vincular_loja",
        candidatoId: params.candidatoId,
        lojaId: params.lojaId,
        cargoPretendido: params.cargoPretendido,
        cargoId: params.cargoId,
        apresentacaoPessoal: params.apresentacaoPessoal
      });
      return formatResponse(result);
    }
  );
}

// mcp-server/src/oauth.ts
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
function getSigningSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "gigante_default_secure_secret_key_2026";
}
function verifyHmacPayload(token, expectedType) {
  if (!token || !token.startsWith(`gig_${expectedType}_`)) return null;
  const parts = token.slice(`gig_${expectedType}_`.length).split(".");
  if (parts.length !== 2) return null;
  const [dataB64, signature] = parts;
  const secret = getSigningSecret();
  const expectedHmac = createHmac("sha256", secret).update(dataB64).digest("base64url");
  if (signature !== expectedHmac) return null;
  try {
    const jsonStr = Buffer.from(dataB64, "base64url").toString("utf-8");
    const data = JSON.parse(jsonStr);
    if (data.__typ !== expectedType) return null;
    if (typeof data.__exp === "number" && data.__exp < Math.floor(Date.now() / 1e3)) return null;
    return data;
  } catch {
    return null;
  }
}
var authCodes = /* @__PURE__ */ new Map();
var activeTokens = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodes.entries()) {
    if (entry.expiresAt <= now) authCodes.delete(code);
  }
  for (const [token, entry] of activeTokens.entries()) {
    if (entry.expiresAt <= now) activeTokens.delete(token);
  }
}, 5 * 60 * 1e3).unref();
function getSupabaseClients() {
  const supaUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    throw new Error("CONFIG_ERROR: Vari\xE1veis de ambiente do Supabase ausentes no MCP Server.");
  }
  const adminClient = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
  const anonClient = createClient(supaUrl, anonKey || serviceKey, { auth: { persistSession: false } });
  return { adminClient, anonClient };
}
async function authenticateOperator(email, password, existingToken) {
  const { adminClient, anonClient } = getSupabaseClients();
  let userId;
  let userEmail;
  let sessionToken;
  if (existingToken) {
    const { data: userData, error: userErr } = await adminClient.auth.getUser(existingToken);
    if (userErr || !userData?.user) {
      return { success: false, error: "Sess\xE3o do Supabase inv\xE1lida ou expirada." };
    }
    userId = userData.user.id;
    userEmail = userData.user.email || email;
    sessionToken = existingToken;
  } else if (email && password) {
    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (signInErr || !signInData?.user || !signInData?.session) {
      return { success: false, error: "Credenciais administrativas inv\xE1lidas. Verifique e-mail e senha." };
    }
    userId = signInData.user.id;
    userEmail = signInData.user.email || email;
    sessionToken = signInData.session.access_token;
  } else {
    return { success: false, error: "E-mail e senha s\xE3o obrigat\xF3rios." };
  }
  const { data: perfil, error: perfilErr } = await adminClient.from("perfis").select("id, nome, email, role, ativo").eq("id", userId).maybeSingle();
  if (perfilErr || !perfil) {
    return { success: false, error: "Perfil de usu\xE1rio n\xE3o encontrado no sistema Trabalhe Conosco." };
  }
  if (!perfil.ativo) {
    return { success: false, error: "Este usu\xE1rio est\xE1 desativado no sistema." };
  }
  const role = perfil.role;
  const isMasterOrRh = role === "franqueadora_admin" || role === "rh_corporativo";
  let lojasAutorizadasIds = [];
  if (!isMasterOrRh) {
    const { data: ulData, error: ulErr } = await adminClient.from("usuario_lojas").select("loja_id").eq("user_id", userId);
    if (ulErr) {
      return { success: false, error: "Erro ao consultar unidades autorizadas." };
    }
    lojasAutorizadasIds = (ulData || []).map((u) => u.loja_id).filter(Boolean);
    if (lojasAutorizadasIds.length === 0) {
      return { success: false, error: "Usu\xE1rio sem unidades autorizadas vinculadas no sistema." };
    }
  }
  return {
    success: true,
    context: {
      userId,
      email: userEmail,
      nome: perfil.nome || "Operador RH",
      role,
      isMasterOrRh,
      lojasAutorizadasIds,
      supabaseSessionToken: sessionToken
    }
  };
}
async function resolveOAuthTokenContext(token) {
  const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
  if (!cleanToken) return null;
  const entry = activeTokens.get(cleanToken);
  if (entry) {
    if (entry.expiresAt > Date.now()) {
      return entry.context;
    }
    activeTokens.delete(cleanToken);
  }
  const hmacData = verifyHmacPayload(cleanToken, "at");
  if (hmacData && hmacData.context) {
    return hmacData.context;
  }
  const auth = await authenticateOperator("", void 0, cleanToken);
  if (auth.success && auth.context) {
    return auth.context;
  }
  return null;
}

// src-api/mcp.ts
async function mcpServerlessHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, mcp-session-id");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const rawAccept = req.headers["accept"] || "";
  if (!rawAccept.includes("application/json") || !rawAccept.includes("text/event-stream")) {
    req.headers["accept"] = "application/json, text/event-stream";
  }
  const authHeader = req.headers["authorization"] || "";
  let incomingToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!incomingToken) {
    const url = new URL(req.url, "http://localhost");
    incomingToken = (url.searchParams.get("access_token") || url.searchParams.get("token") || "").trim();
  }
  if (!incomingToken) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "ACESSO_NEGADO: Token de autentica\xE7\xE3o Bearer JWT ou OAuth \xE9 obrigat\xF3rio." },
      id: null
    }));
    return;
  }
  const operatorContext = await resolveOAuthTokenContext(incomingToken);
  if (!operatorContext) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "ACESSO_NEGADO: Sess\xE3o de operador inv\xE1lida, desativada ou expirada." },
      id: null
    }));
    return;
  }
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "trabalheconosco.gigantepneus.com.br";
  const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;
  const backendToken = operatorContext.supabaseSessionToken || incomingToken;
  const server = new McpServer({
    name: "gigante-pneus-trabalhe-conosco-remoto",
    version: "1.2.0",
    description: "Servidor MCP Administrativo \u2014 Gest\xE3o de vagas, candidatos e curr\xEDculos Gigante Pneus"
  });
  registerGiganteTools(server, {
    getApiUrl: () => baseUrl,
    getAuthToken: () => backendToken
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: void 0,
    enableJsonResponse: true
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
export {
  mcpServerlessHandler as default
};
