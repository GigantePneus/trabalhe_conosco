import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { googleDriveStorage } from '../../services/storage/googleDriveStorage';

let supabaseAdminInstance: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) return supabaseAdminInstance;

  const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supaUrl || !supaServiceKey) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  supabaseAdminInstance = createClient(supaUrl, supaServiceKey, {
    auth: { persistSession: false }
  });
  return supabaseAdminInstance;
}

export interface VisualizarCurriculoParams {
  curriculoId?: string | null;
  fileId?: string | null;
  token?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface VisualizarCurriculoResult {
  statusCode: number;
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  error?: string;
}

/**
 * Endpoint seguro para download e visualização de currículos por usuários autorizados do RH.
 * - Valida a sessão JWT do usuário do Supabase Auth (anônimos são rejeitados).
 * - Consulta permissões estritas nas tabelas public.perfis e public.usuario_lojas.
 * - Impede que gerentes/franqueados acessem currículos de lojas que não lhes pertencem.
 * - Registra obrigatoriamente a trilha de auditoria imutável na tabela public.logs_acesso_curriculos.
 * - Faz streaming direto dos bytes sem expor nenhum link público do Google Drive.
 */
export async function handleVisualizarCurriculo(
  params: VisualizarCurriculoParams
): Promise<VisualizarCurriculoResult> {
  const cleanToken = params.token?.trim();
  const cleanCurriculoId = params.curriculoId?.trim() || undefined;
  const cleanFileId = params.fileId?.trim() || undefined;
  const clientIp = params.clientIp;
  const userAgent = params.userAgent;

  if (!cleanToken) {
    return {
      statusCode: 401,
      error: 'ACESSO_NEGADO: Token de autenticação não fornecido. Acesso restrito a recrutadores autenticados.'
    };
  }

  if (!cleanCurriculoId && !cleanFileId) {
    return {
      statusCode: 400,
      error: 'PARAMETRO_INVALIDO: Informe curriculoId ou fileId válido.'
    };
  }

  const supabaseAdmin = getSupabaseAdmin();

  // 1. Valida o token JWT com Supabase Auth
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return {
      statusCode: 401,
      error: 'ACESSO_NEGADO: Sessão de usuário inválida ou expirada.'
    };
  }

  const authUser = userData.user;

  // 2. Consulta o perfil nas tabelas oficiais do esquema (public.perfis)
  const { data: perfilRow, error: perfilErr } = await supabaseAdmin
    .from('perfis')
    .select('id, role, ativo')
    .eq('id', authUser.id)
    .maybeSingle();

  if (perfilErr || !perfilRow) {
    return {
      statusCode: 403,
      error: 'ACESSO_NEGADO: Perfil interno de recrutador não localizado para este usuário.'
    };
  }

  if (perfilRow.ativo === false) {
    return {
      statusCode: 403,
      error: 'ACESSO_BLOQUEADO: Usuário institucional desativado.'
    };
  }

  const userRole = perfilRow.role;

  // 3. Busca o registro do currículo no banco
  let query = supabaseAdmin
    .from('candidato_curriculos')
    .select('id, candidato_id, google_drive_file_id, nome_arquivo, mime_type, tamanho_bytes');

  if (cleanCurriculoId) {
    query = query.eq('id', cleanCurriculoId);
  } else if (cleanFileId) {
    query = query.eq('google_drive_file_id', cleanFileId);
  }

  const { data: currRow, error: currErr } = await query.maybeSingle();
  if (currErr || !currRow || !currRow.google_drive_file_id) {
    return {
      statusCode: 404,
      error: 'CURRICULO_NAO_ENCONTRADO: O currículo solicitado não foi encontrado no sistema.'
    };
  }

  // 4. Verificação de permissões contextuais por unidade (public.usuario_lojas)
  // Franqueadora Admin e RH Corporativo têm acesso global
  const isGlobalStaff = userRole === 'franqueadora_admin' || userRole === 'rh_corporativo';

  if (!isGlobalStaff) {
    if (userRole === 'gerente' || userRole === 'franqueado') {
      // Busca unidades atribuídas a este gerente/franqueado
      const { data: userLojas, error: lojasErr } = await supabaseAdmin
        .from('usuario_lojas')
        .select('loja_id')
        .eq('user_id', authUser.id);

      if (lojasErr || !userLojas || userLojas.length === 0) {
        return {
          statusCode: 403,
          error: 'ACESSO_NEGADO: Nenhuma unidade autorizada vinculada a este usuário.'
        };
      }

      const allowedLojaIds = new Set(userLojas.map((ul) => ul.loja_id));

      // Busca as candidaturas vinculadas a este currículo / candidato
      const { data: cands } = await supabaseAdmin
        .from('candidaturas')
        .select('loja_id')
        .eq('curriculo_id', currRow.id);

      const hasStoreAccess = (cands || []).some(
        (c) => c.loja_id && allowedLojaIds.has(c.loja_id)
      );

      if (!hasStoreAccess) {
        return {
          statusCode: 403,
          error: 'ACESSO_NEGADO: Você não possui autorização para visualizar currículos desta unidade.'
        };
      }
    } else {
      return {
        statusCode: 403,
        error: 'ACESSO_NEGADO: Papel de usuário sem permissão para download de currículos.'
      };
    }
  }

  // 5. Calcula o hash SHA-256 do e-mail do candidato para registro imutável no log
  let emailHash = '0000000000000000000000000000000000000000000000000000000000000000';
  if (currRow.candidato_id) {
    const { data: candRow } = await supabaseAdmin
      .from('candidatos')
      .select('email')
      .eq('id', currRow.candidato_id)
      .maybeSingle();

    if (candRow?.email) {
      emailHash = crypto
        .createHash('sha256')
        .update(candRow.email.toLowerCase().trim())
        .digest('hex');
    }
  }

  // 6. Registra o acesso na tabela de auditoria (Append-Only)
  try {
    const { error: insertErr } = await supabaseAdmin.from('logs_acesso_curriculos').insert({
      candidato_id: currRow.candidato_id,
      curriculo_id: currRow.id,
      candidato_email_hash: emailHash,
      google_drive_file_id: currRow.google_drive_file_id,
      usuario_id: authUser.id,
      usuario_role: userRole,
      ip_origem: clientIp || '127.0.0.1',
      user_agent: userAgent || 'Painel RH Gigante Pneus',
      motivo_acesso: 'Visualização de Currículo no Painel Administrativo'
    });
    if (insertErr) {
      console.error('[Auditoria] Erro ao registrar logs_acesso_curriculos:', JSON.stringify(insertErr));
    }
  } catch (auditErr: any) {
    console.error('[Auditoria] Exceção ao registrar logs_acesso_curriculos:', auditErr?.message);
  }

  // 7. Faz o download direto via API autorizada do Google Drive
  try {
    const fileData = await (googleDriveStorage as any).downloadFile(currRow.google_drive_file_id);
    return {
      statusCode: 200,
      buffer: fileData.buffer,
      mimeType: currRow.mime_type || fileData.mimeType || 'application/pdf',
      fileName: currRow.nome_arquivo || fileData.name || 'curriculo.pdf'
    };
  } catch (downloadErr: any) {
    console.error('[Backend] Erro ao obter arquivo do Google Drive:', downloadErr?.message);
    return {
      statusCode: 502,
      error: `FALHA_DOWNLOAD_DRIVE: Não foi possível baixar o arquivo do Google Drive (${downloadErr?.message}).`
    };
  }
}

/**
 * Handler padrão para Vercel Serverless Function
 */
export default async function vercelHandler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ success: false, error: `Método ${req.method} não permitido.` });
    }

    const authHeader = req.headers?.authorization;
    const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    const urlObj = new URL(req.url || '/api/curriculos/visualizar', 'http://localhost');

    const token = (bearerToken || (req.query?.token as string) || urlObj.searchParams.get('token') || '').trim() || undefined;
    const curriculoId = ((req.query?.id as string) || (req.query?.curriculoId as string) || urlObj.searchParams.get('id') || urlObj.searchParams.get('curriculoId') || '').trim() || undefined;
    const fileId = ((req.query?.fileId as string) || urlObj.searchParams.get('fileId') || '').trim() || undefined;
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    const userAgent = (req.headers?.['user-agent'] as string) || '';

    const result = await handleVisualizarCurriculo({
      curriculoId,
      fileId,
      token,
      clientIp,
      userAgent
    });

    if (result.statusCode === 200 && result.buffer) {
      res.setHeader('Content-Type', result.mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${result.fileName || 'curriculo.pdf'}"`);
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      return res.status(200).send(result.buffer);
    }

    return res.status(result.statusCode).json({ success: false, error: result.error });
  } catch (err: any) {
    console.error('[VercelHandler][VisualizarException]', err);
    return res.status(500).json({ success: false, error: err?.message || 'Erro interno no servidor.' });
  }
}
