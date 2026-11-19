import crypto from 'crypto';
import { GoogleDriveOAuthAdapter, normalizeCargoSubfolderName } from './googleDriveOAuthAdapter.ts';

export interface StorageUploadOptions {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folderId?: string | null;
  lojaId?: string | null;
  cargoId?: string | null;
  cargoNome?: string | null;
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

export interface ResolvedFolderHierarchy {
  storeFolderId: string;
  targetFolderId: string;
  storeFolderName: string;
  cargoFolderName: string;
}

export interface IStorageAdapter {
  uploadFile(options: StorageUploadOptions): Promise<StorageUploadResult>;
  deleteFile(fileId: string): Promise<boolean>;
  getFolderForStore(lojaId: string | null): Promise<string>;
  getFolderForStoreAndCargo?(options: {
    lojaId?: string | null;
    cargoId?: string | null;
    cargoNome?: string | null;
    storeName?: string | null;
  }): Promise<ResolvedFolderHierarchy>;
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
  private static foldersMap = new Map<string, { id: string; name: string; parentId?: string }>();
  private defaultCorporateFolderId = 'gdrive_folder_corp_gigante_rh';
  private defaultUnidadesRootFolderId = 'gdrive_folder_unidades_root';

  constructor() {
    GoogleDriveMockAdapter.foldersMap.set(this.defaultCorporateFolderId, {
      id: this.defaultCorporateFolderId,
      name: '01 - CORPORATIVO'
    });
    GoogleDriveMockAdapter.foldersMap.set(this.defaultUnidadesRootFolderId, {
      id: this.defaultUnidadesRootFolderId,
      name: '02 - UNIDADES FRANQUEADAS'
    });
  }

  async getFolderForStore(lojaId: string | null): Promise<string> {
    if (!lojaId) {
      return this.defaultCorporateFolderId;
    }
    const cleanId = lojaId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
    const storeFolderId = `gdrive_folder_loja_${cleanId}`;
    if (!GoogleDriveMockAdapter.foldersMap.has(storeFolderId)) {
      GoogleDriveMockAdapter.foldersMap.set(storeFolderId, {
        id: storeFolderId,
        name: `Gigante Pneus – Loja ${cleanId}`,
        parentId: this.defaultUnidadesRootFolderId
      });
    }
    return storeFolderId;
  }

  async getFolderForStoreAndCargo(options: {
    lojaId?: string | null;
    cargoId?: string | null;
    cargoNome?: string | null;
    storeName?: string | null;
  }): Promise<ResolvedFolderHierarchy> {
    const storeFolderId = await this.getFolderForStore(options.lojaId || null);
    const storeObj = GoogleDriveMockAdapter.foldersMap.get(storeFolderId);
    const storeFolderName = options.storeName || storeObj?.name || (options.lojaId ? 'Gigante Pneus – Unidade' : '01 - CORPORATIVO');

    const cargoFolderName = normalizeCargoSubfolderName(options.cargoNome);
    const cargoSlug = cargoFolderName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
    const targetFolderId = `${storeFolderId}_cargo_${cargoSlug}`;

    if (!GoogleDriveMockAdapter.foldersMap.has(targetFolderId)) {
      GoogleDriveMockAdapter.foldersMap.set(targetFolderId, {
        id: targetFolderId,
        name: cargoFolderName,
        parentId: storeFolderId
      });
    }

    return {
      storeFolderId,
      targetFolderId,
      storeFolderName,
      cargoFolderName
    };
  }

  async uploadFile(options: StorageUploadOptions): Promise<StorageUploadResult> {
    // 1. Simulação controlada de falha da API externa (para testes de resiliência)
    if (options.simulateFailure) {
      throw new Error('GDRIVE_API_ERROR: Falha de comunicação ou timeout simulado com a API do Google Drive.');
    }

    // 2. Resolução da pasta de destino segura (subpasta por cargo dentro da pasta da unidade)
    let folderId = options.folderId;
    if (!folderId) {
      const hierarchy = await this.getFolderForStoreAndCargo({
        lojaId: options.lojaId || null,
        cargoId: options.cargoId || null,
        cargoNome: options.cargoNome || null
      });
      folderId = hierarchy.targetFolderId;
    }

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

  static getFolders() {
    return Array.from(this.foldersMap.values());
  }

  static clearStorage() {
    this.filesMap.clear();
    this.foldersMap.clear();
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
  getFolderForStoreAndCargo(options: {
    lojaId?: string | null;
    cargoId?: string | null;
    cargoNome?: string | null;
    storeName?: string | null;
  }) {
    const adapter = getActiveStorageAdapter();
    if (adapter.getFolderForStoreAndCargo) {
      return adapter.getFolderForStoreAndCargo(options);
    }
    return adapter.getFolderForStore(options.lojaId || null).then(fid => ({
      storeFolderId: fid,
      targetFolderId: fid,
      storeFolderName: 'Unidade',
      cargoFolderName: 'Geral'
    }));
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
