import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  IStorageAdapter,
  StorageUploadOptions,
  StorageUploadResult
} from './googleDriveStorage';
import {
  DEFAULT_CORPORATE_EMAIL,
  DEFAULT_ROOT_FOLDER_ID,
  FetchLike,
  GoogleOAuthService,
  googleOAuthService
} from './googleOAuthService';

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
  simulateFailure?: boolean;
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
   * Busca uma subpasta pelo nome exato dentro de `parentId` para evitar duplicação de pastas.
   */
  public async findSubfolderByName(name: string, parentId: string): Promise<DriveFileMetadata | null> {
    const token = await this.oauthService.getValidAccessToken();
    const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapedParent = parentId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `mimeType = '${FOLDER_MIME_TYPE}' and name = '${escapedName}' and '${escapedParent}' in parents and trashed = false`;

    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,mimeType,parents,trashed,shared)',
      pageSize: '1',
      spaces: 'drive'
    });

    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`GDRIVE_FOLDER_SEARCH_ERROR: Erro ao buscar subpasta (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as { files?: DriveFileMetadata[] };
    return data.files && data.files.length > 0 ? data.files[0] : null;
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
   * Resolve a pasta de destino para candidaturas corporativas ou de lojas franqueadas:
   * - Corporativo (lojaId == null): GIGANTE PNEUS - RH / 01 - CORPORATIVO
   * - Loja (lojaId UUID): GIGANTE PNEUS - RH / 02 - UNIDADES FRANQUEADAS / [UUID_LOJA]
   */
  public async getFolderForStore(lojaId: string | null): Promise<string> {
    if (!lojaId) {
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

    // Valida formato UUID estrito para nunca usar nomes de candidatos como nomes de pasta
    const cleanLojaId = lojaId.trim();
    if (!/^[0-9a-fA-F-]{8,64}$/.test(cleanLojaId)) {
      throw new Error('GDRIVE_INVALID_STORE_ID: O identificador da loja deve ser um UUID válido.');
    }

    const cachedStoreFolder = this.folderCache.get(cleanLojaId);
    if (cachedStoreFolder) {
      return cachedStoreFolder;
    }

    // 1. Consulta se a loja já possui google_drive_folder_id salvo no banco
    if (this.supabaseAdmin) {
      try {
        const { data: lojaRow } = await this.supabaseAdmin
          .from('lojas')
          .select('google_drive_folder_id')
          .eq('id', cleanLojaId)
          .maybeSingle();

        if (lojaRow?.google_drive_folder_id && !lojaRow.google_drive_folder_id.startsWith('folder_')) {
          try {
            const existingMeta = await this.getFolderMetadata(lojaRow.google_drive_folder_id);
            this.folderCache.set(cleanLojaId, existingMeta.id);
            return existingMeta.id;
          } catch {
            // Se o ID registrado não for acessível, cria/resolve na árvore oficial
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

    // 3. Garante a pasta exclusiva da loja pelo seu UUID real
    const storeFolder = await this.createFolder(cleanLojaId, unidadesRootId);
    this.folderCache.set(cleanLojaId, storeFolder.id);

    // 4. Persiste o ID real da pasta na tabela public.lojas para reutilização futura
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

    // 1. Resolve a pasta de destino e valida acesso
    const folderId = options.folderId
      ? (await this.getFolderMetadata(options.folderId)).id
      : await this.getFolderForStore(options.lojaId || null);

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

