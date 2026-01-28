
import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { ADVANTAGES, APP_STEPS } from '../constants';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

interface LandingPageProps {
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ theme, onToggleTheme }) => {
  return (
    <Layout theme={theme} onToggleTheme={onToggleTheme}>
      {/* Hero Section Clean */}
      <section className="relative min-h-[80vh] flex items-center bg-white dark:bg-zinc-950 overflow-hidden">
        {/* Background Image - Left Side */}
        <div className="absolute top-0 left-0 w-1/2 h-full hidden lg:block">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white dark:to-zinc-950 z-10"></div>
          <img
            src="/hero-bg.jpg"
            className="w-full h-full object-cover grayscale opacity-20 dark:opacity-10"
            alt="Background View"
          />
        </div>

        <div className="container mx-auto px-6 relative z-20">
          {/* Content - Pushed to Right */}
          <div className="max-w-2xl ml-auto animate-fade-in lg:pl-10">
            <div className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-500/10 text-gigante-red px-4 py-1.5 rounded-full text-xs font-bold mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-gigante-red animate-pulse"></span>
              RECRUTAMENTO ABERTO
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 dark:text-white mb-6 leading-[1.1] tracking-tight">
              Faça parte do time <br /><span className="text-gigante-red italic">Gigante Pneus</span>
            </h1>
            <p className="text-lg text-slate-500 dark:text-slate-400 mb-10 leading-relaxed max-w-lg">
              Construa sua carreira em uma das maiores redes automotivas do Brasil. Buscamos talentos que queiram crescer e fazer a diferença.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/candidatar"
                className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-gigante-red hover:text-white transition-all shadow-xl flex items-center gap-3"
              >
                Quero me candidatar
                <ArrowRight size={20} />
              </Link>
              <a
                href="#quem-somos"
                className="bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-8 py-4 rounded-2xl font-bold text-lg hover:border-gigante-red hover:text-gigante-red transition-all"
              >
                Saiba Mais
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* About Section - Minimalist */}
      <section id="quem-somos" className="py-24 bg-slate-50 dark:bg-zinc-900/50">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
            <div className="order-2 md:order-1">
              <h2 className="text-[11px] font-bold text-gigante-red uppercase tracking-[0.3em] mb-4">Institucional</h2>
              <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-8 leading-tight">
                Uma trajetória de <br />excelência e confiança.
              </h3>
              <div className="space-y-6 text-slate-600 dark:text-slate-400 text-lg leading-relaxed">
                <p>
                  A <strong>Gigante Pneus</strong> é uma rede consolidada no mercado automotivo nacional, com foco total em qualidade e atendimento de excelência.
                </p>
                <p>
                  Investimos em tecnologia, infraestrutura e, principalmente, no desenvolvimento contínuo dos nossos colaboradores, acreditando que as pessoas são o motor do nosso sucesso.
                </p>
              </div>
            </div>
            <div className="order-1 md:order-2 relative">
              <div className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl">
                <img src="http://academia.gigantepneus.com.br/wp-content/uploads/2026/01/image-3.jpg" className="w-full h-full object-cover grayscale" alt="Equipe" />
              </div>
              <div className="absolute -bottom-8 -left-8 bg-white dark:bg-zinc-800 p-8 rounded-3xl shadow-premium border border-slate-100 dark:border-white/5">
                <div className="text-4xl font-black text-gigante-red">+15</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Lojas no Brasil</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Advantages - Modern Grid */}
      <section className="py-24 bg-white dark:bg-zinc-950">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">Por que trabalhar conosco?</h2>
            <p className="text-slate-500 dark:text-slate-400">Oferecemos benefícios e um ambiente que valoriza cada passo da sua carreira.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {ADVANTAGES.map((adv, idx) => (
              <div key={idx} className="p-8 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5 hover:border-gigante-red/30 transition-all group">
                <div className="w-12 h-12 bg-white dark:bg-zinc-800 text-gigante-red rounded-xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                  {adv.icon}
                </div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{adv.title}</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Desenvolva suas habilidades técnicas e interpessoais em um ecossistema focado no crescimento.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works - Step-by-Step Clean */}
      <section className="py-24 bg-slate-50 dark:bg-zinc-900/50">
        <div className="container mx-auto px-6">
          <div className="bg-white dark:bg-zinc-900 rounded-[3rem] p-12 md:p-20 shadow-premium border border-slate-100 dark:border-white/5">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
              {APP_STEPS.map((step) => (
                <div key={step.id} className="relative">
                  <div className="text-5xl font-black text-slate-100 dark:text-white/5 mb-4 absolute -top-8 -left-2 select-none">{step.id}</div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-4 relative z-10">{step.title}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed relative z-10">{step.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-20 text-center">
              <Link
                to="/candidatar"
                className="inline-flex items-center gap-4 bg-gigante-red text-white px-12 py-5 rounded-2xl font-bold text-xl hover:opacity-90 transition-all shadow-xl shadow-red-500/20 uppercase"
              >
                Enviar meu currículo agora
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default LandingPage;
