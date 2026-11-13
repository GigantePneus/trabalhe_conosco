import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import handler from '../api/admin/usuarios.js';
import { handleCriarUsuario, handleAtualizarUsuario } from '../api/admin/usuarios.js';

async function runTests() {
  console.log('=====================================================');
  console.log('🧪 TESTES DE SEGURANÇA E CONTRATO: /api/admin/usuarios');
  console.log('=====================================================');

  // Teste 1: Rejeitar requisições sem Authorization
  {
    let statusCode = 200;
    let responseBody = null;
    const req = {
      method: 'GET',
      headers: {},
      url: '/api/admin/usuarios'
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
      setHeader() {}
    };

    await handler(req, res);
    if (statusCode === 403 && (responseBody?.error || responseBody?.mensagem)) {
      console.log('  ✓ [PASS] 1. Rejeição estrita sem cabeçalho Authorization (HTTP 403)');
    } else {
      console.error(`❌ Teste 1 Falhou: status=${statusCode}`, responseBody);
      process.exit(1);
    }
  }

  // Teste 2: Rejeitar token inválido/falsificado
  {
    let statusCode = 200;
    let responseBody = null;
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer token-invalido-123' },
      url: '/api/admin/usuarios'
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
      setHeader() {}
    };

    await handler(req, res);
    if (statusCode === 403) {
      console.log('  ✓ [PASS] 2. Rejeição com token inválido ou adulterado (HTTP 403)');
    } else {
      console.error(`❌ Teste 2 Falhou: status=${statusCode}`, responseBody);
      process.exit(1);
    }
  }

  // Teste 3: Bloqueio no POST sem autorização prévia
  {
    let statusCode = 200;
    let responseBody = null;
    const req = {
      method: 'POST',
      headers: {},
      body: { nome: 'Teste' },
      url: '/api/admin/usuarios'
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
      setHeader() {}
    };

    await handler(req, res);
    if (statusCode === 403) {
      console.log('  ✓ [PASS] 3. Bloqueio pré-execução no método POST sem autorização (HTTP 403)');
    } else {
      console.error(`❌ Teste 3 Falhou: status=${statusCode}`, responseBody);
      process.exit(1);
    }
  }

  // Teste 4: Rejeitar método HTTP inválido (DELETE)
  {
    let statusCode = 200;
    let responseBody = null;
    const req = {
      method: 'DELETE',
      headers: {},
      url: '/api/admin/usuarios'
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
      setHeader() {}
    };

    await handler(req, res);
    if (statusCode === 403 || statusCode === 405) {
      console.log(`  ✓ [PASS] 4. Bloqueio de método HTTP não suportado (${statusCode})`);
    } else {
      console.error(`❌ Teste 4 Falhou: status=${statusCode}`, responseBody);
      process.exit(1);
    }
  }

  // Teste 5: Validação de parâmetros de criação (rejeição com token ausente ou inválido)
  {
    const res1 = await handleCriarUsuario({
      nome: '',
      email: 'invalido',
      role: 'franqueado',
      lojaIds: []
    }, null);
    if (res1.statusCode === 403) {
      console.log('  ✓ [PASS] 5. handleCriarUsuario bloqueia chamada sem token corporativo');
    } else {
      console.error('❌ Falha teste 5:', res1);
      process.exit(1);
    }
  }

  // Teste 6: Validação de parâmetros de atualização (handleAtualizarUsuario)
  {
    const res2 = await handleAtualizarUsuario({
      userId: ''
    }, null);
    if (res2.statusCode === 403) {
      console.log('  ✓ [PASS] 6. handleAtualizarUsuario bloqueia chamada sem token corporativo');
    } else {
      console.error('❌ Falha teste 6:', res2);
      process.exit(1);
    }
  }

  console.log('\n=====================================================');
  console.log('🎉 TODOS OS TESTES UNITÁRIOS DO ENDPOINT PASSARAM!');
  console.log('=====================================================\n');
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
