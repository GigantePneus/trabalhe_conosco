import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supaUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminSupabase = createClient(supaUrl, serviceKey);

async function backup() {
  console.log('Realizando backup prévio dos candidatos cadastrados...');
  const { data, error } = await adminSupabase
    .from('candidatos')
    .select('*')
    .order('criado_em', { ascending: true });

  if (error) {
    throw new Error(`Falha no backup: ${error.message}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `backups/backup_candidatos_pre_naotem_${timestamp}.json`;
  
  if (!fs.existsSync('backups')) fs.mkdirSync('backups', { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));

  console.log(`✅ Backup concluído com sucesso!`);
  console.log(`Total de candidatos salvos: ${data.length}`);
  console.log(`Arquivo: ${backupPath}`);
}

backup().catch(console.error);
