import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { ConfigItem } from '../types';
import { parseJobLandingFromRequisitos } from '../jobsService';
import { 
  MapPin, BriefcaseBusiness, ArrowRight, Loader2, CalendarDays, 
  BadgeDollarSign, Share2, Filter, RotateCcw, Building2, ChevronLeft, ChevronRight 
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
  lojaId: string;
  lojaNome: string;
}

const ITEMS_PER_PAGE = 6;

const PublicJobsBoard: React.FC = () => {
  const [jobs, setJobs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Estados dos filtros geográficos encadeados
  const [selectedUf, setSelectedUf] = useState<string>('todas');
  const [selectedCidade, setSelectedCidade] = useState<string>('todas');
  const [selectedLoja, setSelectedLoja] = useState<string>('todas');

  // Estado da paginação
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('cargos_publicos')
          .select('*')
          .order('titulo', { ascending: true });

        if (!isMounted) return;
        if (error) {
          console.warn('Supabase indisponível ou sem tabela:', error);
          setHasError(true);
          setJobs([]);
        } else {
          const mappedData: ConfigItem[] = (data || []).map((row: any) => ({
            id: row.id,
            nome: row.titulo,
            requisitos: row.requisitos,
            created_at: new Date().toISOString(),
            ...row,
          }));
          setJobs(mappedData);
        }
      } catch (error) {
        if (!isMounted) return;
        console.warn('Erro ao conectar ao banco de vagas:', error);
        setHasError(true);
        setJobs([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  // Normalização e extração de vagas publicadas e ativas
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
        const lojaId = cargoAny.loja_id || 'corporativo';
        const lojaNome = (cargoAny.loja_nome || 'Rede / Corporativo').trim();

        return { 
          cargo: cargoAny, 
          landing, 
          uf, 
          cidade, 
          lojaId, 
          lojaNome 
        };
      })
      .filter(item => item.landing.published);
  }, [jobs]);

  // Lista dinâmica de Estados (UF) disponíveis com vagas reais publicadas
  const availableUfs = useMemo<string[]>(() => {
    const ufs = new Set<string>();
    activeJobs.forEach(j => {
      if (j.uf) ufs.add(j.uf);
    });
    return Array.from(ufs).sort();
  }, [activeJobs]);

  // Lista dinâmica de Cidades encadeada pelo Estado selecionado
  const availableCidades = useMemo<string[]>(() => {
    const cidades = new Set<string>();
    activeJobs.forEach(j => {
      if (selectedUf === 'todas' || j.uf === selectedUf) {
        if (j.cidade) cidades.add(j.cidade);
      }
    });
    return Array.from(cidades).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeJobs, selectedUf]);

  // Lista dinâmica de Lojas/Unidades encadeada por Estado e Cidade selecionados
  const availableLojas = useMemo<{ id: string; nome: string; cidade: string; uf: string }[]>(() => {
    const map = new Map<string, { id: string; nome: string; cidade: string; uf: string }>();
    activeJobs.forEach(j => {
      const matchUf = selectedUf === 'todas' || j.uf === selectedUf;
      const matchCidade = selectedCidade === 'todas' || j.cidade === selectedCidade;
      if (matchUf && matchCidade && j.lojaId) {
        if (!map.has(j.lojaId)) {
          map.set(j.lojaId, {
            id: j.lojaId,
            nome: j.lojaNome,
            cidade: j.cidade,
            uf: j.uf
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [activeJobs, selectedUf, selectedCidade]);

  // Handlers para os filtros encadeados
  const handleUfChange = (uf: string) => {
    setSelectedUf(uf);
    setSelectedCidade('todas');
    setSelectedLoja('todas');
    setCurrentPage(1);
  };

  const handleCidadeChange = (cidade: string) => {
    setSelectedCidade(cidade);
    setSelectedLoja('todas');
    setCurrentPage(1);
  };

  const handleLojaChange = (lojaId: string) => {
    setSelectedLoja(lojaId);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSelectedUf('todas');
    setSelectedCidade('todas');
    setSelectedLoja('todas');
    setCurrentPage(1);
  };

  const hasActiveFilters = selectedUf !== 'todas' || selectedCidade !== 'todas' || selectedLoja !== 'todas';

  // Aplicação dos filtros sobre as vagas ativas
  const filteredJobs = useMemo(() => {
    return activeJobs.filter(item => {
      if (selectedUf !== 'todas' && item.uf !== selectedUf) {
        return false;
      }
      if (selectedCidade !== 'todas' && item.cidade !== selectedCidade) {
        return false;
      }
      if (selectedLoja !== 'todas' && item.lojaId !== selectedLoja) {
        return false;
      }
      return true;
    });
  }, [activeJobs, selectedUf, selectedCidade, selectedLoja]);

  // Paginação progressiva
  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE) || 1;
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredJobs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredJobs, currentPage]);

  const handleShare = async (title: string, id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/vagas/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Confira esta vaga na Gigante Pneus: ${title}`, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert('Link da vaga copiado!');
        return;
      }
      window.prompt('Copie o link da vaga:', url);
    } catch (err) {
      console.error('Falha ao compartilhar:', err);
    }
  };

  return (
    <div className="bg-[#f5f8ff] dark:bg-[#020817] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">

        {/* Banner LP Gigante Pneus */}
        <img
          src={bannerGigante}
          alt="Carreiras Gigante Pneus"
          className="w-full rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-2xl object-cover mb-8"
        />

        {/* Título e Cabeçalho */}
        <div className="rounded-[2rem] text-white border border-red-600/20 bg-gradient-to-r from-red-600/10 via-gray-100/50 to-gray-200/50 dark:from-red-950/20 dark:to-gray-900/20 backdrop-blur-sm p-5 md:p-7 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="inline-flex bg-[#ffcc00] text-[#072a5a] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                Carreiras Gigante Pneus
              </span>
              <h1 className="mt-3 text-3xl md:text-5xl font-black tracking-tighter leading-[0.95] text-gray-900 dark:text-white">
                Vagas Abertas
              </h1>
              <p className="text-gray-700 dark:text-gray-300 mt-3 max-w-2xl font-medium text-sm">
                Explore oportunidades e encontre uma vaga na maior rede de autocenters e centros automotivos do Brasil.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 text-[#072a5a] dark:text-white rounded-2xl p-4 shrink-0 hidden md:block border border-gray-200 dark:border-gray-800 shadow-md">
              <h3 className="text-sm font-black">
                {activeJobs.length} {activeJobs.length === 1 ? 'vaga cadastrada' : 'vagas cadastradas'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">
                Atualizado em {new Date().toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        {/* Painel de Filtros Geográficos Encadeados (Desktop: lado a lado / Mobile: vertical) */}
        <section aria-label="Filtros de Vagas" className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-xl p-5 md:p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800 mb-5">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-black text-sm uppercase tracking-tight">
              <Filter className="h-4 w-4 text-red-600" />
              <span>Filtrar por Localidade e Unidade</span>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                {filteredJobs.length} {filteredJobs.length === 1 ? 'vaga encontrada' : 'vagas encontradas'}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-red-600 hover:text-red-700 dark:text-red-400 transition-colors bg-red-50 dark:bg-red-950/30 px-3 py-1.5 rounded-xl border border-red-100 dark:border-red-900/30"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Limpar filtros
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Filtro: Estado (UF) */}
            <div className="space-y-1.5">
              <label htmlFor="filter-uf" className="block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Estado (UF)
              </label>
              <div className="relative">
                <select
                  id="filter-uf"
                  value={selectedUf}
                  onChange={(e) => handleUfChange(e.target.value)}
                  className="w-full appearance-none px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 cursor-pointer transition-all"
                >
                  <option value="todas">Todos os estados</option>
                  {availableUfs.map(uf => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                  <span className="text-xs">▼</span>
                </div>
              </div>
            </div>

            {/* 2. Filtro: Cidade (Encadeado) */}
            <div className="space-y-1.5">
              <label htmlFor="filter-cidade" className="block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Cidade
              </label>
              <div className="relative">
                <select
                  id="filter-cidade"
                  value={selectedCidade}
                  onChange={(e) => handleCidadeChange(e.target.value)}
                  disabled={availableCidades.length === 0}
                  className="w-full appearance-none px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="todas">Todas as cidades</option>
                  {availableCidades.map(cidade => (
                    <option key={cidade} value={cidade}>
                      {cidade}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                  <span className="text-xs">▼</span>
                </div>
              </div>
            </div>

            {/* 3. Filtro: Loja / Unidade (Encadeado com suporte a múltiplas lojas na mesma cidade) */}
            <div className="space-y-1.5">
              <label htmlFor="filter-loja" className="block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Loja / Unidade
              </label>
              <div className="relative">
                <select
                  id="filter-loja"
                  value={selectedLoja}
                  onChange={(e) => handleLojaChange(e.target.value)}
                  disabled={availableLojas.length === 0}
                  className="w-full appearance-none px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-sm outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="todas">Todas as unidades</option>
                  {availableLojas.map(loja => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome} {loja.cidade ? `(${loja.cidade}/${loja.uf})` : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                  <span className="text-xs">▼</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Área de conteúdo de vagas com tratamento de loading, erro e lista */}
        {loading ? (
          <div className="min-h-[30vh] flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-10">
            <Loader2 className="h-10 w-10 animate-spin text-red-600 mb-3" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Carregando oportunidades da Gigante Pneus...</p>
          </div>
        ) : hasError ? (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-amber-500/20 p-8 text-center">
            <p className="text-base font-bold text-gray-800 dark:text-gray-200">
              Estamos atualizando nosso catálogo de oportunidades.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Você também pode cadastrar seu perfil no nosso banco de talentos para ser notificado de novas vagas.
            </p>
            <div className="mt-4">
              <Link 
                to="/cadastro" 
                className="inline-flex bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-colors"
              >
                Cadastrar no Banco de Talentos
              </Link>
            </div>
          </div>
        ) : activeJobs.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-10 text-center text-gray-500 dark:text-gray-400 font-semibold">
            Nenhuma vaga publicada no momento.
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-10 text-center space-y-4 shadow-sm">
            <div className="w-14 h-14 bg-red-50 dark:bg-red-950/30 rounded-2xl flex items-center justify-center mx-auto text-red-600">
              <Building2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white">Nenhuma vaga encontrada para esta localidade</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                Não há oportunidades disponíveis com a combinação de filtros selecionada. Experimente limpar os filtros ou cadastrar seu perfil no Banco de Talentos.
              </p>
            </div>
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all shadow-md"
            >
              <RotateCcw className="h-4 w-4" /> Ver todas as vagas
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Grid responsivo de cards de vagas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {paginatedJobs.map(({ cargo, landing, lojaNome, cidade, uf }) => (
                <article
                  key={cargo.id}
                  className="group bg-white dark:bg-[#0b1220] rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden flex flex-col justify-between"
                >
                  {/* Cabeçalho do card com gradiente e identificação da Unidade */}
                  <div className="bg-gradient-to-r from-red-600/5 via-transparent to-transparent border-b border-gray-200 dark:border-gray-800 p-5 md:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex bg-[#ffcc00] text-[#072a5a] px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                            Vaga aberta
                          </span>
                          <span className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border border-red-200/50 dark:border-red-900/30">
                            <Building2 className="h-3 w-3 shrink-0" />
                            {lojaNome}
                          </span>
                        </div>
                        <h2 className="mt-2 text-xl md:text-2xl font-black tracking-tight leading-tight text-gray-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                          {landing.title}
                        </h2>
                      </div>
                    </div>
                  </div>

                  {/* Corpo do card */}
                  <div className="p-5 md:p-6 space-y-4 flex-grow flex flex-col justify-between">
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed line-clamp-2">
                      {landing.shortDescription}
                    </p>

                    {/* Info chips */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-2">
                      <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold text-xs truncate">
                        <MapPin className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" /> 
                        <span className="truncate">{cidade && uf ? `${cidade} / ${uf}` : landing.location}</span>
                      </p>
                      <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold text-xs">
                        <BriefcaseBusiness className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" /> {landing.workModel}
                      </p>
                      <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold text-xs">
                        <BadgeDollarSign className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" /> {landing.salary}
                      </p>
                      <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold text-xs">
                        <CalendarDays className="h-4 w-4 text-[#0a3b8f] dark:text-blue-400 shrink-0" /> {new Date().toLocaleDateString('pt-BR')}
                      </p>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <Link
                        to={`/vagas/${cargo.id}`}
                        className="flex-1 inline-flex justify-center items-center gap-2 bg-[#ffcc00] hover:bg-[#f2c200] text-[#072a5a] px-5 py-3 rounded-xl font-black uppercase text-xs transition-all shadow-sm hover:shadow-md active:scale-98"
                      >
                        Saiba mais <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleShare(landing.title, cargo.id)}
                        className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#072a5a] dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 px-4 py-3 rounded-xl text-xs font-black uppercase transition-all shadow-sm"
                        title="Compartilhar vaga"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Controles de Paginação Progressiva */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                  Página <strong className="text-gray-900 dark:text-white">{currentPage}</strong> de {totalPages} ({filteredJobs.length} vagas)
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

        {/* CTA Banco de Talentos */}
        <div className="mt-10 bg-[#eef4ff] dark:bg-[#0b1220] rounded-3xl border border-[#d7e5ff] dark:border-gray-700 p-6 md:p-8 text-center shadow-sm">
          <h3 className="text-xl font-black text-[#072a5a] dark:text-blue-200">Não encontrou sua vaga?</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 max-w-md mx-auto">
            Cadastre seu perfil no banco de talentos e receba oportunidades alinhadas à sua cidade ou região.
          </p>
          <Link
            to="/cadastro"
            className="mt-4 inline-flex border-2 border-[#0a3b8f] text-[#0a3b8f] dark:text-blue-300 dark:border-blue-300 hover:bg-[#0a3b8f] hover:text-white dark:hover:bg-blue-300 dark:hover:text-gray-900 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all shadow-sm"
          >
            Cadastrar meu perfil
          </Link>
        </div>

      </div>
    </div>
  );
};

export default PublicJobsBoard;
