// src-api/admin/vagas.ts
import { createClient } from "@supabase/supabase-js";
var supabaseAdminInstance = null;
function getSupabaseAdmin() {
  if (supabaseAdminInstance) return supabaseAdminInstance;
  const supaUrl = process.env.SUPABASE_URL || process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaServiceKey) {
    throw new Error("CONFIG_ERROR: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.");
  }
  supabaseAdminInstance = createClient(supaUrl, supaServiceKey, {
    auth: { persistSession: false }
  });
  return supabaseAdminInstance;
}
function registrarAuditoria(entry) {
  console.log(`[AUDITORIA_ADMIN] ${JSON.stringify(entry)}`);
}
var slugify = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
async function verifyVagasAuth(token) {
  const rawToken = token?.trim();
  if (!rawToken) {
    return { authorized: false, statusCode: 401, error: "ACESSO_NEGADO: Token de autentica\xE7\xE3o n\xE3o fornecido." };
  }
  const cleanToken = rawToken.replace(/^Bearer\s+/i, "").trim();
  const adminClient = getSupabaseAdmin();
  const { data: userData, error: userError } = await adminClient.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return { authorized: false, statusCode: 401, error: "ACESSO_NEGADO: Sess\xE3o de usu\xE1rio inv\xE1lida ou expirada." };
  }
  const userId = userData.user.id;
  const { data: perfil, error: perfilError } = await adminClient.from("perfis").select("id, nome, email, role, ativo").eq("id", userId).maybeSingle();
  if (perfilError || !perfil) {
    return { authorized: false, statusCode: 403, error: "ACESSO_NEGADO: Perfil de usu\xE1rio n\xE3o encontrado." };
  }
  if (!perfil.ativo) {
    return { authorized: false, statusCode: 403, error: "ACESSO_NEGADO: Este usu\xE1rio est\xE1 desativado no sistema." };
  }
  const role = perfil.role;
  const isMasterOrRh = role === "franqueadora_admin" || role === "rh_corporativo";
  const isFranqueado = role === "franqueado";
  const isGerente = role === "gerente";
  let lojasAutorizadasIds = [];
  if (isFranqueado || isGerente) {
    const { data: ulData, error: ulError } = await adminClient.from("usuario_lojas").select("loja_id").eq("user_id", userId);
    if (ulError) {
      return { authorized: false, statusCode: 500, error: "Erro ao consultar unidades autorizadas do usu\xE1rio." };
    }
    lojasAutorizadasIds = (ulData || []).map((item) => item.loja_id).filter(Boolean);
    if (lojasAutorizadasIds.length === 0) {
      return { authorized: false, statusCode: 403, error: "ACESSO_NEGADO: Usu\xE1rio operacional sem unidades autorizadas vinculadas." };
    }
  }
  return {
    authorized: true,
    context: {
      userId,
      email: perfil.email || userData.user.email || "",
      nome: perfil.nome || "Usu\xE1rio RH",
      role,
      isMasterOrRh,
      isFranqueado,
      isGerente,
      lojasAutorizadasIds
    }
  };
}
async function handleListarVagas(filtros = {}, token) {
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || "Acesso negado" } };
  }
  const { context } = auth;
  const adminClient = getSupabaseAdmin();
  const page = Math.max(Number(filtros.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filtros.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;
  let query = adminClient.from("cargos").select(`
      id,
      titulo,
      departamento,
      tipo_vaga,
      descricao,
      requisitos,
      ativo,
      publicada,
      loja_id,
      criado_em,
      atualizado_em,
      lojas (
        id,
        nome,
        cidade,
        estado,
        ativa
      )
    `, { count: "exact" });
  if (!context.isMasterOrRh) {
    query = query.in("loja_id", context.lojasAutorizadasIds);
  }
  if (filtros.lojaId && filtros.lojaId !== "todas") {
    if (!context.isMasterOrRh && !context.lojasAutorizadasIds.includes(filtros.lojaId)) {
      return { statusCode: 403, data: { success: false, mensagem: "ACESSO_NEGADO: Voc\xEA n\xE3o possui autoriza\xE7\xE3o para consultar esta unidade." } };
    }
    query = query.eq("loja_id", filtros.lojaId);
  }
  const statusFilter = filtros.status || "todas";
  if (statusFilter === "publicadas") {
    query = query.eq("ativo", true).eq("publicada", true);
  } else if (statusFilter === "rascunhos") {
    query = query.eq("ativo", true).eq("publicada", false);
  } else if (statusFilter === "desativadas") {
    query = query.eq("ativo", false);
  }
  if (filtros.titulo && filtros.titulo.trim()) {
    query = query.ilike("titulo", `%${filtros.titulo.trim()}%`);
  }
  if (filtros.departamento && filtros.departamento.trim()) {
    query = query.ilike("departamento", `%${filtros.departamento.trim()}%`);
  }
  query = query.order("criado_em", { ascending: false }).range(offset, offset + limit - 1);
  const { data, count, error } = await query;
  if (error) {
    return { statusCode: 500, data: { success: false, mensagem: `Erro ao listar vagas: ${error.message}` } };
  }
  let mappedVagas = (data || []).map((row) => {
    let statusCalculado = "rascunho";
    if (!row.ativo) {
      statusCalculado = "desativada";
    } else if (row.publicada) {
      statusCalculado = "publicada";
    }
    return {
      id: row.id,
      titulo: row.titulo,
      departamento: row.departamento || null,
      tipoVaga: row.tipo_vaga || "Presencial",
      descricao: row.descricao || null,
      requisitosRaw: row.requisitos || null,
      ativo: Boolean(row.ativo),
      publicada: Boolean(row.publicada),
      status: statusCalculado,
      loja: row.lojas ? {
        id: row.lojas.id,
        nome: row.lojas.nome,
        cidade: row.lojas.cidade,
        estado: row.lojas.estado,
        ativa: row.lojas.ativa
      } : null,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em
    };
  });
  if (filtros.cidade && filtros.cidade.trim()) {
    const targetCidade = filtros.cidade.trim().toLowerCase();
    mappedVagas = mappedVagas.filter((v) => v.loja?.cidade?.toLowerCase().includes(targetCidade));
  }
  const total = count || mappedVagas.length;
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    statusCode: 200,
    data: {
      success: true,
      vagas: mappedVagas,
      paginacao: {
        total,
        page,
        limit,
        totalPages
      }
    }
  };
}
async function handleConsultarVaga(vagaId, token) {
  if (!vagaId || typeof vagaId !== "string") {
    return { statusCode: 400, data: { success: false, mensagem: "Identificador de vaga (ID) \xE9 obrigat\xF3rio." } };
  }
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || "Acesso negado" } };
  }
  const { context } = auth;
  const adminClient = getSupabaseAdmin();
  const { data: row, error } = await adminClient.from("cargos").select(`
      id,
      titulo,
      departamento,
      tipo_vaga,
      descricao,
      requisitos,
      ativo,
      publicada,
      loja_id,
      criado_em,
      atualizado_em,
      lojas (
        id,
        nome,
        cidade,
        estado,
        ativa
      )
    `).eq("id", vagaId).maybeSingle();
  if (error) {
    return { statusCode: 500, data: { success: false, mensagem: `Erro ao consultar vaga: ${error.message}` } };
  }
  if (!row) {
    return { statusCode: 404, data: { success: false, mensagem: "Vaga n\xE3o encontrada." } };
  }
  if (!context.isMasterOrRh && row.loja_id) {
    if (!context.lojasAutorizadasIds.includes(row.loja_id)) {
      return { statusCode: 403, data: { success: false, mensagem: "ACESSO_NEGADO: Voc\xEA n\xE3o possui autoriza\xE7\xE3o para acessar os dados desta vaga." } };
    }
  }
  let statusCalculado = "rascunho";
  if (!row.ativo) {
    statusCalculado = "desativada";
  } else if (row.publicada) {
    statusCalculado = "publicada";
  }
  let detalhesLanding = null;
  if (row.requisitos) {
    try {
      detalhesLanding = JSON.parse(row.requisitos);
    } catch {
      detalhesLanding = { raw: row.requisitos };
    }
  }
  return {
    statusCode: 200,
    data: {
      success: true,
      vaga: {
        id: row.id,
        titulo: row.titulo,
        departamento: row.departamento || null,
        tipoVaga: row.tipo_vaga || "Presencial",
        descricao: row.descricao || null,
        requisitosRaw: row.requisitos || null,
        ativo: Boolean(row.ativo),
        publicada: Boolean(row.publicada),
        status: statusCalculado,
        loja: (() => {
          const l = Array.isArray(row.lojas) ? row.lojas[0] : row.lojas;
          return l ? {
            id: l.id,
            nome: l.nome,
            cidade: l.cidade,
            estado: l.estado,
            ativa: l.ativa
          } : null;
        })(),
        criadoEm: row.criado_em,
        atualizadoEm: row.atualizado_em,
        detalhesLanding
      }
    }
  };
}
async function handleCriarVaga(input, token) {
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || "Acesso negado" } };
  }
  const { context } = auth;
  const adminClient = getSupabaseAdmin();
  if (context.isGerente) {
    return {
      statusCode: 403,
      data: { success: false, mensagem: "ACESSO_NEGADO: Usu\xE1rios com perfil Gerente n\xE3o possuem permiss\xE3o para criar vagas." }
    };
  }
  const camposProibidosCriacao = ["publicada", "ativo", "id", "criado_em", "criadoEm", "atualizado_em"];
  const tentouProibidosCriacao = camposProibidosCriacao.filter((f) => f in input);
  if (tentouProibidosCriacao.length > 0) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `Os campos ${tentouProibidosCriacao.join(", ")} n\xE3o podem ser definidos na cria\xE7\xE3o. Novas vagas iniciam obrigatoriamente como rascunho.`
      }
    };
  }
  const titulo = input.titulo?.trim();
  if (!titulo || titulo.length < 3) {
    return {
      statusCode: 400,
      data: { success: false, mensagem: "T\xEDtulo da vaga \xE9 obrigat\xF3rio e deve conter ao menos 3 caracteres." }
    };
  }
  let targetLojaId = input.lojaId ? input.lojaId.trim() : null;
  if (context.isFranqueado) {
    if (!targetLojaId) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: "Franqueados devem obrigatoriamente vincular a vaga a uma unidade autorizada." }
      };
    }
    if (!context.lojasAutorizadasIds.includes(targetLojaId)) {
      return {
        statusCode: 403,
        data: { success: false, mensagem: "ACESSO_NEGADO: Voc\xEA n\xE3o possui autoriza\xE7\xE3o para criar vagas nesta unidade." }
      };
    }
  }
  let lojaNome = "Rede / Corporativo";
  let lojaCidade = "";
  let lojaEstado = "";
  if (targetLojaId) {
    const { data: lojaRecord, error: lojaErr } = await adminClient.from("lojas").select("id, nome, cidade, estado, ativa").eq("id", targetLojaId).maybeSingle();
    if (lojaErr || !lojaRecord) {
      return { statusCode: 400, data: { success: false, mensagem: "A unidade informada n\xE3o foi localizada no sistema." } };
    }
    if (!lojaRecord.ativa) {
      return { statusCode: 400, data: { success: false, mensagem: "N\xE3o \xE9 poss\xEDvel vincular vagas a unidades inativas ou desativadas." } };
    }
    lojaNome = lojaRecord.nome;
    lojaCidade = lojaRecord.cidade;
    lojaEstado = lojaRecord.estado;
  }
  const landingPayload = {
    published: false,
    // OBRIGATÓRIO: Inicia sempre como Rascunho
    slug: slugify(titulo),
    title: titulo,
    heroImageUrl: input.heroImageUrl || "/imagens/banner%20vagas%20-%20gigante%20pneus.png",
    location: input.location || (lojaCidade && lojaEstado ? `${lojaCidade} - ${lojaEstado}` : lojaNome),
    workModel: input.workModel || input.tipoVaga || "Presencial",
    shortDescription: input.shortDescription || input.descricao || "Oportunidade para atuar em nossos centros automotivos com foco em excel\xEAncia e desenvolvimento.",
    salary: input.salary || "A combinar",
    benefits: Array.isArray(input.benefits) && input.benefits.length > 0 ? input.benefits : ["Vale alimenta\xE7\xE3o", "Plano de sa\xFAde", "Seguro de vida"],
    responsibilities: Array.isArray(input.responsibilities) && input.responsibilities.length > 0 ? input.responsibilities : ["Executar as atividades t\xE9cnicas e operacionais da fun\xE7\xE3o com foco em qualidade."],
    requirements: Array.isArray(input.requirements) && input.requirements.length > 0 ? input.requirements : ["Experi\xEAncia pr\xE9via na fun\xE7\xE3o e perfil colaborativo."],
    agentContext: input.descricao || ""
  };
  const requisitosSerialized = JSON.stringify(landingPayload);
  const { data: inserted, error: insertError } = await adminClient.from("cargos").insert([{
    titulo,
    loja_id: targetLojaId,
    departamento: input.departamento?.trim() || "Operacional",
    tipo_vaga: input.tipoVaga?.trim() || "Presencial",
    descricao: input.descricao?.trim() || landingPayload.shortDescription,
    requisitos: requisitosSerialized,
    ativo: true,
    publicada: false
    // OBRIGATÓRIO: Rascunho inicialmente
  }]).select("id").single();
  if (insertError) {
    return {
      statusCode: 500,
      data: { success: false, mensagem: `Falha ao cadastrar vaga: ${insertError.message}` }
    };
  }
  registrarAuditoria({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    operador: {
      userId: context.userId,
      email: context.email,
      nome: context.nome,
      role: context.role
    },
    operacao: "CRIAR_VAGA",
    registroAfetado: {
      tipo: "cargos",
      vagaId: inserted.id,
      lojaId: targetLojaId
    },
    resultado: "SUCESSO",
    detalhes: { titulo, lojaId: targetLojaId }
  });
  return {
    statusCode: 201,
    data: {
      success: true,
      vagaId: inserted.id,
      mensagem: "Vaga cadastrada com sucesso como RASCUNHO (n\xE3o publicada)."
    }
  };
}
async function handleEditarVaga(input, token) {
  if (!input.vagaId) {
    return { statusCode: 400, data: { success: false, mensagem: "Identificador de vaga (vagaId) \xE9 obrigat\xF3rio." } };
  }
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || "Acesso negado" } };
  }
  const { context } = auth;
  const adminClient = getSupabaseAdmin();
  if (context.isGerente) {
    return {
      statusCode: 403,
      data: { success: false, mensagem: "ACESSO_NEGADO: Usu\xE1rios com perfil Gerente n\xE3o possuem permiss\xE3o para editar vagas." }
    };
  }
  const camposProibidosEdicao = ["publicada", "ativo", "id", "criado_em", "criadoEm", "atualizado_em"];
  const tentouProibidosEdicao = camposProibidosEdicao.filter((f) => f in input);
  if (tentouProibidosEdicao.length > 0) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `Altera\xE7\xE3o n\xE3o permitida para os campos: ${tentouProibidosEdicao.join(", ")}. O ciclo de vida da vaga deve ser alterado exclusivamente via a\xE7\xF5es de status ('publicar', 'despublicar', 'desativar', 'reativar').`
      }
    };
  }
  const { data: vagaAtual, error: fetchErr } = await adminClient.from("cargos").select("id, titulo, loja_id, requisitos, publicada, ativo").eq("id", input.vagaId).maybeSingle();
  if (fetchErr || !vagaAtual) {
    return { statusCode: 404, data: { success: false, mensagem: "Vaga n\xE3o encontrada para edi\xE7\xE3o." } };
  }
  if (context.isFranqueado) {
    if (!vagaAtual.loja_id || !context.lojasAutorizadasIds.includes(vagaAtual.loja_id)) {
      return { statusCode: 403, data: { success: false, mensagem: "ACESSO_NEGADO: Voc\xEA s\xF3 pode editar vagas de suas unidades autorizadas." } };
    }
  }
  const updates = {
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (input.titulo && input.titulo.trim().length >= 3) {
    updates.titulo = input.titulo.trim();
  }
  if (input.departamento !== void 0) {
    updates.departamento = input.departamento?.trim() || null;
  }
  if (input.tipoVaga !== void 0) {
    updates.tipo_vaga = input.tipoVaga?.trim() || "Presencial";
  }
  if (input.descricao !== void 0) {
    updates.descricao = input.descricao?.trim() || null;
  }
  if (input.lojaId !== void 0) {
    const novaLojaId = input.lojaId ? input.lojaId.trim() : null;
    if (context.isFranqueado) {
      if (!novaLojaId || !context.lojasAutorizadasIds.includes(novaLojaId)) {
        return { statusCode: 403, data: { success: false, mensagem: "ACESSO_NEGADO: Voc\xEA n\xE3o pode transferir vagas para unidades n\xE3o autorizadas." } };
      }
    }
    if (novaLojaId) {
      const { data: lojaCheck, error: errLoja } = await adminClient.from("lojas").select("id, ativa").eq("id", novaLojaId).maybeSingle();
      if (errLoja || !lojaCheck || !lojaCheck.ativa) {
        return { statusCode: 400, data: { success: false, mensagem: "A unidade informada n\xE3o existe ou est\xE1 inativa." } };
      }
    }
    updates.loja_id = novaLojaId;
  }
  let existingLanding = {};
  try {
    existingLanding = JSON.parse(vagaAtual.requisitos || "{}");
  } catch {
  }
  const mergedLanding = {
    ...existingLanding,
    title: updates.titulo || existingLanding.title || vagaAtual.titulo,
    shortDescription: input.shortDescription || updates.descricao || existingLanding.shortDescription,
    salary: input.salary || existingLanding.salary,
    workModel: input.workModel || updates.tipo_vaga || existingLanding.workModel,
    benefits: Array.isArray(input.benefits) ? input.benefits : existingLanding.benefits,
    responsibilities: Array.isArray(input.responsibilities) ? input.responsibilities : existingLanding.responsibilities,
    requirements: Array.isArray(input.requirements) ? input.requirements : existingLanding.requirements,
    location: input.location || existingLanding.location,
    published: vagaAtual.publicada
    // Preserva o status de publicação intacto
  };
  updates.requisitos = JSON.stringify(mergedLanding);
  const { error: updateErr } = await adminClient.from("cargos").update(updates).eq("id", input.vagaId);
  if (updateErr) {
    return { statusCode: 500, data: { success: false, mensagem: `Falha ao atualizar vaga: ${updateErr.message}` } };
  }
  registrarAuditoria({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    operador: {
      userId: context.userId,
      email: context.email,
      nome: context.nome,
      role: context.role
    },
    operacao: "EDITAR_VAGA",
    registroAfetado: {
      tipo: "cargos",
      vagaId: input.vagaId,
      lojaId: vagaAtual.loja_id
    },
    resultado: "SUCESSO",
    detalhes: { camposAtualizados: Object.keys(updates) }
  });
  return { statusCode: 200, data: { success: true, mensagem: "Dados da vaga atualizados com sucesso." } };
}
async function handleAlterarStatusVaga(input, token) {
  if (!input.vagaId || !input.acao) {
    return { statusCode: 400, data: { success: false, mensagem: "Identificador (vagaId) e a\xE7\xE3o s\xE3o obrigat\xF3rios." } };
  }
  const acoesValidas = ["publicar", "despublicar", "desativar", "reativar"];
  if (!acoesValidas.includes(input.acao)) {
    return { statusCode: 400, data: { success: false, mensagem: `A\xE7\xE3o de status inv\xE1lida: "${input.acao}". Use: publicar, despublicar, desativar ou reativar.` } };
  }
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || "Acesso negado" } };
  }
  const { context } = auth;
  const adminClient = getSupabaseAdmin();
  if (context.isGerente) {
    return {
      statusCode: 403,
      data: { success: false, mensagem: "ACESSO_NEGADO: Usu\xE1rios com perfil Gerente n\xE3o possuem permiss\xE3o para alterar status de vagas." }
    };
  }
  const { data: vaga, error: fetchErr } = await adminClient.from("cargos").select("id, titulo, loja_id, requisitos, publicada, ativo").eq("id", input.vagaId).maybeSingle();
  if (fetchErr || !vaga) {
    return { statusCode: 404, data: { success: false, mensagem: "Vaga n\xE3o encontrada." } };
  }
  if (context.isFranqueado) {
    if (!vaga.loja_id || !context.lojasAutorizadasIds.includes(vaga.loja_id)) {
      return { statusCode: 403, data: { success: false, mensagem: "ACESSO_NEGADO: Voc\xEA s\xF3 pode alterar status de vagas das suas unidades autorizadas." } };
    }
  }
  const updates = {
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  let novoStatus = "rascunho";
  let mensagemSucesso = "";
  let landingContent = {};
  try {
    landingContent = JSON.parse(vaga.requisitos || "{}");
  } catch {
  }
  switch (input.acao) {
    case "publicar": {
      if (vaga.loja_id) {
        const { data: lojaCheck } = await adminClient.from("lojas").select("ativa").eq("id", vaga.loja_id).single();
        if (lojaCheck && !lojaCheck.ativa) {
          return { statusCode: 400, data: { success: false, mensagem: "N\xE3o \xE9 poss\xEDvel publicar vagas vinculadas a unidades desativadas." } };
        }
      }
      updates.publicada = true;
      updates.ativo = true;
      landingContent.published = true;
      novoStatus = "publicada";
      mensagemSucesso = `Vaga "${vaga.titulo}" publicada com sucesso e vis\xEDvel no site.`;
      break;
    }
    case "despublicar": {
      updates.publicada = false;
      updates.ativo = true;
      landingContent.published = false;
      novoStatus = "rascunho";
      mensagemSucesso = `Vaga "${vaga.titulo}" alterada para RASCUNHO (oculta do site).`;
      break;
    }
    case "desativar": {
      updates.ativo = false;
      updates.publicada = false;
      landingContent.published = false;
      novoStatus = "desativada";
      mensagemSucesso = `Vaga "${vaga.titulo}" desativada e arquivada com sucesso.`;
      break;
    }
    case "reativar": {
      updates.ativo = true;
      updates.publicada = false;
      landingContent.published = false;
      novoStatus = "rascunho";
      mensagemSucesso = `Vaga "${vaga.titulo}" reativada com sucesso como RASCUNHO.`;
      break;
    }
    default:
      return { statusCode: 400, data: { success: false, mensagem: `A\xE7\xE3o inv\xE1lida: "${input.acao}". Use: publicar, despublicar, desativar ou reativar.` } };
  }
  updates.requisitos = JSON.stringify(landingContent);
  const { error: updErr } = await adminClient.from("cargos").update(updates).eq("id", input.vagaId);
  if (updErr) {
    return { statusCode: 500, data: { success: false, mensagem: `Falha ao alterar status da vaga: ${updErr.message}` } };
  }
  registrarAuditoria({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    operador: {
      userId: context.userId,
      email: context.email,
      nome: context.nome,
      role: context.role
    },
    operacao: "ALTERAR_STATUS_VAGA",
    registroAfetado: {
      tipo: "cargos",
      vagaId: input.vagaId,
      lojaId: vaga.loja_id
    },
    resultado: "SUCESSO",
    detalhes: { acao: input.acao, novoStatus }
  });
  return {
    statusCode: 200,
    data: {
      success: true,
      novoStatus,
      mensagem: mensagemSucesso
    }
  };
}
async function handleListarLojas(token) {
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || "Acesso negado" } };
  }
  const { context } = auth;
  const adminClient = getSupabaseAdmin();
  let query = adminClient.from("lojas").select("id, nome, cidade, estado, ativa").order("nome", { ascending: true });
  if (!context.isMasterOrRh) {
    query = query.in("id", context.lojasAutorizadasIds);
  }
  const { data, error } = await query;
  if (error) {
    return { statusCode: 500, data: { success: false, mensagem: `Erro ao listar lojas: ${error.message}` } };
  }
  return {
    statusCode: 200,
    data: {
      success: true,
      lojas: (data || []).map((l) => ({
        id: l.id,
        nome: l.nome,
        cidade: l.cidade || null,
        estado: l.estado || null,
        ativa: Boolean(l.ativa)
      }))
    }
  };
}
async function vercelAdminVagasHandler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const vagaId = url.searchParams.get("id");
      if (vagaId) {
        const result2 = await handleConsultarVaga(vagaId, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      const filtros = {
        lojaId: url.searchParams.get("lojaId") || void 0,
        cidade: url.searchParams.get("cidade") || void 0,
        titulo: url.searchParams.get("titulo") || void 0,
        departamento: url.searchParams.get("departamento") || void 0,
        status: url.searchParams.get("status") || "todas",
        page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20
      };
      const result = await handleListarVagas(filtros, token);
      return res.status(result.statusCode).json(result.data);
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = await handleCriarVaga(body, token);
      return res.status(result.statusCode).json(result.data);
    }
    if (req.method === "PATCH" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (body?.acao) {
        const result2 = await handleAlterarStatusVaga(body, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      const result = await handleEditarVaga(body, token);
      return res.status(result.statusCode).json(result.data);
    }
    res.setHeader("Allow", ["GET", "POST", "PATCH", "PUT"]);
    return res.status(405).json({ success: false, mensagem: `M\xE9todo ${req.method} n\xE3o permitido.` });
  } catch (err) {
    return res.status(500).json({ success: false, mensagem: err?.message || "Erro interno no servidor." });
  }
}
export {
  vercelAdminVagasHandler as default,
  handleAlterarStatusVaga,
  handleConsultarVaga,
  handleCriarVaga,
  handleEditarVaga,
  handleListarLojas,
  handleListarVagas,
  registrarAuditoria,
  verifyVagasAuth
};
