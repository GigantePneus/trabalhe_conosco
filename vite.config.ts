import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Carrega .env.local e injeta no process.env do Node.js (apenas no processo backend)
const envLocalPath = path.resolve(__dirname, '.env.local');
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
            const { handleGoogleAuthorize } = await import('./api/integracoes/google/autorizar');
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
            const { handleGoogleCallback } = await import('./api/integracoes/google/callback');
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

            const { handleVisualizarCurriculo } = await import('./api/curriculos/visualizar');
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

        // Rota de Ingestão de Candidaturas
        if (req.url?.startsWith('/api/candidaturas/enviar') && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { handleCandidatura } = await import('./api/candidaturas/enviar');
              const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
                req.socket.remoteAddress ||
                '127.0.0.1';
              const result = await handleCandidatura(body, clientIp);

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
      define: {
        // NUNCA expor variáveis GOOGLE_ ou segredos ao bundle do cliente
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
