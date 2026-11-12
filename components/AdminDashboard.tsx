import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { Candidato, ConfigItem, JobLandingContent, KPIStats, Pesquisa, Pergunta, TipoPergunta } from '../types';
import { 
  BarChart3, Users, ClipboardList, Sparkles, Briefcase, Settings, Building2,
  Eye, Download, MapPin, X, Loader2, Plus, Trash2, TrendingUp, ShieldCheck, Calendar,
  Link2, Copy, CheckCheck, ChevronLeft, ToggleLeft, ToggleRight, FileText, Hash, AlignLeft, ListChecks, Star,
  Share2, ExternalLink, MessageCircle, Brain, Award, Zap, Check, AlertTriangle, ThumbsUp, ThumbsDown, RefreshCw,
  KeyRound, Lock, EyeOff, Shield, Folder,
  LayoutList, LayoutGrid, Search, PowerOff, RotateCcw, ChevronRight, Info
} from 'lucide-react';
import { analyzeSurveyResponses, analyzeTalentCompatibility, listAvailableGeminiModels, AIAnalysisResult, TalentAnalysisResult, DEFAULT_PROMPT_SURVEYS, DEFAULT_PROMPT_TALENTS } from '../aiService';
import { createDefaultJobLanding, parseJobLandingFromRequisitos, serializeJobLanding, toLines } from '../jobsService';

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'talents' | 'surveys' | 'ai' | 'jobs' | 'lojas' | 'settings'>('overview');
  
  // Perfil e Autenticação do Usuário
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userProfileLoading, setUserProfileLoading] = useState(true);
  const isGestorMaster = userRole === 'franqueadora_admin';

  // Gestão de Unidades (Lojas)
  const [lojasList, setLojasList] = useState<any[]>([]);
  const [lojaModalOpen, setLojaModalOpen] = useState(false);
  const [editingLoja, setEditingLoja] = useState<any | null>(null);
  const [lojaFormData, setLojaFormData] = useState({
    nome: '',
    cidade: '',
    estado: 'PR',
    google_drive_folder_id: '',
    email_contato: '',
    telefone_contato: '',
    ativa: true
  });
  const [savingLoja, setSavingLoja] = useState(false);
  const [lojaMsg, setLojaMsg] = useState({ text: '', type: '' });

  // Visualização, Pesquisa e Paginação de Unidades (Prompt 51)
  const [lojasViewMode, setLojasViewMode] = useState<'list' | 'cards'>('list');
  const [searchLoja, setSearchLoja] = useState('');
  const [showInactiveLojas, setShowInactiveLojas] = useState(false);
  const [lojasCurrentPage, setLojasCurrentPage] = useState(1);
  const LOJAS_PER_PAGE = 8;

  // Estados de Desativação e Reativação Segura de Unidades (Prompt 51)
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [lojaToDeactivate, setLojaToDeactivate] = useState<any | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateImpact, setDeactivateImpact] = useState<{
    total_vagas: number;
    vagas_publicadas: number;
    total_candidaturas: number;
  } | null>(null);
  const [loadingDeactivateImpact, setLoadingDeactivateImpact] = useState(false);
  const [submittingDeactivation, setSubmittingDeactivation] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [lojaToReactivate, setLojaToReactivate] = useState<any | null>(null);
  const [submittingReactivation, setSubmittingReactivation] = useState(false);
  const [reactivateError, setReactivateError] = useState('');
  const [copiedLojaId, setCopiedLojaId] = useState<string | null>(null);

  // Unidade Vinculada ao Cargo / Vaga
  const [selectedJobLojaId, setSelectedJobLojaId] = useState<string>('');
  
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState('');
  const [filterCargo, setFilterCargo] = useState('');
  
  // Novos Filtros de Data Globais
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedResume, setSelectedResume] = useState<Candidato | null>(null);

  const [stats, setStats] = useState<KPIStats>({ total: 0, porCidade: {}, porCargo: {}, porDia: {} });
  
  // Dados extras para os novos gráficos
  const [timelineData, setTimelineData] = useState<{date: string, count: number, fullDate: Date}[]>([]);
  const [heatmapData, setHeatmapData] = useState<number[]>(new Array(24).fill(0));

  const [cidades, setCidades] = useState<ConfigItem[]>([]);
  const [cargos, setCargos] = useState<ConfigItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [jobEditorOpen, setJobEditorOpen] = useState(false);
  const [editingCargoId, setEditingCargoId] = useState<string>('');
  const [creatingJob, setCreatingJob] = useState(false);
  const [newJobName, setNewJobName] = useState('');
  const [jobLanding, setJobLanding] = useState<JobLandingContent>(createDefaultJobLanding(''));
  const [savingJob, setSavingJob] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);

  // Estado do Módulo de Pesquisas
  const [pesquisas, setPesquisas] = useState<Pesquisa[]>([]);
  const [surveyView, setSurveyView] = useState<'list' | 'create' | 'results'>('list');
  const [editPesquisa, setEditPesquisa] = useState<Pesquisa | null>(null);
  const [selectedPesquisaResults, setSelectedPesquisaResults] = useState<Pesquisa | null>(null);
  const [surveyResults, setSurveyResults] = useState<any[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [surveyResponseCounts, setSurveyResponseCounts] = useState<Record<string, number>>({});
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);

  // Estado do Construtor de Pesquisa
  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyDesc, setSurveyDesc] = useState('');
  const [surveyPerguntas, setSurveyPerguntas] = useState<Pergunta[]>([]);
  const [savingSurvey, setSavingSurvey] = useState(false);

  // Estado da Análise com Inteligência Artificial
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gigante_gemini_key') || '');
  const [tempGeminiKey, setTempGeminiKey] = useState(() => localStorage.getItem('gigante_gemini_key') || '');
  const [geminiSaveStatus, setGeminiSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [aiProvider, setAiProvider] = useState<'ollama' | 'gemini'>(() => {
    const savedProvider = localStorage.getItem('gigante_ai_provider');
    return savedProvider === 'gemini' ? 'gemini' : 'ollama';
  });
  const [ollamaModel, setOllamaModel] = useState<string>(() => localStorage.getItem('gigante_ollama_model') || 'llama3.2:3b');
  const [geminiModel, setGeminiModel] = useState<string>(() => localStorage.getItem('gigante_gemini_model') || 'gemini-2.5-flash');
  const [geminiModels, setGeminiModels] = useState<string[]>([]);
  const [loadingGeminiModels, setLoadingGeminiModels] = useState<boolean>(false);
  const [geminiModelsError, setGeminiModelsError] = useState<string>('');
  const [selectedAiSurveyId, setSelectedAiSurveyId] = useState<string>('');
  const [analyzingSurvey, setAnalyzingSurvey] = useState<boolean>(false);
  const [surveyAnalysisResult, setSurveyAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [selectedAiCargo, setSelectedAiCargo] = useState<string>('');
  const [analyzingTalents, setAnalyzingTalents] = useState<boolean>(false);
  const [matchingTalents, setMatchingTalents] = useState<Candidato[]>([]);
  const [talentAnalysisResults, setTalentAnalysisResults] = useState<Record<string, TalentAnalysisResult>>({});
  const [analyzingTalentId, setAnalyzingTalentId] = useState<string | null>(null);
  const [aiSubTab, setAiSubTab] = useState<'surveys' | 'talents'>('surveys');

  // Prompts customizados (Treinamento de Agentes de IA)
  const [promptSurveys, setPromptSurveys] = useState(() => localStorage.getItem('gigante_prompt_surveys') || DEFAULT_PROMPT_SURVEYS);
  const [promptTalents, setPromptTalents] = useState(() => localStorage.getItem('gigante_prompt_talents') || DEFAULT_PROMPT_TALENTS);
  const [promptSaveStatus, setPromptSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Estado da Gestão de Usuários e Segurança
  const [settingsSubTab, setSettingsSubTab] = useState<'geral' | 'seguranca' | 'usuarios'>('geral');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMsg, setUserMsg] = useState({ text: '', type: '' });

  // Estado da Alteração de Senha (Minha Conta > Segurança)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });

  useEffect(() => {
    const checkAuthAndProfile = async () => {
      setUserProfileLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setUserProfileLoading(false);
        return;
      }
      setCurrentUser(session.user);
      
      const { data: perfil } = await supabase
        .from('perfis')
        .select('id, role, ativo')
        .eq('id', session.user.id)
        .maybeSingle();

      if (perfil) {
        setUserRole(perfil.role || '');
      }
      setUserProfileLoading(false);
    };

    checkAuthAndProfile();
  }, []);

  useEffect(() => {
    fetchData();
    fetchPesquisas();
  }, [filterCity, filterCargo, startDate, endDate]);

  useEffect(() => {
    localStorage.setItem('gigante_ai_provider', aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    localStorage.setItem('gigante_ollama_model', ollamaModel);
  }, [ollamaModel]);

  useEffect(() => {
    localStorage.setItem('gigante_gemini_model', geminiModel);
  }, [geminiModel]);

  useEffect(() => {
    if (aiProvider !== 'gemini' || !geminiKey) {
      setGeminiModels([]);
      setGeminiModelsError('');
      return;
    }

    let cancelled = false;
    const loadGeminiModels = async () => {
      setLoadingGeminiModels(true);
      setGeminiModelsError('');
      try {
        const models = await listAvailableGeminiModels(geminiKey);
        if (cancelled) return;
        setGeminiModels(models);
        if (models.length > 0 && !models.includes(geminiModel)) {
          setGeminiModel(models[0]);
        }
      } catch (error: any) {
        if (cancelled) return;
        setGeminiModels([]);
        setGeminiModelsError(error?.message || 'Falha ao carregar modelos do Gemini.');
      } finally {
        if (!cancelled) setLoadingGeminiModels(false);
      }
    };

    loadGeminiModels();
    return () => {
      cancelled = true;
    };
  }, [aiProvider, geminiKey]);

  const handleVerCurriculo = async (cand: Candidato) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const fileParam = cand.curriculo_id
        ? `id=${encodeURIComponent(cand.curriculo_id)}`
        : `fileId=${encodeURIComponent(cand.curriculo_file_id || '')}`;
      const url = `/api/curriculos/visualizar?${fileParam}&token=${encodeURIComponent(token)}`;
      window.open(url, '_blank');
    } catch {
      if (cand.curriculo_url) {
        window.open(cand.curriculo_url, '_blank');
      }
    }
  };

  const fetchData = async () => {
    setLoading(true);
    
    // Consulta candidatos através do relacionamento com candidaturas (respeitando RLS multi-lojas)
    let qRes = supabase
      .from('candidaturas')
      .select(`
        id,
        vaga_interesse,
        status,
        criado_em,
        loja_id,
        candidatos (
          id,
          nome,
          email,
          cpf_mascarado,
          telefone,
          cidade,
          estado,
          escolaridade,
          linkedin_url,
          aceita_outras_vagas,
          criado_em
        ),
        lojas (
          id,
          nome,
          cidade,
          estado
        ),
        candidato_curriculos (
          id,
          nome_arquivo,
          google_drive_file_id,
          tamanho_bytes
        )
      `)
      .order('criado_em', { ascending: false });

    if (filterCargo) qRes = qRes.eq('vaga_interesse', filterCargo);
    if (startDate) qRes = qRes.gte('criado_em', `${startDate}T00:00:00Z`);
    if (endDate) qRes = qRes.lte('criado_em', `${endDate}T23:59:59Z`);

    const { data: candAppRows, error: candAppErr } = await qRes;

    let flatCandidatos: Candidato[] = [];

    if (!candAppErr && candAppRows) {
      flatCandidatos = candAppRows.map((row: any) => {
        const cand = row.candidatos || {};
        const loja = row.lojas || {};
        const curr = Array.isArray(row.candidato_curriculos) && row.candidato_curriculos.length > 0
          ? row.candidato_curriculos[0]
          : null;

        const cidadeFormatada = loja.cidade
          ? `${loja.cidade}${loja.estado ? ' - ' + loja.estado : ''}`
          : (cand.cidade || 'Corporativo');

        return {
          id: cand.id || row.id,
          candidatura_id: row.id,
          nome: cand.nome || 'Candidato',
          email: cand.email || '',
          cpf_mascarado: cand.cpf_mascarado || '',
          telefone: cand.telefone || '',
          cidade: cidadeFormatada,
          vaga_interesse: row.vaga_interesse || 'Geral',
          escolaridade: cand.escolaridade || '',
          linkedin_url: cand.linkedin_url || '',
          aceita_outras_vagas: cand.aceita_outras_vagas || false,
          resumo: cand.resumo || '',
          curriculo_id: curr?.id || '',
          curriculo_file_id: curr?.google_drive_file_id || '',
          curriculo_url: curr ? `/api/curriculos/visualizar?id=${curr.id}` : '',
          created_at: row.criado_em || cand.criado_em || new Date().toISOString()
        } as Candidato;
      });
    } else {
      // Fallback gracioso caso esteja em ambiente sem autenticação de recrutador
      const { data: rawCand } = await supabase.from('candidatos').select('*').order('criado_em', { ascending: false });
      if (rawCand) {
        flatCandidatos = rawCand.map((c: any) => ({
          ...c,
          created_at: c.criado_em || c.created_at || new Date().toISOString(),
          curriculo_url: c.curriculo_url || ''
        }));
      }
    }

    if (filterCity) {
      flatCandidatos = flatCandidatos.filter(c => c.cidade.toLowerCase().includes(filterCity.toLowerCase()));
    }

    setCandidatos(flatCandidatos);

    // Consulta de Lojas e Cargos compatível com o schema v1.3.9
    try {
      const [lojasRes, cargosRes] = await Promise.all([
        supabase.from('lojas').select('*').order('nome'),
        supabase.from('cargos').select('id, titulo, departamento, tipo_vaga, requisitos, ativo, publicada, loja_id, criado_em').order('titulo')
      ]);

      if (lojasRes.data) {
        setLojasList(lojasRes.data);
        const mappedCidades: ConfigItem[] = lojasRes.data.map((l: any) => ({
          id: l.id,
          nome: `${l.cidade} - ${l.estado} (${l.nome})`,
          created_at: l.criado_em || new Date().toISOString()
        }));
        setCidades(mappedCidades);
      }

      if (cargosRes.data) {
        const mappedCargos: ConfigItem[] = cargosRes.data.map((c: any) => ({
          id: c.id,
          nome: c.titulo,
          titulo: c.titulo,
          requisitos: c.requisitos,
          ativo: c.ativo,
          publicada: c.publicada,
          loja_id: c.loja_id,
          created_at: c.criado_em || new Date().toISOString()
        }));
        setCargos(mappedCargos);
      }
    } catch (e) {
      console.warn('Erro ao carregar lojas ou cargos no AdminDashboard:', e);
    }

    // Cálculo dos KPIs com os dados consolidados
    const s: KPIStats = { total: flatCandidatos.length, porCidade: {}, porCargo: {}, porDia: {} };
    const tMap: Record<string, { count: number; dateObj: Date }> = {};
    const hMap = new Array(24).fill(0);

    flatCandidatos.forEach(cand => {
      s.porCidade[cand.cidade] = (s.porCidade[cand.cidade] || 0) + 1;
      s.porCargo[cand.vaga_interesse] = (s.porCargo[cand.vaga_interesse] || 0) + 1;

      const d = new Date(cand.created_at);
      const diaStr = d.toLocaleDateString('pt-BR');
      s.porDia[diaStr] = (s.porDia[diaStr] || 0) + 1;

      const key = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      if (!tMap[key]) tMap[key] = { count: 0, dateObj: new Date(d.getFullYear(), d.getMonth(), d.getDate()) };
      tMap[key].count++;

      const hour = d.getHours();
      if (hour >= 0 && hour < 24) {
        hMap[hour]++;
      }
    });

    setStats(s);

    const sortedTimeline = Object.keys(tMap).map(k => ({
      date: k,
      count: tMap[k].count,
      fullDate: tMap[k].dateObj
    })).sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());

    setTimelineData(sortedTimeline);
    setHeatmapData(hMap);
    setLoading(false);
  };

  // === GESTÃO DE UNIDADES (LOJAS) ===
  const openCreateLojaModal = () => {
    setEditingLoja(null);
    setLojaFormData({
      nome: '',
      cidade: '',
      estado: 'PR',
      google_drive_folder_id: '',
      email_contato: '',
      telefone_contato: '',
      ativa: true
    });
    setLojaMsg({ text: '', type: '' });
    setLojaModalOpen(true);
  };

  const openEditLojaModal = (loja: any) => {
    setEditingLoja(loja);
    setLojaFormData({
      nome: loja.nome || '',
      cidade: loja.cidade || '',
      estado: loja.estado || 'PR',
      google_drive_folder_id: loja.google_drive_folder_id || '',
      email_contato: loja.email_contato || '',
      telefone_contato: loja.telefone_contato || '',
      ativa: loja.ativa ?? true
    });
    setLojaMsg({ text: '', type: '' });
    setLojaModalOpen(true);
  };

  const handleSaveLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lojaFormData.nome.trim() || !lojaFormData.cidade.trim() || !lojaFormData.estado.trim()) {
      setLojaMsg({ text: 'Informe ao menos o nome da unidade, cidade e estado.', type: 'error' });
      return;
    }
    setSavingLoja(true);
    setLojaMsg({ text: '', type: '' });

    try {
      if (editingLoja) {
        const { error } = await supabase
          .from('lojas')
          .update({
            nome: lojaFormData.nome.trim(),
            cidade: lojaFormData.cidade.trim(),
            estado: lojaFormData.estado.trim().toUpperCase(),
            google_drive_folder_id: lojaFormData.google_drive_folder_id.trim() || null,
            email_contato: lojaFormData.email_contato.trim() || null,
            telefone_contato: lojaFormData.telefone_contato.trim() || null,
            ativa: lojaFormData.ativa
          })
          .eq('id', editingLoja.id);

        if (error) throw error;
        setLojaMsg({ text: 'Unidade atualizada com sucesso!', type: 'success' });
      } else {
        const { error } = await supabase
          .from('lojas')
          .insert([{
            nome: lojaFormData.nome.trim(),
            cidade: lojaFormData.cidade.trim(),
            estado: lojaFormData.estado.trim().toUpperCase(),
            google_drive_folder_id: lojaFormData.google_drive_folder_id.trim() || null,
            email_contato: lojaFormData.email_contato.trim() || null,
            telefone_contato: lojaFormData.telefone_contato.trim() || null,
            ativa: true
          }]);

        if (error) throw error;
        setLojaMsg({ text: 'Unidade cadastrada com sucesso!', type: 'success' });
      }

      setLojaModalOpen(false);
      setEditingLoja(null);
      fetchData();
    } catch (err: any) {
      setLojaMsg({ text: err?.message || 'Falha ao salvar unidade. Verifique se possui permissão de Gestor Master.', type: 'error' });
    } finally {
      setSavingLoja(false);
    }
  };

  // Cópia de Identificador da Loja
  const handleCopyLojaId = async (id: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
        setCopiedLojaId(id);
        setTimeout(() => setCopiedLojaId(null), 2000);
      }
    } catch (e) {
      console.warn('Erro ao copiar ID:', e);
    }
  };

  // Handlers do Ciclo de Vida de Unidades (Prompt 51)
  const handleInitiateDeactivate = async (loja: any) => {
    setLojaToDeactivate(loja);
    setDeactivateReason('');
    setDeactivateError('');
    setDeactivateImpact(null);
    setDeactivateModalOpen(true);
    setLoadingDeactivateImpact(true);

    try {
      const { data, error } = await supabase.rpc('obter_resumo_desativacao_unidade', {
        p_loja_id: loja.id
      });
      if (error) throw error;
      setDeactivateImpact(data as any);
    } catch (err: any) {
      console.warn('Falha ao obter resumo da unidade via RPC, calculando localmente:', err);
      const totalVagas = cargos.filter(c => c.loja_id === loja.id).length;
      const vagasPublicadas = cargos.filter(c => c.loja_id === loja.id && (c as any).publicada === true).length;
      const totalCandidaturas = candidatos.filter(c => (c as any).loja_id === loja.id).length;
      setDeactivateImpact({
        total_vagas: totalVagas,
        vagas_publicadas: vagasPublicadas,
        total_candidaturas: totalCandidaturas
      });
    } finally {
      setLoadingDeactivateImpact(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!lojaToDeactivate) return;
    if (!deactivateReason.trim()) {
      setDeactivateError('Por favor, informe o motivo da desativação da unidade.');
      return;
    }

    setSubmittingDeactivation(true);
    setDeactivateError('');

    try {
      const { error } = await supabase.rpc('desativar_unidade', {
        p_loja_id: lojaToDeactivate.id,
        p_motivo: deactivateReason.trim()
      });

      if (error) throw error;

      setDeactivateModalOpen(false);
      setLojaToDeactivate(null);
      setDeactivateReason('');
      await fetchData();
      alert(`Unidade desativada com sucesso! As vagas publicadas foram despublicadas e não serão republicadas automaticamente.`);
    } catch (err: any) {
      console.error('Erro ao desativar unidade:', err);
      setDeactivateError(err?.message || 'Falha ao desativar unidade. Verifique se possui permissão de Gestor Master.');
    } finally {
      setSubmittingDeactivation(false);
    }
  };

  const handleInitiateReactivate = (loja: any) => {
    setLojaToReactivate(loja);
    setReactivateError('');
    setReactivateModalOpen(true);
  };

  const handleConfirmReactivate = async () => {
    if (!lojaToReactivate) return;
    setSubmittingReactivation(true);
    setReactivateError('');

    try {
      const { error } = await supabase.rpc('reativar_unidade', {
        p_loja_id: lojaToReactivate.id
      });

      if (error) throw error;

      setReactivateModalOpen(false);
      setLojaToReactivate(null);
      await fetchData();
      alert(`Unidade reativada com sucesso! Importante: as vagas antigas continuam despublicadas por segurança para que sejam revisadas e aprovadas pelo RH.`);
    } catch (err: any) {
      console.error('Erro ao reativar unidade:', err);
      setReactivateError(err?.message || 'Falha ao reativar unidade. Verifique se possui permissão de Gestor Master.');
    } finally {
      setSubmittingReactivation(false);
    }
  };

  // Filtros de unidades, busca e paginação (Prompt 51)
  const filteredLojas = useMemo(() => {
    return lojasList.filter(loja => {
      if (!showInactiveLojas && !loja.ativa) {
        return false;
      }
      if (searchLoja.trim()) {
        const query = searchLoja.trim().toLowerCase();
        const matchNome = (loja.nome || '').toLowerCase().includes(query);
        const matchCidade = (loja.cidade || '').toLowerCase().includes(query);
        const matchEstado = (loja.estado || '').toLowerCase().includes(query);
        const matchId = (loja.id || '').toLowerCase().includes(query);
        if (!matchNome && !matchCidade && !matchEstado && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [lojasList, showInactiveLojas, searchLoja]);

  const totalLojasPages = Math.ceil(filteredLojas.length / LOJAS_PER_PAGE) || 1;
  const paginatedLojas = useMemo(() => {
    const start = (lojasCurrentPage - 1) * LOJAS_PER_PAGE;
    return filteredLojas.slice(start, start + LOJAS_PER_PAGE);
  }, [filteredLojas, lojasCurrentPage]);

  // === GESTÃO DE VAGAS ===
  const openJobEditor = (cargo: any) => {
    setCreatingJob(false);
    setNewJobName(cargo.nome || cargo.titulo);
    setEditingCargoId(cargo.id);
    setSelectedJobLojaId(cargo.loja_id || '');
    const parsed = parseJobLandingFromRequisitos(cargo);
    parsed.published = cargo.publicada === true;
    setJobLanding(parsed);
    setJobEditorOpen(true);
  };

  const openCreateJobModal = () => {
    const baseName = 'Consultor de Vendas Técnicas';
    const template = createDefaultJobLanding(baseName);
    setCreatingJob(true);
    setEditingCargoId('');
    setNewJobName(baseName);
    setSelectedJobLojaId('');
    setJobLanding({
      ...template,
      title: 'Consultor de Vendas Técnicas - Centro Automotivo',
      location: 'A combinar',
      workModel: 'Presencial',
      shortDescription: 'Atue no atendimento consultivo e comercial da Gigante Pneus, oferecendo soluções de alta qualidade em pneus, geometria 3D e serviços automotivos.',
      salary: 'A combinar',
      benefits: ['Comissões atrativas', 'Vale Refeição', 'Vale Transporte', 'Plano Odontológico', 'Seguro de Vida'],
      responsibilities: ['Atendimento consultivo e técnico ao cliente', 'Venda de pneus e serviços automotivos especializados', 'Elaboração e negociação de orçamentos', 'Acompanhamento do pós-venda e satisfação'],
      requirements: ['Ensino Médio completo', 'Experiência prévia em vendas ou centros automotivos', 'Boa comunicação interpessoal', 'CNH categoria B'],
      agentContext: 'Priorizar candidatos com boa comunicação, experiência prévia em centros automotivos ou revendas de pneus e perfil de negociação.',
      published: false // RASCUNHO POR PADRÃO!
    });
    setJobEditorOpen(true);
  };

  const handleSaveJobLanding = async () => {
    if (creatingJob && !newJobName.trim()) {
      alert('Informe o nome base da vaga.');
      return;
    }

    setSavingJob(true);
    const payload: JobLandingContent = {
      ...jobLanding,
      benefits: jobLanding.benefits.filter(Boolean),
      responsibilities: jobLanding.responsibilities.filter(Boolean),
      requirements: jobLanding.requirements.filter(Boolean)
    };

    const serialized = serializeJobLanding(payload);
    let error: any = null;

    if (creatingJob) {
      const insertRes = await supabase
        .from('cargos')
        .insert([{ 
          titulo: newJobName.trim() || payload.title, 
          loja_id: selectedJobLojaId || null,
          requisitos: serialized,
          ativo: true,
          publicada: jobLanding.published === true
        }]);
      error = insertRes.error;
    } else {
      const updateRes = await supabase
        .from('cargos')
        .update({ 
          titulo: newJobName.trim() || payload.title, 
          loja_id: selectedJobLojaId || null,
          requisitos: serialized,
          publicada: jobLanding.published === true
        })
        .eq('id', editingCargoId);
      error = updateRes.error;
    }

    setSavingJob(false);
    if (error) {
      alert('Não foi possível salvar a vaga: ' + error.message);
      return;
    }
    setJobEditorOpen(false);
    setEditingCargoId('');
    setCreatingJob(false);
    setNewJobName('');
    fetchData();
  };

  const handleTogglePublish = async (cargo: any) => {
    const newPublished = !cargo.publicada;
    let serialized = cargo.requisitos;
    try {
      const parsed = typeof cargo.requisitos === 'string' ? JSON.parse(cargo.requisitos) : (cargo.requisitos || {});
      parsed.published = newPublished;
      serialized = JSON.stringify(parsed);
    } catch {}

    const { error } = await supabase
      .from('cargos')
      .update({
        publicada: newPublished,
        requisitos: serialized
      })
      .eq('id', cargo.id);

    if (error) {
      alert(`Não foi possível alterar o status de publicação da vaga: ${error.message}`);
      return;
    }
    fetchData();
  };

  const handleDeleteJob = async (cargoId: string) => {
    setDeletingJobId(cargoId);
    const { error } = await supabase.from('cargos').delete().eq('id', cargoId);
    setDeletingJobId(null);
    setConfirmDeleteJobId(null);
    if (error) {
      alert('Não foi possível excluir a vaga.');
      return;
    }
    fetchData();
  };

  // === FUNÇÕES DO MÓDULO DE PESQUISAS ===
  const fetchPesquisas = async () => {
    const { data } = await supabase.from('pesquisas').select('*').order('criado_em', { ascending: false });
    if (data) {
      const mapped = data.map((p: any) => ({
        ...p,
        is_active: p.ativa ?? p.is_active ?? true,
        created_at: p.criado_em || p.created_at || new Date().toISOString()
      }));
      setPesquisas(mapped);
      // Buscar contagem de respostas para cada pesquisa
      const counts: Record<string, number> = {};
      for (const p of mapped) {
        const { count } = await supabase.from('respostas').select('*', { count: 'exact', head: true }).eq('pesquisa_id', p.id);
        counts[p.id] = count || 0;
      }
      setSurveyResponseCounts(counts);
    }
  };

  const fetchSurveyResults = async (pesquisaId: string) => {
    const { data } = await supabase.from('respostas').select('*').eq('pesquisa_id', pesquisaId).order('criado_em', { ascending: false });
    setSurveyResults(data || []);
  };

  const resetSurveyForm = () => {
    setSurveyTitle('');
    setSurveyDesc('');
    setSurveyPerguntas([]);
    setEditPesquisa(null);
  };

  const addPergunta = (tipo: TipoPergunta) => {
    const nova: Pergunta = {
      id: crypto.randomUUID(),
      tipo,
      enunciado: '',
      obrigatoria: true,
      ...(tipo === 'multipla_escolha' ? { opcoes: ['', ''] } : {})
    };
    setSurveyPerguntas(prev => [...prev, nova]);
  };

  const removePergunta = (id: string) => {
    setSurveyPerguntas(prev => prev.filter(p => p.id !== id));
  };

  const updatePergunta = (id: string, field: string, value: any) => {
    setSurveyPerguntas(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      // Se mudou para multipla_escolha e nao tem opcoes, inicia com 2
      if (field === 'tipo' && value === 'multipla_escolha' && !updated.opcoes) {
        updated.opcoes = ['', ''];
      }
      return updated;
    }));
  };

  const addOpcao = (pergId: string) => {
    setSurveyPerguntas(prev => prev.map(p => p.id === pergId ? { ...p, opcoes: [...(p.opcoes || []), ''] } : p));
  };

  const removeOpcao = (pergId: string, oIdx: number) => {
    setSurveyPerguntas(prev => prev.map(p => p.id === pergId ? { ...p, opcoes: (p.opcoes || []).filter((_, i) => i !== oIdx) } : p));
  };

  const updateOpcao = (pergId: string, oIdx: number, value: string) => {
    setSurveyPerguntas(prev => prev.map(p => {
      if (p.id !== pergId) return p;
      const newOpcoes = [...(p.opcoes || [])];
      newOpcoes[oIdx] = value;
      return { ...p, opcoes: newOpcoes };
    }));
  };

  const handleSaveSurvey = async () => {
    if (!surveyTitle || surveyPerguntas.length === 0) return;
    setSavingSurvey(true);
    // Gerar slug a partir do título
    const slug = surveyTitle
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    try {
      const { error } = await supabase.from('pesquisas').insert([{
        titulo: surveyTitle,
        descricao: surveyDesc,
        perguntas: surveyPerguntas,
        slug: slug,
        ativa: true
      }]);
      if (!error) {
        await fetchPesquisas();
        setSurveyView('list');
        resetSurveyForm();
      }
    } catch(e) {} finally {
      setSavingSurvey(false);
    }
  };

  const togglePesquisaActive = async (p: Pesquisa) => {
    const novoStatus = !(p.ativa ?? p.is_active ?? true);
    await supabase.from('pesquisas').update({ ativa: novoStatus }).eq('id', p.id);
    fetchPesquisas();
  };

  const getSurveyUrl = (pesquisaId: string) => {
    const pesquisa = pesquisas.find(p => p.id === pesquisaId);
    const identifier = pesquisa?.slug || pesquisaId;
    return `${window.location.origin}${window.location.pathname}#/pesquisa/${identifier}`;
  };

  const copyLink = (pesquisaId: string) => {
    navigator.clipboard.writeText(getSurveyUrl(pesquisaId));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareWhatsApp = (pesquisaId: string) => {
    const pesquisa = pesquisas.find(p => p.id === pesquisaId);
    const text = `ðŸ“‹ *${pesquisa?.titulo || 'Pesquisa'}*\n\nParticipe da nossa pesquisa interna! Sua opinião é muito importante.\n\nðŸ‘‰ ${getSurveyUrl(pesquisaId)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareFacebook = (pesquisaId: string) => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getSurveyUrl(pesquisaId))}`, '_blank');
  };

  const shareInstagram = (pesquisaId: string) => {
    // Instagram não suporta share via URL, copia o link para o usuário colar nos stories/bio
    navigator.clipboard.writeText(getSurveyUrl(pesquisaId));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareTelegram = (pesquisaId: string) => {
    const pesquisa = pesquisas.find(p => p.id === pesquisaId);
    const text = `${pesquisa?.titulo || 'Pesquisa'} - Participe!`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(getSurveyUrl(pesquisaId))}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareEmail = (pesquisaId: string) => {
    const pesquisa = pesquisas.find(p => p.id === pesquisaId);
    const subject = pesquisa?.titulo || 'Pesquisa Interna';
    const body = `Olá!\n\nParticipe da nossa pesquisa: ${pesquisa?.titulo}\n\nAcesse: ${getSurveyUrl(pesquisaId)}\n\nObrigado!`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleAnalyzeSurvey = async () => {
    if (!selectedAiSurveyId) return;
    setAnalyzingSurvey(true);
    setSurveyAnalysisResult(null);

    const survey = pesquisas.find(p => p.id === selectedAiSurveyId);
    if (!survey) {
      setAnalyzingSurvey(false);
      return;
    }

    try {
      const { data: resData, error: resError } = await supabase
        .from('respostas')
        .select('*')
        .eq('pesquisa_id', selectedAiSurveyId);

      if (resError || !resData || resData.length === 0) {
        alert("Esta pesquisa ainda não possui respostas para analisar!");
        setAnalyzingSurvey(false);
        return;
      }

      const analysis = await analyzeSurveyResponses(
        survey.titulo,
        survey.descricao || '',
        survey.perguntas,
        resData,
        aiProvider,
        geminiKey,
        geminiModel,
        ollamaModel,
        promptSurveys
      );

      setSurveyAnalysisResult(analysis);
    } catch (err: any) {
      console.error(err);
      alert(`Falha ao realizar a análise com IA: ${err.message || 'Erro desconhecido. Verifique as configurações de chaves/VPS.'}`);
    } finally {
      setAnalyzingSurvey(false);
    }
  };

  const handleAnalyzeTalent = async (candidate: Candidato) => {
    setAnalyzingTalentId(candidate.id);
    try {
      const cargoContext = cargos.find(c => c.nome === (selectedAiCargo || candidate.vaga_interesse));
      const landing = cargoContext ? parseJobLandingFromRequisitos(cargoContext) : null;
      const enrichedPrompt = landing?.agentContext
        ? `${promptTalents}\n\nContexto adicional da vaga:\n${landing.agentContext}`
        : promptTalents;

      const analysis = await analyzeTalentCompatibility(
        candidate,
        selectedAiCargo || candidate.vaga_interesse,
        aiProvider,
        geminiKey,
        geminiModel,
        ollamaModel,
        enrichedPrompt
      );
      setTalentAnalysisResults(prev => ({
        ...prev,
        [candidate.id]: analysis
      }));
    } catch (err: any) {
      console.error(err);
      alert(`Falha ao analisar candidato com IA: ${err.message || 'Erro desconhecido.'}`);
    } finally {
      setAnalyzingTalentId(null);
    }
  };

  const handleSelectAiCargo = (cargo: string) => {
    setSelectedAiCargo(cargo);
    if (cargo) {
      const filtered = candidatos.filter(c => c.vaga_interesse === cargo);
      setMatchingTalents(filtered);
    } else {
      setMatchingTalents([]);
    }
  };

  const handleSaveGeminiKey = (key: string) => {
    const normalizedKey = key.trim();
    setGeminiKey(normalizedKey);
    setTempGeminiKey(normalizedKey);
    localStorage.setItem('gigante_gemini_key', normalizedKey);
    if (normalizedKey) {
      setAiProvider('gemini');
    }
    setGeminiSaveStatus('saved');
    setTimeout(() => setGeminiSaveStatus('idle'), 2500);
  };

  const handleSavePrompts = () => {
    localStorage.setItem('gigante_prompt_surveys', promptSurveys);
    localStorage.setItem('gigante_prompt_talents', promptTalents);
    setPromptSaveStatus('saved');
    setTimeout(() => setPromptSaveStatus('idle'), 2500);
  };

  const handleResetPrompts = () => {
    if (window.confirm("Deseja realmente restaurar os prompts padrões do sistema?")) {
      setPromptSurveys(DEFAULT_PROMPT_SURVEYS);
      setPromptTalents(DEFAULT_PROMPT_TALENTS);
      localStorage.setItem('gigante_prompt_surveys', DEFAULT_PROMPT_SURVEYS);
      localStorage.setItem('gigante_prompt_talents', DEFAULT_PROMPT_TALENTS);
      setPromptSaveStatus('saved');
      setTimeout(() => setPromptSaveStatus('idle'), 2500);
    }
  };

  // === SEGURANÇA / ALTERAÇÃO DE SENHA ===
  const validateStrongPassword = (pass: string): { valid: boolean; message: string } => {
    if (pass.length < 8) {
      return { valid: false, message: 'A nova senha deve ter no mínimo 8 caracteres.' };
    }
    if (!/[A-Z]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos uma letra maiúscula.' };
    }
    if (!/[a-z]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos uma letra minúscula.' };
    }
    if (!/[0-9]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos um número.' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos um caractere especial (!@#$%...).' };
    }
    return { valid: true, message: '' };
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg({ text: '', type: '' });

    if (!currentUser?.email) {
      setPasswordMsg({ text: 'Sessão do usuário não identificada. Por favor, refaça o login.', type: 'error' });
      return;
    }

    if (!currentPassword) {
      setPasswordMsg({ text: 'Por favor, informe sua senha atual.', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'A confirmação de senha não confere com a nova senha digitada.', type: 'error' });
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordMsg({ text: 'A nova senha deve ser diferente da senha atual.', type: 'error' });
      return;
    }

    const validation = validateStrongPassword(newPassword);
    if (!validation.valid) {
      setPasswordMsg({ text: validation.message, type: 'error' });
      return;
    }

    setChangingPassword(true);

    try {
      // 1. Reautenticação estrita para validar a senha atual informada pelo usuário
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
      });

      if (reauthError) {
        setPasswordMsg({ text: 'A senha atual informada está incorreta.', type: 'error' });
        setChangingPassword(false);
        return;
      }

      // 2. Atualização segura via Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw updateError;
      }

      setPasswordMsg({ text: 'Senha alterada com sucesso! Utilize sua nova credencial no próximo acesso.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({ text: err.message || 'Falha ao atualizar a senha.', type: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) return;
    setCreatingUser(true);
    setUserMsg({ text: '', type: '' });
    
    // Atenção: signUp no Supabase Client-side realiza o login automático do novo usuário.
    // Em produção, deve-se usar uma chamada para Edge Function com Service Role Key.
    const { error } = await supabase.auth.signUp({
      email: newUserEmail,
      password: newUserPassword,
    });
    
    setCreatingUser(false);
    if (error) {
      setUserMsg({ text: error.message, type: 'error' });
    } else {
      setUserMsg({ text: 'Usuário cadastrado! Obs: Você pode ter sido desconectado (comportamento padrão do Supabase sem Service Role Key).', type: 'success' });
      setNewUserEmail('');
      setNewUserPassword('');
    }
  };

  const SidebarItem = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: React.ReactNode }) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`w-full flex items-center gap-3 px-6 py-4 transition-all text-sm font-bold tracking-wide uppercase border-l-4 ${
          isActive 
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-600' 
            : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-transparent hover:border-gray-300 dark:hover:border-gray-700'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-145px)] bg-gray-50 dark:bg-gray-950">
      
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm flex flex-col z-10">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-1">
            <ShieldCheck className="h-3 w-3 text-red-600" /> Gigante Pneus
          </p>
          <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">
            RH <span className="text-red-600">WORKSPACE</span>
          </h2>
          <div className="mt-3">
            <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${isGestorMaster ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
              {isGestorMaster ? 'Gestor Master' : (userRole === 'rh_corporativo' ? 'RH Corporativo' : (userRole || 'Usuário RH'))}
            </span>
          </div>
        </div>
        
        <nav className="flex-1 py-4 space-y-1">
          <SidebarItem id="overview" label="Visão Geral" icon={<BarChart3 className="h-5 w-5" />} />
          <SidebarItem id="talents" label="Banco de Talentos" icon={<Users className="h-5 w-5" />} />
          <SidebarItem id="surveys" label="Pesquisas Internas" icon={<ClipboardList className="h-5 w-5" />} />
          <SidebarItem id="ai" label="Análise de IA" icon={<Sparkles className="h-5 w-5" />} />
          <SidebarItem id="jobs" label="Mural de Vagas" icon={<Briefcase className="h-5 w-5" />} />
          <SidebarItem id="lojas" label="Rede de Unidades" icon={<Building2 className="h-5 w-5" />} />
        </nav>

        <div className="border-t border-gray-100 dark:border-gray-800 py-4">
          <SidebarItem id="settings" label="Configurações" icon={<Settings className="h-5 w-5" />} />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          
          {/* Aba: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              
              {/* Barra de Filtros de Data */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-lg">
                <div className="flex items-center gap-3">
                   <Calendar className="h-6 w-6 text-red-600" />
                   <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight">Filtro de Período</h3>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none text-sm font-bold text-gray-600 dark:text-gray-300 outline-none focus:ring-2 focus:ring-red-600"
                  />
                  <span className="text-gray-400 font-bold uppercase text-[10px]">até</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none text-sm font-bold text-gray-600 dark:text-gray-300 outline-none focus:ring-2 focus:ring-red-600"
                  />
                  {(startDate || endDate) && (
                    <button onClick={() => {setStartDate(''); setEndDate('');}} className="ml-2 text-[10px] bg-red-100 text-red-600 px-3 py-2 rounded-xl uppercase font-black hover:bg-red-200">
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard title="Total de Talentos" value={stats.total} icon={<Users className="text-red-600 h-6 w-6" />} color="teal" />
                <KPICard title="Dias de Captação" value={Object.keys(stats.porDia).length} icon={<TrendingUp className="text-red-600 h-6 w-6" />} color="teal" />
                {/* Outros 2 slots vazios ou de estatisticas futuras */}
              </div>

              {/* Novos Gráficos: Linha e Heatmap */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2">
                  <SVGLineChart data={timelineData} />
                </div>
                <div className="xl:col-span-1">
                  <HeatmapChart data={heatmapData} total={stats.total} />
                </div>
              </div>

              {/* Distribuição (Barras menores) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <ChartCard title="Distribuição por Cidade" data={stats.porCidade} total={stats.total} />
                <ChartCard title="Distribuição por Vaga" data={stats.porCargo} total={stats.total} />
              </div>
            </div>
          )}

          {/* Aba: BANCO DE TALENTOS */}
          {activeTab === 'talents' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              
              {/* Barra de Filtros */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-lg">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3 mr-4">
                     <Calendar className="h-6 w-6 text-red-600" />
                     <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight">Filtros</h3>
                  </div>
                  <select 
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-xs font-black uppercase outline-none"
                    value={filterCity} onChange={e => setFilterCity(e.target.value)}
                  >
                    <option value="">Todas as Cidades</option>
                    {cidades.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                  <select 
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-xs font-black uppercase outline-none"
                    value={filterCargo} onChange={e => setFilterCargo(e.target.value)}
                  >
                    <option value="">Todas as Vagas</option>
                    {cargos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </div>
                
                <div className="flex items-center gap-3">
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none text-sm font-bold text-gray-600 dark:text-gray-300 outline-none focus:ring-2 focus:ring-red-600"
                  />
                  <span className="text-gray-400 font-bold uppercase text-[10px]">até</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none text-sm font-bold text-gray-600 dark:text-gray-300 outline-none focus:ring-2 focus:ring-red-600"
                  />
                  {(startDate || endDate || filterCity || filterCargo) && (
                    <button onClick={() => {setStartDate(''); setEndDate(''); setFilterCity(''); setFilterCargo('');}} className="ml-2 text-[10px] bg-red-100 text-red-600 px-3 py-2 rounded-xl uppercase font-black hover:bg-red-200">
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 dark:bg-gray-800/50 border-b dark:border-gray-700">
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Candidato</th>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Contato</th>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Cidade</th>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Cadastro</th>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {loading ? (
                      <tr><td colSpan={5} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin text-red-600 mx-auto" /></td></tr>
                    ) : candidatos.map(item => (
                      <tr key={item.id} className="hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="font-black text-gray-900 dark:text-white uppercase">{item.nome}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase">{item.vaga_interesse}</div>
                        </td>
                        <td className="px-8 py-5 text-xs font-medium text-gray-600 dark:text-gray-300">
                          <div>{item.email}</div>
                          <div className="text-[10px] text-gray-400">{item.telefone}</div>
                        </td>
                        <td className="px-8 py-5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{item.cidade}</td>
                        <td className="px-8 py-5 text-[11px] font-bold text-gray-400 uppercase">{new Date(item.created_at).toLocaleDateString('pt-BR')}</td>
                        <td className="px-8 py-5 text-right">
                          <button onClick={() => setSelectedResume(item)} className="bg-red-600 text-white p-2.5 rounded-xl hover:bg-red-700 transition-all shadow-md active:scale-90">
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Aba: PESQUISAS INTERNAS */}
          {activeTab === 'surveys' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              
              {/* Vista: Lista de Pesquisas */}
              {surveyView === 'list' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Pesquisas Internas</h2>
                    <button
                      onClick={() => { resetSurveyForm(); setSurveyView('create'); }}
                      className="bg-red-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-sm flex items-center gap-2 hover:bg-red-700 transition-all shadow-lg active:scale-95"
                    >
                      <Plus className="h-5 w-5" /> Nova Pesquisa
                    </button>
                  </div>

                  {pesquisas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-full mb-6">
                        <ClipboardList className="h-16 w-16 text-red-600" />
                      </div>
                      <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-3">Nenhuma pesquisa criada</h3>
                      <p className="text-gray-500 max-w-md font-medium">Crie sua primeira pesquisa de clima, NPS ou feedback para começar a ouvir seus colaboradores.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {pesquisas.map(p => {
                        const resCount = surveyResponseCounts[p.id] || 0;
                        const diasAtiva = Math.max(1, Math.ceil((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)));
                        return (
                        <div key={p.id} className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl hover:shadow-2xl transition-all group">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{p.titulo}</h3>
                              <p className="text-xs text-gray-400 font-bold uppercase mt-1">{new Date(p.created_at).toLocaleDateString('pt-BR')} â€¢ {p.perguntas.length} perguntas</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${p.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                              {p.is_active ? 'Ativa' : 'Encerrada'}
                            </span>
                          </div>
                          {p.descricao && <p className="text-sm text-gray-500 mb-4 line-clamp-2">{p.descricao}</p>}
                          
                          {/* Mini Stats Preview */}
                          <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                            <div className="text-center">
                              <div className="text-2xl font-black text-red-600">{resCount}</div>
                              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Respostas</div>
                            </div>
                            <div className="text-center border-x border-gray-200 dark:border-gray-700">
                              <div className="text-2xl font-black text-gray-900 dark:text-white">{diasAtiva}</div>
                              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{diasAtiva === 1 ? 'Dia' : 'Dias'}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-black text-gray-900 dark:text-white">{(resCount / diasAtiva).toFixed(1)}</div>
                              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Resp/Dia</div>
                            </div>
                          </div>
                          {/* Link visível + Compartilhamento */}
                          <div className="mb-6 space-y-3">
                            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl">
                              <Link2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate flex-grow">{getSurveyUrl(p.id)}</span>
                              <button onClick={() => copyLink(p.id)} className="flex-shrink-0 p-2 rounded-xl bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 transition-all" title="Copiar link">
                                {copiedLink ? <CheckCheck className="h-4 w-4 text-red-600" /> : <Copy className="h-4 w-4" />}
                              </button>
                              <button onClick={() => setShareOpenId(shareOpenId === p.id ? null : p.id)} className="flex-shrink-0 p-2 rounded-xl bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 transition-all" title="Compartilhar">
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>
                            
                            {shareOpenId === p.id && (
                              <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 animate-in slide-in-from-top-2 duration-300">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mr-2">Compartilhar:</span>
                                <button onClick={() => shareWhatsApp(p.id)} title="WhatsApp" className="p-2.5 rounded-xl hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group">
                                  <svg className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                </button>
                                <button onClick={() => shareFacebook(p.id)} title="Facebook" className="p-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                                  <svg className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                </button>
                                <button onClick={() => shareInstagram(p.id)} title="Instagram (Copiar link)" className="p-2.5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-all group">
                                  <svg className="h-5 w-5 text-gray-400 group-hover:text-pink-600 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                                </button>
                                <button onClick={() => shareTelegram(p.id)} title="Telegram" className="p-2.5 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all group">
                                  <svg className="h-5 w-5 text-gray-400 group-hover:text-sky-500 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                                </button>
                                <button onClick={() => shareEmail(p.id)} title="E-mail" className="p-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all group">
                                  <svg className="h-5 w-5 text-gray-400 group-hover:text-amber-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => { setSelectedPesquisaResults(p); fetchSurveyResults(p.id); setSurveyView('results'); }}
                              className="flex-1 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-2xl font-black uppercase text-[11px] hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all flex items-center justify-center gap-2"
                            >
                              <BarChart3 className="h-4 w-4" /> Resultados
                            </button>
                            <button
                              onClick={() => togglePesquisaActive(p)}
                              className={`px-4 py-3 rounded-2xl font-black uppercase text-[11px] transition-all flex items-center justify-center gap-2 ${p.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30' : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30'}`}
                            >
                              {p.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                              {p.is_active ? 'Encerrar' : 'Reativar'}
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Vista: Construtor de Pesquisa */}
              {surveyView === 'create' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSurveyView('list')} className="p-3 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-all">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Nova Pesquisa</h2>
                  </div>

                  <div className="bg-white dark:bg-gray-900 rounded-[3rem] p-8 md:p-10 border border-gray-100 dark:border-gray-800 shadow-xl space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Título da Pesquisa *</label>
                        <input type="text" value={surveyTitle} onChange={e => setSurveyTitle(e.target.value)} placeholder="Ex: Pesquisa de Clima - Maio/2026" className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Descrição (Opcional)</label>
                        <input type="text" value={surveyDesc} onChange={e => setSurveyDesc(e.target.value)} placeholder="Breve descrição para os participantes" className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none font-bold" />
                      </div>
                    </div>
                  </div>

                  {/* Lista de Perguntas */}
                  <div className="space-y-4">
                    {surveyPerguntas.map((perg, idx) => (
                      <div key={perg.id} className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-lg relative group">
                        <button onClick={() => removePergunta(perg.id)} className="absolute top-6 right-6 p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                        
                        <div className="flex items-center gap-3 mb-6">
                          <span className="bg-red-600 text-white w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm">{idx + 1}</span>
                          <select
                            value={perg.tipo}
                            onChange={e => updatePergunta(perg.id, 'tipo', e.target.value)}
                            className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none text-xs font-black uppercase outline-none text-red-600"
                          >
                            <option value="texto_curto">Texto Curto</option>
                            <option value="texto_longo">Texto Longo</option>
                            <option value="multipla_escolha">Múltipla Escolha</option>
                            <option value="nota">Nota (1-5)</option>
                          </select>
                          <label className="flex items-center gap-2 ml-auto text-[10px] font-black text-gray-400 uppercase cursor-pointer">
                            <input type="checkbox" checked={perg.obrigatoria} onChange={e => updatePergunta(perg.id, 'obrigatoria', e.target.checked)} className="w-4 h-4 rounded text-red-600 focus:ring-red-600" />
                            Obrigatória
                          </label>
                        </div>

                        <input
                          type="text"
                          value={perg.enunciado}
                          onChange={e => updatePergunta(perg.id, 'enunciado', e.target.value)}
                          placeholder="Digite a pergunta aqui..."
                          className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none font-bold text-lg"
                        />

                        {perg.tipo === 'multipla_escolha' && (
                          <div className="mt-6 space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Opções de Resposta</label>
                            {(perg.opcoes || []).map((op, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-3">
                                <span className="text-xs font-black text-gray-300 w-6">{String.fromCharCode(65 + oIdx)})</span>
                                <input
                                  type="text"
                                  value={op}
                                  onChange={e => updateOpcao(perg.id, oIdx, e.target.value)}
                                  className="flex-grow px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none font-bold text-sm"
                                  placeholder={`Opção ${oIdx + 1}`}
                                />
                                <button onClick={() => removeOpcao(perg.id, oIdx)} className="text-gray-300 hover:text-red-500 p-1"><X className="h-4 w-4" /></button>
                              </div>
                            ))}
                            <button onClick={() => addOpcao(perg.id)} className="text-red-600 font-black text-xs uppercase flex items-center gap-1 hover:underline"><Plus className="h-4 w-4" /> Adicionar opção</button>
                          </div>
                        )}

                        {perg.tipo === 'nota' && (
                          <div className="mt-4 flex gap-2">
                            {[1,2,3,4,5].map(n => <div key={n} className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-black text-gray-400 text-sm">{n}</div>)}
                            <span className="text-[10px] font-bold text-gray-400 uppercase self-center ml-2">Prévia</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Botões de Adicionar Pergunta */}
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => addPergunta('texto_curto')} className="flex items-center gap-2 px-5 py-3 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 hover:border-red-600 hover:text-red-600 transition-all font-black text-xs uppercase">
                      <AlignLeft className="h-4 w-4" /> Texto Curto
                    </button>
                    <button onClick={() => addPergunta('texto_longo')} className="flex items-center gap-2 px-5 py-3 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 hover:border-red-600 hover:text-red-600 transition-all font-black text-xs uppercase">
                      <FileText className="h-4 w-4" /> Texto Longo
                    </button>
                    <button onClick={() => addPergunta('multipla_escolha')} className="flex items-center gap-2 px-5 py-3 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 hover:border-red-600 hover:text-red-600 transition-all font-black text-xs uppercase">
                      <ListChecks className="h-4 w-4" /> Múltipla Escolha
                    </button>
                    <button onClick={() => addPergunta('nota')} className="flex items-center gap-2 px-5 py-3 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 hover:border-red-600 hover:text-red-600 transition-all font-black text-xs uppercase">
                      <Star className="h-4 w-4" /> Nota (1-5)
                    </button>
                  </div>

                  {/* Salvar */}
                  <button
                    onClick={handleSaveSurvey}
                    disabled={savingSurvey || !surveyTitle || surveyPerguntas.length === 0}
                    className="w-full bg-black dark:bg-white text-white dark:text-black py-5 rounded-2xl font-black text-xl uppercase shadow-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-30 active:scale-[0.98]"
                  >
                    {savingSurvey ? <Loader2 className="h-6 w-6 animate-spin" /> : <><CheckCheck className="h-6 w-6" /> Publicar Pesquisa</>}
                  </button>
                </div>
              )}

              {/* Vista: Resultados de uma Pesquisa */}
              {surveyView === 'results' && selectedPesquisaResults && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSurveyView('list')} className="p-3 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-all">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div>
                      <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">{selectedPesquisaResults.titulo}</h2>
                      <p className="text-xs font-bold text-gray-400 uppercase">{surveyResults.length} respostas recebidas</p>
                    </div>
                    <button onClick={() => copyLink(selectedPesquisaResults.id)} className="ml-auto bg-red-600 text-white px-5 py-3 rounded-2xl font-black uppercase text-xs flex items-center gap-2 hover:bg-red-700 transition-all shadow-lg">
                      {copiedLink ? <><CheckCheck className="h-4 w-4" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar Link</>}
                    </button>
                  </div>

                  {surveyResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-gray-900 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl">
                      <ClipboardList className="h-12 w-12 text-gray-300 mb-4" />
                      <h3 className="text-lg font-black text-gray-400 uppercase">Ainda sem respostas</h3>
                      <p className="text-sm text-gray-400 mt-2">Compartilhe o link para começar a coletar dados.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {selectedPesquisaResults.perguntas.map((perg, idx) => {
                        const answers = surveyResults.map(r => r.respostas_json[perg.id]).filter(Boolean);
                        return (
                          <div key={perg.id} className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl">
                            <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-tight mb-6">
                              <span className="text-red-600 mr-2">{idx + 1}.</span>{perg.enunciado}
                            </h4>
                            
                            {(perg.tipo === 'nota') && (
                              <div className="space-y-4">
                                <div className="text-5xl font-black text-red-600">{(answers.reduce((a: number, b: number) => a + b, 0) / answers.length).toFixed(1)}</div>
                                <p className="text-xs text-gray-400 font-black uppercase">Média de {answers.length} avaliações</p>
                                <div className="flex gap-2 mt-4">
                                  {[1,2,3,4,5].map(n => {
                                    const count = answers.filter((a: number) => a === n).length;
                                    return (
                                      <div key={n} className="flex-1 text-center">
                                        <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl relative overflow-hidden">
                                          <div className="absolute bottom-0 left-0 right-0 bg-red-600 rounded-xl transition-all" style={{height: `${(count / answers.length) * 100}%`}}></div>
                                        </div>
                                        <span className="text-xs font-black text-gray-500 mt-2 block">{n}â˜…</span>
                                        <span className="text-[10px] font-bold text-gray-400">{count}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {(perg.tipo === 'multipla_escolha') && (
                              <div className="space-y-3">
                                {(perg.opcoes || []).map((op, oIdx) => {
                                  const count = answers.filter((a: string) => a === op).length;
                                  const pct = answers.length > 0 ? (count / answers.length) * 100 : 0;
                                  return (
                                    <div key={oIdx}>
                                      <div className="flex justify-between mb-1"><span className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase">{op}</span><span className="text-xs font-black text-red-600">{count} ({pct.toFixed(0)}%)</span></div>
                                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-red-600 rounded-full transition-all duration-700" style={{width: `${pct}%`}}></div></div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {(perg.tipo === 'texto_curto' || perg.tipo === 'texto_longo') && (
                              <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                                {answers.map((a: string, aIdx: number) => (
                                  <div key={aIdx} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl text-sm text-gray-700 dark:text-gray-300 font-medium">"{a}"</div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Aba: INTELIGÊNCIA ARTIFICIAL */}
          {activeTab === 'ai' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Cabeçalho da IA */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-red-600 to-rose-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="space-y-2 z-10">
                  <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                    <Brain className="h-8 w-8 text-amber-300 animate-pulse" /> RH Copilot IA
                  </h2>
                  <p className="text-red-50 text-sm font-medium max-w-xl">
                    Utilize inteligência artificial para analisar feedbacks de pesquisas, detectar alertas e sugerir planos de ação ou ranquear candidatos com maior aderência técnica.
                  </p>
                </div>
                
                {/* Seletor de sub-aba */}
                <div className="flex bg-white/15 p-1.5 rounded-2xl z-10 self-start md:self-center border border-white/10 shrink-0">
                  <button
                    onClick={() => setAiSubTab('surveys')}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${aiSubTab === 'surveys' ? 'bg-white text-red-800 shadow-md' : 'text-white hover:bg-white/5'}`}
                  >
                    Análise de Pesquisas
                  </button>
                  <button
                    onClick={() => setAiSubTab('talents')}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${aiSubTab === 'talents' ? 'bg-white text-red-800 shadow-md' : 'text-white hover:bg-white/5'}`}
                  >
                    Triagem de Currículos
                  </button>
                </div>
              </div>

              {/* Seletor de Modelo Geral */}
              <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 border border-gray-100 dark:border-gray-800 shadow-lg flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                <div className="space-y-1">
                  <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-sm flex items-center gap-2">
                    <Settings className="h-4 w-4 text-red-600" /> Parâmetros do Motor Cognitivo
                  </h3>
                  <p className="text-xs text-gray-400 font-bold">Defina o fornecedor e o modelo de processamento de linguagem.</p>
                </div>

                <div className="flex flex-wrap gap-4 w-full md:w-auto">
                  <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl border border-gray-200/50 dark:border-gray-700 w-full sm:w-auto">
                    <button
                      onClick={() => setAiProvider('ollama')}
                      className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${aiProvider === 'ollama' ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Ollama (Local VPS)
                    </button>
                    <button
                      onClick={() => setAiProvider('gemini')}
                      className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${aiProvider === 'gemini' ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Google Gemini
                    </button>
                  </div>

                  {aiProvider === 'ollama' && (
                    <select
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      className="px-4 py-2 rounded-2xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs font-black uppercase outline-none focus:border-red-600 w-full sm:w-auto cursor-pointer"
                    >
                      <option value="llama3.2:3b">Llama 3.2 (3B)</option>
                      <option value="qwen2.5:1.5b">Qwen 2.5 (1.5B)</option>
                      <option value="phi3.5:latest">Microsoft Phi-3.5</option>
                      <option value="deepseek-v4-pro:cloud">DeepSeek v4 Pro</option>
                    </select>
                  )}

                  {aiProvider === 'gemini' && geminiKey && (
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      disabled={loadingGeminiModels || geminiModels.length === 0}
                      className="px-4 py-2 rounded-2xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs font-black uppercase outline-none focus:border-red-600 w-full sm:w-auto cursor-pointer disabled:opacity-60"
                    >
                      {loadingGeminiModels && <option value={geminiModel}>Carregando modelos...</option>}
                      {!loadingGeminiModels && geminiModels.length === 0 && <option value={geminiModel}>{geminiModel}</option>}
                      {!loadingGeminiModels && geminiModels.length > 0 && geminiModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  )}

                  {aiProvider === 'gemini' && !geminiKey && (
                    <div className="text-red-500 text-xs font-black uppercase flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/30">
                      <AlertTriangle className="h-4 w-4 animate-pulse" /> Cadastre sua chave nas Configurações!
                    </div>
                  )}

                  {aiProvider === 'gemini' && geminiKey && geminiModelsError && (
                    <div className="text-amber-600 text-xs font-black uppercase flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                      <AlertTriangle className="h-4 w-4" /> {geminiModelsError}
                    </div>
                  )}
                </div>
              </div>

              {/* Sub-aba 1: Análise de Pesquisas */}
              {aiSubTab === 'surveys' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
                  
                  {/* Seletor de Pesquisa */}
                  <div className="xl:col-span-1 bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Selecione a Pesquisa</label>
                      <select
                        value={selectedAiSurveyId}
                        onChange={(e) => {
                          setSelectedAiSurveyId(e.target.value);
                          setSurveyAnalysisResult(null);
                        }}
                        className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold cursor-pointer"
                      >
                        <option value="">-- Selecione uma pesquisa --</option>
                        {pesquisas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.titulo}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedAiSurveyId && (
                      <div className="p-5 bg-red-50/50 dark:bg-teal-950/10 rounded-3xl border border-red-100/50 dark:border-red-900/20 space-y-4 animate-in fade-in duration-300">
                        {(() => {
                          const survey = pesquisas.find(p => p.id === selectedAiSurveyId);
                          const count = surveyResponseCounts[selectedAiSurveyId] || 0;
                          return (
                            <>
                              <div className="space-y-1">
                                <h4 className="font-black text-red-800 dark:text-red-400 uppercase text-xs tracking-wider">Metadados da Pesquisa</h4>
                                <p className="text-xs text-gray-500 font-medium">{survey?.descricao || 'Sem descrição cadastrada.'}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl text-center shadow-sm">
                                  <div className="text-2xl font-black text-red-600">{count}</div>
                                  <div className="text-[9px] font-black uppercase text-gray-400">Respostas</div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl text-center shadow-sm">
                                  <div className="text-2xl font-black text-red-600">{survey?.perguntas.length}</div>
                                  <div className="text-[9px] font-black uppercase text-gray-400">Perguntas</div>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <button
                      onClick={handleAnalyzeSurvey}
                      disabled={analyzingSurvey || !selectedAiSurveyId || (aiProvider === 'gemini' && !geminiKey)}
                      className="w-full bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-150 dark:disabled:bg-gray-800 disabled:text-gray-400 py-4 rounded-2xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/10"
                    >
                      {analyzingSurvey ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Mapeando Clima...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" /> Iniciar Análise Cognitiva
                        </>
                      )}
                    </button>
                  </div>

                  {/* Resultados da Análise de Pesquisa */}
                  <div className="xl:col-span-2 space-y-6">
                    {analyzingSurvey && (
                      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-12 border border-gray-100 dark:border-gray-800 shadow-xl flex flex-col items-center justify-center text-center space-y-6">
                        <div className="relative">
                          <Brain className="h-20 w-20 text-red-600 animate-pulse" />
                          <Sparkles className="h-8 w-8 text-amber-400 absolute top-0 right-0 animate-bounce" />
                        </div>
                        <div className="space-y-2 max-w-md">
                          <h3 className="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">A IA está mapeando o Clima</h3>
                          <p className="text-sm text-gray-500 font-medium">Lendo feedbacks individuais, ponderando média de notas e gerando o plano estratégico de ação...</p>
                        </div>
                        <div className="w-48 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-red-600 rounded-full animate-[loading_2s_infinite] w-2/3"></div>
                        </div>
                      </div>
                    )}

                    {!analyzingSurvey && !surveyAnalysisResult && (
                      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-16 border border-gray-100 dark:border-gray-800 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
                        <div className="bg-red-50 dark:bg-red-900/15 p-6 rounded-full text-red-600">
                          <Brain className="h-16 w-16" />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Relatório de IA Pendente</h3>
                        <p className="text-gray-500 max-w-md text-sm font-medium">
                          Selecione uma pesquisa e clique no botão Ã  esquerda para que o Copilot RH processe as respostas e trace as prioridades do clima.
                        </p>
                      </div>
                    )}

                    {surveyAnalysisResult && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* Sentimento & Resumo */}
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
                            <h3 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-tighter">Relatório Cognitivo do Clima</h3>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase text-gray-400">Sentimento Geral:</span>
                              {surveyAnalysisResult.sentiment === 'positivo' && (
                                <span className="bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 px-4 py-1.5 rounded-full font-black uppercase text-[10px] tracking-wider flex items-center gap-1 border border-green-200/50">
                                  <ThumbsUp className="h-3 w-3" /> Positivo ðŸ˜„
                                </span>
                              )}
                              {surveyAnalysisResult.sentiment === 'negativo' && (
                                <span className="bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 px-4 py-1.5 rounded-full font-black uppercase text-[10px] tracking-wider flex items-center gap-1 border border-red-200/50">
                                  <ThumbsDown className="h-3 w-3" /> Negativo ðŸ˜¡
                                </span>
                              )}
                              {surveyAnalysisResult.sentiment === 'misto' && (
                                <span className="bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 px-4 py-1.5 rounded-full font-black uppercase text-[10px] tracking-wider flex items-center gap-1 border border-amber-200/50">
                                  <RefreshCw className="h-3 w-3 animate-spin-slow" /> Misto ðŸ¤”
                                </span>
                              )}
                              {surveyAnalysisResult.sentiment === 'neutro' && (
                                <span className="bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 px-4 py-1.5 rounded-full font-black uppercase text-[10px] tracking-wider flex items-center gap-1 border border-gray-200">
                                  Neutro ðŸ˜
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="font-black text-xs text-gray-400 uppercase tracking-widest">Resumo Executivo</h4>
                            <p className="text-gray-700 dark:text-gray-300 text-sm font-medium leading-relaxed bg-gray-50/50 dark:bg-gray-800/40 p-5 rounded-3xl border border-gray-100 dark:border-gray-800/80">
                              {surveyAnalysisResult.summary}
                            </p>
                          </div>
                        </div>

                        {/* Pontos Fortes e Pontos Críticos */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Pontos Fortes */}
                          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl space-y-4">
                            <h4 className="font-black text-xs text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center gap-2">
                              <ThumbsUp className="h-4 w-4" /> Pontos Fortes / Elogios
                            </h4>
                            <ul className="space-y-3">
                              {surveyAnalysisResult.positivePoints.map((item, idx) => (
                                <li key={idx} className="flex gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 leading-relaxed">
                                  <span className="text-green-500 font-bold shrink-0">âœ“</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Pontos Críticos */}
                          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl space-y-4">
                            <h4 className="font-black text-xs text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-2">
                              <ThumbsDown className="h-4 w-4" /> Pontos de Atenção / Queixas
                            </h4>
                            <ul className="space-y-3">
                              {surveyAnalysisResult.criticalPoints.map((item, idx) => (
                                <li key={idx} className="flex gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 leading-relaxed">
                                  <span className="text-red-500 font-bold shrink-0">âœ—</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Alertas Urgentes */}
                        {surveyAnalysisResult.alerts.length > 0 && (
                          <div className="bg-red-50/50 dark:bg-red-950/15 rounded-[2.5rem] p-6 sm:p-8 border border-red-100 dark:border-red-950/20 space-y-4 shadow-sm animate-in zoom-in-95">
                            <h4 className="font-black text-xs text-red-700 dark:text-red-400 uppercase tracking-widest flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-red-600 animate-bounce" /> Alertas Críticos Identificados
                            </h4>
                            <div className="space-y-2">
                              {surveyAnalysisResult.alerts.map((alert, idx) => (
                                <p key={idx} className="text-xs font-bold text-red-800 dark:text-red-300 bg-white/80 dark:bg-gray-900/50 px-4 py-3.5 rounded-2xl border border-red-100/50 dark:border-red-900/30 flex items-start gap-2">
                                  <span className="text-red-500">â€¢</span>
                                  <span>{alert}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Plano de Ação */}
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl space-y-4">
                          <h4 className="font-black text-xs text-red-600 uppercase tracking-widest flex items-center gap-2">
                            <Zap className="h-4 w-4" /> Plano de Ação Recomendado (RH)
                          </h4>
                          <div className="space-y-3">
                            {surveyAnalysisResult.actionPlan.map((action, idx) => (
                              <div key={idx} className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100/50 dark:border-gray-700 hover:border-red-500 dark:hover:border-red-400 transition-all group">
                                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-black rounded-lg h-7 w-7 flex items-center justify-center shrink-0 text-xs">
                                  {idx + 1}
                                </div>
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 pt-1 group-hover:text-red-900 dark:group-hover:text-white transition-colors">{action}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Sub-aba 2: Triagem de Currículos */}
              {aiSubTab === 'talents' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
                  
                  {/* Filtro de Vagas */}
                  <div className="xl:col-span-1 bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Selecione o Cargo da Vaga</label>
                      <select
                        value={selectedAiCargo}
                        onChange={(e) => handleSelectAiCargo(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold cursor-pointer"
                      >
                        <option value="">-- Selecione uma vaga --</option>
                        {cargos.map((c) => (
                          <option key={c.id} value={c.nome}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedAiCargo && (
                      <div className="p-5 bg-red-50/50 dark:bg-teal-950/10 rounded-3xl border border-red-100/50 dark:border-red-900/20 space-y-2 animate-in fade-in duration-300">
                        <h4 className="font-black text-red-800 dark:text-red-400 uppercase text-xs tracking-wider">Candidatos Inscritos</h4>
                        <div className="text-3xl font-black text-red-600">{matchingTalents.length}</div>
                        <p className="text-[10px] font-black uppercase text-gray-400">Currículos cadastrados para esta vaga</p>
                      </div>
                    )}
                  </div>

                  {/* Listagem e Matching de Talentos */}
                  <div className="xl:col-span-2 space-y-6">
                    {!selectedAiCargo && (
                      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-16 border border-gray-100 dark:border-gray-800 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-full text-gray-400">
                          <Users className="h-16 w-16" />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Seleção Requerida</h3>
                        <p className="text-gray-500 max-w-md text-sm font-medium">
                          Selecione um cargo Ã  esquerda para visualizar todos os candidatos que manifestaram interesse nesta oportunidade e rodar a triagem cognitiva.
                        </p>
                      </div>
                    )}

                    {selectedAiCargo && matchingTalents.length === 0 && (
                      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-16 border border-gray-100 dark:border-gray-800 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
                        <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-full text-amber-500">
                          <Users className="h-16 w-16" />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Sem Candidatos Inscritos</h3>
                        <p className="text-gray-500 max-w-md text-sm font-medium">
                          Não encontramos nenhum candidato cadastrado no banco com interesse direto para a vaga de "{selectedAiCargo}" no momento.
                        </p>
                      </div>
                    )}

                    {selectedAiCargo && matchingTalents.length > 0 && (
                      <div className="space-y-6">
                        <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tighter text-xl">Triagem de Candidatos - {selectedAiCargo}</h3>
                        
                        <div className="space-y-4">
                          {matchingTalents.map((cand) => {
                            const analysis = talentAnalysisResults[cand.id];
                            const isAnalyzing = analyzingTalentId === cand.id;

                            return (
                              <div key={cand.id} className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 sm:p-8 border border-gray-100 dark:border-gray-800 shadow-lg space-y-6 hover:shadow-xl transition-all">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-50 dark:border-gray-850 pb-4">
                                  <div className="space-y-1">
                                    <h4 className="font-black text-lg text-gray-900 dark:text-white">{cand.nome}</h4>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 font-bold uppercase">
                                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {cand.cidade}</span>
                                      <span>{cand.escolaridade}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {analysis && (
                                      <div className="flex items-center gap-2">
                                        <span className={`px-4 py-1.5 rounded-full font-black uppercase text-[10px] tracking-wider ${
                                          analysis.recommendation === 'Recomendado' ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400' :
                                          analysis.recommendation === 'Potencial' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400' :
                                          'bg-red-50 text-red-700 dark:bg-red-950/20'
                                        }`}>
                                          {analysis.recommendation}
                                        </span>
                                        <div className="bg-red-50 dark:bg-red-900/20 px-3.5 py-1.5 rounded-full text-red-600 dark:text-red-400 font-black text-xs">
                                          Score: {analysis.score}%
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      onClick={() => handleAnalyzeTalent(cand)}
                                      disabled={isAnalyzing || (aiProvider === 'gemini' && !geminiKey)}
                                      className="bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/40 text-xs font-black uppercase px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                                    >
                                      {isAnalyzing ? (
                                        <>
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-3.5 w-3.5" /> {analysis ? 'Reavaliar com IA' : 'Triagem de IA'}
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* Resumo de Apresentação original */}
                                <div className="space-y-1 bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-100/50 dark:border-gray-800 text-xs">
                                  <span className="font-black text-gray-400 uppercase tracking-wider block">Pitch do Candidato</span>
                                  <p className="text-gray-600 dark:text-gray-300 font-medium italic">"{cand.resumo || 'Sem apresentação cadastrada.'}"</p>
                                  {cand.tecnologias && (
                                    <div className="pt-2 flex flex-wrap gap-1.5">
                                      {cand.tecnologias.split(',').map((t, idx) => (
                                        <span key={idx} className="bg-white dark:bg-gray-800 px-2 py-0.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[9px] font-bold text-gray-500 uppercase">{t.trim()}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Resultado da Triagem Inteligente */}
                                {analysis && (
                                  <div className="space-y-4 bg-red-50/30 dark:bg-teal-950/10 p-5 sm:p-6 rounded-[2rem] border border-red-100/30 dark:border-red-900/10 animate-in zoom-in-95 duration-300">
                                    <div className="space-y-1">
                                      <h5 className="font-black text-red-800 dark:text-red-400 uppercase text-[10px] tracking-widest flex items-center gap-1"><Brain className="h-3.5 w-3.5"/> Diagnóstico Cognitivo</h5>
                                      <p className="text-gray-700 dark:text-gray-300 text-xs font-semibold leading-relaxed">{analysis.summary}</p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                      <div className="space-y-1">
                                        <span className="text-[9px] font-black uppercase text-green-600 tracking-wider">Fortalezas do Candidato</span>
                                        <div className="space-y-1">
                                          {analysis.strengths.map((str, sIdx) => (
                                            <div key={sIdx} className="flex gap-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                                              <span className="text-green-500">âœ“</span> <span>{str}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="space-y-1">
                                        <span className="text-[9px] font-black uppercase text-amber-600 tracking-wider">Pontos de Atenção</span>
                                        <div className="space-y-1">
                                          {analysis.weaknesses.map((wkn, wIdx) => (
                                            <div key={wIdx} className="flex gap-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                                              <span className="text-amber-500">âš </span> <span>{wkn}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          )}

          {/* Aba: MURAL DE VAGAS */}
          {activeTab === 'jobs' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Mural de Vagas</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm font-medium mt-1">Cada vaga vira uma LP padrao no estilo Gigante, com "saiba mais" e "candidate-se".</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={openCreateJobModal} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase">
                    <Plus className="h-4 w-4" /> Criar nova vaga
                  </button>
                  <a href="#/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-2 rounded-xl text-xs font-black uppercase">
                    <ExternalLink className="h-4 w-4" /> Ver portal publico
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {cargos.map((cargo) => {
                  const landing = parseJobLandingFromRequisitos(cargo);
                  const lojaAssoc = lojasList.find(l => l.id === cargo.loja_id);
                  const isPublished = cargo.publicada === true || landing.published === true;
                  return (
                    <div key={cargo.id} className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-lg space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h4 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{landing.title}</h4>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Cargo: {cargo.nome}</span>
                            <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
                            <span className="text-xs font-black uppercase text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2.5 py-0.5 rounded-lg border border-red-100 dark:border-red-900/30">
                              {lojaAssoc ? lojaAssoc.nome : 'Rede / Corporativo'}
                            </span>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${isPublished ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                          {isPublished ? 'Publicada' : 'Rascunho'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{landing.shortDescription}</p>
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <button onClick={() => openJobEditor(cargo)} className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase transition-all">
                          Editar Vaga
                        </button>
                        <button
                          onClick={() => handleTogglePublish(cargo)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase transition-all border ${isPublished ? 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30' : 'border-green-300 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30'}`}
                        >
                          {isPublished ? 'Mudar p/ Rascunho' : 'Publicar Vaga'}
                        </button>
                        {isPublished && (
                          <a href={`#/vagas/${cargo.id}`} target="_blank" rel="noreferrer" className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1">
                            <ExternalLink className="h-3.5 w-3.5" /> Ver LP
                          </a>
                        )}
                        <div className="ml-auto">
                          {confirmDeleteJobId === cargo.id ? (
                            <div className="flex items-center gap-2 animate-in fade-in duration-200">
                              <span className="text-[10px] font-black uppercase text-red-600 dark:text-red-400">Excluir?</span>
                              <button
                                onClick={() => handleDeleteJob(cargo.id)}
                                disabled={deletingJobId === cargo.id}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase disabled:opacity-60 transition-all"
                              >
                                {deletingJobId === cargo.id ? 'Excluindo...' : 'Confirmar'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteJobId(null)}
                                className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteJobId(cargo.id)}
                              className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                              title="Excluir vaga"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {jobEditorOpen && (
                <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
                  <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-[2rem] p-8 border border-gray-100 dark:border-gray-800 space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{creatingJob ? 'Criar nova vaga' : 'Editar vaga'}</h4>
                      <button onClick={() => setJobEditorOpen(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
                    </div>

                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 text-xs font-semibold text-red-800 dark:text-red-200">
                      Preencha este formulario como uma pagina de evento: titulo forte, descricao curta, conteudo objetivo e CTA para candidatura.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Nome Interno da Vaga</label>
                        <input value={newJobName} onChange={(e) => setNewJobName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Ex: Consultor de Vendas Técnicas" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Unidade / Loja Vinculada</label>
                        <select
                          value={selectedJobLojaId}
                          onChange={(e) => setSelectedJobLojaId(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-bold cursor-pointer"
                        >
                          <option value="">Rede / Corporativo (Todas as Lojas)</option>
                          {lojasList.map((loja) => (
                            <option key={loja.id} value={loja.id}>
                              {loja.nome} {loja.cidade ? `(${loja.cidade} - ${loja.uf})` : ''} {!loja.ativa ? ' [INATIVA]' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Titulo da LP</label>
                        <input value={jobLanding.title} onChange={(e) => setJobLanding(prev => ({ ...prev, title: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Titulo da vaga" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Imagem Hero (URL)</label>
                        <input value={jobLanding.heroImageUrl} onChange={(e) => setJobLanding(prev => ({ ...prev, heroImageUrl: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Ex: /vagas/hero-analista.jpg" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Slug da URL</label>
                        <input value={jobLanding.slug} onChange={(e) => setJobLanding(prev => ({ ...prev, slug: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="consultor-vendas-tecnicas" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Local</label>
                        <input value={jobLanding.location} onChange={(e) => setJobLanding(prev => ({ ...prev, location: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Cidade - UF" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Modelo de Trabalho</label>
                        <input value={jobLanding.workModel} onChange={(e) => setJobLanding(prev => ({ ...prev, workModel: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Presencial, Hibrido ou Remoto" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Faixa Salarial</label>
                        <input value={jobLanding.salary} onChange={(e) => setJobLanding(prev => ({ ...prev, salary: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Ex: A combinar / Fixo + Comissoes" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Descricao Curta da Vaga</label>
                      <textarea rows={3} value={jobLanding.shortDescription} onChange={(e) => setJobLanding(prev => ({ ...prev, shortDescription: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Descricao curta para o card e topo da LP" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Responsabilidades</label>
                      <textarea rows={4} value={jobLanding.responsibilities.join('\n')} onChange={(e) => setJobLanding(prev => ({ ...prev, responsibilities: toLines(e.target.value) }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Uma responsabilidade por linha" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Requisitos</label>
                      <textarea rows={4} value={jobLanding.requirements.join('\n')} onChange={(e) => setJobLanding(prev => ({ ...prev, requirements: toLines(e.target.value) }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Um requisito por linha" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Beneficios</label>
                      <textarea rows={3} value={jobLanding.benefits.join('\n')} onChange={(e) => setJobLanding(prev => ({ ...prev, benefits: toLines(e.target.value) }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Um beneficio por linha" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Contexto para IA da Vaga</label>
                      <textarea rows={4} value={jobLanding.agentContext} onChange={(e) => setJobLanding(prev => ({ ...prev, agentContext: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800" placeholder="Criterios de descarte, competencias obrigatorias, perfil ideal etc." />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700">
                      <div>
                        <div className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">Status de Publicação</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {jobLanding.published ? 'A vaga ficará imediatamente visível no portal público.' : 'A vaga ficará salva como Rascunho, oculta no portal público.'}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={jobLanding.published}
                          onChange={(e) => setJobLanding(prev => ({ ...prev, published: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                      </label>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button onClick={() => setJobEditorOpen(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-black uppercase">Cancelar</button>
                      <button onClick={handleSaveJobLanding} disabled={savingJob} className="px-5 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase disabled:opacity-60">{savingJob ? 'Salvando...' : 'Salvar Vaga'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba: GESTÃO DE UNIDADES (LOJAS) - PROMPT 51 */}
          {activeTab === 'lojas' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              
              {/* Cabeçalho Principal da Rede */}
              <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl text-red-600">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">
                        Gestão da Rede de Unidades
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">
                        Administre as filiais da Gigante Pneus com histórico auditado, controle de desativação segura e vinculação de vagas.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {isGestorMaster ? (
                    <button
                      onClick={openCreateLojaModal}
                      className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase shadow-lg transition-all active:scale-95"
                    >
                      <Plus className="h-4 w-4" /> Cadastrar Nova Unidade
                    </button>
                  ) : (
                    <div className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                      Permissão exclusiva do Gestor Master (franqueadora_admin)
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de Controles: Pesquisa, Visualização Lista/Cards, Toggle Inativas e Contadores */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-md space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Campo de Pesquisa Rápida */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchLoja}
                      onChange={(e) => {
                        setSearchLoja(e.target.value);
                        setLojasCurrentPage(1);
                      }}
                      placeholder="Pesquisar por nome, cidade ou identificador..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all"
                    />
                    {searchLoja && (
                      <button
                        onClick={() => {
                          setSearchLoja('');
                          setLojasCurrentPage(1);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    
                    {/* Controle: Mostrar Unidades Desativadas */}
                    <label className="inline-flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-800/80 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 transition-all select-none">
                      <input
                        type="checkbox"
                        checked={showInactiveLojas}
                        onChange={(e) => {
                          setShowInactiveLojas(e.target.checked);
                          setLojasCurrentPage(1);
                        }}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-600 h-4 w-4"
                      />
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Mostrar unidades desativadas
                      </span>
                    </label>

                    {/* Alternância: Lista (padrão) vs Cards */}
                    <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setLojasViewMode('list')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                          lojasViewMode === 'list'
                            ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                        }`}
                        title="Visualização em Lista"
                      >
                        <LayoutList className="h-3.5 w-3.5" /> Lista
                      </button>
                      <button
                        onClick={() => setLojasViewMode('cards')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                          lojasViewMode === 'cards'
                            ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                        }`}
                        title="Visualização em Cards"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" /> Cards
                      </button>
                    </div>

                  </div>
                </div>

                {/* Contador de unidades */}
                <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div>
                    Exibindo <strong className="text-gray-900 dark:text-white">{filteredLojas.length}</strong> de {lojasList.length} unidades registradas
                    <span className="ml-2 font-normal">
                      ({lojasList.filter(l => l.ativa).length} ativas, {lojasList.filter(l => !l.ativa).length} inativas)
                    </span>
                  </div>
                  {totalLojasPages > 1 && (
                    <div>Página {lojasCurrentPage} de {totalLojasPages}</div>
                  )}
                </div>
              </div>

              {/* VISUALIZAÇÃO 1: LISTA (Padrão) */}
              {lojasViewMode === 'list' && (
                <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50/80 dark:bg-gray-800/60 uppercase tracking-wider text-[11px] font-black text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                        <tr>
                          <th className="py-4 px-6">Unidade Oficial</th>
                          <th className="py-4 px-6">Cidade / UF</th>
                          <th className="py-4 px-6">Identificador (ID)</th>
                          <th className="py-4 px-6">Situação</th>
                          <th className="py-4 px-6">Vagas Publicadas</th>
                          <th className="py-4 px-6 text-right">Ações Permitidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                        {paginatedLojas.map((loja) => {
                          const vagasDaLoja = cargos.filter(c => c.loja_id === loja.id);
                          const vagasPublicadas = vagasDaLoja.filter(c => (c as any).publicada === true).length;
                          const isCopied = copiedLojaId === loja.id;

                          return (
                            <tr
                              key={loja.id}
                              className={`transition-colors ${
                                loja.ativa
                                  ? 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40 text-gray-900 dark:text-white'
                                  : 'bg-gray-50/40 dark:bg-gray-900/40 opacity-75 hover:opacity-100'
                              }`}
                            >
                              {/* Nome da Unidade */}
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-2.5">
                                  <div className={`p-2 rounded-xl ${loja.ativa ? 'bg-red-50 dark:bg-red-950/30 text-red-600' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <div className="font-black text-sm uppercase tracking-tight">
                                      {loja.nome}
                                    </div>
                                    {!loja.ativa && loja.motivo_desativacao && (
                                      <div className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold mt-0.5 max-w-xs truncate" title={`Motivo: ${loja.motivo_desativacao}`}>
                                        Motivo: {loja.motivo_desativacao}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Cidade / UF */}
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 font-bold">
                                  <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                  <span>{loja.cidade ? `${loja.cidade} - ${loja.estado}` : 'Não informada'}</span>
                                </div>
                              </td>

                              {/* Identificador (ID) */}
                              <td className="py-4 px-6">
                                <button
                                  onClick={() => handleCopyLojaId(loja.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono text-[11px] transition-all"
                                  title="Clique para copiar ID completo"
                                >
                                  <span>#{loja.id.slice(0, 8)}...</span>
                                  {isCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                </button>
                              </td>

                              {/* Situação (Ativa / Inativa) */}
                              <td className="py-4 px-6">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                                    loja.ativa
                                      ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-900/30'
                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/30'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${loja.ativa ? 'bg-green-600' : 'bg-amber-600'}`}></span>
                                  {loja.ativa ? 'Ativa' : 'Inativa'}
                                </span>
                              </td>

                              {/* Quantidade de Vagas Publicadas */}
                              <td className="py-4 px-6">
                                <div className="space-y-0.5">
                                  <div className="font-black text-gray-900 dark:text-white">
                                    {vagasPublicadas} {vagasPublicadas === 1 ? 'vaga pública' : 'vagas públicas'}
                                  </div>
                                  <div className="text-[10px] text-gray-400 font-semibold">
                                    {vagasDaLoja.length} no histórico total
                                  </div>
                                </div>
                              </td>

                              {/* Ações Permitidas */}
                              <td className="py-4 px-6 text-right">
                                {isGestorMaster ? (
                                  <div className="inline-flex items-center gap-2 justify-end">
                                    <button
                                      onClick={() => openEditLojaModal(loja)}
                                      className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-black uppercase transition-all"
                                      title="Editar dados da unidade"
                                    >
                                      Editar
                                    </button>
                                    
                                    {loja.ativa ? (
                                      <button
                                        onClick={() => handleInitiateDeactivate(loja)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs font-black uppercase transition-all"
                                        title="Desativar unidade com preservação de histórico"
                                      >
                                        <PowerOff className="h-3 w-3" /> Desativar
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleInitiateReactivate(loja)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-green-300 dark:border-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-xs font-black uppercase transition-all"
                                        title="Reativar unidade na rede"
                                      >
                                        <RotateCcw className="h-3 w-3" /> Reativar
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-[11px] italic">Somente leitura</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* VISUALIZAÇÃO 2: CARDS (Alternativa) */}
              {lojasViewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedLojas.map((loja) => {
                    const vagasDaLoja = cargos.filter(c => c.loja_id === loja.id);
                    const vagasPublicadas = vagasDaLoja.filter(c => (c as any).publicada === true).length;
                    const isCopied = copiedLojaId === loja.id;

                    return (
                      <div
                        key={loja.id}
                        className={`bg-white dark:bg-gray-900 rounded-3xl p-6 border transition-all flex flex-col justify-between ${
                          loja.ativa
                            ? 'border-gray-100 dark:border-gray-800 shadow-lg hover:shadow-xl'
                            : 'border-dashed border-amber-300/60 dark:border-amber-900/40 bg-amber-50/10 dark:bg-amber-950/10 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div>
                          {/* Cabeçalho do Card */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">
                                <Building2 className="h-3 w-3" /> Unidade Oficial
                              </div>
                              <h4 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                {loja.nome}
                              </h4>
                            </div>
                            <span
                              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase shrink-0 ${
                                loja.ativa
                                  ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                              }`}
                            >
                              {loja.ativa ? 'Ativa' : 'Inativa'}
                            </span>
                          </div>

                          {/* Seção de Alerta se Inativa */}
                          {!loja.ativa && (
                            <div className="p-3 mb-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/30 text-xs">
                              <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                                <Info className="h-3.5 w-3.5 shrink-0" />
                                <span>Unidade Desativada</span>
                              </div>
                              {loja.motivo_desativacao && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                                  <strong>Motivo:</strong> {loja.motivo_desativacao}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Dados da Loja */}
                          <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300 pt-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              <span className="font-bold">{loja.cidade ? `${loja.cidade} - ${loja.estado}` : 'Localidade não informada'}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Hash className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              <button
                                onClick={() => handleCopyLojaId(loja.id)}
                                className="font-mono text-gray-400 hover:text-gray-600 text-[11px] inline-flex items-center gap-1"
                              >
                                <span>ID: {loja.id.slice(0, 13)}...</span>
                                {isCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>

                            {loja.telefone_contato && (
                              <div className="text-[11px] text-gray-500 pl-5">
                                Tel: {loja.telefone_contato}
                              </div>
                            )}
                            {loja.email_contato && (
                              <div className="text-[11px] text-gray-500 pl-5 truncate">
                                E-mail: {loja.email_contato}
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-1">
                              <Briefcase className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              <span className="font-bold text-gray-900 dark:text-white">
                                {vagasPublicadas} {vagasPublicadas === 1 ? 'vaga publicada' : 'vagas publicadas'}
                              </span>
                              <span className="text-[10px] text-gray-400">({vagasDaLoja.length} totais)</span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px]">
                              <Folder className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              <span className="font-mono text-gray-400 truncate">
                                {loja.google_drive_folder_id ? `Drive: ${loja.google_drive_folder_id.slice(0, 14)}...` : 'Drive: Raiz da Organização'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Rodapé com Ações */}
                        {isGestorMaster && (
                          <div className="flex items-center gap-2 pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
                            <button
                              onClick={() => openEditLojaModal(loja)}
                              className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 py-2 rounded-xl text-xs font-black uppercase transition-all text-center"
                            >
                              Editar
                            </button>
                            {loja.ativa ? (
                              <button
                                onClick={() => handleInitiateDeactivate(loja)}
                                className="flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all border border-amber-300 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-center"
                              >
                                Desativar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleInitiateReactivate(loja)}
                                className="flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all border border-green-300 dark:border-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-center"
                              >
                                Reativar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Estado Vazio de Busca */}
              {paginatedLojas.length === 0 && (
                <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800">
                  <Building2 className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-900 dark:text-white font-black uppercase text-base">Nenhuma unidade encontrada.</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {searchLoja
                      ? 'Nenhuma unidade corresponde aos termos pesquisados.'
                      : !showInactiveLojas
                      ? 'Não há unidades ativas disponíveis ou todas foram filtradas.'
                      : 'Nenhuma unidade cadastrada no sistema.'}
                  </p>
                  {searchLoja && (
                    <button
                      onClick={() => setSearchLoja('')}
                      className="mt-4 px-4 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-black uppercase"
                    >
                      Limpar filtro de pesquisa
                    </button>
                  )}
                </div>
              )}

              {/* Paginação da Lista / Cards */}
              {totalLojasPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    Página <strong className="text-gray-900 dark:text-white">{lojasCurrentPage}</strong> de {totalLojasPages} ({filteredLojas.length} unidades)
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLojasCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={lojasCurrentPage === 1}
                      className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-black uppercase border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </button>

                    <div className="flex gap-1">
                      {Array.from({ length: totalLojasPages }).map((_, idx) => {
                        const pageNum = idx + 1;
                        const isActive = pageNum === lojasCurrentPage;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setLojasCurrentPage(pageNum)}
                            className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${
                              isActive
                                ? 'bg-red-600 text-white shadow-md'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setLojasCurrentPage(prev => Math.min(prev + 1, totalLojasPages))}
                      disabled={lojasCurrentPage === totalLojasPages}
                      className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-black uppercase border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Próxima <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* MODAL 1: CONFIRMAÇÃO DE DESATIVAÇÃO SEGURA (PROMPT 51) */}
              {deactivateModalOpen && lojaToDeactivate && (
                <div className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-200">
                  <div className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-[2.5rem] p-7 md:p-8 border border-gray-100 dark:border-gray-800 shadow-2xl space-y-6">
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl text-amber-600">
                          <PowerOff className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                            Desativar Unidade Oficial
                          </h4>
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase">
                            Preservação histórica obrigatória da franqueadora
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setDeactivateModalOpen(false)}
                        className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-1">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unidade Selecionada</div>
                      <div className="text-base font-black text-gray-900 dark:text-white uppercase">{lojaToDeactivate.nome}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 font-semibold">{lojaToDeactivate.cidade} - {lojaToDeactivate.estado}</div>
                    </div>

                    {/* Resumo de Impacto Carregado do Supabase */}
                    <div className="space-y-2">
                      <div className="text-xs font-black uppercase text-gray-500 tracking-wider">Impacto nos Dados Vinculados</div>
                      {loadingDeactivateImpact ? (
                        <div className="flex items-center justify-center py-4 text-xs font-bold text-gray-400">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Consultando histórico de vagas e candidaturas...
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="p-3 bg-gray-50 dark:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700">
                            <div className="text-lg font-black text-gray-900 dark:text-white">{deactivateImpact?.total_vagas || 0}</div>
                            <div className="text-[10px] font-bold uppercase text-gray-500">Vagas no Histórico</div>
                          </div>
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-900/40">
                            <div className="text-lg font-black text-amber-700 dark:text-amber-400">{deactivateImpact?.vagas_publicadas || 0}</div>
                            <div className="text-[10px] font-bold uppercase text-amber-600">Vagas Abertas</div>
                          </div>
                          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/40">
                            <div className="text-lg font-black text-blue-700 dark:text-blue-400">{deactivateImpact?.total_candidaturas || 0}</div>
                            <div className="text-[10px] font-bold uppercase text-blue-600">Candidaturas</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Alertas Contratuais e de Segurança */}
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-900/30 text-xs text-amber-800 dark:text-amber-300 space-y-1.5 leading-relaxed font-medium">
                      <div className="font-black uppercase flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> O que acontece ao desativar:
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-[11px]">
                        <li>As <strong>vagas abertas desta unidade deixarão de aparecer publicamente</strong> no portal Trabalhe Conosco.</li>
                        <li><strong>Nenhuma vaga ou candidatura será excluída</strong>, mantendo 100% do histórico preservado.</li>
                        <li>Novas candidaturas para vagas vinculadas a esta unidade serão bloqueadas.</li>
                        <li>Caso reativada futuramente, <strong>as vagas NÃO serão republicadas automaticamente</strong>, exigindo revisão explícita do RH.</li>
                      </ul>
                    </div>

                    {/* Campo Obrigatório: Motivo da Desativação */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center justify-between">
                        <span>Motivo da Desativação *</span>
                        <span className="text-[10px] font-bold text-gray-400">Registrado em auditoria</span>
                      </label>
                      <textarea
                        value={deactivateReason}
                        onChange={(e) => setDeactivateReason(e.target.value)}
                        placeholder="Ex: Encerramento de contrato de franquia, reforma predial ou mudança societária..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all resize-none"
                        required
                      />
                    </div>

                    {deactivateError && (
                      <div className="p-3 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-900/30">
                        {deactivateError}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => setDeactivateModalOpen(false)}
                        disabled={submittingDeactivation}
                        className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-black uppercase transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirmDeactivate}
                        disabled={submittingDeactivation || !deactivateReason.trim()}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase disabled:opacity-50 transition-all shadow-md active:scale-95"
                      >
                        {submittingDeactivation ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
                        Confirmar Desativação
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL 2: CONFIRMAÇÃO DE REATIVAÇÃO SEGURA (PROMPT 51) */}
              {reactivateModalOpen && lojaToReactivate && (
                <div className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-200">
                  <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-[2.5rem] p-7 md:p-8 border border-gray-100 dark:border-gray-800 shadow-2xl space-y-6">
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-2xl text-green-600">
                          <RotateCcw className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                            Reativar Unidade Oficial
                          </h4>
                          <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase">
                            Reintegração na rede oficial Gigante Pneus
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setReactivateModalOpen(false)}
                        className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-1">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unidade</div>
                      <div className="text-base font-black text-gray-900 dark:text-white uppercase">{lojaToReactivate.nome}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 font-semibold">{lojaToReactivate.cidade} - {lojaToReactivate.estado}</div>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-900/30 text-xs text-blue-900 dark:text-blue-300 space-y-2 leading-relaxed">
                      <div className="font-black uppercase flex items-center gap-1.5">
                        <Info className="h-4 w-4 shrink-0 text-blue-600" /> Regra de Segurança da Franqueadora:
                      </div>
                      <p className="text-[11px]">
                        A reativação restabelece a unidade na rede e permite o cadastro de novas oportunidades. 
                        <strong> As vagas antigas desta unidade NÃO serão republicadas automaticamente</strong> para evitar divulgação de cargos obsoletos. O RH poderá revisá-las e publicá-las individualmente na aba de Vagas.
                      </p>
                    </div>

                    {reactivateError && (
                      <div className="p-3 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-900/30">
                        {reactivateError}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => setReactivateModalOpen(false)}
                        disabled={submittingReactivation}
                        className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-black uppercase transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirmReactivate}
                        disabled={submittingReactivation}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-black uppercase disabled:opacity-50 transition-all shadow-md active:scale-95"
                      >
                        {submittingReactivation ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Confirmar Reativação
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL 3: CADASTRO / EDIÇÃO DE LOJA (Sem qualquer opção de exclusão definitiva) */}
              {lojaModalOpen && (
                <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-200">
                  <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 space-y-6 shadow-2xl">
                    <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl text-red-600">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                            {editingLoja ? 'Editar Unidade' : 'Cadastrar Nova Unidade'}
                          </h4>
                          <p className="text-xs text-gray-500 font-bold uppercase">
                            Exclusivo para Gestor Master (franqueadora_admin)
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setLojaModalOpen(false)}
                        className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    {lojaMsg && (
                      <div className={`p-4 rounded-2xl text-xs font-bold ${lojaMsg.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900/30' : 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300 border border-green-200 dark:border-green-900/30'}`}>
                        {lojaMsg.text}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                          Nome da Unidade / Loja *
                        </label>
                        <input
                          value={lojaFormData.nome}
                          onChange={(e) => setLojaFormData(prev => ({ ...prev, nome: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-bold"
                          placeholder="Ex: Gigante Pneus - Matriz Curitiba"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                          Cidade *
                        </label>
                        <input
                          value={lojaFormData.cidade}
                          onChange={(e) => setLojaFormData(prev => ({ ...prev, cidade: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-bold"
                          placeholder="Ex: Curitiba"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                          UF (Estado) *
                        </label>
                        <input
                          value={lojaFormData.estado}
                          onChange={(e) => setLojaFormData(prev => ({ ...prev, estado: e.target.value.toUpperCase() }))}
                          maxLength={2}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-bold uppercase"
                          placeholder="PR"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                          Telefone de Contato
                        </label>
                        <input
                          value={lojaFormData.telefone_contato}
                          onChange={(e) => setLojaFormData(prev => ({ ...prev, telefone_contato: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm"
                          placeholder="(41) 3000-0000"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                          E-mail de Contato
                        </label>
                        <input
                          type="email"
                          value={lojaFormData.email_contato}
                          onChange={(e) => setLojaFormData(prev => ({ ...prev, email_contato: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm"
                          placeholder="rh@gigantepneus.com.br"
                        />
                      </div>

                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                          ID da Pasta Google Drive (Opcional)
                        </label>
                        <input
                          value={lojaFormData.google_drive_folder_id}
                          onChange={(e) => setLojaFormData(prev => ({ ...prev, google_drive_folder_id: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-mono text-xs"
                          placeholder="Ex: 1A2b3C4d5E... (se vazio, usa a pasta raiz configurada)"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700">
                      <div>
                        <div className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">Status da Unidade</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {lojaFormData.ativa ? 'Unidade ativa e disponível para vinculação de vagas.' : 'Unidade inativa.'}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={lojaFormData.ativa}
                          onChange={(e) => setLojaFormData(prev => ({ ...prev, ativa: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                      </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => setLojaModalOpen(false)}
                        className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-black uppercase"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveLoja}
                        disabled={savingLoja || !lojaFormData.nome.trim()}
                        className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase disabled:opacity-60 transition-all flex items-center gap-2"
                      >
                        {savingLoja ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {editingLoja ? 'Salvar Alterações' : 'Criar Unidade'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba: CONFIGURAÇÕES */}
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              
              {/* Menu de Sub-Abas de Configuração */}
              <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-2">
                <button
                  onClick={() => setSettingsSubTab('geral')}
                  className={`text-sm font-black uppercase tracking-widest pb-3 px-2 border-b-2 transition-all ${settingsSubTab === 'geral' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Configurações Gerais
                </button>
                <button
                  onClick={() => setSettingsSubTab('seguranca')}
                  className={`text-sm font-black uppercase tracking-widest pb-3 px-2 border-b-2 transition-all ${settingsSubTab === 'seguranca' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Minha Conta & Segurança
                </button>
                <button
                  onClick={() => setSettingsSubTab('usuarios')}
                  className={`text-sm font-black uppercase tracking-widest pb-3 px-2 border-b-2 transition-all ${settingsSubTab === 'usuarios' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Gestão de Usuários
                </button>
              </div>

              {settingsSubTab === 'geral' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Box de Setup da IA */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-8 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl space-y-6">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                   <div className="space-y-1">
                     <h3 className="font-black text-xl text-gray-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
                       <Sparkles className="text-red-600 h-6 w-6"/> API Keys e Motores de IA
                     </h3>
                     <p className="text-sm text-gray-600 dark:text-gray-300">Configure o endereço da sua VPS (Ollama) ou chaves do Gemini para habilitar a aba de Análise.</p>
                   </div>
                   {geminiSaveStatus === 'saved' && (
                     <div className="bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 px-4 py-2 rounded-2xl text-xs font-black uppercase flex items-center gap-1.5 self-start sm:self-center shadow-sm animate-in zoom-in-95">
                       <Check className="h-4 w-4" /> Salvo com sucesso!
                     </div>
                   )}
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase text-gray-500 dark:text-gray-300">URL do Ollama (VPS)</label>
                      <input type="text" disabled defaultValue="http://128.140.120.73:11434" className="w-full px-5 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 opacity-90" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black uppercase text-gray-500 dark:text-gray-300">Gemini API Key</label>
                        {geminiKey && (
                          <span className="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-600 px-2 py-0.5 rounded-md font-bold uppercase">Ativa</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input 
                          type="password" 
                          value={tempGeminiKey} 
                          onChange={(e) => setTempGeminiKey(e.target.value)} 
                          placeholder="Insira sua chave Gemini API (AIzaSy...)" 
                           className="flex-1 px-5 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 outline-none focus:border-red-600 font-bold text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-4 focus:ring-red-600/10 transition-all text-xs" 
                        />
                        <button
                          onClick={() => handleSaveGeminiKey(tempGeminiKey)}
                          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5 shrink-0"
                        >
                          <Check className="h-4 w-4" /> Salvar
                        </button>
                      </div>
                    </div>
                 </div>
              </div>

              {/* Box de Treinamento de Agentes de IA */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-8 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl space-y-6">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                   <div className="space-y-1">
                     <h3 className="font-black text-xl text-gray-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
                       <Brain className="text-red-600 h-6 w-6"/> Treinamento & Instruções dos Agentes (Copilot)
                     </h3>
                     <p className="text-sm text-gray-600 dark:text-gray-300">Customize o prompt de sistema e as regras de avaliação de cada agente cognitivo de forma independente.</p>
                   </div>
                   
                   <div className="flex items-center gap-3">
                     <button
                       onClick={handleResetPrompts}
                       className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-black uppercase px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5"
                     >
                       <RefreshCw className="h-3.5 w-3.5" /> Padrão
                     </button>
                     <button
                       onClick={handleSavePrompts}
                       className="bg-red-600 text-white hover:bg-red-700 text-xs font-black uppercase px-5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md hover:shadow-lg focus:ring-4 focus:ring-red-600/20"
                     >
                       {promptSaveStatus === 'saved' ? (
                         <>
                           <Check className="h-3.5 w-3.5" /> Salvo!
                         </>
                       ) : (
                         <>
                           <Zap className="h-3.5 w-3.5" /> Salvar Agentes
                         </>
                       )}
                     </button>
                   </div>
                 </div>

                 <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pt-2">
                    {/* Agente 1: Analista de Clima (Pesquisas) */}
                    <div className="space-y-3 bg-gray-50/80 dark:bg-gray-800/90 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-xl">
                            <ClipboardList className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-gray-900 dark:text-white uppercase tracking-tight">Agente Analista de Clima</h4>
                            <p className="text-[10px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Análise de Pesquisas Internas</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                          Este agente processa os volumes de respostas de colaboradores. Edite abaixo as instruções de foco (ex: orientar tom, priorizar críticas construtivas, buscar palavras-chave):
                        </p>
                        <textarea
                          rows={6}
                          value={promptSurveys}
                          onChange={(e) => setPromptSurveys(e.target.value)}
                          placeholder="Digite as diretrizes do agente analista de clima..."
                          className="w-full px-4 py-3 text-xs rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 outline-none focus:border-red-600 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 font-semibold focus:ring-4 focus:ring-red-600/10 transition-all resize-none leading-relaxed"
                        />
                      </div>
                      <div className="pt-2 text-[10px] font-black text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                        <span>ðŸ’¡ O formato de saída JSON da análise é preservado automaticamente</span>
                      </div>
                    </div>

                    {/* Agente 2: Recrutador Cognitivo (Triagem) */}
                    <div className="space-y-3 bg-gray-50/80 dark:bg-gray-800/90 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-xl">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-gray-900 dark:text-white uppercase tracking-tight">Agente Recrutador Cognitivo</h4>
                            <p className="text-[10px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Triagem de Currículos</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                          Este agente avalia a compatibilidade de um candidato com o cargo de interesse. Edite o perfil ideal, a cultura da empresa ou o rigor técnico:
                        </p>
                        <textarea
                          rows={6}
                          value={promptTalents}
                          onChange={(e) => setPromptTalents(e.target.value)}
                          placeholder="Digite as diretrizes de triagem técnica e cultural..."
                          className="w-full px-4 py-3 text-xs rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 outline-none focus:border-red-600 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 font-semibold focus:ring-4 focus:ring-red-600/10 transition-all resize-none leading-relaxed"
                        />
                      </div>
                      <div className="pt-2 text-[10px] font-black text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                        <span>ðŸ’¡ O score e os campos de qualificação serão calculados conforme seu prompt</span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {/* Sub-aba: MINHA CONTA & SEGURANÇA (ALTERAÇÃO DE SENHA) */}
          {settingsSubTab === 'seguranca' && (
            <div className="bg-white dark:bg-gray-900 p-8 sm:p-10 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl w-full max-w-2xl space-y-8 animate-in fade-in duration-300">
              <div className="border-b border-gray-100 dark:border-gray-800 pb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-red-600 mb-1">
                    <Shield className="h-5 w-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Segurança de Acesso</span>
                  </div>
                  <h3 className="font-black text-2xl text-gray-900 dark:text-white uppercase tracking-tighter">
                    Alterar Minha Senha
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
                    Usuário autenticado: <strong className="text-gray-900 dark:text-white font-mono">{currentUser?.email || 'Sessão ativa'}</strong>
                  </p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl text-red-600 shrink-0">
                  <KeyRound className="h-6 w-6" />
                </div>
              </div>

              {/* Informação sobre ausência de SMTP */}
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-medium space-y-1">
                <div className="font-black uppercase flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Informação de Segurança
                </div>
                <p>
                  Por motivos de integridade e ausência de serviço SMTP ativo no momento, a alteração de credencial é realizada de forma imediata e autenticada no Supabase Auth.
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-6">
                {/* Senha Atual */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                    Senha Atual *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold text-sm dark:text-white"
                      placeholder="Digite sua senha atual"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 p-1"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Nova Senha */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                    Nova Senha *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold text-sm dark:text-white"
                      placeholder="Mínimo de 8 caracteres com letras, números e símbolos"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 p-1"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirmar Nova Senha */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">
                    Confirmar Nova Senha *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold text-sm dark:text-white"
                      placeholder="Repita a nova senha exatamente igual"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 p-1"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Regras da Senha Forte */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400 space-y-1.5">
                  <div className="font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">Requisitos da política de senha:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-medium">
                    <span className={newPassword.length >= 8 ? 'text-green-600 font-bold' : ''}>• No mínimo 8 caracteres</span>
                    <span className={/[A-Z]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• Pelo menos 1 letra maiúscula</span>
                    <span className={/[a-z]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• Pelo menos 1 letra minúscula</span>
                    <span className={/[0-9]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• Pelo menos 1 número</span>
                    <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• Pelo menos 1 símbolo (!@#$...)</span>
                  </div>
                </div>

                {passwordMsg.text && (
                  <div className={`p-4 rounded-2xl text-xs font-bold ${passwordMsg.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900/30' : 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300 border border-green-200 dark:border-green-900/30'}`}>
                    {passwordMsg.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {changingPassword ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
                  Atualizar Senha
                </button>
              </form>
            </div>
          )}

          {settingsSubTab === 'usuarios' && (
            <div className="bg-white dark:bg-gray-900 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl w-full max-w-2xl">
              <div className="mb-8 border-b border-gray-100 dark:border-gray-800 pb-6">
                <h3 className="font-black text-xl text-gray-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                  <Users className="text-red-600 h-6 w-6" /> Adicionar Novo Usuário
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium">
                  Configure acesso ao painel administrativo para novos recrutadores ou gestores.
                </p>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">E-mail de Acesso</label>
                  <input 
                    type="email" 
                    required
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold text-sm dark:text-white"
                    placeholder="nome@gigante.com.br"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-300">Senha Padrão</label>
                  <input 
                    type="password" 
                    required
                    minLength={6}
                    value={newUserPassword}
                    onChange={e => setNewUserPassword(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold text-sm dark:text-white"
                    placeholder="No mínimo 6 caracteres"
                  />
                </div>

                {userMsg.text && (
                  <div className={`p-4 rounded-2xl text-sm font-bold ${userMsg.type === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-900/30' : 'bg-green-50 text-green-600 dark:bg-green-900/30'}`}>
                    {userMsg.text}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={creatingUser}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {creatingUser ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  Cadastrar Usuário
                </button>
              </form>
            </div>
          )}

        </div>
      )}
      
        </div>
      </main>

      {/* Detail Modal (Banco de Talentos) */}
      {selectedResume && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-900 rounded-[3rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100 dark:border-gray-800">
            <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/30 dark:bg-gray-800/30">
              <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Detalhes do Candidato</h2>
              <button onClick={() => setSelectedResume(null)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-full transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-10 overflow-y-auto flex-grow space-y-10">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
                <div>
                  <div className="text-4xl font-black text-gray-900 dark:text-white leading-none uppercase tracking-tighter mb-4">{selectedResume.nome}</div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase">
                    <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 tracking-widest"><MapPin className="h-3.5 w-3.5" /> {selectedResume.cidade}</span>
                    <span className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-xl tracking-widest"><Briefcase className="h-3.5 w-3.5" /> {selectedResume.vaga_interesse}</span>
                  </div>
                  <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                    <p><strong>E-mail:</strong> {selectedResume.email}</p>
                    <p><strong>Telefone:</strong> {selectedResume.telefone}</p>
                  </div>
                  {selectedResume.resumo && (
                    <div className="mt-6 p-5 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Resumo / Apresentação</h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {selectedResume.resumo}
                      </p>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => handleVerCurriculo(selectedResume)}
                  className="bg-black dark:bg-white text-white dark:text-black px-8 py-4 rounded-2xl font-black uppercase flex items-center justify-center gap-3 transition-all shadow-xl text-sm group active:scale-95"
                >
                  <Download className="h-5 w-5 group-hover:translate-y-0.5 transition-transform" /> Ver Currículo
                </button>
              </div>
            </div>

            <div className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              <button 
                onClick={() => setSelectedResume(null)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-black uppercase text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-all shadow-sm"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* COMPONENTES DE GRÁFICO PERSONALIZADOS */

const SVGLineChart = ({ data }: { data: {date: string, count: number}[] }) => {
  if (data.length === 0) return <div className="bg-white dark:bg-gray-900 p-10 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl h-80 flex items-center justify-center text-gray-400 font-bold uppercase">Sem dados</div>;
  
  const max = Math.max(...data.map(d => d.count), 1);
  const w = 600, h = 200, padding = 40;
  
  const getPoint = (index: number, count: number) => {
    const x = padding + (index * ((w - padding * 2) / Math.max(data.length - 1, 1)));
    const y = h - padding - ((count / max) * (h - padding * 2));
    return {x, y};
  };

  const points = data.map((d, i) => getPoint(i, d.count));
  const pathData = points.length > 1 
    ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}` 
    : `M ${padding},${h-padding} L ${w-padding},${h-padding}`;

  // Area under line
  const areaData = `${pathData} L ${points[points.length-1]?.x || w-padding},${h-padding} L ${points[0]?.x || padding},${h-padding} Z`;

  return (
    <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl relative overflow-hidden group">
      <h3 className="font-black text-xs uppercase text-gray-400 dark:text-gray-500 mb-2 tracking-[0.2em] flex items-center gap-3">
         <TrendingUp className="h-4 w-4" /> Volume de Registros no Tempo
      </h3>
      <div className="w-full overflow-x-auto custom-scrollbar pt-8">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto drop-shadow-xl min-w-[500px]">
          <defs>
            <linearGradient id="gradientLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Grid lines */}
          <line x1={padding} y1={h-padding} x2={w-padding} y2={h-padding} stroke="#e5e7eb" strokeWidth="2" className="dark:stroke-gray-800" strokeDasharray="5,5" />
          <line x1={padding} y1={padding} x2={w-padding} y2={padding} stroke="#e5e7eb" strokeWidth="1" className="dark:stroke-gray-800" strokeDasharray="5,5" />
          
          {/* Area */}
          {points.length > 1 && <path d={areaData} fill="url(#gradientLine)" className="animate-in fade-in duration-1000 delay-300" />}
          
          {/* Line */}
          <path d={pathData} fill="none" stroke="#0d9488" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="animate-in slide-in-from-left duration-1000" />
          
          {/* Points & Labels */}
          {data.map((d, i) => {
            const p = getPoint(i, d.count);
            return (
              <g key={i} className="hover:opacity-80 cursor-pointer transition-opacity">
                <circle cx={p.x} cy={p.y} r="6" fill="#fff" stroke="#0d9488" strokeWidth="3" className="animate-in zoom-in duration-700" style={{animationDelay: `${i * 100}ms`}} />
                <text x={p.x} y={h - 10} fill="#9ca3af" fontSize="10" fontWeight="bold" textAnchor="middle">{d.date}</text>
                <text x={p.x} y={p.y - 15} fill="#0d9488" fontSize="12" fontWeight="900" textAnchor="middle">{d.count}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const HeatmapChart = ({ data, total }: { data: number[], total: number }) => {
  const max = Math.max(...data, 1);
  
  // Agrupa por períodos do dia para ficar mais fácil de ver no design
  const periods = [
    { label: 'Madrugada (0h-6h)', hours: data.slice(0, 6) },
    { label: 'Manhã (6h-12h)', hours: data.slice(6, 12) },
    { label: 'Tarde (12h-18h)', hours: data.slice(12, 18) },
    { label: 'Noite (18h-24h)', hours: data.slice(18, 24) }
  ];

  const getColorOpacity = (val: number) => {
    if (val === 0) return 'bg-gray-100 dark:bg-gray-800';
    const intensity = Math.min((val / max) * 100, 100);
    if (intensity > 75) return 'bg-red-700';
    if (intensity > 40) return 'bg-red-500';
    return 'bg-red-300';
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl h-full flex flex-col">
      <h3 className="font-black text-xs uppercase text-gray-400 dark:text-gray-500 mb-6 tracking-[0.2em] flex items-center gap-3">
         <BarChart3 className="h-4 w-4" /> Mapa de Calor (Horários)
      </h3>
      <div className="flex-grow flex flex-col justify-between space-y-4">
        {periods.map((p, i) => (
          <div key={i}>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">{p.label}</div>
            <div className="flex gap-1">
              {p.hours.map((val, hIdx) => {
                const hourNum = (i * 6) + hIdx;
                return (
                  <div key={hIdx} className="group relative flex-1">
                    <div className={`h-8 rounded-md w-full ${getColorOpacity(val)} transition-all hover:scale-110 hover:shadow-lg cursor-pointer`}></div>
                    <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded pointer-events-none transition-opacity whitespace-nowrap z-10">
                      {hourNum}h: {val} registros
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const KPICard = ({ title, value, icon, color }: any) => (
  <div className="bg-white dark:bg-gray-900 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-xl hover:translate-y-[-5px] transition-all group">
    <div className={`bg-${color}-100 dark:bg-${color}-900/30 p-3 rounded-2xl w-fit mb-6 group-hover:rotate-12 transition-transform`}>{icon}</div>
    <div className="text-4xl font-black text-gray-900 dark:text-white mb-1">{value}</div>
    <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">{title}</div>
  </div>
);

const ChartCard = ({ title, data, total }: any) => (
  <div className="bg-white dark:bg-gray-900 p-10 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl">
    <h3 className="font-black text-xs uppercase text-gray-400 dark:text-gray-500 mb-8 tracking-[0.2em] flex items-center gap-3">
       <BarChart3 className="h-4 w-4" /> {title}
    </h3>
    <div className="space-y-6">
      {Object.entries(data).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([label, count]: any) => (
        <div key={label} className="group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase">{label}</span>
            <span className="text-xs font-black text-red-600">{count}</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-red-600 rounded-full transition-all duration-1000" style={{ width: `${(count / total) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ConfigCard = ({ title, items, onAdd, onDelete, newItem, setNewItem }: any) => (
  <div className="bg-white dark:bg-gray-900 p-10 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl flex flex-col h-[500px]">
    <h3 className="font-black text-xl text-gray-900 dark:text-white uppercase tracking-tighter mb-8">{title}</h3>
    <div className="flex gap-3 mb-8">
      <input 
        type="text" 
        className="flex-grow px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 font-bold text-sm"
        placeholder="Adicionar..."
        value={newItem}
        onChange={e => setNewItem(e.target.value)}
      />
      <button onClick={onAdd} className="bg-red-600 text-white p-4 rounded-2xl hover:bg-red-700 transition-all shadow-lg active:scale-90"><Plus className="h-6 w-6" /></button>
    </div>
    <div className="overflow-y-auto flex-grow space-y-3 pr-2 custom-scrollbar">
      {items.map((item: ConfigItem) => (
        <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl group transition-all hover:bg-red-50 dark:hover:bg-red-900/10">
          <span className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-tight">{item.nome}</span>
          <button onClick={() => onDelete(item.id)} className="text-gray-300 hover:text-red-600 p-2 transition-colors"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  </div>
);

export default AdminDashboard;

