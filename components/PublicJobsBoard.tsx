import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { ConfigItem } from '../types';
import { parseJobLandingFromRequisitos } from '../jobsService';
import { 
  MapPin, BriefcaseBusiness, ArrowRight, Loader2, CalendarDays, 
  BadgeDollarSign, Share2, Filter, RotateCcw, Building2, ChevronLeft, 
  ChevronRight, Search, X, CheckCircle2, Sparkles, AlertCircle
} from 'lucide-react';
import bannerGigante from '../imagens/banner LP - Gigante Pneus.png';

interface JobItemWithLanding {
  cargo: ConfigItem & {
    loja_id?: string | null;
    loja_nome?: string | null;
    loja_cidade?: string | null;
    loja_estado?: string | null;
  };
  landing: ReturnType<typeof parseJobLandingFromRequisitos>;
  uf: string;
  cidade: string;
  cidadeUf: string;
  lojaId: string;
  lojaNome: string;
}

interface LojaRecord {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
  ativa?: boolean;
}

interface GroupedCargo {
  cargoKey: string;
  titulo: string;
  landing: ReturnType<typeof parseJobLandingFromRequisitos>;
  cidadeContexto?: string;
  vagas: {
    vagaId: string;
    lojaId: string;
    lojaNome: string;
    cidade: string;
    uf: string;
    cidadeUf: string;
  }[];
}

const ITEMS_PER_PAGE = 6;

const PublicJobsBoard: React.FC = () => {
  const [jobs, setJobs] = useState<ConfigItem[]>([]);
  const [lojas, setLojas] = useState<LojaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Seletores dinâmicos de localidade
  // 'todas' significa sem filtro de cidade; string vazia ou valor específico filtra a cidade
  const [selectedCidadeUf, setSelectedCidadeUf] = useState<string>('todas');
  const [selectedLoja, setSelectedLoja] = useState<string>('todas');

  // Modal de seleção de unidade para cargos com múltiplas vagas
  const [modalGroup, setModalGroup] = useState<GroupedCargo | null>(null);

  // Paginação
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Carrega tanto os cargos públicos quanto as lojas ativas
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [cargosRes, lojasRes] = await Promise.all([
          supabase
            .from('cargos_publicos')
            .select('*')
            .order('titulo', { ascending: true }),
          supabase
            .from('lojas')
            .select('id, nome, cidade, estado, ativa')
            .eq('ativa', true)
            .order('estado', { ascending: true })
            .order('cidade', { ascending: true })
        ]);

        if (!isMounted) return;

        if (cargosRes.error) {
          console.warn('Erro ao carregar cargos_publicos:', cargosRes.error);
          setHasError(true);
          setJobs([]);
        } else {
          const mappedJobs: ConfigItem[] = (cargosRes.data || []).map((row: any) => ({
            id: row.id,
            nome: row.titulo,
            requisitos: row.requisitos,
            created_at: new Date().toISOString(),
            ...row,
          }));
          setJobs(mappedJobs);
        }

        if (lojasRes.error) {
          console.warn('Erro ao carregar lojas ativas:', lojasRes.error);
          setLojas([]);
        } else {
          setLojas(lojasRes.data || []);
        }
      } catch (error) {
        if (!isMounted) return;
        console.warn('Erro ao conectar ao banco:', error);
        setHasError(true);
        setJobs([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, []);

  // Normalização de vagas publicadas e ativas
  const activeJobs = useMemo<JobItemWithLanding[]>(() => {
    return jobs
      .map(cargo => {
        const landing = parseJobLandingFromRequisitos(cargo);
        if ((cargo as any).publicada === true) {
          landing.published = true;
        }

        const cargoAny = cargo as any;
        const uf = (cargoAny.loja_estado || '').trim().toUpperCase();
        const cidade = (cargoAny.loja_cidade || '').trim();
        const cidadeUf = cidade && uf ? `${cidade} — ${uf}` : (cidade || 'Rede Nacional');
        const lojaId = cargoAny.loja_id || 'corporativo';
        const lojaNome = (cargoAny.loja_nome || 'Rede / Corporativo').trim();

        return { 
          cargo: cargoAny, 
          landing, 
          uf, 
          cidade,
          cidadeUf,
          lojaId, 
          lojaNome 
        };
      })
      .filter(item => item.landing.published);
  }, [jobs]);

  // Lista dinâmica de Cidades com lojas ativas no formato "Cidade — UF", sem duplicidades e ordenada
  const availableCidades = useMemo<string[]>(() => {
    const cidadeSet = new Set<string>();

    // 1. Prioriza cidades vindas da tabela oficial de lojas ativas
    lojas.forEach(l => {
      const c = (l.cidade || '').trim();
      const u = (l.estado || '').trim().toUpperCase();
      if (c && u) {
        cidadeSet.add(`${c} — ${u}`);
      } else if (c) {
        cidadeSet.add(c);
      }
    });

    // 2. Se a tabela lojas estiver vazia (fallback), extrai das vagas ativas
    if (cidadeSet.size === 0) {
      activeJobs.forEach(j => {
        if (j.cidade && j.uf) {
          cidadeSet.add(`${j.cidade} — ${j.uf}`);
        } else if (j.cidade) {
          cidadeSet.add(j.cidade);
        }
      });
    }

    return Array.from(cidadeSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [lojas, activeJobs]);

  // Lista dinâmica de Unidades da cidade selecionada
  const availableLojasForCidade = useMemo<LojaRecord[]>(() => {
    if (!selectedCidadeUf || selectedCidadeUf === 'todas') {
      return [];
    }

    const [cidadeNome, ufNome] = selectedCidadeUf.includes('—')
      ? selectedCidadeUf.split('—').map(s => s.trim())
      : [selectedCidadeUf.trim(), ''];

    // Filtra das lojas ativas
    const matchedLojas = lojas.filter(l => {
      const matchCidade = (l.cidade || '').trim().toLowerCase() === cidadeNome.toLowerCase();
      const matchUf = !ufNome || (l.estado || '').trim().toUpperCase() === ufNome.toUpperCase();
      return matchCidade && matchUf;
    });

    if (matchedLojas.length > 0) {
      return matchedLojas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    // Fallback caso venha das vagas
    const map = new Map<string, LojaRecord>();
    activeJobs.forEach(j => {
      if (j.cidadeUf === selectedCidadeUf && j.lojaId) {
        if (!map.has(j.lojaId)) {
          map.set(j.lojaId, {
            id: j.lojaId,
            nome: j.lojaNome,
            cidade: j.cidade,
            estado: j.uf,
            ativa: true
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [selectedCidadeUf, lojas, activeJobs]);

  // Handlers para seleção de localidade
  const handleCidadeChange = (cidadeUf: string) => {
    setSelectedCidadeUf(cidadeUf);
    setSelectedLoja('todas');
    setCurrentPage(1);
  };

  const handleLojaChange = (lojaId: string) => {
    setSelectedLoja(lojaId);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSelectedCidadeUf('todas');
    setSelectedLoja('todas');
    setCurrentPage(1);
  };

  const hasActiveFilters = selectedCidadeUf !== 'todas' || selectedLoja !== 'todas';

  // Filtra as vagas baseado na Cidade e Unidade selecionadas
  const filteredJobs = useMemo(() => {
    return activeJobs.filter(item => {
      if (selectedCidadeUf !== 'todas' && item.cidadeUf !== selectedCidadeUf) {
        return false;
      }
      if (selectedLoja !== 'todas' && item.lojaId !== selectedLoja) {
        return false;
      }
      return true;
    });
  }, [activeJobs, selectedCidadeUf, selectedLoja]);

  // Agrupamento das vagas por Cargo/Título (Elimina a repetição de cards na tela)
  const groupedJobs = useMemo<GroupedCargo[]>(() => {
    const groupsMap = new Map<string, GroupedCargo>();

    filteredJobs.forEach(job => {
      const cargoTitle = (job.cargo.titulo || job.cargo.nome || '').trim();
      const cargoKey = cargoTitle.toLowerCase();

      if (!groupsMap.has(cargoKey)) {
        groupsMap.set(cargoKey, {
          cargoKey,
          titulo: cargoTitle,
          landing: job.landing,
          cidadeContexto: selectedCidadeUf !== 'todas' ? selectedCidadeUf : undefined,
          vagas: []
        });
      }

      const group = groupsMap.get(cargoKey)!;
      // Adiciona a vaga ao grupo (se ainda não existir para esta loja)
      const existing = group.vagas.find(v => v.vagaId === job.cargo.id);
      if (!existing) {
        group.vagas.push({
          vagaId: job.cargo.id,
          lojaId: job.lojaId,
          lojaNome: job.lojaNome,
          cidade: job.cidade,
          uf: job.uf,
          cidadeUf: job.cidadeUf
        });
      }
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }, [filteredJobs, selectedCidadeUf]);

  // Contadores globais para o Banner / Header
  const totalVagasPublicadas = activeJobs.length;
  const totalCargosDistintos = useMemo(() => {
    const set = new Set<string>();
    activeJobs.forEach(j => {
      const t = (j.cargo.titulo || j.cargo.nome || '').trim().toLowerCase();
      if (t) set.add(t);
    });
    return set.size;
  }, [activeJobs]);

  const totalUnidadesContratando = useMemo(() => {
    const set = new Set<string>();
    activeJobs.forEach(j => {
      if (j.lojaId) set.add(j.lojaId);
    });
    return set.size;
  }, [activeJobs]);

  // Paginação dos CARGOS agrupados
  const totalPages = Math.ceil(groupedJobs.length / ITEMS_PER_PAGE) || 1;
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return groupedJobs.slice(start, start + ITEMS_PER_PAGE);
  }, [groupedJobs, currentPage]);

  const handleShare = async (title: string, id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/vagas/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Confira esta vaga na Gigante Pneus: ${title}`, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert('Link da vaga copiado com sucesso!');
        return;
      }
      window.prompt('Copie o link da vaga:', url);
    } catch (err) {
      console.error('Falha ao compartilhar:', err);
    }
  };

  // Fechar modal ao pressionar ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalGroup(null);
      }
    };
    if (modalGroup) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalGroup]);

  return (
    <div className="bg-[#f5f8ff] dark:bg-[#020817] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">

        {/* Banner LP Gigante Pneus */}
        <img
          src={bannerGigante}
          alt="Carreiras Gigante Pneus"
          className="w-full rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-2xl object-cover mb-8"
        />

        {/* Cabeçalho Institucional com Contadores Oficiais */}
        <div className="rounded-[2rem] border border-red-600/20 bg-gradient-to-r from-red-600/10 via-gray-100/50 to-gray-200/50 dark:from-red-950/20 dark:to-gray-900/20 backdrop-blur-sm p-6 md:p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <span className="inline-flex bg-[#ffcc00] text-[#072a5a] px-3.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-sm">
                Carreiras Gigante Pneus
              </span>
              <h1 className="text-3xl md:text-5xl font-black tracking-tighter leading-[0.95] text-gray-900 dark:text-white">
                Vagas Abertas
              </h1>
              <p className="text-gray-700 dark:text-gray-300 max-w-2xl font-medium text-sm md:text-base leading-relaxed">
                Venha fazer parte da maior rede de centros automotivos e autocenters do Brasil. Encontre a vaga ideal para a sua cidade.
              </p>
            </div>

            {/* Indicador de Quantidade de Vagas: Contagem precisa e transparente */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-white/90 dark:bg-gray-900/90 rounded-2xl p-3 sm:p-4 border border-gray-200 dark:border-gray-800 shadow-md shrink-0">
              <div className="text-center px-1 sm:px-2">
                <span className="block text-2xl md:text-3xl font-black text-red-600 dark:text-red-400">
                  {totalVagasPublicadas}
                </span>
                <span className="block text-[10px] sm:text-[11px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-tight">
                  {totalVagasPublicadas === 1 ? 'Vaga Ativa' : 'Vagas Ativas'}
                </span>
              </div>
              <div className="text-center px-1 sm:px-2 border-x border-gray-200 dark:border-gray-800">
                <span className="block text-2xl md:text-3xl font-black text-[#072a5a] dark:text-blue-300">
                  {totalCargosDistintos}
                </span>
                <span className="block text-[10px] sm:text-[11px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-tight">
                  {totalCargosDistintos === 1 ? 'Cargo' : 'Cargos'}
                </span>
              </div>
              <div className="text-center px-1 sm:px-2">
                <span className="block text-2xl md:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  {totalUnidadesContratando}
                </span>
                <span className="block text-[10px] sm:text-[11px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-tight">
                  {totalUnidadesContratando === 1 ? 'Unidade' : 'Unidades'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* NOVA SEÇÃO DE BUSCA: Onde você gostaria de trabalhar? */}
        <section 
          aria-label="Onde você gostaria de trabalhar?" 
          className="bg-white dark:bg-gray-900 rounded-[2rem] border-2 border-red-600/30 dark:border-red-600/20 shadow-xl p-6 md:p-8 mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 text-red-600 dark:text-red-400 font-black text-xs uppercase tracking-wider mb-1">
                <MapPin className="h-4 w-4" />
                <span>Localização de Trabalho</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                Onde você gostaria de trabalhar?
              </h2>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-1">
                Escolha a cidade ou unidade de sua preferência e descubra as oportunidades disponíveis.
              </p>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 self-start md:self-auto text-xs font-black uppercase text-red-600 hover:text-red-700 dark:text-red-400 transition-colors bg-red-50 dark:bg-red-950/30 px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/40"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Ver todas as cidades
              </button>
            )}
          </div>

          {/* Seletores Encadeados (Mobile: coluna / Desktop: grid 2 colunas alinhadas) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Seletor 1: Cidade (Dinâmica de cidades com lojas ativas) */}
            <div className="space-y-2">
              <label htmlFor="select-cidade" className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-red-600" />
                  1. Cidade
                </span>
                <span className="text-[11px] font-bold text-gray-400 lowercase">
                  ({availableCidades.length} cidades ativas)
                </span>
              </label>
              <div className="relative">
                <select
                  id="select-cidade"
                  value={selectedCidadeUf}
                  onChange={(e) => handleCidadeChange(e.target.value)}
                  className="w-full appearance-none px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/90 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 cursor-pointer transition-all shadow-sm"
                >
                  <option value="todas">Todas as cidades (Ver rede completa)</option>
                  {availableCidades.map(cidadeUf => (
                    <option key={cidadeUf} value={cidadeUf}>
                      {cidadeUf}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                  <span className="text-xs">▼</span>
                </div>
              </div>
            </div>

            {/* Seletor 2: Unidade (Opcional, encadeado com a cidade selecionada) */}
            <div className="space-y-2">
              <label htmlFor="select-loja" className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-[#072a5a] dark:text-blue-400" />
                  2. Unidade (Opcional)
                </span>
                {selectedCidadeUf !== 'todas' && (
                  <span className="text-[11px] font-bold text-gray-400">
                    {availableLojasForCidade.length} {availableLojasForCidade.length === 1 ? 'loja nesta cidade' : 'lojas nesta cidade'}
                  </span>
                )}
              </label>
              <div className="relative">
                <select
                  id="select-loja"
                  value={selectedLoja}
                  onChange={(e) => handleLojaChange(e.target.value)}
                  disabled={selectedCidadeUf === 'todas'}
                  className="w-full appearance-none px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/90 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 cursor-pointer transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedCidadeUf === 'todas' ? (
                    <option value="todas">Todas as unidades (selecione uma cidade para filtrar)</option>
                  ) : (
                    <>
                      <option value="todas">Todas as unidades de {selectedCidadeUf.split('—')[0].trim()}</option>
                      {availableLojasForCidade.map(loja => (
                        <option key={loja.id} value={loja.id}>
                          {loja.nome}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                  <span className="text-xs">▼</span>
                </div>
              </div>
            </div>
          </div>

          {/* Dica amigável de candidatura espontânea rápida */}
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#ffcc00] shrink-0" />
              <span>Não encontrou sua unidade? Envie seu currículo para nosso Banco de Talentos.</span>
            </span>
            <Link
              to="/cadastro"
              className="font-black text-red-600 dark:text-red-400 hover:underline uppercase tracking-tight shrink-0"
            >
              Cadastrar Currículo Geral &rarr;
            </Link>
          </div>
        </section>

        {/* Conteúdo de Vagas */}
        {loading ? (
          <div className="min-h-[30vh] flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-10">
            <Loader2 className="h-10 w-10 animate-spin text-red-600 mb-3" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Carregando oportunidades da Gigante Pneus...
            </p>
          </div>
        ) : hasError ? (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-amber-500/30 p-8 text-center shadow-md">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              Estamos atualizando nosso catálogo de vagas
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
              Você pode cadastrar seu perfil agora no Banco de Talentos para ser chamado assim que novas oportunidades forem abertas.
            </p>
            <div className="mt-5">
              <Link 
                to="/cadastro" 
                className="inline-flex bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase transition-all shadow-md"
              >
                Cadastrar no Banco de Talentos
              </Link>
            </div>
          </div>
        ) : activeJobs.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-10 text-center space-y-4">
            <p className="text-base font-bold text-gray-700 dark:text-gray-300">
              Nenhuma vaga publicada no momento.
            </p>
            <Link 
              to="/cadastro" 
              className="inline-flex bg-[#072a5a] hover:bg-[#0a3b8f] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all"
            >
              Cadastrar no Banco de Talentos
            </Link>
          </div>
        ) : groupedJobs.length === 0 ? (
          /* Mensagem Amigável quando a cidade selecionada não possui vagas no momento */
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] border-2 border-dashed border-gray-300 dark:border-gray-800 p-8 md:p-12 text-center space-y-5 shadow-sm">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 rounded-3xl flex items-center justify-center mx-auto text-red-600">
              <Building2 className="h-8 w-8" />
            </div>
            
            <div className="max-w-xl mx-auto space-y-2">
              <h3 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">
                Nenhuma vaga aberta para {selectedCidadeUf !== 'todas' ? selectedCidadeUf : 'esta seleção'} no momento
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Temos unidades ativas na região, mas no momento nenhuma vaga específica foi publicada. 
                Você pode cadastrar seu currículo no nosso <strong>Banco de Talentos</strong> para ser convocado prioritariamente!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                to="/cadastro"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3.5 rounded-xl text-xs font-black uppercase transition-all shadow-md active:scale-98"
              >
                Cadastrar Currículo no Banco de Talentos <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={handleClearFilters}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 px-5 py-3.5 rounded-xl text-xs font-black uppercase transition-all"
              >
                <RotateCcw className="h-4 w-4" /> Ver vagas em outras cidades
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Indicador de resultados agrupados */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold text-gray-600 dark:text-gray-400 px-1">
              <span>
                Exibindo <strong className="text-gray-900 dark:text-white">{groupedJobs.length}</strong> {groupedJobs.length === 1 ? 'função disponível' : 'funções disponíveis'} 
                {selectedCidadeUf !== 'todas' ? ` em ${selectedCidadeUf}` : ' em toda a rede'}
                {selectedLoja !== 'todas' && ' (unidade específica)'}
              </span>
              <span className="text-[11px] text-gray-400">
                Total de {filteredJobs.length} {filteredJobs.length === 1 ? 'vaga aberta' : 'vagas abertas'}
              </span>
            </div>

            {/* Grid Responsivo de CARGOS (1 card por cargo, sem duplicações) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {paginatedGroups.map((group) => {
                const totalUnidades = group.vagas.length;
                const isMultiUnit = totalUnidades > 1;
                const singleVaga = group.vagas[0];

                return (
                  <article
                    key={group.cargoKey}
                    className="group bg-white dark:bg-[#0b1220] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col justify-between"
                  >
                    {/* Cabeçalho do Card */}
                    <div className="bg-gradient-to-r from-red-600/5 via-transparent to-transparent border-b border-gray-200 dark:border-gray-800 p-5 md:p-6">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex bg-[#ffcc00] text-[#072a5a] px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm">
                            Vaga aberta
                          </span>

                          {/* Badge de Disponibilidade por Unidade */}
                          {isMultiUnit ? (
                            <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 text-[#072a5a] dark:text-blue-300 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border border-blue-200/60 dark:border-blue-900/40">
                              <Building2 className="h-3 w-3 text-blue-600 shrink-0" />
                              Disponível em {totalUnidades} unidades
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border border-red-200/50 dark:border-red-900/30 truncate max-w-[260px]">
                              <Building2 className="h-3 w-3 text-red-600 shrink-0" />
                              <span className="truncate">{singleVaga.lojaNome}</span>
                            </span>
                          )}
                        </div>

                        <h2 className="text-xl md:text-2xl font-black tracking-tight leading-snug text-gray-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                          {group.titulo}
                        </h2>
                      </div>
                    </div>

                    {/* Corpo do Card com detalhes da vaga */}
                    <div className="p-5 md:p-6 space-y-4 flex-grow flex flex-col justify-between">
                      <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed line-clamp-2">
                        {group.landing.shortDescription || 'Oportunidade para atuar em nossos centros automotivos com foco em excelência e desenvolvimento profissional.'}
                      </p>

                      {/* Chips de Informações */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2">
                        <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold truncate">
                          <MapPin className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" />
                          <span className="truncate">
                            {isMultiUnit
                              ? (selectedCidadeUf !== 'todas' ? `${selectedCidadeUf} (${totalUnidades} lojas)` : `Múltiplas cidades (${totalUnidades} lojas)`)
                              : (singleVaga.cidadeUf || group.landing.location)}
                          </span>
                        </p>
                        <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                          <BriefcaseBusiness className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" />
                          {group.landing.workModel || 'Presencial'}
                        </p>
                        <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                          <BadgeDollarSign className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" />
                          {group.landing.salary || 'A combinar'}
                        </p>
                        <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                          <CalendarDays className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" />
                          Atualizado hoje
                        </p>
                      </div>

                      {/* Ações do Card */}
                      <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        {isMultiUnit ? (
                          /* Se há múltiplas unidades, abre o Modal Elegante de Seleção */
                          <button
                            type="button"
                            onClick={() => setModalGroup(group)}
                            className="flex-1 inline-flex justify-center items-center gap-2 bg-[#ffcc00] hover:bg-[#f2c200] text-[#072a5a] px-5 py-3 rounded-xl font-black uppercase text-xs transition-all shadow-sm hover:shadow-md active:scale-98"
                          >
                            Ver unidades ({totalUnidades}) <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : (
                          /* Se há apenas 1 unidade, direciona diretamente para a rota real da vaga */
                          <Link
                            to={`/vagas/${singleVaga.vagaId}`}
                            className="flex-1 inline-flex justify-center items-center gap-2 bg-[#ffcc00] hover:bg-[#f2c200] text-[#072a5a] px-5 py-3 rounded-xl font-black uppercase text-xs transition-all shadow-sm hover:shadow-md active:scale-98"
                          >
                            Saiba mais <ArrowRight className="h-4 w-4" />
                          </Link>
                        )}

                        <button
                          type="button"
                          onClick={() => handleShare(group.titulo, singleVaga.vagaId)}
                          className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#072a5a] dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 px-4 py-3 rounded-xl text-xs font-black uppercase transition-all shadow-sm"
                          title="Compartilhar vaga"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Controles de Paginação */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                  Página <strong className="text-gray-900 dark:text-white">{currentPage}</strong> de {totalPages} ({groupedJobs.length} funções)
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-black uppercase border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      const isActive = pageNum === currentPage;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
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
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-black uppercase border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Próxima <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal / Drawer Elegante de Seleção de Unidades */}
        {modalGroup && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalGroup(null);
            }}
          >
            <div 
              className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-cargo-title"
            >
              {/* Cabeçalho da Modal */}
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4 bg-gradient-to-r from-red-600/5 via-transparent to-transparent">
                <div>
                  <span className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 border border-red-200/50 dark:border-red-900/30">
                    <Building2 className="h-3 w-3" />
                    {modalGroup.vagas.length} {modalGroup.vagas.length === 1 ? 'Unidade Disponível' : 'Unidades Disponíveis'}
                  </span>
                  <h3 id="modal-cargo-title" className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">
                    {modalGroup.titulo}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Selecione abaixo a unidade de sua preferência para iniciar sua candidatura:
                  </p>
                </div>
                <button
                  onClick={() => setModalGroup(null)}
                  className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                  title="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Lista Scrollável de Unidades */}
              <div className="p-6 overflow-y-auto space-y-3.5 divide-y divide-gray-100 dark:divide-gray-800">
                {modalGroup.vagas.map((vaga) => (
                  <div 
                    key={vaga.vagaId} 
                    className="pt-3.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group/item"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-red-600 shrink-0" />
                        <h4 className="font-black text-sm text-gray-900 dark:text-white group-hover/item:text-red-600 dark:group-hover/item:text-red-400 transition-colors">
                          {vaga.lojaNome}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 pl-6">
                        <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                        <span>{vaga.cidadeUf}</span>
                      </p>
                    </div>

                    <Link
                      to={`/vagas/${vaga.vagaId}`}
                      onClick={() => setModalGroup(null)}
                      className="inline-flex items-center justify-center gap-1.5 bg-[#ffcc00] hover:bg-[#f2c200] text-[#072a5a] px-4 py-2.5 rounded-xl font-black uppercase text-xs transition-all shadow-sm active:scale-98 shrink-0 sm:self-center"
                    >
                      Candidatar-se nesta unidade <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>

              {/* Rodapé da Modal */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalGroup(null)}
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CTA Permanente: Banco de Talentos / Candidatura Espontânea */}
        <section aria-label="Banco de Talentos" className="mt-12 bg-[#eef4ff] dark:bg-[#0b1220] rounded-3xl border border-[#d7e5ff] dark:border-gray-800 p-6 md:p-10 text-center shadow-sm">
          <div className="max-w-2xl mx-auto space-y-3">
            <span className="inline-flex bg-[#072a5a] text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
              Banco de Talentos
            </span>
            <h3 className="text-2xl md:text-3xl font-black text-[#072a5a] dark:text-blue-200">
              Não encontrou uma vaga para o seu perfil?
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
              Cadastre seu currículo no nosso banco geral. Quando abrirmos novas vagas na sua cidade ou região, entraremos em contato diretamente com você.
            </p>
            <div className="pt-2">
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-2 border-2 border-[#0a3b8f] text-[#0a3b8f] dark:text-blue-300 dark:border-blue-300 hover:bg-[#0a3b8f] hover:text-white dark:hover:bg-blue-300 dark:hover:text-gray-900 px-7 py-3.5 rounded-xl text-xs font-black uppercase transition-all shadow-md active:scale-98"
              >
                Cadastrar meu currículo agora <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default PublicJobsBoard;
