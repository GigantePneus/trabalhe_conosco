import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { ConfigItem } from '../types';
import { parseJobLandingFromRequisitos } from '../jobsService';
import { MapPin, BriefcaseBusiness, ArrowRight, Loader2, CalendarDays, BadgeDollarSign, Share2 } from 'lucide-react';
import bannerGigante from '../imagens/banner LP - Gigante Pneus.png';

const PublicJobsBoard: React.FC = () => {
  const [jobs, setJobs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

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

  const activeJobs = jobs
    .map(cargo => {
      const landing = parseJobLandingFromRequisitos(cargo);
      if ((cargo as any).publicada === true) {
        landing.published = true;
      }
      return { cargo, landing };
    })
    .filter(item => item.landing.published);

  const handleShare = async (title: string, slug: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/vagas/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Confira esta vaga: ${title}`, url });
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

        {/* Banner LP Gigante Pneus (Renderizado independentemente de loading ou erro) */}
        <img
          src={bannerGigante}
          alt="Carreiras Gigante"
          className="w-full rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-2xl object-cover mb-8"
        />

        {/* Título e subtítulo */}
        <div className="rounded-[2rem] text-white border border-red-600/20 bg-gradient-to-r from-red-600/10 via-gray-100/50 to-gray-200/50 dark:from-red-950/20 dark:to-gray-900/20 backdrop-blur-sm p-5 md:p-7 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="inline-flex bg-[#ffcc00] text-[#072a5a] px-3 py-1 rounded-full text-[10px] font-black uppercase">Carreiras Gigante</span>
              <h1 className="mt-3 text-3xl md:text-5xl font-black tracking-tighter leading-[0.95] text-gray-900 dark:text-white">Vagas Abertas</h1>
              <p className="text-gray-900 dark:text-white mt-3 max-w-2xl font-medium text-sm">
                Explore oportunidades e encontre uma vaga alinhada ao seu momento profissional.
              </p>
            </div>
            <div className="bg-white text-[#072a5a] rounded-2xl p-4 shrink-0 hidden md:block">
              <h3 className="text-sm font-black">{activeJobs.length} {activeJobs.length === 1 ? 'vaga disponível' : 'vagas disponíveis'}</h3>
              <p className="text-xs text-gray-500 font-semibold mt-1">Atualizado em {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>

        {/* Área de conteúdo de vagas com tratamento de loading, erro e lista */}
        {loading ? (
          <div className="min-h-[30vh] flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-10">
            <Loader2 className="h-10 w-10 animate-spin text-red-600 mb-3" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Carregando oportunidades...</p>
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
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activeJobs.map(({ cargo, landing }) => (
              <article
                key={cargo.id}
                className="group bg-white dark:bg-[#0b1220] rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden"
              >
                {/* Cabeçalho do card com gradiente */}
                <div className="bg-gradient-to-r from-red-600/5 via-transparent to-transparent border-b border-gray-200 dark:border-gray-800 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex bg-[#ffcc00] text-[#072a5a] px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase">Vaga aberta</span>
                      <h2 className="mt-2 text-xl md:text-2xl font-black tracking-tight leading-tight text-gray-900 dark:text-white dark:text-emerald-300 group-hover:text-[#023015] transition-colors">{landing.title}</h2>
                    </div>
                  </div>
                </div>

                {/* Corpo do card */}
                <div className="p-5 md:p-6 space-y-4">
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed min-h-[48px]">{landing.shortDescription}</p>

                  {/* Info chips */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                      <MapPin className="h-4 w-4 text-[#0a3b8f] shrink-0" /> {landing.location}
                    </p>
                    <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                      <BriefcaseBusiness className="h-4 w-4 text-[#0a3b8f] shrink-0" /> {landing.workModel}
                    </p>
                    <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                      <BadgeDollarSign className="h-4 w-4 text-[#0a3b8f] shrink-0" /> {landing.salary}
                    </p>
                    <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold">
                      <CalendarDays className="h-4 w-4 text-[#0a3b8f] shrink-0" /> {new Date().toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <Link
                      to={`/vagas/${landing.slug}`}
                      className="flex-1 inline-flex justify-center items-center gap-2 bg-[#ffcc00] hover:bg-[#f2c200] text-[#072a5a] px-5 py-3 rounded-xl font-black uppercase text-xs transition-all shadow-sm hover:shadow-md"
                    >
                      Saiba mais <ArrowRight className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleShare(landing.title, landing.slug)}
                      className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#072a5a] dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 px-4 py-3 rounded-xl text-xs font-black uppercase transition-all"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* CTA Cadastro */}
        <div className="mt-10 bg-[#eef4ff] dark:bg-[#0b1220] rounded-3xl border border-[#d7e5ff] dark:border-gray-700 p-6 md:p-8 text-center">
          <h3 className="text-xl font-black text-[#072a5a] dark:text-blue-200">Não encontrou sua vaga?</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 max-w-md mx-auto">
            Cadastre seu perfil no banco de talentos e receba novas oportunidades alinhadas ao seu perfil.
          </p>
          <Link
            to="/cadastro"
            className="mt-4 inline-flex border-2 border-[#0a3b8f] text-[#0a3b8f] dark:text-blue-300 dark:border-blue-300 hover:bg-[#0a3b8f] hover:text-white dark:hover:bg-blue-300 dark:hover:text-gray-900 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all"
          >
            Cadastrar meu perfil
          </Link>
        </div>

      </div>
    </div>
  );
};

export default PublicJobsBoard;

