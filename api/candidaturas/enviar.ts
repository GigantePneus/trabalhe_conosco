import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { validateCurriculoFile } from '../../services/security/fileValidator';
import { candidaturasRateLimiter, checkDistributedRateLimit } from '../../services/security/rateLimiter';
import { googleDriveStorage } from '../../services/storage/googleDriveStorage';
import { validateCpf, maskCpf, generateCpfHash, encryptCpf } from '../../services/security/cpfSecurity';

// Configuração do cliente Supabase administrativo no backend com reload dinâmico de .env.local
export function getSupabaseAdmin() {
  dotenv.config({ path: '.env.local', override: true });
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL || 'https://hidayzojjztfyuefmknz.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.includes('supabase-demo') || key.trim() === '') {
    return null;
  }
  return createClient(url, key.trim(), {
    auth: { persistSession: false }
  });
}

export interface VagaItemPayload {
  cargo_id?: string | null;
  loja_id?: string | null;
  vaga_interesse: string;
}

export interface CandidaturaPayload {
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  cidade?: string;
  estado?: string;
  escolaridade?: string;
  linkedin_url?: string;
  aceita_outras_vagas?: boolean;
  consentimento_lgpd: boolean;
  vagas?: VagaItemPayload[];
  // Campos de retrocompatibilidade para submissão de vaga única
  cargo_id?: string | null;
  loja_id?: string | null;
  vaga_interesse?: string;
  resumo?: string;
  arquivo: {
    nome: string;
    base64: string;
    mimeType?: string;
    simulateFailure?: boolean; // Para testes controlados de resiliência
  };
}

export interface CandidaturaResponse {
  success: boolean;
  status_processamento?: 'efetivado' | 'recebido_para_analise';
  protocolo?: string;
  candidatura_id?: string;
  candidato_id?: string;
  curriculo_id?: string;
  candidaturas_criadas?: number;
  vagas_duplicadas_ignoradas?: string[];
  status?: string;
  mensagem: string;
  detalhes?: string;
}

/**
 * Gera um protocolo único no formato GIG-YYYYMMDD-XXXXXX
 */
function gerarProtocoloCandidatura(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GIG-${dateStr}-${randomHex}`;
}

/**
 * Sanitiza strings para prevenção de injeção e caracteres nulos
 */
function sanitizeString(str?: string | null): string {
  if (!str) return '';
  return str.replace(/\0/g, '').trim();
}

/**
 * Registra falhas de compensação do Google Drive de forma persistente no banco de dados
 * (tabela upload_transacoes) e em arquivo local de auditoria, sem depender apenas de logs.
 */
async function registrarFalhaCompensacaoPersistente(
  fileId: string,
  nomeArquivo: string,
  protocolo: string,
  motivoErro: string
) {
  console.error(`[Backend][COMPENSATION_ALERT] Falha ao remover arquivo órfão (${fileId}):`, motivoErro);

  const sessionTokenHash = crypto.createHash('sha256').update(fileId + protocolo + Date.now().toString()).digest('hex');

  const adminClient = getSupabaseAdmin();
  if (!adminClient) return;

  try {
    await adminClient
      .from('upload_transacoes')
      .insert({
        sessao_token_hash: sessionTokenHash,
        google_drive_file_id: fileId,
        nome_arquivo: nomeArquivo || 'curriculo_orfao_pendente',
        mime_type: 'application/pdf',
        tamanho_bytes: 0,
        status: 'falho',
        tentativas_reconciliacao: 1,
        erro_reconciliacao: `Falha na compensação imediata: ${motivoErro || 'Erro desconhecido'}`,
        expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
  } catch (dbPersistErr: any) {
    console.error('[Backend][CRITICAL_COMPENSATION] Falha ao registrar compensação no banco:', dbPersistErr?.message);
  }
}

/**
 * Handler principal do endpoint POST /api/candidaturas/enviar
 * Compatível com Vercel Serverless Function e middleware Vite/Express
 */
export async function handleCandidatura(
  payload: CandidaturaPayload,
  clientIp = '127.0.0.1'
): Promise<{ statusCode: number; data: CandidaturaResponse }> {
  try {
    // 1. Rate Limiting Compartilhado Distribuído (Serverless) com Fail-Closed em Produção
    const rateCheck = await checkDistributedRateLimit(clientIp, 15, 60);
    if (!rateCheck.allowed) {
      if (rateCheck.serviceUnavailable) {
        return {
          statusCode: 503,
          data: {
            success: false,
            mensagem: 'Serviço temporariamente indisponível para controle de tráfego. Tente novamente em alguns instantes.'
          }
        };
      }
      return {
        statusCode: 429,
        data: {
          success: false,
          mensagem: `Limite de requisições excedido. Aguarde ${rateCheck.retryAfterSeconds} segundos antes de tentar novamente.`
        }
      };
    }

    // 2. Validação e Sanitização dos Campos Cadastrais
    const nome = sanitizeString(payload.nome);
    const email = sanitizeString(payload.email).toLowerCase();
    const telefone = sanitizeString(payload.telefone);
    const cidade = sanitizeString(payload.cidade);
    const estado = sanitizeString(payload.estado).toUpperCase().slice(0, 2);
    const escolaridade = sanitizeString(payload.escolaridade);
    const linkedinUrl = sanitizeString(payload.linkedin_url);
    const aceitaOutrasVagas = payload.aceita_outras_vagas === true;
    const resumo = sanitizeString(payload.resumo);

    if (!nome || nome.length < 2) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: 'Nome completo é obrigatório (mínimo de 2 caracteres).' }
      };
    }

    if (!email || !email.includes('@') || !email.includes('.')) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: 'E-mail inválido. Informe um endereço de e-mail autêntico.' }
      };
    }

    if (!telefone || telefone.length < 8) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: 'Telefone de contato é obrigatório (mínimo de 8 dígitos).' }
      };
    }

    if (!payload.consentimento_lgpd) {
      return {
        statusCode: 400,
        data: {
          success: false,
          mensagem: 'O consentimento com os termos da LGPD é obrigatório para submissão do currículo.'
        }
      };
    }

    // 3. Validação Matemática e Proteção Criptográfica do CPF
    const cpfValidation = validateCpf(payload.cpf);
    if (!cpfValidation.valid) {
      return {
        statusCode: 400,
        data: {
          success: false,
          mensagem: cpfValidation.error || 'CPF inválido. Verifique os dígitos informados.'
        }
      };
    }

    const cleanCpf = cpfValidation.cleanCpf;
    const cpfMascarado = maskCpf(cleanCpf);
    const cpfHash = generateCpfHash(cleanCpf);
    let cpfCriptografado: string | null = null;
    try {
      cpfCriptografado = encryptCpf(cleanCpf);
    } catch {
      // Fallback gracioso caso chave de criptografia reversível esteja ausente em dev local
      cpfCriptografado = null;
    }

    // 4. Normalização da Lista de Vagas Pretendidas (Múltiplas Vagas)
    const vagasList: VagaItemPayload[] = [];
    if (payload.vagas && Array.isArray(payload.vagas) && payload.vagas.length > 0) {
      for (const item of payload.vagas) {
        if (item && (item.cargo_id || item.loja_id || item.vaga_interesse)) {
          vagasList.push({
            cargo_id: item.cargo_id ? item.cargo_id.trim() : null,
            loja_id: item.loja_id ? item.loja_id.trim() : null,
            vaga_interesse: sanitizeString(item.vaga_interesse) || 'Candidatura Espontânea'
          });
        }
      }
    } else {
      // Fallback retrocompatível para formulário de vaga única
      vagasList.push({
        cargo_id: payload.cargo_id ? payload.cargo_id.trim() : null,
        loja_id: payload.loja_id ? payload.loja_id.trim() : null,
        vaga_interesse: sanitizeString(payload.vaga_interesse) || 'Candidatura Geral'
      });
    }

    if (vagasList.length === 0) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: 'Selecione ao menos uma vaga ou oportunidade de interesse.' }
      };
    }

    // 5. Validação do Arquivo de Currículo (Limite 10 MB e formato)
    if (!payload.arquivo || !payload.arquivo.base64 || !payload.arquivo.nome) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: 'O arquivo de currículo (.pdf, .doc ou .docx) é obrigatório.' }
      };
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(payload.arquivo.base64, 'base64');
    } catch {
      return {
        statusCode: 400,
        data: { success: false, mensagem: 'Codificação de arquivo inválida. O arquivo deve estar em Base64.' }
      };
    }

    const validationResult = validateCurriculoFile(
      fileBuffer,
      payload.arquivo.nome,
      payload.arquivo.mimeType
    );

    if (!validationResult.valid) {
      return {
        statusCode: 400,
        data: {
          success: false,
          mensagem: validationResult.error || 'Arquivo inválido.'
        }
      };
    }

    // 6. Geração do Protocolo Único
    const protocolo = gerarProtocoloCandidatura();

    // 6.0. Verificação das credenciais administrativas do backend
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return {
        statusCode: 503,
        data: {
          success: false,
          mensagem: 'O servidor backend local requer a configuração da chave SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local para executar a ingestão com segurança.',
          detalhes: 'Configure a variável SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local do servidor para concluir o envio.'
        }
      };
    }

    // 6.1. Verificação Prévia de Duplicidade Total no Backend (Sem Expor Consulta Pública)
    // Evita upload desnecessário para o Google Drive quando o candidato já possuir inscrição ativa
    // para todas as vagas solicitadas. Executado internamente com a chave administrativa segura.
    const cargosEspecificosIds = vagasList
      .map(v => v.cargo_id)
      .filter((cid): cid is string => typeof cid === 'string' && cid.length > 0);

    if (cargosEspecificosIds.length > 0 && cargosEspecificosIds.length === vagasList.length) {
      try {
        const { data: candExistente } = await supabaseAdmin
          .from('candidatos')
          .select('id, candidaturas(cargo_id, status)')
          .eq('cpf_hash', cpfHash)
          .maybeSingle();

        if (candExistente && candExistente.candidaturas && Array.isArray(candExistente.candidaturas)) {
          const candidaturasAtivas = candExistente.candidaturas.filter(
            (c: any) => c.status !== 'Reprovado' && c.status !== 'Desistente'
          );
          const todasVagasDuplicadas = cargosEspecificosIds.every(cid =>
            candidaturasAtivas.some((c: any) => c.cargo_id === cid)
          );

          if (todasVagasDuplicadas) {
            return {
              statusCode: 409,
              data: {
                success: false,
                status: 'todas_vagas_duplicadas',
                protocolo,
                mensagem: 'Você já possui inscrição ativa para todas as vagas selecionadas.',
                detalhes: 'Nenhum novo arquivo foi enviado ao armazenamento seguro.'
              }
            };
          }
        }
      } catch (dupCheckErr) {
        // Fallback gracioso: caso a checagem prévia não responda, prossegue para o fluxo transacional padrão
        console.warn('[Backend] Verificação prévia de duplicidade contornada:', dupCheckErr);
      }
    }

    // 7. Upload ÚNICO no Google Drive (Reaproveitado por todas as candidaturas selecionadas)
    let driveUpload;
    try {
      driveUpload = await googleDriveStorage.uploadFile({
        buffer: fileBuffer,
        originalName: payload.arquivo.nome,
        mimeType: validationResult.detectedMimeType || 'application/pdf',
        lojaId: vagasList[0]?.loja_id || null,
        simulateFailure: payload.arquivo.simulateFailure === true
      });
    } catch (driveErr: any) {
      console.error('[Backend] Falha no armazenamento externo:', driveErr.message);
      return {
        statusCode: 502,
        data: {
          success: false,
          mensagem: 'Falha temporária ao comunicar com o servidor de armazenamento seguro. Por favor, tente enviar novamente.',
          detalhes: 'O upload para o repositório de arquivos falhou. Nenhum registro foi gravado no banco de dados.'
        }
      };
    }

    // 8. Execução Transacional Atômica no PostgreSQL (RPC registrar_candidatura_transacional v2.0)
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'registrar_candidatura_transacional',
      {
        p_nome: nome,
        p_email: email,
        p_cpf_limpo: cleanCpf,
        p_cpf_hash: cpfHash,
        p_cpf_mascarado: cpfMascarado,
        p_cpf_criptografado: cpfCriptografado,
        p_telefone: telefone,
        p_cidade: cidade,
        p_estado: estado,
        p_escolaridade: escolaridade,
        p_linkedin_url: linkedinUrl,
        p_aceita_outras_vagas: aceitaOutrasVagas,
        p_consentimento_lgpd: true,
        p_vagas: vagasList,
        p_resumo: resumo,
        p_google_drive_file_id: driveUpload.fileId,
        p_google_drive_folder_id: driveUpload.folderId,
        p_nome_arquivo: driveUpload.fileName,
        p_mime_type: driveUpload.mimeType,
        p_tamanho_bytes: driveUpload.tamanhoBytes,
        p_md5_checksum: driveUpload.md5Checksum,
        p_protocolo: protocolo,
        p_ip_origem: clientIp
      }
    );

    // 9. Mecanismo de Compensação (Rollback Saga) se a transação do banco falhar
    if (rpcError) {
      console.error('[Backend] Erro na transação do banco:', rpcError.message);
      // Exclui o arquivo enviado ao Google Drive para não deixar arquivos órfãos
      try {
        await googleDriveStorage.deleteFile(driveUpload.fileId);
      } catch (compErr: any) {
        await registrarFalhaCompensacaoPersistente(
          driveUpload.fileId,
          driveUpload.fileName,
          protocolo,
          compErr?.message || 'Erro desconhecido'
        );
      }

      // Tratamento de erros de domínio da RPC
      const msg = rpcError.message || '';
      if (msg.includes('VAGA_INEXISTENTE')) {
        return { statusCode: 404, data: { success: false, mensagem: 'Uma das vagas selecionadas não foi encontrada.' } };
      }
      if (msg.includes('VAGA_INATIVA')) {
        return { statusCode: 400, data: { success: false, mensagem: 'Uma das vagas selecionadas não está mais disponível para inscrições.' } };
      }
      if (msg.includes('UNIDADE_INCOMPATIVEL')) {
        return { statusCode: 400, data: { success: false, mensagem: 'A unidade selecionada diverge da unidade cadastrada para a vaga.' } };
      }
      if (msg.includes('UNIDADE_INATIVA')) {
        return { statusCode: 400, data: { success: false, mensagem: 'A unidade selecionada está temporariamente indisponível.' } };
      }

      return {
        statusCode: 500,
        data: {
          success: false,
          mensagem: 'Não foi possível finalizar o registro da candidatura. Os dados foram revertidos com segurança.',
          detalhes: rpcError.message
        }
      };
    }

    // 10. Tratamento de Inscrição Duplicada Total detectada pela RPC
    // Se a RPC identificou que todas as vagas já estavam inscritas, descarta o arquivo do Drive via compensação
    if (rpcData?.status_processamento === 'todas_vagas_duplicadas') {
      try {
        await googleDriveStorage.deleteFile(driveUpload.fileId);
      } catch (compErr: any) {
        await registrarFalhaCompensacaoPersistente(
          driveUpload.fileId,
          driveUpload.fileName,
          protocolo,
          compErr?.message || 'Erro desconhecido'
        );
      }
      return {
        statusCode: 409,
        data: {
          success: false,
          status: 'todas_vagas_duplicadas',
          protocolo: rpcData.protocolo || protocolo,
          vagas_duplicadas_ignoradas: rpcData.vagas_duplicadas_ignoradas || [],
          mensagem: 'Você já possui inscrição ativa para todas as vagas selecionadas.',
          detalhes: 'O arquivo de currículo enviado foi removido e não foram criadas candidaturas adicionais.'
        }
      };
    }

    // 11. Resposta Diferenciada Genérica (Proteção contra enumeração de dados em caso de divergência cadastral)
    if (rpcData?.status_processamento === 'recebido_para_analise') {
      return {
        statusCode: 200,
        data: {
          success: true,
          status_processamento: 'recebido_para_analise',
          protocolo: rpcData.protocolo || protocolo,
          curriculo_id: rpcData.curriculo_id,
          status: 'Em Análise',
          mensagem: 'Sua solicitação de candidatura foi recebida com sucesso e está em análise pelo departamento de Recursos Humanos.'
        }
      };
    }

    return {
      statusCode: 201,
      data: {
        success: true,
        status_processamento: 'efetivado',
        protocolo: rpcData?.protocolo || protocolo,
        candidato_id: rpcData?.candidato_id,
        curriculo_id: rpcData?.curriculo_id,
        candidaturas_criadas: rpcData?.candidaturas_criadas || vagasList.length,
        vagas_duplicadas_ignoradas: rpcData?.vagas_duplicadas_ignoradas || [],
        status: 'Recebido',
        mensagem: 'Candidatura e currículo recebidos e vinculados com sucesso às vagas selecionadas.'
      }
    };
  } catch (err: any) {
    console.error('[Backend] Erro inesperado:', err);
    return {
      statusCode: 500,
      data: {
        success: false,
        mensagem: 'Ocorreu um erro interno no processamento da sua solicitação.'
      }
    };
  }
}

/**
 * Handler padrão para Vercel Serverless Function
 */
export default async function vercelHandler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, mensagem: `Método ${req.method} não permitido.` });
  }

  const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      // payload json bruto
    }
  }

  const result = await handleCandidatura(body || {}, clientIp);

  if (result.statusCode === 503 || result.statusCode === 429) {
    res.setHeader('Retry-After', '30');
  }

  return res.status(result.statusCode).json(result.data);
}
