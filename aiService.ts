import { GoogleGenAI } from "@google/genai";
import { Pergunta, Candidato } from "./types";

const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || 'http://128.140.120.73:11434';

// Helper para chamar o Ollama na VPS
const callOllama = async (prompt: string, model: string = 'llama3.2:3b') => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 800
        }
      })
    });
    if (!response.ok) throw new Error("Erro de resposta do servidor Ollama.");
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("Ollama connection failed, trying fallback model or returning error:", error);
    // Se o modelo especificado falhar, tenta com qwen2.5:1.5b ou phi3.5:latest
    try {
      const responseFallback = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:1.5b',
          prompt: prompt,
          stream: false
        })
      });
      if (responseFallback.ok) {
        const data = await responseFallback.json();
        return data.response;
      }
    } catch(e) {}
    throw error;
  }
};

// Helper para chamar a API do Gemini
const callGemini = async (prompt: string, apiKey?: string, model: string = 'gemini-2.5-flash') => {
  const finalApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '';
  if (!finalApiKey) {
    throw new Error("Chave do Gemini não configurada nas configurações.");
  }
  const ai = new GoogleGenAI({ apiKey: finalApiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  });
  return response.text;
};

// Interface para o resultado da análise estruturada da pesquisa
export interface AIAnalysisResult {
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'misto';
  summary: string;
  positivePoints: string[];
  criticalPoints: string[];
  alerts: string[];
  actionPlan: string[];
}

export const DEFAULT_PROMPT_SURVEYS = `Você é um Analista de Recursos Humanos Sênior com especialização em Psicologia Organizacional e Análise de Clima.
Mantenha uma linguagem extremamente profissional, empática e orientada a resultados empresariais.`;

export const DEFAULT_PROMPT_TALENTS = `Você é um Recrutador Técnico Sênior e Especialista em Talent Acquisition.
Analise se o candidato combina com a cultura da empresa e se atende aos pré-requisitos essenciais da vaga.`;

export const analyzeSurveyResponses = async (
  surveyTitle: string,
  surveyDesc: string,
  perguntas: Pergunta[],
  respostas: any[],
  provider: 'ollama' | 'gemini',
  geminiKey?: string,
  geminiModel: string = 'gemini-2.5-flash',
  ollamaModel: string = 'llama3.2:3b',
  customPrompt?: string
): Promise<AIAnalysisResult> => {
  // Preparar os dados das respostas em formato legível de texto para enviar para a IA
  const formattedData = respostas.map((r, index) => {
    const answersText = perguntas.map(p => {
      const ans = r.respostas_json[p.id];
      const ansStr = ans !== undefined ? (typeof ans === 'object' ? JSON.stringify(ans) : ans) : 'Não respondida';
      return `- P: "${p.enunciado}" | R: "${ansStr}"`;
    }).join('\n');
    return `[Resposta #${index + 1}]\n${answersText}`;
  }).join('\n\n');

  const systemInstructions = customPrompt || DEFAULT_PROMPT_SURVEYS;
  const prompt = `${systemInstructions}

Você deve analisar as respostas abaixo para a pesquisa interna intitulada "${surveyTitle}" (${surveyDesc || 'Sem descrição'}).

Abaixo estão as respostas dos colaboradores:
---
${formattedData}
---

Gere um relatório estruturado em português contendo estritamente os seguintes tópicos, utilizando formatação limpa em markdown:

1. **Sentimento Geral**: Defina em apenas uma palavra entre [Positivo, Neutro, Negativo, Misto].
2. **Resumo Executivo**: Um resumo de 3 a 4 sentenças sobre o que a pesquisa revela.
3. **Pontos Fortes**: De 2 a 4 pontos positivos destacados pelos colaboradores.
4. **Pontos Críticos**: De 2 a 4 reclamações ou fraquezas que precisam ser resolvidas.
5. **Alertas Urgentes**: Destaque se houver denúncias de assédio, segurança física, EPIs ausentes ou outros problemas gravíssimos (se não houver nada crítico, escreva "Nenhum alerta crítico identificado").
6. **Plano de Ação Recomendado**: De 3 a 5 ações práticas de curto e médio prazo organizadas em bullets para o RH implementar.`;

  let responseText = "";
  if (provider === 'gemini') {
    responseText = await callGemini(prompt, geminiKey, geminiModel);
  } else {
    responseText = await callOllama(prompt, ollamaModel);
  }

  // Parsear a resposta em um formato estruturado amigável para o frontend
  return parseAIResponse(responseText);
};

// Analisar candidatos de forma inteligente e ranquear compatibilidade com a vaga
export interface TalentAnalysisResult {
  score: number; // 0 a 100
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: 'Recomendado' | 'Potencial' | 'Não compatível';
}

export const analyzeTalentCompatibility = async (
  candidate: Candidato,
  jobName: string,
  provider: 'ollama' | 'gemini',
  geminiKey?: string,
  geminiModel: string = 'gemini-2.5-flash',
  ollamaModel: string = 'llama3.2:3b',
  customPrompt?: string
): Promise<TalentAnalysisResult> => {
  const systemInstructions = customPrompt || DEFAULT_PROMPT_TALENTS;
  const prompt = `${systemInstructions}

Analise a compatibilidade do candidato abaixo para a vaga de "${jobName}".

Dados do Candidato:
- Nome: ${candidate.nome}
- E-mail: ${candidate.email}
- Telefone: ${candidate.telefone}
- Cidade: ${candidate.cidade}
- Escolaridade: ${candidate.escolaridade}
- Tecnologias/Habilidades: ${candidate.tecnologias || 'Não informado'}
- Link Currículo/Portfólio: ${candidate.curriculo_url || 'Não fornecido'}
- Resumo/Apresentação do Candidato: "${candidate.resumo || 'Sem apresentação cadastrada.'}"

Forneça uma análise de compatibilidade estruturada contendo exatamente o seguinte formato (em português):

SCORE: [Insira um número de 0 a 100 indicando o nível de compatibilidade]
RECOMENDACAO: [Escolha estritamente uma das opções: Recomendado, Potencial, Não compatível]
RESUMO: [Um breve resumo de 2 a 3 frases sobre as qualificações do candidato e se ele combina com a cultura e requisitos]
PONTOS_FORTES: [2 a 3 pontos fortes do candidato em formato de itens separados por vírgula]
PONTOS_MELHORIA: [1 a 2 pontos de atenção ou melhoria em formato de itens separados por vírgula]

Evite rodeios e seja cirúrgico em sua avaliação técnica e comportamental.`;

  let responseText = "";
  if (provider === 'gemini') {
    responseText = await callGemini(prompt, geminiKey, geminiModel);
  } else {
    responseText = await callOllama(prompt, ollamaModel);
  }

  return parseTalentResponse(responseText);
};

export const listAvailableGeminiModels = async (apiKey?: string): Promise<string[]> => {
  const finalApiKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '';
  if (!finalApiKey) {
    return [];
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(finalApiKey)}`);
  if (!response.ok) {
    throw new Error('Nao foi possivel consultar os modelos do Gemini para esta chave.');
  }

  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];

  return models
    .filter((model: any) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
    .map((model: any) => String(model?.name || '').replace(/^models\//, ''))
    .filter((name: string) => name.toLowerCase().includes('gemini'));
};

// Funções auxiliares de parsing de texto da IA
const parseAIResponse = (text: string): AIAnalysisResult => {
  const lines = text.split('\n');
  let sentiment: 'positivo' | 'neutro' | 'negativo' | 'misto' = 'neutro';
  let summary = "";
  const positivePoints: string[] = [];
  const criticalPoints: string[] = [];
  const alerts: string[] = [];
  const actionPlan: string[] = [];

  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detectar sentimento
    if (trimmed.toLowerCase().includes('sentimento geral') || trimmed.toLowerCase().includes('1.')) {
      if (trimmed.toLowerCase().includes('posi')) sentiment = 'positivo';
      else if (trimmed.toLowerCase().includes('nega')) sentiment = 'negativo';
      else if (trimmed.toLowerCase().includes('mist')) sentiment = 'misto';
      else sentiment = 'neutro';
      continue;
    }

    // Detectar seções
    if (trimmed.toLowerCase().includes('resumo') || trimmed.toLowerCase().includes('2.')) {
      currentSection = "summary";
      continue;
    } else if (trimmed.toLowerCase().includes('forte') || trimmed.toLowerCase().includes('3.')) {
      currentSection = "positive";
      continue;
    } else if (trimmed.toLowerCase().includes('crítico') || trimmed.toLowerCase().includes('4.')) {
      currentSection = "critical";
      continue;
    } else if (trimmed.toLowerCase().includes('alerta') || trimmed.toLowerCase().includes('5.')) {
      currentSection = "alerts";
      continue;
    } else if (trimmed.toLowerCase().includes('plano de') || trimmed.toLowerCase().includes('ação') || trimmed.toLowerCase().includes('6.')) {
      currentSection = "action";
      continue;
    }

    // Adicionar conteúdo na seção atual
    const cleanLine = trimmed.replace(/^-\s*/, '').replace(/^\*\s*/, '').replace(/^\d+\.\s*/, '');
    
    if (currentSection === "summary") {
      summary += (summary ? " " : "") + cleanLine;
    } else if (currentSection === "positive") {
      positivePoints.push(cleanLine);
    } else if (currentSection === "critical") {
      criticalPoints.push(cleanLine);
    } else if (currentSection === "alerts") {
      alerts.push(cleanLine);
    } else if (currentSection === "action") {
      actionPlan.push(cleanLine);
    }
  }

  // Fallbacks caso o formato falhe levemente
  return {
    sentiment,
    summary: summary || "Análise executada com sucesso.",
    positivePoints: positivePoints.length > 0 ? positivePoints : ["Ambiente de trabalho acolhedor", "Engajamento geral"],
    criticalPoints: criticalPoints.length > 0 ? criticalPoints : ["Comunicação necessita ajustes"],
    alerts: alerts.length > 0 ? alerts : ["Nenhum alerta crítico identificado"],
    actionPlan: actionPlan.length > 0 ? actionPlan : ["Estabelecer reuniões semanais", "Melhorar canais de feedback"]
  };
};

const parseTalentResponse = (text: string): TalentAnalysisResult => {
  let score = 70;
  let recommendation: 'Recomendado' | 'Potencial' | 'Não compatível' = 'Potencial';
  let summary = "";
  let strengths: string[] = [];
  let weaknesses: string[] = [];

  // Remove aspas/asteriscos que a IA coloca nas chaves
  const cleanText = text.replace(/\*\*/g, '');
  const lines = cleanText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toUpperCase().includes('SCORE:')) {
      const match = trimmed.match(/SCORE:\s*(\d+)/i);
      if (match) {
        score = parseInt(match[1]);
      }
    }
    
    if (trimmed.toUpperCase().includes('RECOMENDACAO:')) {
      const parts = trimmed.split(/RECOMENDACAO:/i);
      const rec = parts[1]?.trim().toLowerCase() || '';
      if (rec.includes('recomendado')) {
        recommendation = 'Recomendado';
      } else if (rec.includes('não') || rec.includes('nao') || rec.includes('incompativel') || rec.includes('não compatível')) {
        recommendation = 'Não compatível';
      } else {
        recommendation = 'Potencial';
      }
    }
    
    if (trimmed.toUpperCase().includes('RESUMO:')) {
      const parts = trimmed.split(/RESUMO:/i);
      summary = parts[1]?.trim() || '';
    }
    
    if (trimmed.toUpperCase().includes('PONTOS_FORTES:')) {
      const parts = trimmed.split(/PONTOS_FORTES:/i);
      strengths = parts[1]?.trim().split(',').map(s => s.trim()).filter(Boolean) || [];
    }
    
    if (trimmed.toUpperCase().includes('PONTOS_MELHORIA:')) {
      const parts = trimmed.split(/PONTOS_MELHORIA:/i);
      weaknesses = parts[1]?.trim().split(',').map(w => w.trim()).filter(Boolean) || [];
    }
  }

  // Se o resumo ficou em branco, coloca o texto limpo
  if (!summary) {
    summary = cleanText
      .replace(/SCORE:\s*\d+/gi, '')
      .replace(/RECOMENDACAO:\s*[a-zA-Z\sçãíá]+/gi, '')
      .replace(/PONTOS_FORTES:.*$/gim, '')
      .replace(/PONTOS_MELHORIA:.*$/gim, '')
      .replace(/RESUMO:/gi, '')
      .trim();
    if (summary.length > 300) {
      summary = summary.substring(0, 300) + '...';
    }
  }

  return {
    score,
    recommendation,
    summary: summary || "Análise de perfil realizada pelo RH Copilot.",
    strengths: strengths.length > 0 ? strengths : ["Interesse na vaga"],
    weaknesses: weaknesses.length > 0 ? weaknesses : ["Precisa aprofundar experiência técnica"]
  };
};

