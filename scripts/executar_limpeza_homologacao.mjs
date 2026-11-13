import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Carregar variáveis de .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
            env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
        }
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://hidayzojjztfyuefmknz.supabase.co';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
    console.error('ERRO: SUPABASE_SERVICE_ROLE_KEY não encontrada em .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
    console.log('==============================================================================');
    console.log('INICIANDO LIMPEZA CONTROLADA DE HOMOLOGAÇÃO NO SUPABASE OFICIAL');
    console.log('Host:', supabaseUrl);
    console.log('Data:', new Date().toISOString());
    console.log('==============================================================================\n');

    // 1. Verificação prévia das contagens
    console.log('1. Verificando inventário prévio...');
    const { count: countLojas, error: errLojas } = await supabase.from('lojas').select('*', { count: 'exact', head: true });
    const { count: countCargos, error: errCargos } = await supabase.from('cargos').select('*', { count: 'exact', head: true });
    const { count: countPerfis, error: errPerfis } = await supabase.from('perfis').select('*', { count: 'exact', head: true });
    const { count: countCandidatos, error: errCand } = await supabase.from('candidatos').select('*', { count: 'exact', head: true });
    const { count: countCandidaturas, error: errCands } = await supabase.from('candidaturas').select('*', { count: 'exact', head: true });
    const { count: countCurriculos, error: errCurrs } = await supabase.from('candidato_curriculos').select('*', { count: 'exact', head: true });
    const { count: countLogs, error: errLogs } = await supabase.from('logs_acesso_curriculos').select('*', { count: 'exact', head: true });
    const { count: countUploads, error: errUps } = await supabase.from('upload_transacoes').select('*', { count: 'exact', head: true });

    if (errLojas || errCargos || errCand) {
        console.error('Erro na consulta prévia:', errLojas || errCargos || errCand);
        process.exit(1);
    }

    console.log(`• Lojas: ${countLojas} (Esperado: 28)`);
    console.log(`• Cargos: ${countCargos} (Esperado: 2)`);
    console.log(`• Perfis: ${countPerfis} (Esperado: >= 2)`);
    console.log(`• Candidatos: ${countCandidatos} (Esperado: 6)`);
    console.log(`• Candidaturas: ${countCandidaturas} (Esperado: 8)`);
    console.log(`• Currículos: ${countCurriculos} (Esperado: 6)`);
    console.log(`• Logs de Acesso: ${countLogs} (Esperado: 8)`);
    console.log(`• Upload Transações: ${countUploads} (Esperado: 13)`);

    // Travas de segurança
    if (countLojas < 28) {
        throw new Error(`ABORTANDO: Quantidade de lojas (${countLojas}) é inferior a 28.`);
    }
    if (countCargos < 2) {
        throw new Error(`ABORTANDO: Quantidade de cargos (${countCargos}) é inferior a 2.`);
    }
    if (countCandidatos > 50) {
        throw new Error(`ABORTANDO: Quantidade de candidatos (${countCandidatos}) é superior a 50.`);
    }

    console.log('\n✓ Travas de segurança validadas com sucesso.');
    console.log('2. Executando exclusão em ordem topológica reversa...\n');

    // 2.1 candidato_compartilhamentos
    const { error: d1 } = await supabase.from('candidato_compartilhamentos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d1) console.warn('candidato_compartilhamentos:', d1.message); else console.log('✓ candidato_compartilhamentos limpo.');

    // 2.2 respostas
    const { error: d2 } = await supabase.from('respostas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d2) console.warn('respostas:', d2.message); else console.log('✓ respostas limpo.');

    // 2.3 candidatura_pendencias_identidade
    const { error: d3 } = await supabase.from('candidatura_pendencias_identidade').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d3) console.warn('candidatura_pendencias_identidade:', d3.message); else console.log('✓ candidatura_pendencias_identidade limpo.');

    // 2.4 logs_acesso_curriculos
    const { error: d4 } = await supabase.from('logs_acesso_curriculos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d4) console.warn('logs_acesso_curriculos:', d4.message); else console.log('✓ logs_acesso_curriculos limpo.');

    // 2.5 candidaturas
    const { error: d5 } = await supabase.from('candidaturas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d5) console.warn('candidaturas:', d5.message); else console.log('✓ candidaturas limpo.');

    // 2.6 candidato_curriculos
    const { error: d6 } = await supabase.from('candidato_curriculos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d6) console.warn('candidato_curriculos:', d6.message); else console.log('✓ candidato_curriculos limpo.');

    // 2.7 upload_transacoes
    const { error: d7 } = await supabase.from('upload_transacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d7) console.warn('upload_transacoes:', d7.message); else console.log('✓ upload_transacoes limpo.');

    // 2.8 candidatos
    const { error: d8 } = await supabase.from('candidatos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (d8) console.warn('candidatos:', d8.message); else console.log('✓ candidatos limpo.');

    console.log('\n3. Realizando verificação pós-limpeza...');
    const { count: finalCand } = await supabase.from('candidatos').select('*', { count: 'exact', head: true });
    const { count: finalCands } = await supabase.from('candidaturas').select('*', { count: 'exact', head: true });
    const { count: finalCurrs } = await supabase.from('candidato_curriculos').select('*', { count: 'exact', head: true });
    const { count: finalLogs } = await supabase.from('logs_acesso_curriculos').select('*', { count: 'exact', head: true });
    const { count: finalUps } = await supabase.from('upload_transacoes').select('*', { count: 'exact', head: true });
    const { count: finalLojas } = await supabase.from('lojas').select('*', { count: 'exact', head: true });
    const { count: finalCargos } = await supabase.from('cargos').select('*', { count: 'exact', head: true });
    const { count: finalPerfis } = await supabase.from('perfis').select('*', { count: 'exact', head: true });

    console.log('------------------------------------------------------------------------------');
    console.log(`Candidatos restantes:          ${finalCand} (Exigido: 0)`);
    console.log(`Candidaturas restantes:        ${finalCands} (Exigido: 0)`);
    console.log(`Currículos restantes:          ${finalCurrs} (Exigido: 0)`);
    console.log(`Logs restantes:                ${finalLogs} (Exigido: 0)`);
    console.log(`Upload transações restantes:   ${finalUps} (Exigido: 0)`);
    console.log(`Lojas preservadas:             ${finalLojas} (Exigido: 28)`);
    console.log(`Cargos preservados:            ${finalCargos} (Exigido: 2)`);
    console.log(`Perfis preservados:            ${finalPerfis} (Exigido: >= 2)`);
    console.log('------------------------------------------------------------------------------');

    if (finalCand !== 0 || finalCands !== 0 || finalCurrs !== 0 || finalUps !== 0) {
        throw new Error('FALHA: Resíduos de homologação ainda presentes no banco de dados!');
    }

    if (finalLojas < 28 || finalCargos < 2) {
        throw new Error('FALHA CRÍTICA: Estrutura operacional foi danificada!');
    }

    console.log('\n🎉 LIMPEZA DE HOMOLOGAÇÃO CONCLUÍDA COM SUCESSO ABSOLUTO!');
    console.log('A infraestrutura operacional foi 100% preservada.');
}

main().catch(err => {
    console.error('\n❌ ERRO NA EXECUÇÃO DA LIMPEZA:', err);
    process.exit(1);
});
