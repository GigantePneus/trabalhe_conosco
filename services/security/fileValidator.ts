export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedMimeType?: string;
  detectedFormat?: 'pdf' | 'doc' | 'docx';
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB = 10.485.760 bytes

/**
 * Validador estrito de arquivos de currículo.
 * Valida tamanho, extensão e conteúdo binário real (magic numbers / assinaturas de cabeçalho).
 */
export function validateCurriculoFile(
  buffer: Buffer,
  originalName: string,
  declaredMimeType?: string
): FileValidationResult {
  // 1. Validação de Tamanho
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'ARQUIVO_VAZIO: O arquivo enviado está vazio (0 bytes).' };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `ARQUIVO_MUITO_GRANDE: O arquivo possui ${(buffer.length / (1024 * 1024)).toFixed(2)} MB, excedendo o limite máximo de 10 MB.`
    };
  }

  // 2. Validação da Extensão
  const ext = originalName.includes('.')
    ? originalName.split('.').pop()?.toLowerCase() || ''
    : '';

  if (!['pdf', 'doc', 'docx'].includes(ext)) {
    return {
      valid: false,
      error: 'EXTENSAO_NAO_PERMITIDA: Apenas arquivos .pdf, .doc e .docx são aceitos.'
    };
  }

  // 3. Validação Binária de Conteúdo (Magic Bytes)
  // PDF: %PDF- (hex: 25 50 44 46 2d)
  const isPdf =
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d;

  // DOC (OLE2 Compound Document): hex D0 CF 11 E0 A1 B1 1A E1
  const isDoc =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1;

  // DOCX (ZIP archive standard PK): hex 50 4B 03 04
  const isDocx =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  if (ext === 'pdf' && !isPdf) {
    return {
      valid: false,
      error: 'CONTEUDO_INVALIDO: O arquivo possui extensão .pdf mas sua assinatura binária não corresponde a um documento PDF válido.'
    };
  }

  if (ext === 'doc' && !isDoc) {
    return {
      valid: false,
      error: 'CONTEUDO_INVALIDO: O arquivo possui extensão .doc mas sua assinatura binária não corresponde a um documento Microsoft Word válido.'
    };
  }

  if (ext === 'docx' && !isDocx) {
    return {
      valid: false,
      error: 'CONTEUDO_INVALIDO: O arquivo possui extensão .docx mas sua assinatura binária não corresponde a um documento OOXML/Word válido.'
    };
  }

  // Se nenhum formato binário suportado for detectado
  if (!isPdf && !isDoc && !isDocx) {
    return {
      valid: false,
      error: 'CONTEUDO_REJEITADO: Formato binário não reconhecido. Envie um arquivo PDF, DOC ou DOCX autêntico.'
    };
  }

  let finalMime = 'application/pdf';
  let format: 'pdf' | 'doc' | 'docx' = 'pdf';

  if (isPdf) {
    finalMime = 'application/pdf';
    format = 'pdf';
  } else if (isDoc) {
    finalMime = 'application/msword';
    format = 'doc';
  } else if (isDocx) {
    finalMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    format = 'docx';
  }

  return {
    valid: true,
    detectedMimeType: finalMime,
    detectedFormat: format
  };
}

