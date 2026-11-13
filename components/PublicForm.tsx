import React, { useState, useEffect, useMemo } from 'react';
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
  CreditCard, 
  Globe, 
  Sparkles, 
  Check, 
  UserCheck, 
  Award, 
  Clock, 
  X, 
  FileCheck2, 
  HelpCircle 
} from 'lucide-react';
import { parseJobLandingFromRequisitos } from '../jobsService';
import { ExperienciaProfissional } from '../types';
import CandidateFormProgress, { calculateFormProgress } from './CandidateFormProgress';

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

const HABILIDADES_SUGERIDAS = [
  'Troca de Pneus / Borracharia',
  'Alinhamento & Balanceamento',
  'Mecânica Rápida Automotiva',
  'Atendimento ao Cliente',
  'Vendas Técnicas / Balcão',
  'Controle de Estoque / Almoxarifado',
  'Operação de Caixa / PDV',
  'Informática Básica / ERP',
  'CNH Categoria B',
  'CNH Categoria AB',
  'Facilidade de Aprendizado',
  'Pontualidade & Organização'
];

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
  
  // Estado cadastral principal (inicia estritamente vazio no formulário novo)
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    telefone: '',
    cidade: '',
    estado: 'SP',
    escolaridade: '', // Inicia vazio sem seleção prévia
    linkedin_url: '',
    aceita_outras_vagas: false, // Inicia desmarcado
    loja_filtro_id: '',
    candidatura_espontanea: false, // Inicia desmarcado
    apresentacao_pessoal: '',
    consentimento_lgpd: false, // Inicia desmarcado
  });

  // Estado de experiência profissional: inicia SEM NENHUMA seleção prévia
  const [tipoExperiencia, setTipoExperiencia] = useState<'com_experiencia' | 'primeiro_emprego' | null>(null);
  const [experienciaData, setExperienciaData] = useState({
    ultima_empresa: '',
    cargo_funcao: '',
    area_atuacao: '', // Inicia vazio
    tempo_experiencia: '', // Inicia vazio
    principais_atividades: '',
    disponibilidade_inicio: '', // Inicia vazio
    observacoes: ''
  });
  const [habilidadesSelecionadas, setHabilidadesSelecionadas] = useState<string[]>([]);
  const [customHabilidade, setCustomHabilidade] = useState('');

  // Seleção de vagas e anexo de currículo
  const [selectedCargoIds, setSelectedCargoIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  // Estados de submissão
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [confirmedProtocolo, setConfirmedProtocolo] = useState<string | null>(null);
  const [confirmedStatusType, setConfirmedStatusType] = useState<'efetivado' | 'recebido_para_analise'>('efetivado');
  const [confirmedHasCurriculo, setConfirmedHasCurriculo] = useState<boolean>(false);
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
            if (c.id === slug) return true;
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
        // NOTA (Prompt 62): No formulário novo geral (/cadastro), nenhuma vaga ou candidatura
        // espontânea deve ser pré-selecionada. O candidato deve fazer a escolha consciente.
      } catch (e) {
        console.warn('Erro ao carregar opções públicas:', e);
      }
    };
    loadOptions();
    return () => { isMounted = false; };
  }, [slug]);

  const toggleCargoSelection = (cargoId: string) => {
    setSelectedCargoIds(prev => 
      prev.includes(cargoId) ? prev.filter(id => id !== cargoId) : [...prev, cargoId]
    );
  };

  const toggleHabilidade = (habilidade: string) => {
    setHabilidadesSelecionadas(prev => 
      prev.includes(habilidade) ? prev.filter(h => h !== habilidade) : [...prev, habilidade]
    );
  };

  const handleAddCustomHabilidade = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const clean = customHabilidade.trim();
    if (clean && !habilidadesSelecionadas.includes(clean)) {
      setHabilidadesSelecionadas(prev => [...prev, clean]);
      setCustomHabilidade('');
    }
  };

  const filteredCargos = formData.loja_filtro_id
    ? cargos.filter(c => !c.loja_id || c.loja_id === formData.loja_filtro_id)
    : cargos;

  // Contador de caracteres da Apresentação Pessoal
  const apresentacaoLength = formData.apresentacao_pessoal.trim().length;
  const isApresentacaoValida = apresentacaoLength >= 80 && formData.apresentacao_pessoal.length <= 2000;

  // Cálculo inteligente e reativo do progresso (Prompt 61)
  const formProgress = useMemo(() => {
    return calculateFormProgress({
      formData,
      selectedCargoIds,
      tipoExperiencia,
      experienciaData,
      isValidCpfFn: isValidCPFClient
    });
  }, [formData, selectedCargoIds, tipoExperiencia, experienciaData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetails(null);

    // 1. Validação de CPF
    if (!isValidCPFClient(formData.cpf)) {
      setSubmissionState('error');
      setErrorDetails("O CPF informado é inválido. Por favor, verifique os dígitos digitados.");
      return;
    }

    // 2. Validação de Escolaridade
    if (!formData.escolaridade) {
      setSubmissionState('error');
      setErrorDetails("Por favor, selecione sua escolaridade.");
      return;
    }

    // 3. Validação de Apresentação Pessoal (Obrigatória na V1: 80 - 2.000 chars)
    if (apresentacaoLength < 80) {
      setSubmissionState('error');
      setErrorDetails(`A apresentação pessoal ("Conte um pouco sobre você") é obrigatória e deve ter pelo menos 80 caracteres. Atualmente possui ${apresentacaoLength} caracteres (faltam ${80 - apresentacaoLength}).`);
      return;
    }
    if (formData.apresentacao_pessoal.length > 2000) {
      setSubmissionState('error');
      setErrorDetails(`A apresentação pessoal não pode exceder 2.000 caracteres (tamanho atual: ${formData.apresentacao_pessoal.length}).`);
      return;
    }

    // 4. Validação de Experiência Profissional
    if (!tipoExperiencia) {
      setSubmissionState('error');
      setErrorDetails("Por favor, selecione se você possui experiência anterior ou se busca seu primeiro emprego.");
      return;
    }

    if (tipoExperiencia === 'com_experiencia') {
      if (!experienciaData.cargo_funcao.trim()) {
        setSubmissionState('error');
        setErrorDetails("Por favor, informe seu último cargo ou função exercida.");
        return;
      }
      if (!experienciaData.ultima_empresa.trim()) {
        setSubmissionState('error');
        setErrorDetails("Por favor, informe o nome da sua última empresa ou empregador.");
        return;
      }
      if (!experienciaData.area_atuacao) {
        setSubmissionState('error');
        setErrorDetails("Por favor, selecione sua área de atuação principal.");
        return;
      }
      if (!experienciaData.tempo_experiencia) {
        setSubmissionState('error');
        setErrorDetails("Por favor, selecione seu tempo total de experiência.");
        return;
      }
    }

    // Validação de Disponibilidade para Início
    if (!experienciaData.disponibilidade_inicio) {
      setSubmissionState('error');
      setErrorDetails("Por favor, selecione sua disponibilidade para início das atividades.");
      return;
    }

    // 5. Validação de Vagas Selecionadas
    if (selectedCargoIds.length === 0 && !formData.candidatura_espontanea) {
      setSubmissionState('error');
      setErrorDetails("Selecione pelo menos uma vaga de interesse ou marque a opção de Candidatura Espontânea.");
      return;
    }

    // 6. Validação de LGPD
    if (!formData.consentimento_lgpd) {
      setSubmissionState('error');
      setErrorDetails("Você deve consentir com os termos da LGPD para registrar sua candidatura.");
      return;
    }

    // 7. Validação de Arquivo (SE fornecido)
    if (file && file.size > 10 * 1024 * 1024) {
      setSubmissionState('error');
      setErrorDetails(`O arquivo anexado excede o limite máximo de 10 MB (tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      return;
    }

    try {
      setSubmissionState('validating');
      setStatusMessage('Validando informações cadastrais e perfil profissional...');

      let base64Data: string | null = null;
      if (file) {
        setSubmissionState('processing');
        setStatusMessage('Processando documento anexado para envio seguro...');
        base64Data = await fileToBase64(file);
      }

      setSubmissionState('uploading');
      setStatusMessage('Transmitindo sua ficha para o Banco de Talentos da Gigante Pneus...');

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

      if (formData.candidatura_espontanea || vagasList.length === 0) {
        vagasList.push({
          cargo_id: null,
          loja_id: formData.loja_filtro_id || null,
          vaga_interesse: 'Candidatura Espontânea / Banco de Talentos'
        });
      }

      // Estruturação do objeto de experiência
      const experienciaPayload: ExperienciaProfissional = {
        tipo_experiencia: tipoExperiencia || 'primeiro_emprego',
        primeiro_emprego: tipoExperiencia === 'primeiro_emprego',
        ultima_empresa: tipoExperiencia === 'com_experiencia' ? experienciaData.ultima_empresa.trim() : 'Primeiro Emprego',
        cargo_funcao: tipoExperiencia === 'com_experiencia' ? experienciaData.cargo_funcao.trim() : 'Iniciante / Primeiro Emprego',
        area_atuacao: tipoExperiencia === 'com_experiencia' ? experienciaData.area_atuacao : 'Primeiro Emprego / Entrada',
        tempo_experiencia: tipoExperiencia === 'com_experiencia' ? experienciaData.tempo_experiencia : 'Sem experiência prévia',
        principais_atividades: tipoExperiencia === 'com_experiencia' ? experienciaData.principais_atividades.trim() : '',
        habilidades: habilidadesSelecionadas,
        disponibilidade_inicio: experienciaData.disponibilidade_inicio,
        observacoes: experienciaData.observacoes.trim()
      };

      const payload: any = {
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
        apresentacao_pessoal: formData.apresentacao_pessoal.trim(),
        resumo: formData.apresentacao_pessoal.trim(),
        experiencia_profissional: experienciaPayload
      };

      // Arquivo é opcional na V1
      if (file && base64Data) {
        payload.arquivo = {
          nome: file.name,
          base64: base64Data,
          mimeType: file.type || 'application/pdf'
        };
      }

      const res = await fetch('/api/candidaturas/enviar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      let responseData: any = null;
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          responseData = await res.json();
        } catch (jsonErr) {
          console.warn('[PublicForm] Resposta declarada como JSON mas inválida:', jsonErr);
        }
      }

      if (!res.ok || !responseData || !responseData.success) {
        if (res.status === 502 || res.status === 504) {
          setSubmissionState('resend_needed');
          setErrorDetails(responseData?.mensagem || 'Instabilidade temporária na conexão. Por favor, tente reenviar.');
          return;
        }

        const userMessage = responseData?.mensagem ||
          (res.status >= 500
            ? 'Ocorreu uma instabilidade temporária no servidor. Por favor, tente enviar novamente em instantes.'
            : 'Não foi possível validar seus dados. Por favor, revise as informações preenchidas.');

        throw new Error(userMessage);
      }

      setConfirmedProtocolo(responseData.protocolo);
      setConfirmedStatusType(responseData.status_processamento === 'recebido_para_analise' ? 'recebido_para_analise' : 'efetivado');
      setConfirmedHasCurriculo(Boolean(file));
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
            {isAnalise ? 'Inscrição em Análise Cadastral' : 'Inscrição Confirmada com Sucesso!'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mb-6 leading-relaxed">
            {isAnalise 
              ? 'Sua apresentação profissional e dados cadastrais foram recebidos com segurança e estão em análise pela equipe de RH da Gigante Pneus.'
              : 'Seu perfil foi registrado no Banco de Talentos Corporativo e já está disponível para os avaliadores de RH.'
            }
          </p>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl w-full border border-gray-200 dark:border-gray-700/60 mb-6 text-left">
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Protocolo de Confirmação</span>
            <span className="text-lg font-mono font-black text-red-600 dark:text-red-400 select-all tracking-wide">{confirmedProtocolo}</span>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              {confirmedHasCurriculo ? (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-bold">
                  <FileCheck2 className="h-3.5 w-3.5" /> Currículo em arquivo anexado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
                  <UserCheck className="h-3.5 w-3.5" /> Ficha profissional e apresentação preenchidas
                </span>
              )}
            </div>
            <span className="text-[10px] text-gray-400 block mt-1">Guarde este número para consultas futuras.</span>
          </div>

          <button 
            onClick={() => {
              setSubmissionState('idle');
              setConfirmedProtocolo(null);
              setFile(null);
              setSelectedCargoIds([]);
              setFormData({
                nome: '',
                email: '',
                cpf: '',
                telefone: '',
                cidade: '',
                estado: 'SP',
                escolaridade: '',
                linkedin_url: '',
                aceita_outras_vagas: false,
                loja_filtro_id: '',
                candidatura_espontanea: false,
                apresentacao_pessoal: '',
                consentimento_lgpd: false,
              });
              setTipoExperiencia(null);
              setExperienciaData({
                ultima_empresa: '',
                cargo_funcao: '',
                area_atuacao: '',
                tempo_experiencia: '',
                principais_atividades: '',
                disponibilidade_inicio: '',
                observacoes: ''
              });
              setHabilidadesSelecionadas([]);
            }}
            className="text-xs font-black uppercase text-red-600 hover:text-red-700 tracking-widest transition-colors"
          >
            ← Voltar ao Início / Nova Inscrição
          </button>
        </div>
      </div>
    );
  }

  const isLoading = submissionState === 'validating' || submissionState === 'processing' || submissionState === 'uploading';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] p-8 md:p-12 border border-gray-100 dark:border-gray-800 shadow-xl relative">
        {/* Marca d'água decorativa com corte isolado para não bloquear o position: sticky dos filhos */}
        <div className="absolute inset-0 rounded-[3rem] overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-48 h-48 bg-red-600/5 rounded-full -mr-24 -mt-24 pointer-events-none"></div>
        </div>
        
        {/* Cabeçalho Principal Aprovado */}
        <div className="mb-8 pb-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
              Rede Gigante Pneus
            </span>
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
              Banco de Talentos V1
            </span>
            <span className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Currículo Opcional
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white uppercase tracking-tighter">Trabalhe Conosco</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium text-xs tracking-wide leading-relaxed">
            Cadastre seu perfil profissional no Banco de Talentos Oficial da Gigante Pneus. Você pode se candidatar com ou sem currículo em arquivo.
          </p>
        </div>

        {/* Barra de Progresso Inteligente - Sticky abaixo da barra de navegação corporativa */}
        <div className="sticky top-20 z-20 -mx-8 md:-mx-12 px-8 md:px-12 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800/80 mb-8 transition-all">
          <CandidateFormProgress
            progress={formProgress.progress}
            message={formProgress.message}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 relative">
          {/* Overlay de carregamento */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-4 p-6 text-center rounded-3xl">
              <div className="relative">
                <Loader2 className="h-14 w-14 animate-spin text-red-600" />
                <HeartPulse className="h-6 w-6 text-red-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="font-extrabold uppercase text-red-600 tracking-wider text-sm animate-pulse">
                {statusMessage}
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Por favor, aguarde a conclusão da gravação segura da sua candidatura.
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
                  placeholder="Seu nome civil completo"
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
                  <option value="">Selecione sua escolaridade *</option>
                  <option value="Ensino Fundamental">Ensino Fundamental</option>
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

          {/* Bloco 2: Apresentação Pessoal Obrigatória (80 - 2.000 chars) */}
          <div className="space-y-3 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2 gap-2">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-800 dark:text-gray-200 tracking-widest flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-red-600" />
                  2. Conte um pouco sobre você *
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Fale sobre sua trajetória profissional, seus principais objetivos e por que gostaria de trabalhar na Gigante Pneus.
                </p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  isApresentacaoValida
                    ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300'
                    : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                }`}>
                  {apresentacaoLength} / mín. 80 - máx. 2.000
                </span>
              </div>
            </div>

            <div className="relative">
              <textarea
                required
                rows={5}
                minLength={80}
                maxLength={2000}
                className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-normal text-sm leading-relaxed text-gray-800 dark:text-white resize-y"
                placeholder="Exemplo: Trabalho na área de mecânica e alinhamento há 3 anos. Tenho facilidade em lidar com clientes, pontualidade e busco uma oportunidade na Gigante Pneus para crescer profissionalmente com dedicação e comprometimento..."
                value={formData.apresentacao_pessoal}
                onChange={e => setFormData({...formData, apresentacao_pessoal: e.target.value})}
              />
              {apresentacaoLength > 0 && apresentacaoLength < 80 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="h-3 w-3" />
                  Faltam {80 - apresentacaoLength} caracteres para atingir o mínimo recomendado de 80.
                </p>
              )}
            </div>
          </div>

          {/* Bloco 3: Experiência Profissional Estruturada */}
          <div className="space-y-4 pt-4">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="text-xs font-black uppercase text-gray-800 dark:text-gray-200 tracking-widest flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-red-600" />
                3. Sua Experiência Profissional
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Estruture suas informações de trabalho para que nossa equipe de RH avalie seu histórico rapidamente.
              </p>
            </div>

            {/* Alternador: Com Experiência vs Primeiro Emprego */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipoExperiencia('com_experiencia')}
                className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                  tipoExperiencia === 'com_experiencia'
                    ? 'border-red-600 bg-red-50/50 dark:bg-red-950/20 ring-2 ring-red-600/20'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-gray-300'
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  tipoExperiencia === 'com_experiencia' ? 'border-red-600 bg-red-600 text-white' : 'border-gray-400'
                }`}>
                  {tipoExperiencia === 'com_experiencia' && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">Possuo Experiência Anterior</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Já atuei em empresas ou funções anteriores no setor automotivo, comercial ou outros.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTipoExperiencia('primeiro_emprego')}
                className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                  tipoExperiencia === 'primeiro_emprego'
                    ? 'border-red-600 bg-red-50/50 dark:bg-red-950/20 ring-2 ring-red-600/20'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-gray-300'
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  tipoExperiencia === 'primeiro_emprego' ? 'border-red-600 bg-red-600 text-white' : 'border-gray-400'
                }`}>
                  {tipoExperiencia === 'primeiro_emprego' && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    Busco Meu Primeiro Emprego
                    <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] font-black px-2 py-0.5 rounded-full">
                      Iniciante
                    </span>
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Não possuo carteira assinada anterior. Busco oportunidade para aprender e me desenvolver.</p>
                </div>
              </button>
            </div>

            {/* Mensagem orientativa quando nenhuma opção de experiência foi selecionada */}
            {tipoExperiencia === null && (
              <div className="p-4 bg-gray-50/70 dark:bg-gray-800/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Selecione acima se você já possui experiência anterior ou se está iniciando sua carreira no primeiro emprego para avançar nesta etapa.
                </p>
              </div>
            )}

            {/* Campos condicionais para quem tem experiência */}
            {tipoExperiencia === 'com_experiencia' && (
              <div className="space-y-4 bg-gray-50/60 dark:bg-gray-800/40 p-5 rounded-2xl border border-gray-100 dark:border-gray-800">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                      Última Empresa / Empregador *
                    </label>
                    <input 
                      required
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:border-red-600 outline-none text-xs text-gray-800 dark:text-white"
                      placeholder="Ex: Auto Center ABC / Oficina Central"
                      value={experienciaData.ultima_empresa}
                      onChange={e => setExperienciaData({...experienciaData, ultima_empresa: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                      Último Cargo / Função Exercida *
                    </label>
                    <input 
                      required
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:border-red-600 outline-none text-xs text-gray-800 dark:text-white"
                      placeholder="Ex: Alinhador, Borracheiro, Vendedor, Mecânico"
                      value={experienciaData.cargo_funcao}
                      onChange={e => setExperienciaData({...experienciaData, cargo_funcao: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                      Área de Atuação Principal *
                    </label>
                    <select
                      required
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:border-red-600 outline-none text-xs text-gray-800 dark:text-white"
                      value={experienciaData.area_atuacao}
                      onChange={e => setExperienciaData({...experienciaData, area_atuacao: e.target.value})}
                    >
                      <option value="">Selecione a área principal *</option>
                      <option value="Mecânica e Serviços Automotivos">Mecânica & Serviços Automotivos</option>
                      <option value="Borracharia, Alinhamento e Balanceamento">Borracharia, Alinhamento & Balanceamento</option>
                      <option value="Vendas Balcão e Atendimento ao Cliente">Vendas Balcão & Atendimento</option>
                      <option value="Estoque, Almoxarifado e Logística">Estoque, Almoxarifado & Logística</option>
                      <option value="Administrativo e Financeiro">Administrativo & Financeiro</option>
                      <option value="Gerência e Liderança de Equipe">Gerência & Liderança</option>
                      <option value="Outra Área">Outra Área</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                      Tempo Total de Experiência *
                    </label>
                    <select
                      required
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:border-red-600 outline-none text-xs text-gray-800 dark:text-white"
                      value={experienciaData.tempo_experiencia}
                      onChange={e => setExperienciaData({...experienciaData, tempo_experiencia: e.target.value})}
                    >
                      <option value="">Selecione o tempo de experiência *</option>
                      <option value="Menos de 6 meses">Menos de 6 meses</option>
                      <option value="6 meses a 1 ano">6 meses a 1 ano</option>
                      <option value="1 a 2 anos">1 a 2 anos</option>
                      <option value="3 a 5 anos">3 a 5 anos</option>
                      <option value="Mais de 5 anos">Mais de 5 anos</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    Principais Atividades Exercidas
                  </label>
                  <textarea
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:border-red-600 outline-none text-xs text-gray-800 dark:text-white resize-y"
                    placeholder="Descreva brevemente o que fazia no dia a dia (ex: montagem de pneus, balanceamento dinâmico, emissão de ordens de serviço...)"
                    value={experienciaData.principais_atividades}
                    onChange={e => setExperienciaData({...experienciaData, principais_atividades: e.target.value})}
                  />
                </div>
              </div>
            )}

            {/* Card acolhedor para primeiro emprego */}
            {tipoExperiencia === 'primeiro_emprego' && (
              <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-200/60 dark:border-amber-900/40">
                <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5">
                  <Award className="h-4 w-4" /> Bem-vindo(a) ao seu início de carreira na Gigante Pneus!
                </p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1">
                  Valorizamos muito a vontade de aprender, pontualidade e dedicação. Selecione abaixo as habilidades e cursos que você já possui ou está desenvolvendo.
                </p>
              </div>
            )}

            {/* Habilidades e Diferenciais (Chips Selecionáveis) */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Habilidades e Diferenciais (Clique para selecionar)
              </label>
              <div className="flex flex-wrap gap-2">
                {HABILIDADES_SUGERIDAS.map(hab => {
                  const isSelected = habilidadesSelecionadas.includes(hab);
                  return (
                    <button
                      key={hab}
                      type="button"
                      onClick={() => toggleHabilidade(hab)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-red-600 border-red-600 text-white shadow-sm font-bold'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 font-medium'
                      }`}
                    >
                      {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : <span>+</span>}
                      {hab}
                    </button>
                  );
                })}
              </div>

              {/* Inclusão de Habilidade Personalizada */}
              <div className="flex gap-2 mt-2">
                <input 
                  type="text"
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs text-gray-800 dark:text-white outline-none focus:border-red-600 flex-1"
                  placeholder="Adicionar outra habilidade ou curso (ex: NR-35, Mecânica Básica SENAI...)"
                  value={customHabilidade}
                  onChange={e => setCustomHabilidade(e.target.value)}
                  onKeyDown={handleAddCustomHabilidade}
                />
                <button
                  type="button"
                  onClick={handleAddCustomHabilidade}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </div>

            {/* Disponibilidade para Início */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Disponibilidade para Início *
                </label>
                <select
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:border-red-600 outline-none text-xs text-gray-800 dark:text-white"
                  value={experienciaData.disponibilidade_inicio}
                  onChange={e => setExperienciaData({...experienciaData, disponibilidade_inicio: e.target.value})}
                >
                  <option value="">Selecione sua disponibilidade *</option>
                  <option value="Imediata">Imediata</option>
                  <option value="15 dias (Aviso prévio)">15 dias (Aviso prévio)</option>
                  <option value="30 dias (Aviso prévio)">30 dias (Aviso prévio)</option>
                  <option value="A combinar">A combinar</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bloco 4: Seleção de Múltiplas Vagas e Unidades */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="text-xs font-black uppercase text-gray-400 dark:text-gray-500 tracking-widest">
                4. Seleção de Vagas e Oportunidades
              </h3>
              <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-1 rounded-full">
                {selectedCargoIds.length} {selectedCargoIds.length === 1 ? 'vaga selecionada' : 'vagas selecionadas'}
              </span>
            </div>

            {/* Filtro por Unidade */}
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

            {/* Opção Voluntária 1: Candidatura Espontânea */}
            <div className="p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60 flex items-start gap-3">
              <input 
                id="candidatura-espontanea"
                type="checkbox"
                checked={formData.candidatura_espontanea}
                onChange={e => setFormData({...formData, candidatura_espontanea: e.target.checked})}
                className="mt-1 h-4 w-4 rounded text-red-600 focus:ring-red-500 border-gray-300 dark:border-gray-700 cursor-pointer"
              />
              <label htmlFor="candidatura-espontanea" className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed cursor-pointer select-none">
                <span className="font-bold">Candidatura Espontânea:</span> Desejo deixar meu perfil cadastrado no Banco de Talentos Geral da Gigante Pneus para novas vagas que surgirem.
              </label>
            </div>

            {/* Opção Voluntária 2: Ampliação de Oportunidades */}
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
                Desejo também ser considerado para outras vagas compatíveis com meu perfil em qualquer unidade da rede.
              </label>
            </div>
          </div>

          {/* Bloco 5: Anexo de Currículo (OPCIONAL NA V1) */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2 gap-2">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-800 dark:text-gray-200 tracking-widest flex items-center gap-2">
                  <FileText className="h-4 w-4 text-red-600" />
                  5. Anexar Currículo
                  <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Opcional
                  </span>
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Não possui um arquivo de currículo pronto? Não tem problema! As seções preenchidas acima já são suficientes para sua avaliação inicial.
                </p>
              </div>
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 self-end sm:self-auto"
                >
                  <X className="h-3.5 w-3.5" /> Remover anexo
                </button>
              )}
            </div>

            <div className={`mt-1 flex justify-center px-6 pt-6 pb-6 border-2 border-dashed rounded-3xl transition-all relative ${
              file 
                ? 'border-green-500 bg-green-50/20 dark:bg-green-950/20' 
                : 'border-gray-200 dark:border-gray-800 hover:border-red-600 bg-gray-50/50 dark:bg-gray-800/30'
            }`}>
              <input 
                type="file" 
                accept=".pdf,.doc,.docx"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <div className="space-y-2 text-center pointer-events-none">
                <div className={`p-3.5 rounded-full shadow-sm mx-auto w-fit transition-transform ${
                  file ? 'bg-green-100 dark:bg-green-900/40 text-green-600' : 'bg-white dark:bg-gray-800 text-red-600'
                }`}>
                  {file ? <FileCheck2 className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
                </div>
                <div className="text-sm">
                  {file ? (
                    <span className="font-bold text-green-700 dark:text-green-400">
                      Arquivo anexado: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  ) : (
                    <span className="font-medium text-gray-600 dark:text-gray-400">
                      Arraste seu currículo ou <span className="text-red-600 font-bold underline">clique para selecionar</span> (PDF, DOC ou DOCX até 10 MB)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {file 
                    ? 'O arquivo será armazenado com segurança no repositório corporativo e disponibilizado ao RH.' 
                    : 'Campo não obrigatório. Caso anexe, ele complementará os dados preenchidos acima.'
                  }
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
              className="mt-1 h-4 w-4 rounded text-red-600 focus:ring-red-500 border-gray-300 dark:border-gray-700 cursor-pointer"
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
              <>
                Finalizar Cadastro no Banco de Talentos
                {selectedCargoIds.length > 0 && ` (${selectedCargoIds.length} vaga${selectedCargoIds.length > 1 ? 's' : ''})`}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PublicForm;
