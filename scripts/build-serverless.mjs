import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

console.log('[build-serverless] Empacotando funções serverless para Vercel...');

const entryPoints = [
  'src-api/candidaturas/enviar.ts',
  'src-api/curriculos/visualizar.ts',
  'src-api/curriculos/download.ts',
  'src-api/integracoes/google/autorizar.ts',
  'src-api/integracoes/google/callback.ts',
  'src-api/admin/usuarios.ts'
];

// Limpar e preparar o diretório de destino api/
if (fs.existsSync('api')) {
  fs.rmSync('api', { recursive: true, force: true });
}
fs.mkdirSync('api', { recursive: true });

// Empacotar funções com esbuild
await esbuild.build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  outdir: 'api',
  outbase: 'src-api',
  sourcemap: false,
  logLevel: 'info'
});

console.log('[build-serverless] ✅ Todas as funções foram empacotadas com sucesso em /api.');
