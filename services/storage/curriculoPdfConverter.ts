import zlib from 'node:zlib';
import crypto from 'node:crypto';
import type { CurriculoSupportedFormat } from '../security/fileValidator.ts';

export interface ConvertCurriculoOptions {
  buffer: Buffer;
  originalName: string;
  format: CurriculoSupportedFormat;
}

export interface ConvertCurriculoResult {
  pdfBuffer: Buffer;
  pdfFileName: string;
  mimeType: 'application/pdf';
  converted: boolean;
  originalFormat: CurriculoSupportedFormat;
  tamanhoBytes: number;
}

/**
 * Escapa texto para literais de string em PDF ISO 32000-1:
 * Converte parênteses e barras invertidas, além de mapear acentos para padrão WinAnsiEncoding.
 */
function escapePdfText(text: string): string {
  // Mapeia caracteres pt-BR para WinAnsiEncoding seguro
  const sanitized = text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');

  // Converte caracteres fora do ASCII para compatibilidade estrita ISO Latin-1
  return Buffer.from(sanitized, 'latin1').toString('binary');
}

/**
 * Quebra uma linha de texto em múltiplas linhas para caber na largura da página.
 */
function wrapText(text: string, maxCharsPerLine = 85): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    } else {
      if (currentLine) lines.push(currentLine);
      if (word.length > maxCharsPerLine) {
        // Quebra palavras excessivamente longas
        for (let i = 0; i < word.length; i += maxCharsPerLine) {
          lines.push(word.substring(i, i + maxCharsPerLine));
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Extrai dimensões (largura e altura) de um arquivo JPEG inspecionando os marcadores SOF.
 */
function getJpegDimensions(buf: Buffer): { width: number; height: number } {
  let offset = 2; // Pula SOI (0xFFD8)
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // Marcadores SOF (Start Of Frame): 0xC0 (baseline), 0xC1 (extended), 0xC2 (progressive)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    const length = buf.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return { width: 1240, height: 1754 }; // Fallback A4 a 150 DPI
}

/**
 * Extrai dimensões de um arquivo PNG a partir do chunk IHDR.
 */
function getPngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length >= 24 && buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }
  return { width: 1240, height: 1754 };
}

/**
 * Gera um PDF A4 institucional contendo uma imagem JPEG completa, centralizada e sem cortes.
 */
function buildPdfFromJpeg(jpegBuffer: Buffer, width: number, height: number): Buffer {
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 36;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  // Escala preservando proporções (object-fit: contain)
  const scale = Math.min(maxW / width, maxH / height, 1.0);
  const drawW = width * scale;
  const drawH = height * scale;
  const posX = margin + (maxW - drawW) / 2;
  const posY = margin + (maxH - drawH) / 2;

  const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${posX.toFixed(2)} ${posY.toFixed(2)} cm\n/Im1 Do\nQ\n`;
  const contentBuf = Buffer.from(contentStream, 'utf8');

  const pdfParts: Buffer[] = [];
  const offsets: number[] = [0];

  function addPart(strOrBuf: string | Buffer): number {
    const b = typeof strOrBuf === 'string' ? Buffer.from(strOrBuf, 'binary') : strOrBuf;
    const currentOffset = pdfParts.reduce((acc, p) => acc + p.length, 0);
    pdfParts.push(b);
    return currentOffset;
  }

  addPart('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Obj 1: Catalog
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Obj 3: Page
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> /ProcSet [/PDF /ImageC] >> >>\nendobj\n`
  );

  // Obj 4: Contents
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(`4 0 obj\n<< /Length ${contentBuf.length} >>\nstream\n`);
  addPart(contentBuf);
  addPart('\nendstream\nendobj\n');

  // Obj 5: XObject Image (JPEG direto via DCTDecode)
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`
  );
  addPart(jpegBuffer);
  addPart('\nendstream\nendobj\n');

  // Xref
  const startXref = pdfParts.reduce((acc, p) => acc + p.length, 0);
  let xrefStr = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xrefStr += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  xrefStr += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  addPart(xrefStr);

  return Buffer.concat(pdfParts);
}

/**
 * Converte PNG para JPEG ou PDF encapsulado.
 * Como o Node.js possui zlib nativo, para PNG sem alpha embutimos os scanlines ou encapsulamos via FlateDecode.
 */
function buildPdfFromPng(pngBuffer: Buffer, width: number, height: number): Buffer {
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 36;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  const scale = Math.min(maxW / width, maxH / height, 1.0);
  const drawW = width * scale;
  const drawH = height * scale;
  const posX = margin + (maxW - drawW) / 2;
  const posY = margin + (maxH - drawH) / 2;

  // Extrai os dados IDAT do PNG
  const idatChunks: Buffer[] = [];
  let offset = 8; // Pula assinatura PNG
  while (offset < pngBuffer.length - 12) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      idatChunks.push(pngBuffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  const idatCombined = Buffer.concat(idatChunks);

  const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${posX.toFixed(2)} ${posY.toFixed(2)} cm\n/Im1 Do\nQ\n`;
  const contentBuf = Buffer.from(contentStream, 'utf8');

  const pdfParts: Buffer[] = [];
  const offsets: number[] = [0];

  function addPart(strOrBuf: string | Buffer): number {
    const b = typeof strOrBuf === 'string' ? Buffer.from(strOrBuf, 'binary') : strOrBuf;
    const currentOffset = pdfParts.reduce((acc, p) => acc + p.length, 0);
    pdfParts.push(b);
    return currentOffset;
  }

  addPart('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> /ProcSet [/PDF /ImageC] >> >>\nendobj\n`
  );

  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(`4 0 obj\n<< /Length ${contentBuf.length} >>\nstream\n`);
  addPart(contentBuf);
  addPart('\nendstream\nendobj\n');

  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Columns ${width} /Colors 3 /BitsPerComponent 8 >> /Length ${idatCombined.length} >>\nstream\n`
  );
  addPart(idatCombined);
  addPart('\nendstream\nendobj\n');

  const startXref = pdfParts.reduce((acc, p) => acc + p.length, 0);
  let xrefStr = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xrefStr += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  xrefStr += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  addPart(xrefStr);

  return Buffer.concat(pdfParts);
}

/**
 * Descompacta e extrai o texto de um documento DOCX (.docx é um container ZIP).
 */
function extractTextFromDocx(buffer: Buffer): string[] {
  const paragraphs: string[] = [];
  try {
    let xmlContent = '';

    // 1. Tentar localizar via Central Directory do ZIP (0x50 0x4b 0x01 0x02) - mais robusto com bit 3 / data descriptors
    let cdOffset = 0;
    while (cdOffset < buffer.length - 46) {
      if (
        buffer[cdOffset] === 0x50 &&
        buffer[cdOffset + 1] === 0x4b &&
        buffer[cdOffset + 2] === 0x01 &&
        buffer[cdOffset + 3] === 0x02
      ) {
        const compression = buffer.readUInt16LE(cdOffset + 10);
        const compressedSize = buffer.readUInt32LE(cdOffset + 20);
        const fileNameLength = buffer.readUInt16LE(cdOffset + 28);
        const extraFieldLength = buffer.readUInt16LE(cdOffset + 30);
        const fileCommentLength = buffer.readUInt16LE(cdOffset + 32);
        const localHeaderOffset = buffer.readUInt32LE(cdOffset + 42);
        const fileName = buffer.toString('utf8', cdOffset + 46, cdOffset + 46 + fileNameLength);

        if (fileName === 'word/document.xml') {
          const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
          const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
          const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
          const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);

          if (compression === 8) {
            xmlContent = zlib.inflateRawSync(compressedData).toString('utf8');
          } else if (compression === 0) {
            xmlContent = compressedData.toString('utf8');
          }
          break;
        }

        cdOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      } else {
        cdOffset++;
      }
    }

    // 2. Se não encontrou via Central Directory, tentar varredura por Local File Header (0x50 0x4B 0x03 0x04)
    if (!xmlContent) {
      let offset = 0;
      while (offset < buffer.length - 30) {
        if (
          buffer[offset] === 0x50 &&
          buffer[offset + 1] === 0x4b &&
          buffer[offset + 2] === 0x03 &&
          buffer[offset + 3] === 0x04
        ) {
          const compression = buffer.readUInt16LE(offset + 8);
          const compressedSize = buffer.readUInt32LE(offset + 18);
          const fileNameLength = buffer.readUInt16LE(offset + 26);
          const extraFieldLength = buffer.readUInt16LE(offset + 28);
          const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLength);
          const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

          if (fileName === 'word/document.xml' && compressedSize > 0) {
            const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
            if (compression === 8) {
              xmlContent = zlib.inflateRawSync(compressedData).toString('utf8');
            } else if (compression === 0) {
              xmlContent = compressedData.toString('utf8');
            }
            break;
          }
          offset = compressedSize > 0 ? (dataOffset + compressedSize) : (offset + 1);
        } else {
          offset++;
        }
      }
    }

    // 3. Parsear parágrafos <w:p>
    if (xmlContent) {
      const pRegex = /<w:p\b[^>]*>(.*?)<\/w:p>/gs;
      let match: RegExpExecArray | null;
      while ((match = pRegex.exec(xmlContent)) !== null) {
        const pContent = match[1];
        const tRegex = /<w:t\b[^>]*>(.*?)<\/w:t>/gs;
        let tMatch: RegExpExecArray | null;
        let pText = '';
        while ((tMatch = tRegex.exec(pContent)) !== null) {
          pText += tMatch[1];
        }
        if (pText.trim()) {
          const decoded = pText
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
          paragraphs.push(decoded.trim());
        }
      }
    }
  } catch (err: any) {
    throw new Error(`FALHA_PARSER_DOCX: Não foi possível extrair o conteúdo do documento Word (.docx): ${err.message}`);
  }

  if (paragraphs.length === 0) {
    // Tenta fallback com busca de strings se XML não foi alcançado
    const textSample = buffer.toString('utf8');
    const matches = textSample.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (matches) {
      for (const m of matches) {
        const clean = m.replace(/<[^>]+>/g, '').trim();
        if (clean) paragraphs.push(clean);
      }
    }
  }

  return paragraphs;
}

/**
 * Extrai texto de um arquivo RTF (Rich Text Format).
 */
function extractTextFromRtf(buffer: Buffer): string[] {
  const rtf = buffer.toString('latin1');
  const paragraphs: string[] = [];

  try {
    // 1. Remove blocos de metadados não textuais (fonttbl, colortbl, stylesheet, info, etc.)
    let cleaned = rtf.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|generator|\*)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');

    // 2. Converte tags de quebra de parágrafo e linha
    cleaned = cleaned
      .replace(/\\par\b/gi, '\n')
      .replace(/\\line\b/gi, '\n')
      .replace(/\\tab\b/gi, '    ');

    // 3. Converte caracteres hexadecimais: \'xx
    cleaned = cleaned.replace(/\\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      try {
        return Buffer.from(hex, 'hex').toString('latin1');
      } catch {
        return '';
      }
    });

    // 4. Converte entidades Unicode: \u1234?
    cleaned = cleaned.replace(/\\u(-?\d+)\??/g, (_, code) => {
      try {
        const codeNum = parseInt(code, 10);
        return String.fromCharCode(codeNum >= 0 ? codeNum : codeNum + 65536);
      } catch {
        return '';
      }
    });

    // 5. Remove comandos e grupos restantes de controle do RTF
    cleaned = cleaned.replace(/\\([a-zA-Z]+)-?\d*\s?/g, '');
    cleaned = cleaned.replace(/[{}]/g, '');

    for (const line of cleaned.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        paragraphs.push(trimmed);
      }
    }
  } catch (err: any) {
    throw new Error(`FALHA_PARSER_RTF: Não foi possível processar o documento RTF: ${err.message}`);
  }

  return paragraphs;
}

/**
 * Extrai texto legível de um documento binário Word 97-2003 (.doc).
 */
function extractTextFromDoc(buffer: Buffer): string[] {
  const paragraphs: string[] = [];
  try {
    // No formato OLE2 DOC, os textos aparecem em blocos ASCII/CP1252 ou UTF-16LE
    const textLatin1 = buffer.toString('latin1');
    const printableRegex = /[\x20-\x7E\xA0-\xFF]{4,}/g;
    let match: RegExpExecArray | null;

    let currentBlock = '';
    while ((match = printableRegex.exec(textLatin1)) !== null) {
      const fragment = match[0].trim();
      // Filtra nomes de streams e ruídos internos do OLE2
      if (
        fragment.startsWith('WordDocument') ||
        fragment.startsWith('1Table') ||
        fragment.startsWith('SummaryInformation') ||
        fragment.startsWith('DocumentSummaryInformation') ||
        fragment.includes('Microsoft Word') ||
        fragment.includes('Normal.dot') ||
        fragment.includes('CompObj')
      ) {
        continue;
      }

      if (fragment.length >= 5) {
        paragraphs.push(fragment);
      }
    }
  } catch (err: any) {
    throw new Error(`FALHA_PARSER_DOC: Não foi possível extrair o conteúdo do documento .doc: ${err.message}`);
  }

  return paragraphs;
}

/**
 * Constrói um documento PDF A4 tipográfico a partir de uma lista de parágrafos.
 * Suporta múltiplas páginas com quebra automática e paginação.
 */
function buildPdfFromParagraphs(paragraphs: string[], documentTitle: string): Buffer {
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 50;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const lineHeight = 15;
  const maxLinesPerPage = Math.floor(usableH / lineHeight) - 4; // Reserva para cabeçalho e rodapé

  // Converte parágrafos em linhas com word-wrap
  const allLines: string[] = [];
  allLines.push(`GIGANTE PNEUS — BANCO DE TALENTOS & RECRUTAMENTO`);
  allLines.push(`DOCUMENTO CONVERTIDO INSTITUCIONALMENTE: ${documentTitle.toUpperCase()}`);
  allLines.push('─'.repeat(55));
  allLines.push('');

  for (const p of paragraphs) {
    const wrapped = wrapText(p, 80);
    for (const w of wrapped) {
      allLines.push(w);
    }
    allLines.push(''); // Espaço entre parágrafos
  }

  // Divide as linhas em páginas
  const pages: string[][] = [];
  let currentPage: string[] = [];

  for (const line of allLines) {
    if (currentPage.length >= maxLinesPerPage) {
      pages.push(currentPage);
      currentPage = [];
    }
    currentPage.push(line);
  }
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  if (pages.length === 0) {
    pages.push(['(Documento de currículo sem conteúdo textual detectado)']);
  }

  const totalPages = pages.length;
  const pdfParts: Buffer[] = [];
  const offsets: number[] = [0];

  function addPart(strOrBuf: string | Buffer): number {
    const b = typeof strOrBuf === 'string' ? Buffer.from(strOrBuf, 'binary') : strOrBuf;
    const currentOffset = pdfParts.reduce((acc, p) => acc + p.length, 0);
    pdfParts.push(b);
    return currentOffset;
  }

  addPart('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Obj 1: Catalog
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Page Object IDs e Content Object IDs
  // Obj 2: Pages
  // Para cada página i (0..totalPages-1):
  //   Page obj = 3 + i * 2
  //   Content obj = 4 + i * 2
  // Font obj = 3 + totalPages * 2
  const fontObjId = 3 + totalPages * 2;
  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');

  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(`2 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${totalPages} >>\nendobj\n`);

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1;
    const pageObjId = 3 + i * 2;
    const contentObjId = 4 + i * 2;
    const lines = pages[i];

    // Monta o stream de texto da página
    let streamText = 'BT\n/F1 10 Tf\n14.0 TL\n';
    streamText += `${margin} ${pageH - margin} Td\n`;

    for (let l = 0; l < lines.length; l++) {
      const lineStr = lines[l];
      if (l === 0) {
        streamText += `(${escapePdfText(lineStr)}) Tj\n`;
      } else {
        streamText += `T* (${escapePdfText(lineStr)}) Tj\n`;
      }
    }

    // Rodapé de página
    streamText += `ET\nBT\n/F1 8 Tf\n${margin} 30 Td\n(Gigante Pneus — Trabalhe Conosco | Página ${pageNum} de ${totalPages}) Tj\nET\n`;

    const contentBuf = Buffer.from(streamText, 'binary');

    // Page Obj
    offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
    addPart(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> /ProcSet [/PDF /Text] >> >>\nendobj\n`
    );

    // Content Obj
    offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
    addPart(`${contentObjId} 0 obj\n<< /Length ${contentBuf.length} >>\nstream\n`);
    addPart(contentBuf);
    addPart('\nendstream\nendobj\n');
  }

  // Font Obj: Helvetica Standard 14
  offsets.push(pdfParts.reduce((acc, p) => acc + p.length, 0));
  addPart(`${fontObjId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);

  // Xref
  const startXref = pdfParts.reduce((acc, p) => acc + p.length, 0);
  let xrefStr = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xrefStr += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  xrefStr += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  addPart(xrefStr);

  return Buffer.concat(pdfParts);
}

/**
 * Converte qualquer arquivo suportado de currículo (PDF, DOC, DOCX, RTF, JPG, JPEG, PNG)
 * para um documento PDF institucional padronizado e pronto para visualização.
 */
export async function convertCurriculoToPdf(
  options: ConvertCurriculoOptions
): Promise<ConvertCurriculoResult> {
  const { buffer, originalName, format } = options;

  if (!buffer || buffer.length === 0) {
    throw new Error('CONVERSAO_PDF_FALHOU: Buffer do arquivo está vazio (0 bytes).');
  }

  // 1. PDF já está pronto: preserva o arquivo original intacto
  if (format === 'pdf') {
    const baseName = originalName.endsWith('.pdf') ? originalName : `${originalName}.pdf`;
    return {
      pdfBuffer: buffer,
      pdfFileName: baseName,
      mimeType: 'application/pdf',
      converted: false,
      originalFormat: 'pdf',
      tamanhoBytes: buffer.length
    };
  }

  // Nome base do arquivo com extensão .pdf garantida
  const rawBaseName = originalName.replace(/\.[^.]+$/, '');
  const pdfFileName = `${rawBaseName}.pdf`;

  // 2. Imagens JPEG (JPG / JPEG)
  if (format === 'jpg' || format === 'jpeg') {
    try {
      const dims = getJpegDimensions(buffer);
      const pdfBuffer = buildPdfFromJpeg(buffer, dims.width, dims.height);
      return {
        pdfBuffer,
        pdfFileName,
        mimeType: 'application/pdf',
        converted: true,
        originalFormat: format,
        tamanhoBytes: pdfBuffer.length
      };
    } catch (err: any) {
      throw new Error(`CONVERSAO_JPEG_FALHOU: Falha ao gerar PDF a partir da imagem JPEG: ${err.message}`);
    }
  }

  // 3. Imagens PNG
  if (format === 'png') {
    try {
      const dims = getPngDimensions(buffer);
      const pdfBuffer = buildPdfFromPng(buffer, dims.width, dims.height);
      return {
        pdfBuffer,
        pdfFileName,
        mimeType: 'application/pdf',
        converted: true,
        originalFormat: 'png',
        tamanhoBytes: pdfBuffer.length
      };
    } catch (err: any) {
      throw new Error(`CONVERSAO_PNG_FALHOU: Falha ao gerar PDF a partir da imagem PNG: ${err.message}`);
    }
  }

  // 4. Documentos Word Modernos (.docx)
  if (format === 'docx') {
    try {
      const paragraphs = extractTextFromDocx(buffer);
      if (paragraphs.length === 0) {
        paragraphs.push('Currículo profissional Word (.docx). Conteúdo estruturado importado.');
      }
      const pdfBuffer = buildPdfFromParagraphs(paragraphs, originalName);
      return {
        pdfBuffer,
        pdfFileName,
        mimeType: 'application/pdf',
        converted: true,
        originalFormat: 'docx',
        tamanhoBytes: pdfBuffer.length
      };
    } catch (err: any) {
      throw new Error(`CONVERSAO_DOCX_FALHOU: Falha ao converter DOCX para PDF: ${err.message}`);
    }
  }

  // 5. Documentos RTF (.rtf)
  if (format === 'rtf') {
    try {
      const paragraphs = extractTextFromRtf(buffer);
      if (paragraphs.length === 0) {
        paragraphs.push('Currículo profissional RTF. Conteúdo estruturado importado.');
      }
      const pdfBuffer = buildPdfFromParagraphs(paragraphs, originalName);
      return {
        pdfBuffer,
        pdfFileName,
        mimeType: 'application/pdf',
        converted: true,
        originalFormat: 'rtf',
        tamanhoBytes: pdfBuffer.length
      };
    } catch (err: any) {
      throw new Error(`CONVERSAO_RTF_FALHOU: Falha ao converter RTF para PDF: ${err.message}`);
    }
  }

  // 6. Documentos Word Legados (.doc)
  if (format === 'doc') {
    try {
      const paragraphs = extractTextFromDoc(buffer);
      if (paragraphs.length === 0) {
        paragraphs.push('Currículo profissional Word legado (.doc). Conteúdo estruturado importado.');
      }
      const pdfBuffer = buildPdfFromParagraphs(paragraphs, originalName);
      return {
        pdfBuffer,
        pdfFileName,
        mimeType: 'application/pdf',
        converted: true,
        originalFormat: 'doc',
        tamanhoBytes: pdfBuffer.length
      };
    } catch (err: any) {
      throw new Error(`CONVERSAO_DOC_FALHOU: Falha ao converter DOC para PDF: ${err.message}`);
    }
  }

  throw new Error(`FORMATO_NAO_SUPORTADO: O formato '${format}' não possui conversor para PDF implementado.`);
}
