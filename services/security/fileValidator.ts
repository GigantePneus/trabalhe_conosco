export type CurriculoSupportedFormat = 'pdf' | 'doc' | 'docx' | 'rtf' | 'jpg' | 'jpeg' | 'png';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedMimeType?: string;
  detectedFormat?: CurriculoSupportedFormat;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB = 10.485.760 bytes

/**
 * Validador estrito de arquivos de currículo.
 * Valida tamanho, extensão e conteúdo binário real (magic numbers / assinaturas de cabeçalho).
 * Suporta: PDF, DOC, DOCX, RTF, JPG, JPEG e PNG.
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

  const allowedExtensions: CurriculoSupportedFormat[] = ['pdf', 'doc', 'docx', 'rtf', 'jpg', 'jpeg', 'png'];

  if (!allowedExtensions.includes(ext as any)) {
    return {
      valid: false,
      error: 'EXTENSAO_NAO_PERMITIDA: Apenas arquivos .pdf, .doc, .docx, .rtf, .jpg, .jpeg e .png são aceitos.'
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

  // DOCX (ZIP archive standard PK): hex 50 4B 03 04 ou 50 4B 05 06 ou 50 4B 07 08
  const isDocx =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);

  // RTF: {\rtf (hex: 7B 5C 72 74 66)
  const isRtf =
    buffer.length >= 5 &&
    buffer[0] === 0x7b &&
    buffer[1] === 0x5c &&
    buffer[2] === 0x72 &&
    buffer[3] === 0x74 &&
    buffer[4] === 0x66;

  // JPEG / JPG: hex FF D8 FF
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  // PNG: hex 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

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

  if (ext === 'rtf' && !isRtf) {
    return {
      valid: false,
      error: 'CONTEUDO_INVALIDO: O arquivo possui extensão .rtf mas sua assinatura binária não corresponde a um documento RTF válido.'
    };
  }

  if ((ext === 'jpg' || ext === 'jpeg') && !isJpeg) {
    return {
      valid: false,
      error: 'CONTEUDO_INVALIDO: O arquivo possui extensão .jpg/.jpeg mas sua assinatura binária não corresponde a uma imagem JPEG válida.'
    };
  }

  if (ext === 'png' && !isPng) {
    return {
      valid: false,
      error: 'CONTEUDO_INVALIDO: O arquivo possui extensão .png mas sua assinatura binária não corresponde a uma imagem PNG válida.'
    };
  }

  // Se nenhum formato binário suportado for detectado
  if (!isPdf && !isDoc && !isDocx && !isRtf && !isJpeg && !isPng) {
    return {
      valid: false,
      error: 'CONTEUDO_REJEITADO: Formato binário não reconhecido. Envie um arquivo PDF, DOC, DOCX, RTF, JPG ou PNG autêntico.'
    };
  }

  let finalMime = 'application/pdf';
  let format: CurriculoSupportedFormat = 'pdf';

  if (isPdf) {
    finalMime = 'application/pdf';
    format = 'pdf';
  } else if (isDoc) {
    finalMime = 'application/msword';
    format = 'doc';
  } else if (isDocx) {
    finalMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    format = 'docx';
  } else if (isRtf) {
    finalMime = 'application/rtf';
    format = 'rtf';
  } else if (isJpeg) {
    finalMime = 'image/jpeg';
    format = (ext === 'jpg' ? 'jpg' : 'jpeg');
  } else if (isPng) {
    finalMime = 'image/png';
    format = 'png';
  }

  return {
    valid: true,
    detectedMimeType: finalMime,
    detectedFormat: format
  };
}

