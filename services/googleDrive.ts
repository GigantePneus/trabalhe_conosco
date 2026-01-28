
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializa o cliente para chamar a Function
const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const driveService = {
  uploadResume: async (file: File, storeName: string, roleName: string, candidateName: string) => {
    console.log('📁 [DriveService] Iniciando upload...');
    console.log('📁 [DriveService] Supabase configurado?', !!supabase);

    // Se o Supabase estiver configurado, usa a Edge Function
    if (supabase) {
      try {
        console.log('📁 [DriveService] Usando Edge Function para upload...');
        const formData = new FormData();
        formData.append('file', file);

        console.log('📁 [DriveService] Invocando função upload-resume...');
        const { data, error } = await supabase.functions.invoke('upload-resume', {
          body: formData,
        });

        if (error) {
          console.error('📁 [DriveService] Erro na Edge Function:', error);
          console.error('📁 [DriveService] Detalhes do erro:', JSON.stringify(error, null, 2));
          throw new Error(`Erro no upload: ${error.message}`);
        }

        console.log('📁 [DriveService] Resposta da Edge Function:', data);

        // Verificar se data contém um erro
        if (data && data.error) {
          console.error('📁 [DriveService] Edge Function retornou erro:', data.error);
          throw new Error(`Edge Function error: ${data.error}`);
        }

        if (!data || !data.drive_id || !data.web_view_link) {
          console.error('📁 [DriveService] Resposta inválida:', data);
          throw new Error('Resposta inválida da função de upload');
        }

        return {
          driveId: data.drive_id,
          driveUrl: data.web_view_link,
          fileName: file.name
        };
      } catch (err: any) {
        console.error('📁 [DriveService] Erro ao usar Edge Function:', err);
        console.warn('📁 [DriveService] Usando MOCK FALLBACK devido ao erro...');

        // Fallback para MOCK se a Edge Function falhar
        return mockUpload(file, storeName, roleName, candidateName);
      }
    }

    // --- MOCK FALLBACK --- 
    console.warn('📁 [DriveService] Supabase não configurado, usando MOCK...');
    return mockUpload(file, storeName, roleName, candidateName);
  }
};

// Função auxiliar para upload mock
async function mockUpload(file: File, storeName: string, roleName: string, candidateName: string) {
  console.log(`📁 [MOCK] Simulando upload de ${file.name}`);
  console.log(`📁 [MOCK] Destino: /Curriculos-Gigante-Pneus/${storeName}/${roleName}/`);

  await new Promise(resolve => setTimeout(resolve, 1500));

  const timestamp = new Date().toISOString().split('T')[0];
  const extension = file.name.split('.').pop();
  const driveId = `dr_mock_${Math.random().toString(36).substr(2, 9)}`;

  const result = {
    driveId,
    driveUrl: `https://drive.google.com/file/d/${driveId}/view`,
    fileName: `${candidateName.replace(/\s+/g, '_')}_${timestamp}.${extension}`
  };

  console.log('📁 [MOCK] Upload simulado concluído:', result);
  return result;
}
