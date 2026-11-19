import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  IStorageAdapter,
  StorageUploadOptions,
  StorageUploadResult
} from './googleDriveStorage.ts';
import {
  DEFAULT_CORPORATE_EMAIL,
  DEFAULT_ROOT_FOLDER_ID,
  type FetchLike,
  GoogleOAuthService,
  googleOAuthService
} from './googleOAuthService.ts';

export const ALLOWED_CURRICULO_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const;

export const FOLDER_NAME_CORPORATIVO = '01 - CORPORATIVO';
export const FOLDER_NAME_UNIDADES = '02 - UNIDADES FRANQUEADAS';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  md5Checksum?: string;
  size?: string;
  trashed?: boolean;
  shared?: boolean;
  permissions?: Array<{ id: string; type: string; role: string }>;
}

export interface DirectUploadMetadata {
  originalName: string;
  mimeType: string;
  folderId?: string | null;
  lojaId?: string | null;
  cargoId?: string | null;
  cargoNome?: string | null;
  simulateFailure?: boolean;
}

/**
 * Formata o nome da pasta de uma unidade franqueada para o padrão oficial:
 * "Gigante Pneus – [Cidade/Nome] – [UF]"
 */
export function formatStoreFolderName(loja: {
  nome: string;
  cidade?: string | null;
  estado?: string | null;
}): string {
  let nome = (loja.nome || '').trim();
  const uf = (loja.estado || '').trim().toUpperCase();

  // Garante o prefixo oficial "Gigante Pneus"
  if (!/^gigante\s*pneus/i.test(nome)) {
    nome = `Gigante Pneus – ${nome}`;
  }

  // Normaliza hífens para meia-risca (en-dash) com espaços
  nome = nome.replace(/\s*[-–—]\s*/g, ' – ');

  // Se o estado estiver presente e o nome ainda não terminar com o estado (ex: " – SP")
  if (uf && !new RegExp(`[–-]\\s*${uf}$`, 'i').test(nome) && !nome.includes(`/${uf}`)) {
    nome = `${nome} – ${uf}`;
  }

  return nome;
}

/**
 * Normaliza o título da vaga/cargo para nomes padronizados de subpastas no Google Drive.
 * Agrupa cargos equivalentes e define subpasta própria para candidaturas espontâneas.
 */
export function normalizeCargoSubfolderName(rawTitle?: string | null): string {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return 'Banco de Talentos - Espontânea';
  }

  const clean = rawTitle.trim();
  if (
    !clean ||
    clean.toLowerCase() === 'geral' ||
    clean.toLowerCase().includes('espontanea') ||
    clean.toLowerCase().includes('espontânea') ||
    clean.toLowerCase().includes('banco de talentos')
  ) {
    return 'Banco de Talentos - Espontânea';
  }

  const lower = clean.toLowerCase();

  // 1. Mecânico (Mecânico Automotivo, Mecanico de Autos, etc.)
  if (/mecanic|mecânic/i.test(lower)) {
    if (/auxiliar.*(mecanic|mecânic)/i.test(lower)) {
      return 'Auxiliar de Mecânico';
    }
    return 'Mecânico';
  }

  // 2. Alinhador (Alinhador Automotivo, Alinhador de Pneus, etc.)
  if (/alinhad/i.test(lower)) {
    return 'Alinhador';
  }

  // 3. Consultor de Vendas (Vendedor, Consultor Comercial, etc.)
  if (/vend|comercial|consultor/i.test(lower)) {
    return 'Consultor de Vendas';
  }

  // 4. Estoquista (Almoxarife, Controle de Estoque, etc.)
  if (/estoqu|almoxar/i.test(lower)) {
    return 'Estoquista';
  }

  // 5. Auxiliar de Pátio
  if (/auxiliar.*p[aá]tio/i.test(lower)) {
    return 'Auxiliar de Pátio';
  }

  // 6. Recepcionista (Atendente, Recepção, etc.)
  if (/recep|atendent/i.test(lower)) {
    return 'Recepcionista';
  }

  // Fallback limpo: remove barras e caracteres especiais de filesystem
  return clean
    .replace(/[/\\?%*:|"<>]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Adaptador Real Google Drive API v3 com OAuth 2.0 (escopo estrito `drive.file`).
 * - Organiza automaticamente em:
 *   - Corporativo: GIGANTE PNEUS - RH / 01 - CORPORATIVO
 *   - Unidades: GIGANTE PNEUS - RH / 02 - UNIDADES FRANQUEADAS / [UUID_LOJA]
 * - Bloqueia qualquer tentativa de compartilhamento público (`anyone`).
 * - Registra o ID da pasta na tabela `public.lojas.google_drive_folder_id`.
 */
export class GoogleDriveOAuthAdapter implements IStorageAdapter {
  private oauthService: GoogleOAuthService;
  private fetchImpl: FetchLike;
  private rootFolderId: string;
  private folderCache = new Map<string, string>();
  private supabaseAdmin: SupabaseClient | null = null;

  constructor(options?: {
    oauthService?: GoogleOAuthService;
    fetchImpl?: FetchLike;
    rootFolderId?: string;
    supabaseAdmin?: SupabaseClient | null;
  }) {
    this.oauthService = options?.oauthService || googleOAuthService;
    this.fetchImpl = options?.fetchImpl || globalThis.fetch.bind(globalThis);
    this.rootFolderId =
      options?.rootFolderId ||
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
      DEFAULT_ROOT_FOLDER_ID;

    if (options?.supabaseAdmin !== undefined) {
      this.supabaseAdmin = options.supabaseAdmin;
    } else {
      const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supaUrl && supaKey) {
        this.supabaseAdmin = createClient(supaUrl, supaKey, {
          auth: { persistSession: false }
        });
      }
    }
  }

  /**
   * Valida a conexão OAuth 2.0, verifica se a conta autenticada é a corporativa oficial
   * e testa a acessibilidade da pasta raiz sob o escopo `drive.file`.
   */
  public async validateConnection(): Promise<{
    connected: boolean;
    userEmail: string;
    rootFolderId: string;
    rootFolderName: string;
  }> {
    const token = await this.oauthService.getValidAccessToken();

    const aboutRes = await this.fetchImpl(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!aboutRes.ok) {
      throw new Error(`GDRIVE_CONNECTION_ERROR: Falha ao consultar drive/v3/about (HTTP ${aboutRes.status}).`);
    }

    const aboutData = (await aboutRes.json()) as { user?: { emailAddress?: string } };
    const email = (aboutData.user?.emailAddress || '').toLowerCase().trim();
    const expectedEmail = this.oauthService.getConfig().authorizedEmail || DEFAULT_CORPORATE_EMAIL;

    if (email !== expectedEmail) {
      throw new Error(
        `GDRIVE_UNAUTHORIZED_USER: Conta conectada (${email}) diverge da conta corporativa (${expectedEmail}).`
      );
    }

    const rootMeta = await this.getFolderMetadata(this.rootFolderId);

    return {
      connected: true,
      userEmail: email,
      rootFolderId: rootMeta.id,
      rootFolderName: rootMeta.name
    };
  }

  /**
   * Obtém metadados de uma pasta e valida se ela está acessível ao aplicativo sob `drive.file`
   * e não está na lixeira.
   */
  public async getFolderMetadata(folderId: string): Promise<DriveFileMetadata> {
    if (!folderId || typeof folderId !== 'string') {
      throw new Error('GDRIVE_FOLDER_ID_INVALID: ID de pasta não informado.');
    }

    const token = await this.oauthService.getValidAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      folderId
    )}?fields=id,name,mimeType,parents,trashed,shared`;

    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000)
    });

    if (res.status === 404 || res.status === 403) {
      throw new Error(
        `GDRIVE_FOLDER_INACCESSIBLE: A pasta '${folderId}' não está acessível com o escopo 'drive.file' (HTTP ${res.status}). Pastas criadas manualmente na interface web do Drive precisam ser autorizadas via Google Picker com o Client ID do aplicativo ou criadas diretamente pela API do aplicativo.`
      );
    }

    if (!res.ok) {
      throw new Error(`GDRIVE_API_ERROR: Falha ao obter metadados da pasta (HTTP ${res.status}).`);
    }

    const meta = (await res.json()) as DriveFileMetadata;

    if (meta.trashed) {
      throw new Error(`GDRIVE_FOLDER_TRASHED: A pasta '${folderId}' encontra-se na lixeira.`);
    }

    if (meta.mimeType !== FOLDER_MIME_TYPE) {
      throw new Error(`GDRIVE_NOT_A_FOLDER: O recurso '${folderId}' não é uma pasta do Google Drive.`);
    }

    return meta;
  }

  /**
   * Busca uma subpasta pelo nome exato ou normalizado dentro de `parentId` para evitar duplicação de pastas.
   */
  public async findSubfolderByName(name: string, parentId: string): Promise<DriveFileMetadata | null> {
    const token = await this.oauthService.getValidAccessToken();
    const cleanName = name.trim();
    const escapedParent = parentId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `mimeType = '${FOLDER_MIME_TYPE}' and '${escapedParent}' in parents and trashed = false`;

    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,mimeType,parents,trashed,shared)',
      pageSize: '100',
      spaces: 'drive'
    });

    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`GDRIVE_FOLDER_SEARCH_ERROR: Erro ao buscar subpastas em '${parentId}' (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as { files?: DriveFileMetadata[] };
    if (!data.files || data.files.length === 0) return null;

    const normalize = (s: string) => s.replace(/[-–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetNorm = normalize(cleanName);

    // 1. Busca exata primeiro
    const exact = data.files.find(f => f.name === cleanName);
    if (exact) return exact;

    // 2. Busca normalizada (mesmo nome com variações de traço/espaço)
    const normalizedMatch = data.files.find(f => normalize(f.name) === targetNorm);
    if (normalizedMatch) return normalizedMatch;

    return null;
  }

  /**
   * Cria uma pasta privada no Google Drive dentro de `parentId` (ou busca se já existir).
   */
  public async createFolder(name: string, parentId?: string): Promise<DriveFileMetadata> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('GDRIVE_FOLDER_NAME_INVALID: Nome da pasta não pode ser vazio.');
    }

    const targetParent = parentId || this.rootFolderId;

    // Verifica se o parent é acessível antes de criar
    await this.getFolderMetadata(targetParent);

    // Previne duplicação verificando se já existe subpasta com o mesmo nome
    const existing = await this.findSubfolderByName(cleanName, targetParent);
    if (existing) {
      return existing;
    }

    const token = await this.oauthService.getValidAccessToken();
    const metadata = {
      name: cleanName,
      mimeType: FOLDER_MIME_TYPE,
      parents: [targetParent]
    };

    const res = await this.fetchImpl(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,shared',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!res.ok) {
      throw new Error(`GDRIVE_CREATE_FOLDER_FAILED: Não foi possível criar a pasta '${cleanName}' (HTTP ${res.status}).`);
    }

    return (await res.json()) as DriveFileMetadata;
  }

  /**
   * Resolve a pasta de destino da unidade franqueada ou corporativo:
   * - Corporativo: GIGANTE PNEUS - RH / 01 - CORPORATIVO
   * - Loja Franqueada: GIGANTE PNEUS - RH / 02 - UNIDADES FRANQUEADAS / Gigante Pneus – [Loja] – [UF]
   */
  public async getFolderForStore(lojaId: string | null): Promise<string> {
    if (!lojaId || lojaId === 'corporativo' || lojaId === '00000000-0000-0000-0000-000000000000') {
      const envCorpFolder = process.env.GOOGLE_DRIVE_CORP_FOLDER_ID;
      if (envCorpFolder) {
        await this.getFolderMetadata(envCorpFolder);
        return envCorpFolder;
      }

      const cachedCorp = this.folderCache.get('__CORPORATIVO__');
      if (cachedCorp) return cachedCorp;

      const corpFolder = await this.createFolder(FOLDER_NAME_CORPORATIVO, this.rootFolderId);
      this.folderCache.set('__CORPORATIVO__', corpFolder.id);
      return corpFolder.id;
    }

    // Valida formato UUID estrito
    const cleanLojaId = lojaId.trim();
    if (!/^[0-9a-fA-F-]{8,64}$/.test(cleanLojaId)) {
      throw new Error('GDRIVE_INVALID_STORE_ID: O identificador da loja deve ser um UUID válido.');
    }

    const cachedStoreFolder = this.folderCache.get(cleanLojaId);
    if (cachedStoreFolder) {
      return cachedStoreFolder;
    }

    let lojaRow: { id: string; nome: string; cidade?: string | null; estado?: string | null; google_drive_folder_id?: string | null } | null = null;

    // 1. Consulta metadados da loja no Supabase
    if (this.supabaseAdmin) {
      try {
        const { data } = await this.supabaseAdmin
          .from('lojas')
          .select('id, nome, cidade, estado, google_drive_folder_id')
          .eq('id', cleanLojaId)
          .maybeSingle();
        lojaRow = data;

        // Se já possui google_drive_folder_id salvo, verifica se a pasta é válida e não está na lixeira
        if (lojaRow?.google_drive_folder_id && !lojaRow.google_drive_folder_id.startsWith('folder_')) {
          try {
            const existingMeta = await this.getFolderMetadata(lojaRow.google_drive_folder_id);
            if (!existingMeta.trashed && existingMeta.mimeType === FOLDER_MIME_TYPE) {
              this.folderCache.set(cleanLojaId, existingMeta.id);
              return existingMeta.id;
            }
          } catch {
            // Pasta registrada está inacessível ou na lixeira; resolve/recria com nome padronizado
          }
        }
      } catch {
        // Continua resolução via Drive API
      }
    }

    // 2. Garante a pasta '02 - UNIDADES FRANQUEADAS' sob a raiz
    let unidadesRootId = process.env.GOOGLE_DRIVE_UNIDADES_FOLDER_ID || this.folderCache.get('__UNIDADES_ROOT__');
    if (!unidadesRootId) {
      const unidadesFolder = await this.createFolder(FOLDER_NAME_UNIDADES, this.rootFolderId);
      unidadesRootId = unidadesFolder.id;
      this.folderCache.set('__UNIDADES_ROOT__', unidadesRootId);
    }

    // 3. Monta o nome oficial padronizado da unidade (ex: "Gigante Pneus – Jundiaí – SP")
    const storeFolderName = formatStoreFolderName(lojaRow || { nome: cleanLojaId });

    // 4. Localiza ou cria a pasta da unidade sob '02 - UNIDADES FRANQUEADAS'
    const storeFolder = await this.createFolder(storeFolderName, unidadesRootId);
    this.folderCache.set(cleanLojaId, storeFolder.id);

    // 5. Persiste o ID real da pasta na tabela public.lojas para reutilização futura
    if (this.supabaseAdmin) {
      try {
        await this.supabaseAdmin
          .from('lojas')
          .update({ google_drive_folder_id: storeFolder.id })
          .eq('id', cleanLojaId);
      } catch {
        // Não interrompe o fluxo caso o banco esteja em modo somente leitura no teste
      }
    }

    return storeFolder.id;
  }

  /**
   * Resolve a hierarquia completa de armazenamento:
   * - Unidade Franqueada: GIGANTE PNEUS - RH / 02 - UNIDADES FRANQUEADAS / Gigante Pneus – [Loja] – [UF] / [Cargo Normalizado]
   * - Corporativo: GIGANTE PNEUS - RH / 01 - CORPORATIVO / [Cargo Normalizado]
   */
  public async getFolderForStoreAndCargo(options: {
    lojaId?: string | null;
    cargoId?: string | null;
    cargoNome?: string | null;
  }): Promise<{
    storeFolderId: string;
    targetFolderId: string;
    storeFolderName: string;
    cargoFolderName: string;
  }> {
    // 1. Resolve a pasta da unidade (ou corporativo)
    const storeFolderId = await this.getFolderForStore(options.lojaId || null);
    let storeFolderName = FOLDER_NAME_CORPORATIVO;

    if (options.lojaId && options.lojaId !== 'corporativo') {
      try {
        const meta = await this.getFolderMetadata(storeFolderId);
        storeFolderName = meta.name;
      } catch {
        storeFolderName = 'Unidade Franqueada';
      }
    }

    // 2. Resolve o nome do cargo (via cargoNome ou consultando cargoId no Supabase)
    let rawCargo = options.cargoNome?.trim() || null;
    if (!rawCargo && options.cargoId && this.supabaseAdmin) {
      try {
        const { data: cargoRow } = await this.supabaseAdmin
          .from('cargos')
          .select('titulo')
          .eq('id', options.cargoId.trim())
          .maybeSingle();
        if (cargoRow?.titulo) {
          rawCargo = cargoRow.titulo;
        }
      } catch {
        // Fallback
      }
    }

    const cargoFolderName = normalizeCargoSubfolderName(rawCargo);

    // 3. Localiza ou cria a subpasta correspondente ao cargo dentro da pasta da loja/corporativo
    const cacheKey = `cargo_${storeFolderId}_${cargoFolderName}`;
    let targetFolderId = this.folderCache.get(cacheKey);

    if (!targetFolderId) {
      const cargoFolder = await this.createFolder(cargoFolderName, storeFolderId);
      targetFolderId = cargoFolder.id;
      this.folderCache.set(cacheKey, targetFolderId);
    }

    return {
      storeFolderId,
      targetFolderId,
      storeFolderName,
      cargoFolderName
    };
  }

  /**
   * Realiza o upload multipart (RFC 2387) de um currículo para o Google Drive API v3.
   * Suporta tanto `uploadFile(options: StorageUploadOptions)` quanto `uploadFile(buffer: Buffer, metadata: DirectUploadMetadata)`.
   */
  public async uploadFile(
    bufferOrOptions: Buffer | StorageUploadOptions,
    directMetadata?: DirectUploadMetadata
  ): Promise<StorageUploadResult> {
    const options: StorageUploadOptions = Buffer.isBuffer(bufferOrOptions)
      ? {
          buffer: bufferOrOptions,
          originalName: directMetadata?.originalName || 'curriculo.pdf',
          mimeType: directMetadata?.mimeType || 'application/pdf',
          folderId: directMetadata?.folderId,
          lojaId: directMetadata?.lojaId,
          cargoId: directMetadata?.cargoId,
          cargoNome: directMetadata?.cargoNome,
          simulateFailure: directMetadata?.simulateFailure
        }
      : bufferOrOptions;

    if (options.simulateFailure) {
      throw new Error('GDRIVE_API_ERROR: Falha de comunicação ou timeout simulado com a API do Google Drive.');
    }

    if (!options.buffer || options.buffer.length === 0) {
      throw new Error('GDRIVE_EMPTY_BUFFER: Buffer de arquivo vazio.');
    }

    if (!ALLOWED_CURRICULO_MIMES.includes(options.mimeType as any)) {
      throw new Error(`GDRIVE_MIME_FORBIDDEN: MIME type '${options.mimeType}' não permitido.`);
    }

    // 1. Resolve a pasta de destino (subpasta por cargo dentro da pasta da unidade) e valida acesso
    let folderId = options.folderId;
    if (!folderId) {
      const resolved = await this.getFolderForStoreAndCargo({
        lojaId: options.lojaId || null,
        cargoId: options.cargoId || null,
        cargoNome: options.cargoNome || null
      });
      folderId = resolved.targetFolderId;
    } else {
      folderId = (await this.getFolderMetadata(folderId)).id;
    }

    // 2. Gera nome seguro e não previsível (sem expor nome do candidato)
    const ext = options.originalName.includes('.')
      ? options.originalName.split('.').pop()?.toLowerCase() || 'pdf'
      : 'pdf';
    const safeExt = ['pdf', 'doc', 'docx'].includes(ext) ? ext : 'pdf';
    const randomToken = crypto.randomBytes(16).toString('hex');
    const safeFileName = `curriculo_${randomToken}.${safeExt}`;

    // 3. Calcula o MD5 local antes do envio
    const localMd5 = crypto.createHash('md5').update(options.buffer).digest('hex');

    // 4. Monta o corpo multipart/related para Google Drive API v3
    const boundary = `gigante_drive_boundary_${crypto.randomBytes(12).toString('hex')}`;
    const driveMetadata = {
      name: safeFileName,
      mimeType: options.mimeType,
      parents: [folderId],
      copyRequiresWriterPermission: true,
      writersCanShare: false
    };

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(driveMetadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${options.mimeType}\r\n\r\n`,
      'utf-8'
    );
    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const multipartBody = Buffer.concat([preamble, options.buffer, epilogue]);

    const token = await this.oauthService.getValidAccessToken();
    const uploadUrl =
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,md5Checksum,size,shared';

    const res = await this.fetchImpl(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length)
      },
      body: multipartBody,
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      throw new Error(`GDRIVE_UPLOAD_FAILED: Google Drive API retornou HTTP ${res.status} durante o upload.`);
    }

    const uploaded = (await res.json()) as DriveFileMetadata;

    if (!uploaded.id) {
      throw new Error('GDRIVE_UPLOAD_INVALID_RESPONSE: Google Drive não retornou o ID do arquivo criado.');
    }

    // 5. Proteção de privacidade: se por qualquer configuração externa o arquivo vier compartilhado, exclui e aborta
    if (uploaded.shared === true) {
      await this.deleteFile(uploaded.id).catch(() => undefined);
      throw new Error('SECURITY_VIOLATION_PUBLIC_SHARING_FORBIDDEN: O arquivo criado possui flag de compartilhamento ativa.');
    }

    // 6. Valida integridade MD5 quando retornado pela API
    if (uploaded.md5Checksum && uploaded.md5Checksum.toLowerCase() !== localMd5.toLowerCase()) {
      await this.deleteFile(uploaded.id).catch(() => undefined);
      throw new Error('GDRIVE_CHECKSUM_MISMATCH: O checksum MD5 retornado pelo Google Drive diverge do arquivo enviado.');
    }

    return {
      fileId: uploaded.id,
      fileName: uploaded.name || safeFileName,
      folderId,
      mimeType: options.mimeType,
      tamanhoBytes: options.buffer.length,
      md5Checksum: uploaded.md5Checksum || localMd5,
      criadoEm: new Date().toISOString()
    };
  }

  /**
   * Obtém metadados de um arquivo no Google Drive.
   */
  public async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('GDRIVE_FILE_ID_INVALID: ID do arquivo inválido.');
    }

    const token = await this.oauthService.getValidAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?fields=id,name,mimeType,parents,md5Checksum,size,trashed,shared`;

    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`GDRIVE_GET_FILE_FAILED: Falha ao consultar metadados do arquivo '${fileId}' (HTTP ${res.status}).`);
    }

    return (await res.json()) as DriveFileMetadata;
  }

  /**
   * Exclui permanentemente um arquivo no Google Drive (utilizado em operações de compensação Saga).
   */
  public async deleteFile(fileId: string): Promise<boolean> {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('GDRIVE_DELETE_INVALID_ID: ID do arquivo ausente para exclusão compensatória.');
    }

    const token = await this.oauthService.getValidAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;

    const res = await this.fetchImpl(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });

    if (res.status === 204 || res.status === 200) {
      return true;
    }

    throw new Error(
      `GDRIVE_COMPENSATION_DELETE_FAILED: Falha ao excluir arquivo órfão '${fileId}' no Google Drive (HTTP ${res.status}).`
    );
  }

  /**
   * Baixa os bytes do currículo diretamente do Google Drive de forma segura (sem expor link público).
   */
  public async downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('GDRIVE_FILE_ID_INVALID: ID do arquivo inválido para download.');
    }

    const token = await this.oauthService.getValidAccessToken();
    const meta = await this.getFileMetadata(fileId);

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await this.fetchImpl(downloadUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      throw new Error(`GDRIVE_DOWNLOAD_FAILED: Google Drive API retornou HTTP ${res.status} ao baixar arquivo.`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: meta.mimeType || 'application/pdf',
      name: meta.name || 'curriculo.pdf'
    };
  }

  /**
   * Bloqueio explícito contra criação de permissões públicas (`anyone` ou links públicos).
   * Qualquer tentativa de invocar compartilhamento público lança erro de segurança.
   */
  public async createPublicPermission(_fileId: string): Promise<never> {
    throw new Error(
      'SECURITY_VIOLATION_PUBLIC_SHARING_FORBIDDEN: A criação de links públicos ou permissões "anyone" é estritamente proibida para currículos da Gigante Pneus.'
    );
  }
}

