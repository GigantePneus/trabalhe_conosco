import assert from 'node:assert';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGiganteTools } from '../mcp-server/src/tools.ts';

console.log('================================================================================');
console.log('TESTES DE INTEGRAÇÃO MCP: IMPORTAR_CURRICULO_DRIVE & COMPATIBILIDADE');
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

async function main() {
  const server = new McpServer({
    name: 'test-mcp-server',
    version: '1.4.0'
  });

  let capturedRequest = null;
  registerGiganteTools(server, {
    getApiUrl: () => 'http://localhost:3000',
    getAuthToken: () => 'test_token'
  });

  // Teste 1: Verificar se as 16 ferramentas estão registradas
  runTest('1. O servidor MCP registra exatamente 16 ferramentas', () => {
    // No McpServer, as tools ficam em _registeredTools ou no método connect
    const tools = (server)._registeredTools || {};
    const toolNames = Object.keys(tools);
    assert.strictEqual(toolNames.length, 16, `Esperava 16 ferramentas, encontrou ${toolNames.length}: ${toolNames.join(', ')}`);
  });

  runTest('2. A ferramenta "anexar_curriculo" está registrada com lojaId e cargo', () => {
    const tools = (server)._registeredTools || {};
    const tool = tools['anexar_curriculo'];
    assert.ok(tool, 'Ferramenta anexar_curriculo deve existir');
    const shape = tool.inputSchema?.shape || tool.inputSchema?.properties || {};
    assert.ok('lojaId' in shape, 'lojaId deve estar presente');
    assert.ok('cargo' in shape, 'cargo deve estar presente');
    assert.ok('arquivoBase64' in shape, 'arquivoBase64 deve estar presente');
  });

  runTest('3. A nova ferramenta "importar_curriculo_drive" está registrada e expõe os 6 parâmetros', () => {
    const tools = (server)._registeredTools || {};
    const tool = tools['importar_curriculo_drive'];
    assert.ok(tool, 'Ferramenta importar_curriculo_drive deve existir');
    const shape = tool.inputSchema?.shape || tool.inputSchema?.properties || {};
    const params = Object.keys(shape);
    assert.ok(params.includes('candidatoId'), 'candidatoId deve existir');
    assert.ok(params.includes('arquivoBase64'), 'arquivoBase64 deve existir');
    assert.ok(params.includes('nomeArquivo'), 'nomeArquivo deve existir');
    assert.ok(params.includes('tipoMime'), 'tipoMime deve existir');
    assert.ok(params.includes('lojaId'), 'lojaId deve existir');
    assert.ok(params.includes('cargo'), 'cargo deve existir');
  });

  runTest('4. Descrição de "importar_curriculo_drive" documenta todos os formatos suportados', () => {
    const tools = (server)._registeredTools || {};
    const tool = tools['importar_curriculo_drive'];
    const desc = tool.description || '';
    assert.ok(desc.includes('PDF'), 'Deve mencionar PDF');
    assert.ok(desc.includes('DOC'), 'Deve mencionar DOC');
    assert.ok(desc.includes('DOCX'), 'Deve mencionar DOCX');
    assert.ok(desc.includes('RTF'), 'Deve mencionar RTF');
    assert.ok(desc.includes('JPG'), 'Deve mencionar JPG');
    assert.ok(desc.includes('PNG'), 'Deve mencionar PNG');
  });

  console.log('\n================================================================================');
  console.log(`RESULTADO FINAL MCP: ${passCount} PASSOU | ${failCount} FALHOU`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
