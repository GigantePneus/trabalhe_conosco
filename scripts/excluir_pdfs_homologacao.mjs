import fs from 'fs';
import path from 'path';

// 1. Carregar variáveis de .env.local
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

const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;
const refreshToken = env.GOOGLE_REFRESH_TOKEN;

if (!clientId || !clientSecret || !refreshToken) {
    console.error('ERRO: Credenciais Google OAuth incompletas em .env.local');
    process.exit(1);
}

const TARGET_FILES = [
    { id: '1wekYXU_2flBOShWaE1H20Vjs0Wa211lc', expectedName: 'curriculo_8a675f53ca4d70e4a01bbcd56c0578bc.pdf' },
    { id: '1k22grkDJb7axlesZYFlNLpuyLXjDodmF', expectedName: 'curriculo_3e20bbe069130dd0282816f70b47dc4b.pdf' },
    { id: '1fmcCkXxedd1ona1qrouIoBigmM0ikDTk', expectedName: 'curriculo_5f47df308241040f5bc50040d20154ac.pdf' },
    { id: '1He0raALPog5LbA5jMyw4DiXL3mBw3tRY', expectedName: 'curriculo_8606250b836b4bfd66a244022658ef7e.pdf' }
];

async function getAccessToken() {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Falha ao obter token OAuth (HTTP ${res.status}): ${text}`);
    }

    const data = await res.json();
    return data.access_token;
}

async function run() {
    console.log('==============================================================================');
    console.log('EXCLUSÃO CONTROLADA DE ARQUIVOS DE HOMOLOGAÇÃO NO GOOGLE DRIVE CORPORATIVO');
    console.log('Data:', new Date().toISOString());
    console.log('==============================================================================\n');

    console.log('1. Obtendo token de acesso OAuth 2.0...');
    const accessToken = await getAccessToken();
    console.log('✓ Token de acesso obtido com sucesso.\n');

    // Validar usuário conectado
    const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (aboutRes.ok) {
        const aboutData = await aboutRes.json();
        console.log(`✓ Conta Corporativa: ${aboutData.user?.emailAddress} (${aboutData.user?.displayName})\n`);
    }

    console.log('2. Processando exclusão individual dos 4 arquivos do manifesto:\n');

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (let i = 0; i < TARGET_FILES.length; i++) {
        const item = TARGET_FILES[i];
        console.log(`[${i + 1}/4] Consultando arquivo ID: ${item.id}`);

        try {
            // 2.1 Consulta prévia de metadados
            const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?fields=id,name,mimeType,size,trashed`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!metaRes.ok) {
                if (metaRes.status === 404) {
                    console.log(`   ℹ Arquivo não encontrado (já havia sido excluído previamente).\n`);
                    results.push({ id: item.id, name: item.expectedName, status: 'JÁ_EXCLUÍDO' });
                    successCount++;
                    continue;
                }
                const errText = await metaRes.text();
                throw new Error(`HTTP ${metaRes.status}: ${errText}`);
            }

            const meta = await metaRes.json();
            console.log(`   • Nome no Drive:   ${meta.name}`);
            console.log(`   • Tipo MIME:       ${meta.mimeType}`);
            console.log(`   • Tamanho Bytes:   ${meta.size || 'N/A'}`);
            console.log(`   • Na Lixeira?:     ${meta.trashed ? 'SIM' : 'NÃO'}`);

            // 2.2 Exclusão permanente
            console.log(`   • Executando exclusão permanente via Google Drive API v3...`);
            const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (delRes.status === 204 || delRes.status === 200) {
                console.log(`   ✓ EXCLUSÃO CONFIRMADA COM SUCESSO (HTTP ${delRes.status})!\n`);
                successCount++;
                results.push({ id: item.id, name: meta.name, status: 'EXCLUÍDO_COM_SUCESSO' });
            } else {
                const delText = await delRes.text();
                throw new Error(`Falha na deleção (HTTP ${delRes.status}): ${delText}`);
            }
        } catch (err) {
            console.error(`   ❌ Falha ao processar ${item.id}:`, err.message, '\n');
            failCount++;
            results.push({ id: item.id, name: item.expectedName, status: 'FALHA', erro: err.message });
        }
    }

    console.log('==============================================================================');
    console.log(`RESUMO DA OPERAÇÃO NO GOOGLE DRIVE:`);
    console.log(`• Total no Manifesto:      4`);
    console.log(`• Excluídos com Sucesso:   ${successCount}`);
    console.log(`• Falhas / Pendências:     ${failCount}`);
    console.log('==============================================================================\n');

    results.forEach(r => {
        console.log(`• [${r.status}] ID: ${r.id} | Arquivo: ${r.name}`);
    });
}

run().catch(err => {
    console.error('ERRO FATAL:', err);
    process.exit(1);
});
