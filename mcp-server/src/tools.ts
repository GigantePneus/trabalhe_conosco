/**
 * Definição centralizada das 7 Ferramentas Administrativas MCP
 * Sistema Trabalhe Conosco — Gigante Pneus Multi-Lojas
 * 
 * Compartilhado entre os adaptadores STDIO (local) e Streamable HTTP (remoto).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export interface ToolsConfig {
  getApiUrl: () => string;
  getAuthToken: () => string;
}

interface ApiResponse {
  status: number;
  data: any;
}

async function apiRequest(
  config: ToolsConfig,
  method: string,
  path: string,
  body?: Record<string, any>,
  queryParams?: Record<string, string | number | undefined>
): Promise<ApiResponse> {
  const baseUrl = config.getApiUrl() || 'http://localhost:3000';
  const token = config.getAuthToken() || '';
  const url = new URL(path, baseUrl);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const fetchOptions: RequestInit = { method, headers };
  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error: any) {
    return {
      status: 0,
      data: {
        success: false,
        mensagem: `Erro de conexão com a API: ${error.message}. Verifique se o servidor está rodando em ${baseUrl}`
      }
    };
  }
}

function formatResponse(result: ApiResponse): { content: Array<{ type: 'text'; text: string }> } {
  const prefix = result.status >= 200 && result.status < 300 ? '✅' : '❌';
  return {
    content: [{
      type: 'text' as const,
      text: `${prefix} [HTTP ${result.status}]\n${JSON.stringify(result.data, null, 2)}`
    }]
  };
}

export function registerGiganteTools(server: McpServer, config: ToolsConfig): void {
  // ─── 1. listar_lojas ─────────────────────────────────────────────────────────
  server.tool(
    'listar_lojas',
    'Lista as unidades (lojas) da rede Gigante Pneus que o administrador autenticado tem acesso. Retorna id, nome, cidade, estado e status de ativação.',
    {},
    async () => {
      const result = await apiRequest(config, 'GET', '/api/admin/lojas');
      return formatResponse(result);
    }
  );

  // ─── 2. listar_vagas ─────────────────────────────────────────────────────────
  server.tool(
    'listar_vagas',
    'Lista vagas administrativas com filtros opcionais por loja, cidade, título, departamento, status (publicadas/rascunhos/desativadas/todas) e paginação.',
    {
      lojaId: z.string().optional().describe('ID da loja para filtrar (UUID). Omita para ver todas as lojas autorizadas.'),
      cidade: z.string().optional().describe('Filtrar vagas por cidade da unidade.'),
      titulo: z.string().optional().describe('Buscar vagas por título (parcial, case-insensitive).'),
      departamento: z.string().optional().describe('Filtrar por departamento (parcial, case-insensitive).'),
      status: z.enum(['todas', 'publicadas', 'rascunhos', 'desativadas']).optional().describe('Filtrar por status da vaga. Padrão: todas.'),
      page: z.number().int().min(1).optional().describe('Número da página. Padrão: 1.'),
      limit: z.number().int().min(1).max(100).optional().describe('Itens por página (máx 100). Padrão: 20.')
    },
    async (params) => {
      const result = await apiRequest(config, 'GET', '/api/admin/vagas', undefined, {
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

  // ─── 3. consultar_vaga ───────────────────────────────────────────────────────
  server.tool(
    'consultar_vaga',
    'Consulta os detalhes completos de uma vaga específica pelo seu ID (UUID). Inclui dados de landing page, requisitos, benefícios e status.',
    {
      vagaId: z.string().describe('ID (UUID) da vaga a consultar.')
    },
    async (params) => {
      const result = await apiRequest(config, 'GET', '/api/admin/vagas', undefined, {
        id: params.vagaId
      });
      return formatResponse(result);
    }
  );

  // ─── 4. criar_vaga ───────────────────────────────────────────────────────────
  server.tool(
    'criar_vaga',
    'Cria uma nova vaga de emprego. A vaga é criada SEMPRE como RASCUNHO (não publicada) por segurança. Para torná-la pública no portal, use posteriormente a ferramenta publicar_vaga com confirmação.',
    {
      titulo: z.string().min(3).describe('Título da vaga (mín. 3 caracteres). Ex: "Mecânico Automotivo", "Vendedor(a)"'),
      lojaId: z.string().optional().describe('ID (UUID) da loja/unidade onde a vaga será aberta. Obrigatório para franqueados.'),
      departamento: z.string().optional().describe('Departamento. Ex: "Oficina Mecânica", "Vendas", "Administrativo". Padrão: "Operacional".'),
      tipoVaga: z.string().optional().describe('Modelo de trabalho. Ex: "Presencial", "Híbrido". Padrão: "Presencial".'),
      descricao: z.string().optional().describe('Descrição detalhada da vaga e das atividades.'),
      salary: z.string().optional().describe('Faixa salarial. Ex: "R$ 2.500 a R$ 3.500", "A combinar".'),
      shortDescription: z.string().optional().describe('Descrição curta para listagens e cards.'),
      workModel: z.string().optional().describe('Modelo de trabalho detalhado para a landing page.'),
      benefits: z.array(z.string()).optional().describe('Lista de benefícios. Ex: ["Vale alimentação", "Plano de saúde"]'),
      responsibilities: z.array(z.string()).optional().describe('Lista de responsabilidades do cargo.'),
      requirements: z.array(z.string()).optional().describe('Lista de requisitos e qualificações.')
    },
    async (params) => {
      const result = await apiRequest(config, 'POST', '/api/admin/vagas', {
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

  // ─── 5. editar_vaga ──────────────────────────────────────────────────────────
  server.tool(
    'editar_vaga',
    'Edita informações textuais ou estruturais de uma vaga existente. Envie apenas os campos que deseja alterar. O ciclo de vida da vaga (publicação/ativação) não é alterado por esta ferramenta.',
    {
      vagaId: z.string().describe('ID (UUID) da vaga a editar.'),
      titulo: z.string().min(3).optional().describe('Novo título da vaga.'),
      lojaId: z.string().optional().describe('Novo ID da loja/unidade.'),
      departamento: z.string().optional().describe('Novo departamento.'),
      tipoVaga: z.string().optional().describe('Novo modelo de trabalho.'),
      descricao: z.string().optional().describe('Nova descrição detalhada.'),
      salary: z.string().optional().describe('Nova faixa salarial.'),
      shortDescription: z.string().optional().describe('Nova descrição curta.'),
      workModel: z.string().optional().describe('Novo modelo de trabalho para landing.'),
      benefits: z.array(z.string()).optional().describe('Nova lista de benefícios.'),
      responsibilities: z.array(z.string()).optional().describe('Nova lista de responsabilidades.'),
      requirements: z.array(z.string()).optional().describe('Nova lista de requisitos.')
    },
    async (params) => {
      const result = await apiRequest(config, 'PATCH', '/api/admin/vagas', {
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

  // ─── 6. publicar_vaga (Exige Confirmação Explícita) ───────────────────────────
  server.tool(
    'publicar_vaga',
    'Altera a visibilidade pública de uma vaga no portal Trabalhe Conosco. Por segurança, requer confirmação explícita (confirmacao: true).',
    {
      vagaId: z.string().describe('ID (UUID) da vaga.'),
      acao: z.enum(['publicar', 'despublicar', 'reativar']).describe(
        '"publicar" = torna visível imediatamente no site. "despublicar" = retorna para rascunho (oculta do site). "reativar" = reativa uma vaga desativada como rascunho.'
      ),
      confirmacao: z.boolean().describe('Confirmação explícita obrigatória para evitar alterações acidentais. Deve ser true.')
    },
    async (params) => {
      if (params.confirmacao !== true) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️ [AÇÃO BLOQUEADA — CONFIRMAÇÃO EXIGIDA]\n\nA alteração de status/visibilidade de uma vaga modifica o portal público Trabalhe Conosco. Para confirmar a operação, informe explicitamente "confirmacao: true".'
          }]
        };
      }

      const result = await apiRequest(config, 'PATCH', '/api/admin/vagas', {
        vagaId: params.vagaId,
        acao: params.acao
      });
      return formatResponse(result);
    }
  );

  // ─── 7. desativar_vaga (Exige Confirmação Explícita) ─────────────────────────
  server.tool(
    'desativar_vaga',
    'Desativa e arquiva uma vaga, retirando-a imediatamente do ar. Por segurança, requer confirmação explícita (confirmacao: true).',
    {
      vagaId: z.string().describe('ID (UUID) da vaga a desativar.'),
      confirmacao: z.boolean().describe('Confirmação explícita obrigatória para evitar arquivamentos acidentais. Deve ser true.')
    },
    async (params) => {
      if (params.confirmacao !== true) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️ [AÇÃO BLOQUEADA — CONFIRMAÇÃO EXIGIDA]\n\nDesativar uma vaga remove-a do portal público e arquiva o registro. Para confirmar a operação, informe explicitamente "confirmacao: true".'
          }]
        };
      }

      const result = await apiRequest(config, 'PATCH', '/api/admin/vagas', {
        vagaId: params.vagaId,
        acao: 'desativar'
      });
      return formatResponse(result);
    }
  );

  // ─── 8. listar_candidatos ───────────────────────────────────────────────────
  server.tool(
    'listar_candidatos',
    'Lista candidatos cadastrados no Banco de Talentos com filtros opcionais por nome, e-mail, telefone, cidade, estado, loja (UUID), cargo pretendido, status da candidatura e paginação.',
    {
      nome: z.string().optional().describe('Filtrar por nome do candidato (busca parcial, case-insensitive).'),
      email: z.string().optional().describe('Filtrar por e-mail exato ou parcial.'),
      telefone: z.string().optional().describe('Filtrar por telefone ou WhatsApp.'),
      cidade: z.string().optional().describe('Filtrar por cidade do candidato.'),
      estado: z.string().length(2).optional().describe('Filtrar por estado (UF com 2 letras, ex: "GO", "SP").'),
      lojaId: z.string().optional().describe('ID (UUID) da loja para listar candidatos vinculados àquela unidade.'),
      cargo: z.string().optional().describe('Filtrar por cargo pretendido ou vaga de interesse.'),
      status: z.string().optional().describe('Status da candidatura (ex: "Banco de Talentos", "Recebido", "Em Triagem", "Entrevista", "Aprovado", "Reprovado", "Desistente").'),
      origem: z.string().optional().describe('Origem do cadastro (ex: "migracao_drive", "portal").'),
      page: z.number().int().min(1).optional().describe('Número da página. Padrão: 1.'),
      limit: z.number().int().min(1).max(100).optional().describe('Itens por página (máx 100). Padrão: 20.')
    },
    async (params) => {
      const result = await apiRequest(config, 'GET', '/api/admin/candidatos', undefined, {
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

  // ─── 9. consultar_candidato ─────────────────────────────────────────────────
  server.tool(
    'consultar_candidato',
    'Consulta os dados cadastrais completos de um candidato específico pelo seu ID (UUID), incluindo dados de contato, lojas vinculadas, candidaturas ativas e histórico de currículos anexados.',
    {
      candidatoId: z.string().describe('ID (UUID) do candidato a consultar.')
    },
    async (params) => {
      const result = await apiRequest(config, 'GET', '/api/admin/candidatos', undefined, {
        id: params.candidatoId
      });
      return formatResponse(result);
    }
  );

  // ─── 10. verificar_duplicidade ──────────────────────────────────────────────
  server.tool(
    'verificar_duplicidade',
    'Verifica previamente se um candidato já existe na base de dados por e-mail exato, telefone, CPF (ou hash) e nomes similares (homônimos), prevenindo duplicidades acidentais antes da criação.',
    {
      email: z.string().optional().describe('E-mail do candidato a verificar.'),
      telefone: z.string().optional().describe('Telefone ou WhatsApp do candidato.'),
      cpf: z.string().optional().describe('CPF do candidato (com ou sem pontuação).'),
      nome: z.string().optional().describe('Nome completo do candidato para verificação de homônimos.')
    },
    async (params) => {
      const result = await apiRequest(config, 'POST', '/api/admin/candidatos', {
        acao: 'verificar_duplicidade',
        email: params.email,
        telefone: params.telefone,
        cpf: params.cpf,
        nome: params.nome
      });
      return formatResponse(result);
    }
  );

  // ─── 11. criar_candidato ────────────────────────────────────────────────────
  server.tool(
    'criar_candidato',
    'Cadastra um novo candidato no Banco de Talentos da Gigante Pneus. Para currículos antigos sem CPF, o sistema identifica internamente o candidato como registro de migração com CPF pendente (origem: migracao_drive, cpf_status: pendente_migracao), sem gerar ou apresentar identificadores sintéticos como CPF verdadeiro. Permite vincular imediatamente a uma loja e cargo pretendido.',
    {
      nome: z.string().min(2).describe('Nome completo do candidato (mínimo 2 caracteres).'),
      email: z.string().email().describe('E-mail válido do candidato.'),
      telefone: z.string().min(8).describe('Telefone de contato ou WhatsApp (com DDD).'),
      cidade: z.string().optional().describe('Cidade de residência do candidato.'),
      estado: z.string().length(2).optional().describe('UF da residência (2 letras, ex: "GO", "SP").'),
      bairro: z.string().optional().describe('Bairro de residência.'),
      cpf: z.string().optional().describe('CPF do candidato (opcional caso o currículo não informe CPF; o registro será salvo como CPF pendente).'),
      lojaId: z.string().optional().describe('ID (UUID) da loja da Gigante Pneus para vinculação imediata da candidatura.'),
      cargoPretendido: z.string().optional().describe('Cargo ou área de interesse informada no currículo (ex: "Mecânico Alinhador", "Vendedor").'),
      resumoProfissional: z.string().optional().describe('Síntese de qualificações e histórico profissional do currículo.'),
      origem: z.string().optional().describe('Origem do registro. Padrão: "migracao_drive".')
    },
    async (params) => {
      const result = await apiRequest(config, 'POST', '/api/admin/candidatos', {
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
        origem: params.origem || 'migracao_drive'
      });
      return formatResponse(result);
    }
  );

  // ─── 12. editar_candidato ───────────────────────────────────────────────────
  server.tool(
    'editar_candidato',
    'Atualiza dados cadastrais de um candidato existente (nome, e-mail, telefone, cidade, estado, bairro, resumo ou CPF). Envie apenas os campos que deseja alterar.',
    {
      candidatoId: z.string().describe('ID (UUID) do candidato a editar.'),
      nome: z.string().min(2).optional().describe('Novo nome completo.'),
      email: z.string().email().optional().describe('Novo e-mail do candidato.'),
      telefone: z.string().min(8).optional().describe('Novo telefone de contato.'),
      cidade: z.string().optional().describe('Nova cidade.'),
      estado: z.string().length(2).optional().describe('Nova UF (2 letras).'),
      bairro: z.string().optional().describe('Novo bairro.'),
      resumoProfissional: z.string().optional().describe('Novo resumo profissional.'),
      cpf: z.string().optional().describe('CPF do candidato (caso obtido posteriormente).')
    },
    async (params) => {
      const result = await apiRequest(config, 'PATCH', '/api/admin/candidatos', {
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

  // ─── 13. anexar_curriculo ───────────────────────────────────────────────────
  server.tool(
    'anexar_curriculo',
    'Faz o upload do arquivo binário de currículo do candidato para armazenamento seguro no Google Drive institucional e vincula ao registro de candidato_curriculos. Aceita arquivos em Base64 (PDF, DOC ou DOCX). Resolve automaticamente a pasta da unidade e a subpasta por cargo.',
    {
      candidatoId: z.string().describe('ID (UUID) do candidato ao qual o currículo pertence.'),
      arquivoBase64: z.string().describe('Conteúdo completo do arquivo codificado em Base64.'),
      nomeArquivo: z.string().describe('Nome original do arquivo com extensão (ex: "curriculo_candidato.pdf").'),
      tipoMime: z.string().optional().describe('Tipo MIME do arquivo (ex: "application/pdf"). Se omitido, será inferido do arquivo.'),
      lojaId: z.string().optional().describe('UUID da unidade/loja para direcionamento da pasta no Google Drive. Se omitido, será resolvido automaticamente das candidaturas do candidato.'),
      cargo: z.string().optional().describe('Cargo pretendido (ex: "Mecânico", "Consultor de Vendas") para direcionamento da subpasta no Google Drive. Se omitido, será resolvido automaticamente das candidaturas do candidato.')
    },
    async (params) => {
      const result = await apiRequest(config, 'POST', '/api/admin/candidatos', {
        acao: 'anexar_curriculo',
        candidatoId: params.candidatoId,
        arquivoBase64: params.arquivoBase64,
        nomeArquivo: params.nomeArquivo,
        tipoMime: params.tipoMime,
        lojaId: params.lojaId,
        cargo: params.cargo
      });
      return formatResponse(result);
    }
  );

  // ─── 14. consultar_curriculos ───────────────────────────────────────────────
  server.tool(
    'consultar_curriculos',
    'Lista todos os arquivos de currículo anexados a um candidato, retornando metadados técnicos (data, tamanho, MD5, status no Drive) e link seguro para visualização institucional.',
    {
      candidatoId: z.string().describe('ID (UUID) do candidato a consultar.')
    },
    async (params) => {
      const result = await apiRequest(config, 'GET', '/api/admin/candidatos', undefined, {
        id: params.candidatoId,
        modo: 'curriculos'
      });
      return formatResponse(result);
    }
  );

  // ─── 15. vincular_candidato_loja ────────────────────────────────────────────
  server.tool(
    'vincular_candidato_loja',
    'Vincula formalmente um candidato a uma loja (unidade) no Banco de Talentos, permitindo que a equipe de RH e gerentes daquela unidade visualizem o candidato imediatamente em seu painel. O vínculo é estritamente no Banco de Talentos: NÃO conta como candidatura a vaga aberta específica nem altera contadores de vagas abertas, e NÃO dispara mensagens automáticas (WhatsApp, SMS ou e-mail) ao candidato.',
    {
      candidatoId: z.string().describe('ID (UUID) do candidato.'),
      lojaId: z.string().describe('ID (UUID) da loja da Gigante Pneus para vincular.'),
      cargoPretendido: z.string().optional().describe('Cargo ou função de interesse na unidade (ex: "Mecânico", "Alinhador").'),
      cargoId: z.string().optional().describe('ID (UUID) de um cargo cadastrado no sistema, se conhecido.'),
      apresentacaoPessoal: z.string().optional().describe('Nota de apresentação ou observações para os recrutadores da unidade.')
    },
    async (params) => {
      const result = await apiRequest(config, 'POST', '/api/admin/candidatos', {
        acao: 'vincular_loja',
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
