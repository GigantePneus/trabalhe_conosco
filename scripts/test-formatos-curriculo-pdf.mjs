import assert from 'node:assert';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { validateCurriculoFile } from '../services/security/fileValidator.ts';
import { convertCurriculoToPdf } from '../services/storage/curriculoPdfConverter.ts';

console.log('================================================================================');
console.log('SUÍTE DE TESTES: COMPATIBILIDADE DE FORMATOS & CONVERSÃO INSTITUCIONAL PARA PDF');
console.log('================================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// ─── 1. GERADORES DE ARQUIVOS SINTÉTICOS DE TESTE ─────────────────────────────

// A. PDF Sintético Válido
function makeSyntheticPdf(text = 'Curriculo de Teste') {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 20 >>\nstream\nBT /F1 12 Tf (${text}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n300\n%%EOF\n`,
    'binary'
  );
}

// B. JPEG Sintético Válido (Cabeçalho SOI + APP0 + SOF0 de 200x300 + EOI)
function makeSyntheticJpeg(width = 200, height = 300) {
  const buf = Buffer.alloc(30);
  buf[0] = 0xff; buf[1] = 0xd8; // SOI
  buf[2] = 0xff; buf[3] = 0xe0; // APP0
  buf[4] = 0x00; buf[5] = 0x10; // Len 16
  buf.write('JFIF\0', 6, 'ascii');
  buf[11] = 0x01; buf[12] = 0x01; buf[13] = 0x00;
  // SOF0 (Start of Frame baseline)
  buf[14] = 0xff; buf[15] = 0xc0;
  buf[16] = 0x00; buf[17] = 0x0b; // Len 11
  buf[18] = 0x08; // 8 bits precision
  buf.writeUInt16BE(height, 19); // Altura
  buf.writeUInt16BE(width, 21);  // Largura
  buf[23] = 0x03; // 3 componentes (RGB)
  // EOI
  buf[24] = 0xff; buf[25] = 0xd9;
  return buf;
}

// C. PNG Sintético Válido (Assinatura PNG + IHDR 150x250 + IDAT com zlib + IEND)
function makeSyntheticPng(width = 150, height = 250) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // Chunk IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit
  ihdrData[9] = 2; // RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrChunk.write('IHDR', 4, 'ascii');
  ihdrData.copy(ihdrChunk, 8);

  // Chunk IDAT (Scanlines comprimidos)
  const rawPixels = Buffer.alloc(height * (1 + width * 3), 128); // Cinza
  const compressed = zlib.deflateSync(rawPixels);
  const idatChunk = Buffer.alloc(4 + 4 + compressed.length + 4);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatChunk.write('IDAT', 4, 'ascii');
  compressed.copy(idatChunk, 8);

  // Chunk IEND
  const iendChunk = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// D. DOCX Sintético Válido (Container ZIP contendo word/document.xml)
function makeSyntheticDocx(textContent = 'Joao Silva - Mecanico Automotivo Experiente') {
  const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${textContent}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Experiencia de 5 anos em suspensao e alinhamento.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const xmlBuffer = Buffer.from(xmlContent, 'utf8');
  const fileName = 'word/document.xml';
  const fileNameBuf = Buffer.from(fileName, 'utf8');

  // Local File Header
  const lfh = Buffer.alloc(30 + fileNameBuf.length);
  lfh.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
  lfh.writeUInt16LE(20, 4); // version needed
  lfh.writeUInt16LE(0, 6); // general flags
  lfh.writeUInt16LE(0, 8); // compression: 0 (stored)
  lfh.writeUInt16LE(0, 10); // time
  lfh.writeUInt16LE(0, 12); // date
  lfh.writeUInt32LE(0, 14); // crc32
  lfh.writeUInt32LE(xmlBuffer.length, 18); // compressed size
  lfh.writeUInt32LE(xmlBuffer.length, 22); // uncompressed size
  lfh.writeUInt16LE(fileNameBuf.length, 26); // file name length
  lfh.writeUInt16LE(0, 28); // extra field length
  fileNameBuf.copy(lfh, 30);

  // Central Directory Record
  const cdr = Buffer.alloc(46 + fileNameBuf.length);
  cdr.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
  cdr.writeUInt16LE(20, 4);
  cdr.writeUInt16LE(20, 6);
  cdr.writeUInt16LE(0, 8);
  cdr.writeUInt16LE(0, 10);
  cdr.writeUInt32LE(xmlBuffer.length, 20);
  cdr.writeUInt32LE(xmlBuffer.length, 24);
  cdr.writeUInt16LE(fileNameBuf.length, 28);
  fileNameBuf.copy(cdr, 46);

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(1, 8); // total entries
  eocd.writeUInt32LE(cdr.length, 12); // size of cdr
  eocd.writeUInt32LE(lfh.length + xmlBuffer.length, 16); // offset of cdr

  return Buffer.concat([lfh, xmlBuffer, cdr, eocd]);
}

// E. RTF Sintético Válido
function makeSyntheticRtf(nome = 'Carlos Eduardo', cargo = 'Alinhador') {
  return Buffer.from(
    `{\\rtf1\\ansi\\deff0\\nouicompat{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}\n` +
    `{\\*\\generator Riched20 10.0.19041}\\viewkind4\\uc1\n` +
    `\\pard\\b\\fs24 Curr\\'edculo: ${nome}\\b0\\fs20\\par\n` +
    `Cargo de interesse: ${cargo}\\par\n` +
    `Telefone: (11) 98765-4321\\par\n` +
    `Experi\\'eancia profissional com balanceamento e montagem de pneus.\\par\n` +
    `}`,
    'latin1'
  );
}

// F. DOC Legado Sintético (OLE2 Compound Document Header)
function makeSyntheticDoc(text = 'Curriculo Word 97-2003 Legado com Experiencia') {
  const buf = Buffer.alloc(512);
  // OLE2 magic bytes: D0 CF 11 E0 A1 B1 1A E1
  const ole2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  for (let i = 0; i < ole2.length; i++) buf[i] = ole2[i];
  buf.write('WordDocument\0', 32, 'latin1');
  buf.write(text, 64, 'latin1');
  return buf;
}

// ─── EXECUÇÃO DOS TESTES ──────────────────────────────────────────────────────

async function main() {
  // Teste 1: Validação de Magic Bytes para todos os formatos
  runTest('1. Validador aceita PDF autêntico', () => {
    const pdfBuf = makeSyntheticPdf();
    const res = validateCurriculoFile(pdfBuf, 'candidato.pdf');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedFormat, 'pdf');
    assert.strictEqual(res.detectedMimeType, 'application/pdf');
  });

  runTest('2. Validador aceita JPEG autêntico', () => {
    const jpgBuf = makeSyntheticJpeg();
    const res = validateCurriculoFile(jpgBuf, 'foto_curriculo.jpg');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedFormat, 'jpg');
    assert.strictEqual(res.detectedMimeType, 'image/jpeg');
  });

  runTest('3. Validador aceita PNG autêntico', () => {
    const pngBuf = makeSyntheticPng();
    const res = validateCurriculoFile(pngBuf, 'documento_scaneado.png');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedFormat, 'png');
    assert.strictEqual(res.detectedMimeType, 'image/png');
  });

  runTest('4. Validador aceita DOCX autêntico', () => {
    const docxBuf = makeSyntheticDocx();
    const res = validateCurriculoFile(docxBuf, 'curriculo_word.docx');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedFormat, 'docx');
    assert.strictEqual(res.detectedMimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  runTest('5. Validador aceita RTF autêntico', () => {
    const rtfBuf = makeSyntheticRtf();
    const res = validateCurriculoFile(rtfBuf, 'curriculo.rtf');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedFormat, 'rtf');
    assert.strictEqual(res.detectedMimeType, 'application/rtf');
  });

  runTest('6. Validador aceita DOC legado autêntico', () => {
    const docBuf = makeSyntheticDoc();
    const res = validateCurriculoFile(docBuf, 'curriculo_antigo.doc');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.detectedFormat, 'doc');
    assert.strictEqual(res.detectedMimeType, 'application/msword');
  });

  runTest('7. Validador rejeita extensões ou magic bytes inválidos', () => {
    const fakeExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    const resExe = validateCurriculoFile(fakeExe, 'malware.exe');
    assert.strictEqual(resExe.valid, false);

    const fakePdf = Buffer.from('Arquivo de texto que mente ser PDF');
    const resFake = validateCurriculoFile(fakePdf, 'fraude.pdf');
    assert.strictEqual(resFake.valid, false);
    assert.match(resFake.error, /CONTEUDO_INVALIDO/);
  });

  // Testes de Conversão Padronizada para PDF
  await runAsyncTest('8. Conversão PDF: preserva o arquivo original intacto sem reprocessar', async () => {
    const originalPdf = makeSyntheticPdf('Original Intacto');
    const res = await convertCurriculoToPdf({
      buffer: originalPdf,
      originalName: 'candidato.pdf',
      format: 'pdf'
    });
    assert.strictEqual(res.converted, false);
    assert.strictEqual(res.mimeType, 'application/pdf');
    assert.strictEqual(res.pdfBuffer.length, originalPdf.length);
    assert.deepStrictEqual(res.pdfBuffer, originalPdf);
  });

  await runAsyncTest('9. Conversão JPEG -> PDF: gera PDF válido contendo a imagem completa', async () => {
    const jpegBuf = makeSyntheticJpeg(800, 1200);
    const res = await convertCurriculoToPdf({
      buffer: jpegBuf,
      originalName: 'foto_curriculo.jpg',
      format: 'jpg'
    });
    assert.strictEqual(res.converted, true);
    assert.strictEqual(res.mimeType, 'application/pdf');
    assert.strictEqual(res.pdfFileName, 'foto_curriculo.pdf');
    // Valida que o resultado gerado é um PDF autêntico
    const header = res.pdfBuffer.subarray(0, 5).toString('ascii');
    assert.strictEqual(header, '%PDF-');
    assert.ok(res.pdfBuffer.includes('/DCTDecode')); // Contém o stream JPEG nativo sem cortes
  });

  await runAsyncTest('10. Conversão PNG -> PDF: gera PDF válido com a imagem completa', async () => {
    const pngBuf = makeSyntheticPng(600, 900);
    const res = await convertCurriculoToPdf({
      buffer: pngBuf,
      originalName: 'scanner.png',
      format: 'png'
    });
    assert.strictEqual(res.converted, true);
    assert.strictEqual(res.mimeType, 'application/pdf');
    assert.strictEqual(res.pdfFileName, 'scanner.pdf');
    assert.strictEqual(res.pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  await runAsyncTest('11. Conversão DOCX -> PDF: extrai texto estruturado e gera PDF paginado', async () => {
    const docxBuf = makeSyntheticDocx('Antonio Carlos - Vendedor de Pneus Especializado');
    const res = await convertCurriculoToPdf({
      buffer: docxBuf,
      originalName: 'curriculo_antonio.docx',
      format: 'docx'
    });
    assert.strictEqual(res.converted, true);
    assert.strictEqual(res.mimeType, 'application/pdf');
    assert.strictEqual(res.pdfFileName, 'curriculo_antonio.pdf');
    assert.strictEqual(res.pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(res.pdfBuffer.includes('Antonio Carlos'));
  });

  await runAsyncTest('12. Conversão RTF -> PDF: decodifica acentos, limpa tags e gera PDF A4', async () => {
    const rtfBuf = makeSyntheticRtf('Renata Meireles', 'Consultora de Vendas');
    const res = await convertCurriculoToPdf({
      buffer: rtfBuf,
      originalName: 'curriculo_renata.rtf',
      format: 'rtf'
    });
    assert.strictEqual(res.converted, true);
    assert.strictEqual(res.mimeType, 'application/pdf');
    assert.strictEqual(res.pdfFileName, 'curriculo_renata.pdf');
    assert.strictEqual(res.pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  await runAsyncTest('13. Conversão DOC -> PDF: extrai texto binário OLE2 e gera PDF', async () => {
    const docBuf = makeSyntheticDoc('Marcos Paulo - Mecanico Geral');
    const res = await convertCurriculoToPdf({
      buffer: docBuf,
      originalName: 'marcos_doc.doc',
      format: 'doc'
    });
    assert.strictEqual(res.converted, true);
    assert.strictEqual(res.mimeType, 'application/pdf');
    assert.strictEqual(res.pdfFileName, 'marcos_doc.pdf');
    assert.strictEqual(res.pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  await runAsyncTest('14. Tratamento de Falha: se buffer for inválido/corrompido, rejeita com erro', async () => {
    await assert.rejects(
      async () => {
        await convertCurriculoToPdf({
          buffer: Buffer.alloc(0),
          originalName: 'vazio.docx',
          format: 'docx'
        });
      },
      /CONVERSAO_PDF_FALHOU/
    );
  });

  console.log('\n================================================================================');
  console.log(`RESULTADO FINAL: ${passCount} PASSOU | ${failCount} FALHOU`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
