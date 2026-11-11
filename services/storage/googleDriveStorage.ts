import crypto from 'crypto';
import { GoogleDriveOAuthAdapter } from './googleDriveOAuthAdapter';

export interface StorageUploadOptions {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folderId?: string | null;
  lojaId?: string | null;
  metadata?: Record<string, any>;
  simulateFailure?: boolean;
}

export interface StorageUploadResult {
  fileId: string;
  fileName: string;
  folderId: string;
  mimeType: string;
  tamanhoBytes: number;
  md5Checksum: string;
  criadoEm: string;
}

export interface IStorageAdapter {
  uploadFile(options: StorageUploadOptions): Promise<StorageUploadResult>;
  deleteFile(fileId: string): Promise<boolean>;
  getFolderForStore(lojaId: string | null): Promise<string>;
  downloadFile?(fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }>;
}

/**
 * Mock seguro do Google Drive para homologação e desenvolvimento local.
 * Implementa identificação de pasta por loja/corporativo, nomes seguros e não previsíveis,
 * cálculo de checksum MD5 real, simulação de falhas e método de compensação/rollback.
 * NUNCA gera links públicos de compartilhamento.
 */
export class GoogleDriveMockAdapter implements IStorageAdapter {
  private static filesMap = new Map<string, { buffer: Buffer; metadata: StorageUploadResult }>();
  private defaultCorporateFolderId = 'gdrive_folder_corp_gigante_rh';

  async getFolderForStore(lojaId: string | null): Promise<string> {
    if (!lojaId) {
      return this.defaultCorporateFolderId;
    }
    return `gdrive_folder_loja_${lojaId.replace(/-/g, '').substring(0, 12)}`;
  }

  async uploadFile(options: StorageUploadOptions): Promise<StorageUploadResult> {
    // 1. Simulação controlada de falha da API externa (para testes de resiliência)
    if (options.simulateFailure) {
      throw new Error('GDRIVE_API_ERROR: Falha de comunicação ou timeout simulado com a API do Google Drive.');
    }

    // 2. Resolução da pasta de destino segura
    const folderId = options.folderId || await this.getFolderForStore(options.lojaId || null);

    // 3. Geração de nome de arquivo seguro e não previsível
    const ext = options.originalName.includes('.')
      ? options.originalName.split('.').pop()?.toLowerCase() || 'dat'
      : 'dat';
    const uniqueToken = crypto.randomBytes(16).toString('hex');
    const safeFileName = `curriculo_${uniqueToken}.${ext}`;

    // 4. Identificador único do arquivo no Drive
    const fileId = `gdrive_file_${crypto.randomUUID()}`;

    // 5. Cálculo real de integridade MD5
    const md5Checksum = crypto.createHash('md5').update(options.buffer).digest('hex');

    const result: StorageUploadResult = {
      fileId,
      fileName: safeFileName,
      folderId,
      mimeType: options.mimeType,
      tamanhoBytes: options.buffer.length,
      md5Checksum,
      criadoEm: new Date().toISOString()
    };

    // Armazena no repositório seguro em memória do mock
    GoogleDriveMockAdapter.filesMap.set(fileId, {
      buffer: options.buffer,
      metadata: result
    });

    return result;
  }

  async deleteFile(fileId: string): Promise<boolean> {
    if (GoogleDriveMockAdapter.filesMap.has(fileId)) {
      GoogleDriveMockAdapter.filesMap.delete(fileId);
      return true;
    }
    return false;
  }

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    const stored = GoogleDriveMockAdapter.filesMap.get(fileId);
    if (!stored) {
      throw new Error(`GDRIVE_FILE_NOT_FOUND: Arquivo '${fileId}' não encontrado no storage local.`);
    }
    return {
      buffer: stored.buffer,
      mimeType: stored.metadata.mimeType,
      name: stored.metadata.fileName
    };
  }

  static getStoredFile(fileId: string) {
    return this.filesMap.get(fileId);
  }

  static clearStorage() {
    this.filesMap.clear();
  }
}

const mockAdapterInstance = new GoogleDriveMockAdapter();
let realAdapterInstance: GoogleDriveOAuthAdapter | null = null;

export function getActiveStorageAdapter(): IStorageAdapter {
  const mode = (process.env.GOOGLE_DRIVE_MODE || 'mock').toLowerCase().trim();
  if (mode === 'real') {
    if (!realAdapterInstance) {
      realAdapterInstance = new GoogleDriveOAuthAdapter();
    }
    return realAdapterInstance;
  }
  return mockAdapterInstance;
}

/**
 * Facade que delega dinamicamente para `GoogleDriveOAuthAdapter` (quando GOOGLE_DRIVE_MODE=real)
 * ou `GoogleDriveMockAdapter` (quando GOOGLE_DRIVE_MODE=mock), preservando total compatibilidade.
 */
export const googleDriveStorage: IStorageAdapter = {
  uploadFile(options: StorageUploadOptions) {
    return getActiveStorageAdapter().uploadFile(options);
  },
  deleteFile(fileId: string) {
    return getActiveStorageAdapter().deleteFile(fileId);
  },
  getFolderForStore(lojaId: string | null) {
    return getActiveStorageAdapter().getFolderForStore(lojaId);
  },
  downloadFile(fileId: string) {
    const adapter = getActiveStorageAdapter();
    if (adapter.downloadFile) {
      return adapter.downloadFile(fileId);
    }
    throw new Error('GDRIVE_DOWNLOAD_UNSUPPORTED: Adaptador de storage não suporta download.');
  }
};

export { GoogleDriveOAuthAdapter };
