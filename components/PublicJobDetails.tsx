import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { ConfigItem } from '../types';
import { createDefaultJobLanding, parseJobLandingFromRequisitos } from '../jobsService';
import { JobImage } from './JobImage';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, Building2, Share2, CalendarDays, BriefcaseBusiness, Clock3, BadgeDollarSign } from 'lucide-react';

const PublicJobDetails: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [job, setJob] = useState<{ cargo: ConfigItem; landing: ReturnType<typeof parseJobLandingFromRequisitos> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.from('cargos_publicos').select('*');
        if (!isMounted) return;
        if (error) {
          console.error('Erro ao carregar detalhe da vaga:', error);
          setJob(null);
          return;
        }
        const match = (data || [])
          .map((row: any) => {
            const cargo: ConfigItem = {
              id: row.id,
              nome: row.titulo,
              requisitos: row.requisitos,
              created_at: new Date().toISOString(),
              ...row,
            };
            const landing = parseJobLandingFromRequisitos(cargo);
            if (row.publicada === true) {
              landing.published = true;
            }
            if (row.loja_cidade && landing.location === 'A combinar') {
              landing.location = `${row.loja_cidade}${row.loja_estado ? ' - ' + row.loja_estado : ''}`;
            }
            return { cargo, landing };
          })
          .find(item => (item.cargo.id === slug || item.landing.slug === slug) && item.landing.published);
        setJob(match || null);
      } catch (error) {
        if (!isMounted) return;
        console.error('Erro ao carregar detalhe da vaga:', error);
        setJob(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [slug]);

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-red-600" /></div>;
  }

  if (!job) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">Vaga não encontrada</h1>
        <Link to="/" className="mt-6 inline-block bg-red-600 text-white px-5 py-2.5 rounded-xl font-black uppercase text-xs">Voltar para vagas</Link>
      </div>
    );
  }

  const { landing } = job;
  const safeLanding = {
    ...createDefaultJobLanding(job.cargo.nome),
    ...landing,
    responsibilities: Array.isArray(landing?.responsibilities) ? landing.responsibilities : [],
    requirements: Array.isArray(landing?.requirements) ? landing.requirements : [],
    benefits: Array.isArray(landing?.benefits) ? landing.benefits : []
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: safeLanding.title,
          text: `Confira esta vaga: ${safeLanding.title}`,
          url: currentUrl
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentUrl);
        alert('Link da vaga copiado para a area de transferencia.');
        return;
      }

      window.prompt('Copie o link da vaga:', currentUrl);
    } catch (error) {
      console.error('Falha ao compartilhar vaga:', error);
    }
  };

  return (
    <div className="bg-[#f5f8ff] dark:bg-[#020817]">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-10 md:pb-14">
        <Link to="/" className="inline-flex items-center gap-2 text-[11px] font-black uppercase text-gray-500 dark:text-gray-300 hover:text-[#0a3b8f] dark:hover:text-blue-300"><ArrowLeft className="h-4 w-4" /> Voltar para vagas</Link>

        <section className="mt-4 space-y-4">
          <JobImage
            src={safeLanding.heroImageUrl}
            alt={safeLanding.title}
            titulo={safeLanding.title}
            lojaNome={job.cargo.loja_nome || safeLanding.location}
            aspectRatio="hero"
            priority={true}
            containerClassName="w-full rounded-[2rem] border border-[#0c3c7a] shadow-2xl bg-white dark:bg-gray-900"
          />

          <div className="rounded-[2rem] text-white border border-emerald-700/40 bg-gradient-to-r from-emerald-500/20 via-rose-600/30 to-emerald-900/40 backdrop-blur-sm p-5 md:p-7">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              <div className="lg:col-span-2">
                <span className="inline-flex bg-[#ffcc00] text-[#072a5a] px-3 py-1 rounded-full text-[10px] font-black uppercase">Vaga aberta</span>
                <h1 className="mt-3 text-3xl md:text-5xl font-black tracking-tighter leading-[0.95] text-[#034b1c]">{safeLanding.title}</h1>
              </div>

              <div className="bg-white text-[#072a5a] rounded-2xl p-4">
                <h3 className="text-sm font-black">Informações da vaga</h3>
                <div className="mt-3 space-y-2 text-sm font-semibold">
                  <p className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {safeLanding.location}</p>
                  <p className="inline-flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4" /> {safeLanding.workModel}</p>
                  <p className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {new Date().toLocaleDateString('pt-BR')}</p>
                </div>
                <Link to={`/candidatar/${job.cargo.id}`} className="mt-4 w-full inline-flex justify-center bg-[#ffcc00] hover:bg-[#f2c200] text-[#072a5a] px-4 py-3 rounded-xl text-xs font-black uppercase">
                  Quero me candidatar
                </Link>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 bg-white text-[#072a5a] hover:bg-slate-100 px-4 py-2.5 rounded-xl text-xs font-black uppercase"
              >
                <Share2 className="h-4 w-4" /> Compartilhar vaga
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <article className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8">
            <h2 className="text-3xl font-black tracking-tight text-[#072a5a] dark:text-white">Sobre a vaga</h2>
            <p className="mt-4 text-gray-700 dark:text-gray-300 leading-relaxed">{safeLanding.shortDescription}</p>

            <hr className="my-7 border-gray-200 dark:border-gray-700" />
            <h3 className="text-2xl font-black text-[#072a5a] dark:text-white">Responsabilidades</h3>
            <ul className="mt-4 space-y-2">
              {safeLanding.responsibilities.map((item, idx) => <li key={idx} className="text-gray-700 dark:text-gray-300 text-sm flex gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#ffcc00]" />{item}</li>)}
            </ul>

            <h3 className="text-2xl font-black text-[#072a5a] dark:text-white mt-8">Requisitos</h3>
            <ul className="mt-4 space-y-2">
              {safeLanding.requirements.map((item, idx) => <li key={idx} className="text-gray-700 dark:text-gray-300 text-sm">- {item}</li>)}
            </ul>
          </article>

          <aside className="space-y-4">
            <div className="bg-white dark:bg-[#0b1220] rounded-3xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-xl font-black text-[#072a5a] dark:text-blue-200">Informações da vaga</h3>
              <div className="mt-4 space-y-3 text-sm">
                <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><BadgeDollarSign className="h-4 w-4 text-[#0a3b8f]" /> <strong>Salário:</strong> {safeLanding.salary}</p>
                <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><BriefcaseBusiness className="h-4 w-4 text-[#0a3b8f]" /> <strong>Modelo:</strong> {safeLanding.workModel}</p>
                <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><Clock3 className="h-4 w-4 text-[#0a3b8f]" /> <strong>Carga:</strong> 44h semanais</p>
                <p className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><CalendarDays className="h-4 w-4 text-[#0a3b8f]" /> <strong>Contrato:</strong> CLT</p>
              </div>
              <h4 className="mt-5 text-xs font-black uppercase tracking-wider text-[#0a3b8f] dark:text-blue-300">Benefícios</h4>
              <ul className="mt-2 space-y-1">
                {safeLanding.benefits.map((item, idx) => <li key={idx} className="text-sm text-gray-700 dark:text-gray-300">- {item}</li>)}
              </ul>
              <Link to={`/candidatar/${job.cargo.id}`} className="mt-6 w-full inline-flex justify-center bg-[#ffcc00] hover:bg-[#f2c200] text-[#072a5a] px-4 py-3 rounded-xl text-xs font-black uppercase">Quero me candidatar</Link>
            </div>

            <div className="bg-[#eef4ff] dark:bg-[#0b1220] rounded-3xl border border-[#d7e5ff] dark:border-gray-700 p-6">
              <h4 className="text-lg font-black text-[#072a5a] dark:text-blue-200">Não é para você?</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Cadastre seu perfil no banco de talentos e receba novas oportunidades.</p>
              <Link to="/cadastro" className="mt-4 inline-flex border border-[#0a3b8f] text-[#0a3b8f] dark:text-blue-300 dark:border-blue-300 px-4 py-2 rounded-xl text-xs font-black uppercase">Cadastrar meu perfil</Link>
            </div>
          </aside>
        </section>

        <section className="mt-6 bg-white dark:bg-[#0b1220] rounded-3xl border border-gray-200 dark:border-gray-700 p-6 md:p-8">
          <h3 className="text-2xl font-black text-[#072a5a] dark:text-blue-200 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-red-600" /> Sobre a Gigante Pneus
          </h3>
          <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            A Gigante Pneus é uma rede referência em serviços automotivos, vendas de pneus e manutenção de excelência em todo o Brasil, comprometida com qualidade, segurança e valorização profissional.
          </p>

          <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 dark:bg-red-950/40 rounded-xl text-red-600 shrink-0">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <span className="block text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Unidade responsável pela vaga
                </span>
                <span className="font-bold text-gray-800 dark:text-gray-100">
                  {job.cargo.loja_nome || 'Rede / Banco de Talentos Corporativo'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-[#0a3b8f] dark:text-blue-400 shrink-0">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <span className="block text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Localidade
                </span>
                <span className="font-bold text-gray-800 dark:text-gray-100">
                  {job.cargo.loja_cidade && job.cargo.loja_estado
                    ? `${job.cargo.loja_cidade} - ${job.cargo.loja_estado}`
                    : (safeLanding.location || 'Brasil (Multi-Lojas)')}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PublicJobDetails;

