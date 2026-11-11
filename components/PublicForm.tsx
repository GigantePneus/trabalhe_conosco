import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Briefcase, 
  MapPin, 
  Mail, 
  Phone, 
  HeartPulse, 
  ShieldCheck, 
  FileText, 
  RefreshCw,
  CreditCard,
  Globe,
  Sparkles,
  Check
} from 'lucide-react';
import { parseJobLandingFromRequisitos } from '../jobsService';

interface LojaPublica {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
}

interface CargoPublico {
  id: string;
  titulo: string;
  departamento: string | null;
  requisitos: string | null;
  loja_id: string | null;
  loja_nome: string | null;
  loja_cidade: string | null;
  loja_estado: string | null;
}

type SubmissionState = 'idle' | 'validating' | 'uploading' | 'processing' | 'success' | 'error' | 'resend_needed';

// Formatação e máscara de CPF
const formatCPF = (val: string) => {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

// Formatação e máscara de Telefone / WhatsApp
const formatPhone = (val: string) => {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

// Validação matemática de CPF no client
const isValidCPFClient = (cpf: string) => {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(clean.charAt(i), 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(clean.charAt(9), 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(clean.charAt(i), 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(clean.charAt(10), 10);
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

const PublicForm: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    telefone: '',
    cidade: '',
    estado: 'SP',
    escolaridade: 'Ensino Médio',
    linkedin_url: '',
    aceita_outras_vagas: true,
    loja_filtro_id: '',
    candidatura_espontanea: false,
    resumo: '',
    consentimento_lgpd: true,
  });

  // Lista de IDs de cargos selecionados (suporte a múltiplas vagas)
  const [selectedCargoIds, setSelectedCargoIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [confirmedProtocolo, setConfirmedProtocolo] = useState<string | null>(null);
  const [confirmedStatusType, setConfirmedStatusType] = useState<'efetivado' | 'recebido_para_analise'>('efetivado');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const [lojas, setLojas] = useState<LojaPublica[]>([]);
  const [cargos, setCargos] = useState<CargoPublico[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadOptions = async () => {
      try {
        const [lojasRes, cargosRes] = await Promise.all([
          supabase.from('lojas_publicas').select('id, nome, cidade, estado').order('cidade', { ascending: true }),
          supabase.from('cargos_publicos').select('id, titulo, departamento, requisitos, loja_id, loja_nome, loja_cidade, loja_estado').order('titulo', { ascending: true })
        ]);
        if (!isMounted) return;
        const loadedLojas = (lojasRes.data || []) as LojaPublica[];
        const loadedCargos = (cargosRes.data || []) as CargoPublico[];
        setLojas(loadedLojas);
        setCargos(loadedCargos);

        if (slug) {
          const matched = loadedCargos.find(c => {
            const landing = parseJobLandingFromRequisitos({
              id: c.id,
              nome: c.titulo,
              requisitos: c.requisitos,
              created_at: new Date().toISOString()
            });
            return landing.slug === slug;
          });
          if (matched) {
            setSelectedCargoIds([matched.id]);
            setFormData(prev => ({
              ...prev,
              loja_filtro_id: matched.loja_id || '',
              cidade: matched.loja_cidade || prev.cidade,
              estado: matched.loja_estado || prev.estado
            }));
          }
        }
      } catch (e) {
        console.warn('Erro ao carregar opções públicas:', e);
      }
    };
    loadOptions();
    return () => { isMounted = false; };
  }, [slug]);

  // Alterna seleção de uma vaga
  const toggleCargoSelection = (cargoId: string) => {
    setSelectedCargoIds(prev => 
      prev.includes(cargoId) ? prev.filter(id => id !== cargoId) : [...prev, cargoId]
    );
  };

  // Vagas visíveis filtradas pela unidade selecionada
  const filteredCargos = formData.loja_filtro_id
    ? cargos.filter(c => !c.loja_id || c.loja_id === formData.loja_filtro_id)
    : cargos;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetails(null);

    // Validação de CPF
    if (!isValidCPFClient(formData.cpf)) {
      setSubmissionState('error');
      setErrorDetails("O CPF informado é inválido. Por favor, verifique os dígitos digitados.");
      return;
    }

    // Validação de Vagas Selecionadas
    if (selectedCargoIds.length === 0 && !formData.candidatura_espontanea) {
      setSubmissionState('error');
      setErrorDetails("Selecione pelo menos uma vaga de interesse ou marque a opção de Candidatura Espontânea.");
      return;
    }

    if (!file) {
      setSubmissionState('error');
      setErrorDetails("O upload do arquivo de currículo (.pdf, .doc ou .docx) é obrigatório.");
      return;
    }

    if (!formData.consentimento_lgpd) {
      setSubmissionState('error');
      setErrorDetails("Você deve consentir com os termos da LGPD para enviar seu currículo.");
      return;
    }

    try {
      setSubmissionState('validating');
      setStatusMessage('Validando informações cadastrais e documento...');

      if (file.size > 10 * 1024 * 1024) {
        throw new Error(`O arquivo excede o limite máximo permitido de 10 MB (tamanho atual: ${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      }

      setSubmissionState('processing');
      setStatusMessage('Processando e validando formato seguro do currículo...');
      const base64Data = await fileToBase64(file);

      setSubmissionState('uploading');
      setStatusMessage('Transmitindo candidatura para os servidores da Gigante Pneus...');

      // Monta lista de vagas pretendidas
      const vagasList: Array<{ cargo_id?: string | null; loja_id?: string | null; vaga_interesse: string }> = [];
      
      for (const id of selectedCargoIds) {
        const found = cargos.find(c => c.id === id);
        if (found) {
          vagasList.push({
            cargo_id: found.id,
            loja_id: found.loja_id,
            vaga_interesse: found.titulo
          });
        }
      }

      // Adiciona candidatura espontânea se selecionada
      if (formData.candidatura_espontanea || vagasList.length === 0) {
        vagasList.push({
          cargo_id: null,
          loja_id: formData.loja_filtro_id || null,
          vaga_interesse: 'Candidatura Espontânea / Banco de Talentos'
        });
      }

      const payload = {
        nome: formData.nome,
        email: formData.email,
        cpf: formData.cpf,
        telefone: formData.telefone,
        cidade: formData.cidade,
        estado: formData.estado,
        escolaridade: formData.escolaridade,
        linkedin_url: formData.linkedin_url,
        aceita_outras_vagas: formData.aceita_outras_vagas,
        consentimento_lgpd: formData.consentimento_lgpd,
        vagas: vagasList,
        resumo: formData.resumo,
        arquivo: {
          nome: file.name,
          base64: base64Data,
          mimeType: file.type || 'application/pdf'
        }
      };

      const res = await fetch('/api/candidaturas/enviar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await res.json();

      if (!res.ok || !responseData.success) {
        if (res.status === 502 || res.status === 504) {
          setSubmissionState('resend_needed');
          setErrorDetails(responseData.mensagem || 'Falha transitória na comunicação. Por favor, reenvie.');
          return;
        }
        throw new Error(responseData.mensagem || 'Falha ao processar candidatura.');
      }

      setConfirmedProtocolo(responseData.protocolo);
      setConfirmedStatusType(responseData.status_processamento === 'recebido_para_analise' ? 'recebido_para_analise' : 'efetivado');
      setSubmissionState('success');
    } catch (err: any) {
      setSubmissionState('error');
      setErrorDetails(err.message || 'Erro inesperado no envio da candidatura. Tente novamente.');
    }
  };

  // Tela de Sucesso com Protocolo Confirmado
  if (submissionState === 'success' && confirmedProtocolo) {
    const isAnalise = confirmedStatusType === 'recebido_para_analise';
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center animate-in fade-in zoom-in duration-500">
        <div className="bg-white dark:bg-gray-900 p-8 md:p-12 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
          <div className={`w-24 h-24 ${isAnalise ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'} rounded-full flex items-center justify-center mb-6`}>
            {isAnalise ? (
              <ShieldCheck className="h-12 w-12 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            )}
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
            {isAnalise ? 'Solicitação em Análise Cadastral' : 'Candidatura Registrada com Sucesso!'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mb-6 leading-relaxed">
            {isAnalise 
              ? 'Seus dados e currículo foram recebidos de forma segura e encaminhados para validação cadastral da equipe de Recursos Humanos da Gigante Pneus.'
              : 'Seu cadastro único foi validado e vinculado às oportunidades selecionadas. Nosso time de recrutamento entrará em contato caso haja compatibilidade.'
            }
          </p>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl w-full border border-gray-200 dark:border-gray-700/60 mb-6 text-left">
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Protocolo de Confirmação</span>
            <span className="text-lg font-mono font-black text-red-600 dark:text-red-400 select-all tracking-wide">{confirmedProtocolo}</span>
            <span className="text-[10px] text-gray-400 block mt-1">Guarde este número para acompanhamento futuro.</span>
          </div>

          <button 
            onClick={() => {
              setSubmissionState('idle');
              setConfirmedProtocolo(null);
              setFile(null);
              setSelectedCargoIds([]);
            }}
            className="text-xs font-black uppercase text-red-600 hover:text-red-700 tracking-widest transition-colors"
          >
            ← Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  const isLoading = submissionState === 'validating' || submissionState === 'processing' || submissionState === 'uploading';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] p-8 md:p-12 border border-gray-100 dark:border-gray-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-red-600/5 rounded-full -mr-24 -mt-24 pointer-events-none"></div>
        
        <div className="mb-10 pb-8 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
              Rede Gigante Pneus
            </span>
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
              Cadastro Único Centralizado
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white uppercase tracking-tighter">Trabalhe Conosco</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium text-xs tracking-wide leading-relaxed">
            Preencha seus dados uma única vez e selecione uma ou mais vagas em nossas unidades franqueadas e sede corporativa.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 relative">
          {/* Overlay de carregamento com estados visuais explícitos */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center space-y-4 p-6 text-center rounded-3xl">
              <div className="relative">
                <Loader2 className="h-14 w-14 animate-spin text-red-600" />
                <HeartPulse className="h-6 w-6 text-red-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="font-extrabold uppercase text-red-600 tracking-wider text-sm animate-pulse">
                {statusMessage}
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Por favor, aguarde a conclusão da operação transacional segura.
              </span>
            </div>
          )}

          {/* Alerta de Erro */}
          {submissionState === 'error' && errorDetails && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-600 p-4 flex items-start gap-3 rounded-r-xl">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-red-800 dark:text-red-300 text-sm font-bold uppercase">Atenção</p>
                <p className="text-red-700 dark:text-red-400 text-xs mt-1 font-medium">{errorDetails}</p>
              </div>
            </div>
          )}

          {/* Bloco 1: Dados Pessoais e Identificação Civil */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-gray-400 dark:text-gray-500 tracking-widest border-b border-gray-100 dark:border-gray-800 pb-2">
              1. Identificação do Candidato
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Nome Completo *</label>
                <input 
                  required
                  type="text"
                  className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                  placeholder="Nome civil completo"
                  value={formData.nome}
                  onChange={e => setFormData({...formData, nome: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center justify-between">
                  <span>CPF *</span>
                  {formData.cpf.length >= 14 && (
                    <span className={`text-[10px] font-bold ${isValidCPFClient(formData.cpf) ? 'text-green-600' : 'text-red-600'}`}>
                      {isValidCPFClient(formData.cpf) ? '✓ Válido' : '✗ Inválido'}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input 
                    required
                    type="text"
                    maxLength={14}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                    placeholder="000.000.000-00"
                    value={formData.cpf}
                    onChange={e => setFormData({...formData, cpf: formatCPF(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">E-mail *</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input 
                    required
                    type="email"
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                    placeholder="seu.email@exemplo.com"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">WhatsApp / Telefone *</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input 
                    required
                    type="tel"
                    maxLength={15}
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                    placeholder="(11) 99999-9999"
                    value={formData.telefone}
                    onChange={e => setFormData({...formData, telefone: formatPhone(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Cidade de Residência *</label>
                <input 
                  required
                  type="text"
                  className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                  placeholder="Ex: Campinas"
                  value={formData.cidade}
                  onChange={e => setFormData({...formData, cidade: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Escolaridade *</label>
                <select
                  required
                  className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                  value={formData.escolaridade}
                  onChange={e => setFormData({...formData, escolaridade: e.target.value})}
                >
                  <option value="Ensino Médio">Ensino Médio</option>
                  <option value="Técnico / Profissionalizante">Técnico / Profissionalizante</option>
                  <option value="Superior Cursando">Superior Cursando</option>
                  <option value="Superior Completo">Superior Completo</option>
                  <option value="Pós-Graduação">Pós-Graduação</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">LinkedIn / Portfólio (Opcional)</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input 
                    type="url"
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                    placeholder="https://linkedin.com/in/seuperfil"
                    value={formData.linkedin_url}
                    onChange={e => setFormData({...formData, linkedin_url: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bloco 2: Seleção de Múltiplas Vagas e Unidades */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="text-xs font-black uppercase text-gray-400 dark:text-gray-500 tracking-widest">
                2. Seleção de Vagas e Oportunidades
              </h3>
              <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-1 rounded-full">
                {selectedCargoIds.length} {selectedCargoIds.length === 1 ? 'vaga selecionada' : 'vagas selecionadas'}
              </span>
            </div>

            {/* Filtro por Unidade para facilitar a escolha */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Filtrar por Unidade:</label>
              <select
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 text-xs font-medium text-gray-800 dark:text-white outline-none focus:border-red-600"
                value={formData.loja_filtro_id}
                onChange={e => setFormData({...formData, loja_filtro_id: e.target.value})}
              >
                <option value="">Todas as Unidades da Rede</option>
                {lojas.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.cidade} - {l.estado} ({l.nome})
                  </option>
                ))}
              </select>
            </div>

            {/* Grid de Cards de Vagas Selecionáveis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1 border border-gray-100 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-800/20">
              {filteredCargos.map(cargo => {
                const isSelected = selectedCargoIds.includes(cargo.id);
                return (
                  <div
                    key={cargo.id}
                    onClick={() => toggleCargoSelection(cargo.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      isSelected 
                        ? 'border-red-600 bg-red-50/60 dark:bg-red-950/30 text-gray-900 dark:text-white shadow-sm' 
                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border transition-colors shrink-0 ${
                      isSelected ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate leading-snug">{cargo.titulo}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {cargo.loja_cidade ? `${cargo.loja_cidade} - ${cargo.loja_estado}` : 'Corporativo / Todas as Lojas'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Opção Voluntária 1: Candidatura Espontânea / Banco Geral */}
            <div className="p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60 flex items-start gap-3">
              <input 
                id="candidatura-espontanea"
                type="checkbox"
                checked={formData.candidatura_espontanea}
                onChange={e => setFormData({...formData, candidatura_espontanea: e.target.checked})}
                className="mt-1 h-4 w-4 rounded text-red-600 focus:ring-red-500 border-gray-300 dark:border-gray-700 cursor-pointer"
              />
              <label htmlFor="candidatura-espontanea" className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed cursor-pointer select-none">
                <span className="font-bold">Candidatura Espontânea:</span> Desejo deixar meu currículo registrado para oportunidades gerais nesta ou em outras unidades caso não haja vaga específica aberta no momento.
              </label>
            </div>

            {/* Opção Voluntária 2: Consideração para Outras Oportunidades (Requisito da Rede) */}
            <div className="p-3.5 bg-red-50/40 dark:bg-red-950/20 rounded-2xl border border-red-200/60 dark:border-red-900/40 flex items-start gap-3">
              <input 
                id="aceita-outras-vagas"
                type="checkbox"
                checked={formData.aceita_outras_vagas}
                onChange={e => setFormData({...formData, aceita_outras_vagas: e.target.checked})}
                className="mt-1 h-4 w-4 rounded text-red-600 focus:ring-red-500 border-gray-300 dark:border-gray-700 cursor-pointer"
              />
              <label htmlFor="aceita-outras-vagas" className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed cursor-pointer select-none">
                <span className="font-bold text-red-700 dark:text-red-400 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> Ampliação de Oportunidades:
                </span>
                Desejo também ser considerado para outras oportunidades compatíveis com meu perfil profissional em qualquer unidade franqueada da rede Gigante Pneus.
              </label>
            </div>
          </div>

          {/* Bloco 3: Upload Único do Currículo */}
          <div className="space-y-2 pt-2">
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Currículo (PDF, DOC ou DOCX - Máx 10 MB) *
            </label>
            <div className="mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-gray-200 dark:border-gray-800 border-dashed rounded-3xl hover:border-red-600 dark:hover:border-red-500 transition-all cursor-pointer group relative bg-gray-50/50 dark:bg-gray-800/30">
              <input 
                required
                type="file" 
                accept=".pdf,.doc,.docx"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <div className="space-y-2 text-center">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-full shadow-sm mx-auto w-fit transition-transform group-hover:scale-110">
                  {file ? <FileText className="h-8 w-8 text-red-600" /> : <Upload className="h-8 w-8 text-red-600" />}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-bold text-red-600">
                    {file ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)` : "Clique ou arraste seu currículo aqui"}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                  Upload único: este documento será vinculado automaticamente a todas as vagas que você selecionou.
                </p>
              </div>
            </div>
          </div>

          {/* Consentimento LGPD Obrigatório */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60 flex items-start gap-3">
            <input 
              id="consentimento-lgpd"
              type="checkbox"
              required
              checked={formData.consentimento_lgpd}
              onChange={e => setFormData({...formData, consentimento_lgpd: e.target.checked})}
              className="mt-1 h-4 w-4 rounded text-red-600 focus:ring-red-500 border-gray-300 dark:border-gray-700"
            />
            <label htmlFor="consentimento-lgpd" className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed cursor-pointer select-none">
              <span className="font-bold text-gray-800 dark:text-gray-200">Termo de Consentimento LGPD: </span>
              Autorizo a Gigante Pneus a armazenar e processar meus dados pessoais e profissionais para fins de participação em processos seletivos presentes e futuros, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
            </label>
          </div>

          <button 
            disabled={isLoading}
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-bold text-lg uppercase shadow-xl hover:shadow-red-600/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>Enviar Candidatura Oficial ({selectedCargoIds.length || (formData.candidatura_espontanea ? 1 : 0)} vaga{(selectedCargoIds.length > 1) ? 's' : ''})</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PublicForm;
