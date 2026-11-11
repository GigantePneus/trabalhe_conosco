import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { Pesquisa, Pergunta } from '../types';
import { CheckCircle2, AlertCircle, Loader2, ClipboardList, Send, HeartPulse } from 'lucide-react';

const PublicSurvey: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  
  const [respostas, setRespostas] = useState<Record<string, any>>({});

  useEffect(() => {
    if (id) {
      fetchPesquisa(id);
    }
  }, [id]);

  const fetchPesquisa = async (identifier: string) => {
    try {
      // Tenta buscar por slug primeiro, depois por UUID (usando coluna oficial 'ativa')
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
      
      let query = supabase.from('pesquisas').select('*').eq('ativa', true);
      
      if (isUUID) {
        query = query.eq('id', identifier);
      } else {
        query = query.eq('slug', identifier);
      }
      
      const { data, error } = await query.single();
        
      if (error || !data) {
        setError('Pesquisa não encontrada ou desativada.');
      } else {
        setPesquisa({
          ...data,
          is_active: data.ativa ?? data.is_active ?? true
        });
      }
    } catch (e: any) {
      setError('Erro ao carregar a pesquisa.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (perguntaId: string, value: any) => {
    setRespostas(prev => ({ ...prev, [perguntaId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pesquisa) return;
    
    // Validação de obrigatórias
    for (const p of pesquisa.perguntas) {
      if (p.obrigatoria && !respostas[p.id]) {
        setError(`A pergunta "${p.enunciado}" é obrigatória.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('respostas')
        .insert([{
          pesquisa_id: pesquisa.id,
          respostas_json: respostas
        }]);

      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err: any) {
      setError('Erro ao enviar respostas. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-12 w-12 animate-spin text-red-600" />
      </div>
    );
  }

  if (error && !pesquisa) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-2">Ops!</h2>
        <p className="text-gray-500 font-medium mb-6 text-center">{error}</p>
        <Link to="/" className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold uppercase hover:bg-red-700 transition-all">Voltar ao Início</Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-16 px-4">
        <div className="max-w-xl mx-auto bg-white dark:bg-gray-900 p-10 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="h-12 w-12 text-red-600" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tighter uppercase">Muito Obrigado!</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg font-medium leading-relaxed">
            Sua opinião foi registrada e é fundamental para continuarmos cuidando da nossa equipe na <span className="font-bold text-red-600">Gigante Pneus</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center animate-in fade-in duration-700">
          <div className="inline-flex items-center justify-center p-4 bg-red-100 dark:bg-red-900/40 rounded-full mb-6">
            <ClipboardList className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white mb-4 tracking-tighter uppercase leading-none">
            {pesquisa?.titulo}
          </h1>
          {pesquisa?.descricao && (
            <p className="text-gray-600 dark:text-gray-400 text-lg max-w-xl mx-auto leading-relaxed font-medium">
              {pesquisa.descricao}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-gray-800 p-8 md:p-12 space-y-10 animate-in slide-in-from-bottom-8 duration-700">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-600 p-4 flex items-start gap-3 rounded-r-xl">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <p className="text-red-800 dark:text-red-300 text-sm font-bold uppercase">{error}</p>
            </div>
          )}

          <div className="space-y-12">
            {pesquisa?.perguntas.map((p, index) => (
              <div key={p.id} className="space-y-4">
                <label className="block text-sm md:text-base font-black text-gray-800 dark:text-gray-200 uppercase tracking-wide">
                  <span className="text-red-600 mr-2">{index + 1}.</span> 
                  {p.enunciado} {p.obrigatoria && <span className="text-red-500">*</span>}
                </label>

                {p.tipo === 'texto_curto' && (
                  <input 
                    type="text"
                    required={p.obrigatoria}
                    className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white"
                    placeholder="Sua resposta..."
                    value={respostas[p.id] || ''}
                    onChange={e => handleInputChange(p.id, e.target.value)}
                  />
                )}

                {p.tipo === 'texto_longo' && (
                  <textarea 
                    rows={4}
                    required={p.obrigatoria}
                    className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-medium text-gray-800 dark:text-white resize-none"
                    placeholder="Escreva detalhadamente..."
                    value={respostas[p.id] || ''}
                    onChange={e => handleInputChange(p.id, e.target.value)}
                  />
                )}

                {p.tipo === 'nota' && (
                  <div className="flex flex-wrap gap-2 md:gap-4">
                    {[1, 2, 3, 4, 5].map(nota => (
                      <button
                        key={nota}
                        type="button"
                        onClick={() => handleInputChange(p.id, nota)}
                        className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl font-black text-lg md:text-xl transition-all border-2 flex items-center justify-center ${
                          respostas[p.id] === nota 
                            ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/30 scale-110' 
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-red-600/50 hover:text-red-600'
                        }`}
                      >
                        {nota}
                      </button>
                    ))}
                  </div>
                )}

                {p.tipo === 'multipla_escolha' && (
                  <div className="space-y-3">
                    {p.opcoes?.map((opcao: string, oIndex: number) => (
                      <label key={oIndex} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        respostas[p.id] === opcao 
                          ? 'border-red-600 bg-red-50 dark:bg-red-900/20 shadow-sm' 
                          : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 hover:border-red-300'
                      }`}>
                        <input 
                          type="radio" 
                          name={`pergunta-${p.id}`}
                          value={opcao}
                          checked={respostas[p.id] === opcao}
                          onChange={() => handleInputChange(p.id, opcao)}
                          className="w-5 h-5 text-red-600 focus:ring-red-600 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className={`font-bold text-sm uppercase ${respostas[p.id] === opcao ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-300'}`}>
                          {opcao}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-gray-100 dark:border-gray-800">
            <button 
              disabled={submitting}
              type="submit"
              className="w-full bg-black dark:bg-white text-white dark:text-black py-5 rounded-2xl font-black text-xl uppercase shadow-2xl hover:shadow-black/20 dark:hover:shadow-white/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
            >
              {submitting ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <><Send className="h-6 w-6" /> Enviar Respostas</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PublicSurvey;

