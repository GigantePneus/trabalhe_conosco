
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabaseService } from '../services/supabase';
import { driveService } from '../services/googleDrive';
import { Store, JobRole } from '../types';
import { Upload, CheckCircle, AlertCircle, Loader2, FileText, X, Send } from 'lucide-react';

const ApplicationForm: React.FC<{ theme?: 'light' | 'dark', onToggleTheme?: () => void }> = ({ theme, onToggleTheme }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    nome: '', telefone: '', cidade_loja_id: '', cargo_id: '', apresentacao: ''
  });

  useEffect(() => {
    Promise.all([supabaseService.getStores(), supabaseService.getRoles()]).then(([s, r]) => {
      setStores(s); setRoles(r); setLoading(false);
    });
  }, []);

  const handleInputChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return alert("Envie seu currículo.");
    setIsSubmitting(true);

    try {
      console.log('🚀 Iniciando envio de candidatura...');
      console.log('📄 Arquivo selecionado:', selectedFile.name, selectedFile.size, 'bytes');

      const selectedStore = stores.find(s => s.id === formData.cidade_loja_id);
      const selectedJob = roles.find(r => r.id === formData.cargo_id);

      console.log('🏪 Loja:', selectedStore?.nome_loja);
      console.log('💼 Cargo:', selectedJob?.nome);

      console.log('📤 Fazendo upload do currículo...');
      const driveData = await driveService.uploadResume(
        selectedFile,
        selectedStore?.nome_loja || 'Geral',
        selectedJob?.nome || 'Geral',
        formData.nome
      );

      console.log('✅ Upload concluído:', driveData);
      console.log('💾 Salvando candidato no banco...');

      await supabaseService.submitCandidate({
        ...formData,
        curriculo_url: driveData.driveUrl,
        curriculo_drive_id: driveData.driveId
      });

      console.log('🎉 Candidatura enviada com sucesso!');
      setIsSuccess(true);
    } catch (err: any) {
      console.error('❌ Erro ao enviar candidatura:', err);
      const errorMessage = err?.message || err?.toString() || 'Erro desconhecido';
      alert(`Erro ao enviar candidatura:\n\n${errorMessage}\n\nVerifique o console (F12) para mais detalhes.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <Layout theme={theme} onToggleTheme={onToggleTheme}>
        <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 bg-black">
          <div className="bg-white p-12 rounded-sm shadow-2xl border-r-8 border-gigante-red max-w-lg w-full text-center">
            <div className="w-20 h-20 bg-black text-white rounded-sm flex items-center justify-center mx-auto mb-8 border-b-4 border-gigante-red">
              <CheckCircle size={48} />
            </div>
            <h2 className="text-3xl font-black uppercase italic mb-4">Currículo Recebido!</h2>
            <p className="text-gray-600 mb-10 leading-relaxed font-bold italic">
              Seu perfil agora faz parte da nossa base de talentos. Boa sorte!
            </p>
            <button onClick={() => navigate('/')} className="bg-black text-white font-black px-10 py-4 rounded-sm hover:bg-gigante-red transition-all shadow-lg italic uppercase">
              Voltar ao Início
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout theme={theme} onToggleTheme={onToggleTheme}>
      <section className="py-20 bg-gray-50 dark:bg-gigante-gray min-h-screen">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-black uppercase italic mb-4 dark:text-white underline decoration-gigante-red decoration-4 underline-offset-8">Faça sua Candidatura</h1>
              <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mt-6">Sistema Oficial Gigante Pneus</p>
            </div>

            <div className="bg-white rounded-sm shadow-2xl p-8 md:p-12 border-b-8 border-black dark:bg-gigante-dark dark:border-gigante-red">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300">Nome Completo</label>
                    <input required type="text" name="nome" value={formData.nome} onChange={handleInputChange} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-black outline-none transition-all dark:bg-zinc-900 dark:text-white dark:border-white/10 dark:focus:border-gigante-red placeholder:text-gray-400 dark:placeholder:text-gray-500" placeholder="Ex: Alex Ignacio" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300">WhatsApp</label>
                    <input required type="tel" name="telefone" value={formData.telefone} onChange={handleInputChange} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-black outline-none transition-all dark:bg-zinc-900 dark:text-white dark:border-white/10 dark:focus:border-gigante-red placeholder:text-gray-400 dark:placeholder:text-gray-500" placeholder="(00) 00000-0000" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300">Unidade Desejada</label>
                    <select required name="cidade_loja_id" value={formData.cidade_loja_id} onChange={handleInputChange} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-black outline-none dark:bg-zinc-900 dark:text-white dark:border-white/10 dark:focus:border-gigante-red">
                      <option value="">Selecione a Loja</option>
                      {stores.map(s => <option key={s.id} value={s.id}>{s.nome_loja}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300">Cargo Pretendido</label>
                    <select required name="cargo_id" value={formData.cargo_id} onChange={handleInputChange} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-black outline-none dark:bg-zinc-900 dark:text-white dark:border-white/10 dark:focus:border-gigante-red">
                      <option value="">Selecione o Cargo</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300">Apresentação</label>
                  <textarea required name="apresentacao" value={formData.apresentacao} onChange={handleInputChange} rows={4} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-black outline-none transition-all resize-none dark:bg-zinc-900 dark:text-white dark:border-white/10 dark:focus:border-gigante-red placeholder:text-gray-400 dark:placeholder:text-gray-500" placeholder="Conte sua experiência..." />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Currículo (Arquivo)</label>
                  <div onClick={() => fileInputRef.current?.click()} className={`border-4 border-dashed rounded-sm p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${selectedFile ? 'border-gigante-red bg-gigante-red/5' : 'border-gray-200 bg-gray-50 hover:border-black dark:bg-black/40 dark:border-white/10 dark:hover:border-gigante-red'}`}>
                    <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
                    {selectedFile ? (
                      <div className="flex items-center gap-4 text-gigante-red font-black uppercase italic">
                        <FileText size={32} />
                        <span className="text-sm">{selectedFile.name}</span>
                        <X size={16} onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-black dark:text-white" />
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="text-gray-300 mx-auto mb-4" size={40} />
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Clique para subir seu currículo</p>
                      </div>
                    )}
                  </div>
                </div>

                <button disabled={isSubmitting} className="w-full bg-black text-white py-6 rounded-sm font-black text-xl hover:bg-gigante-red transition-all shadow-2xl flex items-center justify-center gap-4 italic uppercase border-b-8 border-gigante-red">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send size={24} /> Enviar Candidatura</>}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default ApplicationForm;
