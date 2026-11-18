import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Helper robusto para carregar módulos compilados da API local via ESM independente do .vite-temp
const projectRoot = process.cwd();
function getApiModuleUrl(apiRelativePath: string): string {
  const fullPath = path.resolve(projectRoot, apiRelativePath);
  const mtime = fs.existsSync(fullPath) ? fs.statSync(fullPath).mtimeMs : Date.now();
  return `${pathToFileURL(fullPath).href}?t=${mtime}`;
}

// Carrega .env.local e injeta no process.env do Node.js (apenas no processo backend)
const envLocalPath = path.resolve(projectRoot, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      const key = match[1];
      const val = match[2].trim().replace(/^["'](.*)["']$/, '$1');
      process.env[key] = val;
    }
  }
}

function candidaturasApiPlugin(): Plugin {
  return {
    name: 'candidaturas-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Rota de Início OAuth Administrativo
        if (req.url?.startsWith('/api/integracoes/google/autorizar') && req.method === 'GET') {
          try {
            const { handleGoogleAuthorize } = await import(getApiModuleUrl('api/integracoes/google/autorizar.js'));
            const result = await handleGoogleAuthorize(req.headers as Record<string, string | string[] | undefined>);

            if (result.cookieToSet) {
              res.setHeader('Set-Cookie', result.cookieToSet);
            }

            const accept = (req.headers['accept'] || '') as string;
            if (result.statusCode === 200 && result.redirectUrl && accept.includes('text/html')) {
              res.statusCode = 302;
              res.setHeader('Location', result.redirectUrl);
              res.end();
              return;
            }

            res.statusCode = result.statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(result.data));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, mensagem: err.message || 'Erro interno OAuth' }));
          }
          return;
        }

        // Rota de Callback OAuth
        if (req.url?.startsWith('/api/integracoes/google/callback') && req.method === 'GET') {
          try {
            const urlObj = new URL(req.url, 'http://localhost:3000');
            const { handleGoogleCallback } = await import(getApiModuleUrl('api/integracoes/google/callback.js'));
            const result = await handleGoogleCallback({
              code: urlObj.searchParams.get('code') || undefined,
              state: urlObj.searchParams.get('state') || undefined,
              error: urlObj.searchParams.get('error') || undefined
            });

            res.statusCode = result.statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(result.data));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, mensagem: err.message || 'Erro interno callback OAuth' }));
          }
          return;
        }

        // Rota Segura para Visualização / Download de Currículos
        if ((req.url?.startsWith('/api/curriculos/visualizar') || req.url?.startsWith('/api/curriculos/download')) && req.method === 'GET') {
          try {
            const urlObj = new URL(req.url, 'http://localhost:3000');
            const authHeader = req.headers['authorization'];
            const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
            const token = bearerToken || urlObj.searchParams.get('token') || undefined;
            const curriculoId = urlObj.searchParams.get('id') || urlObj.searchParams.get('curriculoId') || undefined;
            const fileId = urlObj.searchParams.get('fileId') || undefined;
            const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
              req.socket.remoteAddress ||
              '127.0.0.1';
            const userAgent = (req.headers['user-agent'] as string) || '';

            const { handleVisualizarCurriculo } = await import(getApiModuleUrl('api/curriculos/visualizar.js'));
            const result = await handleVisualizarCurriculo({
              curriculoId,
              fileId,
              token,
              clientIp,
              userAgent
            });

            if (result.statusCode === 200 && result.buffer) {
              res.statusCode = 200;
              res.setHeader('Content-Type', result.mimeType || 'application/pdf');
              res.setHeader('Content-Disposition', `inline; filename="${result.fileName || 'curriculo.pdf'}"`);
              res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
              res.end(result.buffer);
              return;
            }

            res.statusCode = result.statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: result.error }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || 'Erro ao processar visualização de currículo' }));
          }
          return;
        }

        // Rota Administrativa para Gestão de Usuários e Permissões
        if (req.url?.startsWith('/api/admin/usuarios')) {
          const authHeader = req.headers['authorization'];
          const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
          const { handleListarUsuarios, handleCriarUsuario, handleAtualizarUsuario } = await import(getApiModuleUrl('api/admin/usuarios.js'));

          if (req.method === 'GET') {
            try {
              const result = await handleListarUsuarios(bearerToken);
              res.statusCode = result.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify(result.data));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, mensagem: err.message || 'Erro interno' }));
            }
            return;
          }

          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              let result: { statusCode: number; data: any };
              if (req.method === 'POST') {
                result = await handleCriarUsuario(body, bearerToken);
              } else if (req.method === 'PATCH' || req.method === 'PUT') {
                result = await handleAtualizarUsuario(body, bearerToken);
              } else {
                res.statusCode = 405;
                res.end(JSON.stringify({ success: false, mensagem: 'Método não permitido' }));
                return;
              }
              res.statusCode = result.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result.data));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, mensagem: err.message || 'Erro interno' }));
            }
          });
          return;
        }

        // Rota Administrativa para Listar Lojas (MCP)
        if (req.url?.startsWith('/api/admin/lojas') && req.method === 'GET') {
          const authHeader = (req.headers['authorization'] as string) || undefined;
          try {
            const { handleListarLojas } = await import(getApiModuleUrl('api/admin/vagas.js'));
            const result = await handleListarLojas(authHeader);
            res.statusCode = result.statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(result.data));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || 'Erro interno' }));
          }
          return;
        }

        // Rota Administrativa para Gestão de Vagas (MCP Fase 1)
        if (req.url?.startsWith('/api/admin/vagas')) {
          const authHeader = (req.headers['authorization'] as string) || undefined;
          const urlObj = new URL(req.url, 'http://localhost:3000');
          const pathSuffix = urlObj.pathname.replace(/^\/api\/admin\/vagas\/?/, '');
          const vagaId = urlObj.searchParams.get('id') || (pathSuffix && !pathSuffix.includes('/') ? pathSuffix : undefined);

          const {
            handleListarVagas,
            handleConsultarVaga,
            handleCriarVaga,
            handleEditarVaga,
            handleAlterarStatusVaga
          } = await import(getApiModuleUrl('api/admin/vagas.js'));

          if (req.method === 'GET') {
            try {
              if (vagaId) {
                const result = await handleConsultarVaga(vagaId, authHeader);
                res.statusCode = result.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(JSON.stringify(result.data));
                return;
              }

              const queryParams = {
                lojaId: urlObj.searchParams.get('lojaId') || undefined,
                cidade: urlObj.searchParams.get('cidade') || undefined,
                titulo: urlObj.searchParams.get('titulo') || undefined,
                departamento: urlObj.searchParams.get('departamento') || undefined,
                status: (urlObj.searchParams.get('status') as any) || undefined,
                page: urlObj.searchParams.get('page') ? Number(urlObj.searchParams.get('page')) : undefined,
                limit: urlObj.searchParams.get('limit') ? Number(urlObj.searchParams.get('limit')) : undefined
              };

              const result = await handleListarVagas(queryParams, authHeader);
              res.statusCode = result.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify(result.data));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message || 'Erro interno' }));
            }
            return;
          }

          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              let result: { statusCode: number; data: any };

              if (req.method === 'POST') {
                result = await handleCriarVaga(body, authHeader);
              } else if (req.method === 'PATCH' || req.method === 'PUT') {
                const targetId = vagaId || body.id || body.vagaId;
                if (!targetId) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: 'ID da vaga não informado.' }));
                  return;
                }

                if (body.acao && ['publicar', 'despublicar', 'desativar', 'reativar'].includes(body.acao)) {
                  result = await handleAlterarStatusVaga({ ...body, vagaId: targetId }, authHeader);
                } else {
                  result = await handleEditarVaga({ ...body, vagaId: targetId }, authHeader);
                }
              } else {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Método não permitido' }));
                return;
              }

              res.statusCode = result.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result.data));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message || 'Erro interno' }));
            }
          });
          return;
        }

        // Rota Administrativa para Gestão de Candidatos e Currículos (MCP Fase 2)
        if (req.url?.startsWith('/api/admin/candidatos')) {
          const authHeader = (req.headers['authorization'] as string) || undefined;
          const urlObj = new URL(req.url, 'http://localhost:3000');
          const pathSuffix = urlObj.pathname.replace(/^\/api\/admin\/candidatos\/?/, '');
          const candidatoId = urlObj.searchParams.get('id') || (pathSuffix && !pathSuffix.includes('/') ? pathSuffix : undefined);

          const {
            handleListarCandidatos,
            handleConsultarCandidato,
            handleVerificarDuplicidade,
            handleCriarCandidato,
            handleEditarCandidato,
            handleAnexarCurriculo,
            handleConsultarCurriculos,
            handleVincularCandidatoLoja
          } = await import(getApiModuleUrl('api/admin/candidatos.js'));

          if (req.method === 'GET') {
            try {
              if (urlObj.pathname.includes('/curriculos') || urlObj.searchParams.get('modo') === 'curriculos') {
                const targetId = candidatoId || urlObj.searchParams.get('candidatoId');
                if (!targetId) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: 'ID do candidato obrigatório.' }));
                  return;
                }
                const result = await handleConsultarCurriculos(targetId, authHeader);
                res.statusCode = result.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(JSON.stringify(result.data));
                return;
              }

              if (candidatoId) {
                const result = await handleConsultarCandidato(candidatoId, authHeader);
                res.statusCode = result.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(JSON.stringify(result.data));
                return;
              }

              const queryParams = {
                nome: urlObj.searchParams.get('nome') || undefined,
                email: urlObj.searchParams.get('email') || undefined,
                telefone: urlObj.searchParams.get('telefone') || undefined,
                cidade: urlObj.searchParams.get('cidade') || undefined,
                estado: urlObj.searchParams.get('estado') || undefined,
                lojaId: urlObj.searchParams.get('lojaId') || undefined,
                cargo: urlObj.searchParams.get('cargo') || undefined,
                status: urlObj.searchParams.get('status') || undefined,
                origem: urlObj.searchParams.get('origem') || undefined,
                page: urlObj.searchParams.get('page') ? Number(urlObj.searchParams.get('page')) : undefined,
                limit: urlObj.searchParams.get('limit') ? Number(urlObj.searchParams.get('limit')) : undefined
              };

              const result = await handleListarCandidatos(queryParams, authHeader);
              res.statusCode = result.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify(result.data));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message || 'Erro interno' }));
            }
            return;
          }

          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              let result: { statusCode: number; data: any };

              if (req.method === 'POST') {
                const acao = body.acao || urlObj.searchParams.get('acao');
                if (acao === 'duplicidade' || acao === 'verificar_duplicidade') {
                  result = await handleVerificarDuplicidade(body, authHeader);
                } else if (acao === 'anexar_curriculo' || acao === 'curriculo') {
                  result = await handleAnexarCurriculo(body, authHeader);
                } else if (acao === 'vincular_loja' || acao === 'vincular') {
                  result = await handleVincularCandidatoLoja(body, authHeader);
                } else {
                  result = await handleCriarCandidato(body, authHeader);
                }
              } else if (req.method === 'PATCH' || req.method === 'PUT') {
                const targetId = candidatoId || body.candidatoId || body.id;
                result = await handleEditarCandidato({ ...body, candidatoId: targetId }, authHeader);
              } else {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Método não permitido' }));
                return;
              }

              res.statusCode = result.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result.data));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message || 'Erro interno' }));
            }
          });
          return;
        }

        // Rota de Ingestão de Candidaturas
        if (req.url?.startsWith('/api/candidaturas/enviar') && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { handleCandidatura } = await import(getApiModuleUrl('api/candidaturas/enviar.js'));
              const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
                req.socket.remoteAddress ||
                '127.0.0.1';
              const result = await handleCandidatura(body, clientIp);

              if (result.statusCode === 503 || result.statusCode === 429) {
                res.setHeader('Retry-After', '30');
              }
              res.statusCode = result.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result.data));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, mensagem: err.message || 'Erro interno no servidor' }));
            }
          });
          return;
        }

        // Rota Healthcheck
        if (req.url === '/health' || req.url === '/api/health') {
          const { default: healthHandler } = await import(getApiModuleUrl('api/health.js'));
          return healthHandler(req, res);
        }

        // Rotas OAuth 2.1 e Metadata RFC 8414
        if (
          req.url?.startsWith('/.well-known/oauth-authorization-server') ||
          req.url?.startsWith('/.well-known/openid-configuration') ||
          req.url?.startsWith('/oauth/')
        ) {
          const { default: oauthRouterHandler } = await import(getApiModuleUrl('api/oauth.js'));
          return oauthRouterHandler(req, res);
        }

        // Rota MCP Serverless Streamable HTTP
        if (req.url === '/mcp' || req.url?.startsWith('/mcp?') || req.url?.startsWith('/mcp/') || req.url === '/api/mcp' || req.url?.startsWith('/api/mcp?') || req.url?.startsWith('/api/mcp/')) {
          const { default: mcpHandler } = await import(getApiModuleUrl('api/mcp.js'));
          return mcpHandler(req, res);
        }

        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        candidaturasApiPlugin()
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
