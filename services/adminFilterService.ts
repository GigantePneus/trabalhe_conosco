/**
 * Serviço de Filtragem Estruturada do Banco de Talentos (Prompt 65)
 * Projeto: Trabalhe Conosco — Gigante Pneus Multi-Lojas
 */

import {
  areCargosEquivalent,
  isCandidaturaEspontanea,
  toCanonicalCargo,
  normalizeCargoText
} from './cargoEquivalenceService';
import type { KPIStats } from '../types';

/**
 * Identificadores explicitamente auditados de registros sintéticos de teste.
 * Não utiliza apenas domínio de e-mail como critério de exclusão.
 */
export const AUDITED_TEST_CANDIDATO_IDS = new Set<string>([
  'e87b3b8a-d313-4f06-997f-0f8dc5e3bbc1' // Mariana Costa Ferreira (candidatos.id)
]);

export const AUDITED_TEST_CANDIDATURA_IDS = new Set<string>([
  '7c1f8b79-feae-46a3-b6ef-6d07bdf46de9' // Candidatura de teste Jundiaí (candidaturas.id)
]);

export const AUDITED_TEST_PROTOCOLS = new Set<string>([
  'GIG-20261113-522288'
]);

/**
 * Verifica se um item corresponde a um registro sintético de teste.
 */
export function isItemRegistroTeste(item: any): boolean {
  if (!item) return false;
  if (item.candidato_id && AUDITED_TEST_CANDIDATO_IDS.has(item.candidato_id)) return true;
  if (item.id && AUDITED_TEST_CANDIDATO_IDS.has(item.id)) return true;
  if (item.candidatura_id && AUDITED_TEST_CANDIDATURA_IDS.has(item.candidatura_id)) return true;
  if (item.protocolo && AUDITED_TEST_PROTOCOLS.has(item.protocolo)) return true;
  if (item.dados_extras?.protocolo && AUDITED_TEST_PROTOCOLS.has(item.dados_extras.protocolo)) return true;
  if (item.dados_extras?.is_teste === true || item.dados_formulario?.is_teste === true) return true;
  if (item.is_teste === true) return true;
  return false;
}

/**
 * Normaliza o município e estado de residência do candidato, evitando duplicações
 * anômalas de UF (como "Goiânia - GO - GO") e padronizando formato "Cidade - UF".
 */
export function normalizeCidadeResidencia(cidadeRaw?: string, estadoRaw?: string): string {
  if (!cidadeRaw || !cidadeRaw.trim()) return 'Não informada';
  let c = cidadeRaw.trim();
  let e = (estadoRaw || '').trim().toUpperCase();

  // Se a cidade já termina com '- UF' ou '/ UF' (ex: 'Goiânia - GO' ou 'Goiânia/GO')
  const matchUf = c.match(/(?:[\s\-\/]+)([A-Z]{2})$/i);
  if (matchUf) {
    const ufInCity = matchUf[1].toUpperCase();
    c = c.slice(0, matchUf.index).trim();
    if (!e) e = ufInCity;
  }

  // Remove qualquer traço ou barra solta no final
  c = c.replace(/[\-\/]+$/, '').trim();

  // Limpa se ainda restou algo como 'Goiânia - GO'
  const secondCheck = c.match(/(?:[\s\-\/]+)([A-Z]{2})$/i);
  if (secondCheck) {
    const ufInCity2 = secondCheck[1].toUpperCase();
    c = c.slice(0, secondCheck.index).trim();
    if (!e) e = ufInCity2;
  }

  if (e && e.length === 2) {
    return `${c} - ${e}`;
  }
  return c;
}

export interface CandidatoAdminItem {
  id: string;
  candidatura_id: string;
  candidato_id?: string;
  nome: string;
  email: string;
  cpf_mascarado: string;
  telefone: string;
  cidade: string;
  estado?: string;
  candidato_cidade?: string;
  candidato_estado?: string;
  cidade_residencia?: string;
  unidade_pretendida?: string;
  cargo_id?: string | null;
  vaga_interesse: string;
  status_candidatura: string;
  loja_id: string | null;
  loja_nome?: string;
  loja_cidade?: string;
  loja_estado?: string;
  possui_curriculo?: boolean;
  curriculo_id?: string;
  curriculo_file_id?: string;
  created_at: string;
  [key: string]: any;
}

export interface AdminFilters {
  lojaId?: string;
  cargoId?: string; // Título do cargo, UUID ou 'espontanea'
  cidade?: string;
  estado?: string;
  status?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  searchTerm?: string;
  cargosList?: Array<{ id: string; titulo?: string; nome?: string; [key: string]: any }>;
  includeTestRecords?: boolean;
}

export interface UniqueCargoOption {
  titulo: string;
  normalizedTitulo: string;
  vagaIds: string[];
}

/**
 * Extrai a lista única de cargos a partir das vagas cadastradas no sistema
 * e, opcionalmente, dos cargos/profissões registrados no Banco de Talentos,
 * normalizando espaços, maiúsculas/minúsculas e ordenando em ordem alfabética.
 */
export function getUniqueCargos(
  cargos: Array<{ id: string; titulo?: string; nome?: string; loja_id?: string; [key: string]: any }>,
  bancoTalentosCargos?: string[]
): UniqueCargoOption[] {
  const map = new Map<string, UniqueCargoOption>();

  // 1. Cargos cadastrados como vagas na rede
  if (Array.isArray(cargos)) {
    for (const c of cargos) {
      const rawTitle = (c.titulo || c.nome || '').trim();
      if (!rawTitle) continue;

      const canonicalTitle = toCanonicalCargo(rawTitle);
      const cleanDisplayTitle = canonicalTitle || rawTitle.replace(/\s+/g, ' ');
      const normalizedKey = normalizeFilterText(cleanDisplayTitle);

      if (!normalizedKey) continue;

      const existing = map.get(normalizedKey);
      if (existing) {
        if (c.id && !existing.vagaIds.includes(c.id)) {
          existing.vagaIds.push(c.id);
        }
        if (cleanDisplayTitle.length > existing.titulo.length) {
          existing.titulo = cleanDisplayTitle;
        }
      } else {
        map.set(normalizedKey, {
          titulo: cleanDisplayTitle,
          normalizedTitulo: normalizedKey,
          vagaIds: c.id ? [c.id] : []
        });
      }
    }
  }

  // 2. Cargos adicionais existentes no Banco de Talentos (ex: Borracheiro)
  if (Array.isArray(bancoTalentosCargos)) {
    for (const btCargo of bancoTalentosCargos) {
      if (!btCargo || typeof btCargo !== 'string') continue;
      if (isCandidaturaEspontanea(btCargo)) continue;

      const canonicalTitle = toCanonicalCargo(btCargo);
      const normalizedKey = normalizeFilterText(canonicalTitle);

      if (!normalizedKey) continue;

      if (!map.has(normalizedKey)) {
        map.set(normalizedKey, {
          titulo: canonicalTitle,
          normalizedTitulo: normalizedKey,
          vagaIds: []
        });
      }
    }
  }

  // Ordena em ordem alfabética (pt-BR)
  return Array.from(map.values()).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/**
 * Normaliza string para comparação sem acentos e minúscula
 */
export function normalizeFilterText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filtra a lista de candidatos/candidaturas do Painel RH de forma puramente estruturada
 */
export function filterCandidatosAdmin(
  items: CandidatoAdminItem[],
  filters: AdminFilters
): CandidatoAdminItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const {
    lojaId,
    cargoId,
    cidade,
    estado,
    status,
    startDate,
    endDate,
    searchTerm
  } = filters;

  const normalizedCidade = normalizeFilterText(cidade);
  const normalizedEstado = normalizeFilterText(estado);
  const normalizedStatus = normalizeFilterText(status);
  const normalizedSearch = normalizeFilterText(searchTerm);

  let startTimestamp: number | null = null;
  if (startDate) {
    const d = new Date(`${startDate}T00:00:00`);
    if (!isNaN(d.getTime())) {
      startTimestamp = d.getTime();
    }
  }

  let endTimestamp: number | null = null;
  if (endDate) {
    const d = new Date(`${endDate}T23:59:59.999`);
    if (!isNaN(d.getTime())) {
      endTimestamp = d.getTime();
    }
  }

  // Monta mapa de vaga ID -> normalized título se cargosList for fornecido
  let vagaIdToNormalizedTitle: Map<string, string> | null = null;
  if (Array.isArray(filters.cargosList) && filters.cargosList.length > 0) {
    vagaIdToNormalizedTitle = new Map();
    for (const c of filters.cargosList) {
      if (c && c.id) {
        vagaIdToNormalizedTitle.set(c.id, normalizeFilterText(c.titulo || c.nome));
      }
    }
  }

  return items.filter(item => {
    // 0. Filtro de Registros Sintéticos de Teste (ocultos por padrão, preservados para auditoria)
    if (!filters.includeTestRecords && isItemRegistroTeste(item)) {
      return false;
    }

    // 1. Filtro Estruturado por Unidade Franqueada (loja_id)
    if (lojaId && lojaId.trim() !== '') {
      if (!item.loja_id || item.loja_id !== lojaId) {
        return false;
      }
    }

    // 2. Filtro Estruturado por Cargo / Vaga (cargo_id, título do cargo ou Candidatura Espontânea)
    if (cargoId && cargoId.trim() !== '') {
      if (cargoId === 'espontanea') {
        const isEspontanea = isCandidaturaEspontanea(item.vaga_interesse);
        if (!isEspontanea) return false;
      } else {
        const normalizedFilterCargo = normalizeFilterText(cargoId);

        // 1. Match semântico por equivalência de cargos oficiais e sinônimos
        const matchByEquivalence = areCargosEquivalent(item.vaga_interesse, cargoId);

        // 2. Match direto por vaga_interesse normalizada
        const matchByTitle = normalizeFilterText(item.vaga_interesse) === normalizedFilterCargo;

        // 3. Match direto por UUID se o filtro tiver recebido um UUID específico de vaga
        const matchByDirectId = Boolean(item.cargo_id && item.cargo_id === cargoId);

        // 4. Match pelo cargo da vaga a partir do mapa de cargos (cargosList)
        let matchByMappedVaga = false;
        if (vagaIdToNormalizedTitle && item.cargo_id) {
          const mappedTitle = vagaIdToNormalizedTitle.get(item.cargo_id);
          if (mappedTitle && (mappedTitle === normalizedFilterCargo || areCargosEquivalent(mappedTitle, cargoId))) {
            matchByMappedVaga = true;
          }
        }

        // 5. Se cargoId passado for um UUID de vaga existente, verificar equivalência com o cargo pretendido
        if (!matchByEquivalence && !matchByTitle && !matchByDirectId && !matchByMappedVaga && vagaIdToNormalizedTitle && cargoId) {
          const filterTitleFromUuid = vagaIdToNormalizedTitle.get(cargoId);
          if (filterTitleFromUuid) {
            const itemTitle = item.vaga_interesse || 
              (item.cargo_id ? vagaIdToNormalizedTitle.get(item.cargo_id) : '');
            if (itemTitle && (normalizeFilterText(itemTitle) === filterTitleFromUuid || areCargosEquivalent(itemTitle, filterTitleFromUuid))) {
              matchByMappedVaga = true;
            }
          }
        }

        if (!matchByEquivalence && !matchByTitle && !matchByDirectId && !matchByMappedVaga) {
          return false;
        }
      }
    }

    // 3. Filtro por Cidade de Residência (exclusivamente onde o candidato mora)
    if (normalizedCidade) {
      const candCity = item.candidato_cidade || item.cidade_residencia || item.cidade || '';
      const matchCandCidade = normalizeFilterText(candCity).includes(normalizedCidade);
      if (!matchCandCidade) {
        return false;
      }
    }

    // 4. Filtro por Estado (UF de residência do candidato)
    if (normalizedEstado) {
      const candState = item.candidato_estado || item.estado || '';
      const matchCandEstado = normalizeFilterText(candState) === normalizedEstado;
      if (!matchCandEstado) {
        return false;
      }
    }

    // 5. Filtro por Status da Candidatura
    if (normalizedStatus) {
      if (normalizeFilterText(item.status_candidatura) !== normalizedStatus) {
        return false;
      }
    }

    // 6. Filtro por Período de Submissão (inclusivo)
    if (startTimestamp !== null || endTimestamp !== null) {
      const itemTime = new Date(item.created_at).getTime();
      if (isNaN(itemTime)) return false;

      if (startTimestamp !== null && itemTime < startTimestamp) {
        return false;
      }
      if (endTimestamp !== null && itemTime > endTimestamp) {
        return false;
      }
    }

    // 7. Busca Textual Ampla (Nome, E-mail, Telefone, CPF, Vaga)
    if (normalizedSearch) {
      const searchDigits = normalizedSearch.replace(/\D/g, '');
      const telDigits = (item.telefone || '').replace(/\D/g, '');
      const cpfDigits = (item.cpf_mascarado || '').replace(/\D/g, '');

      const nomeMatch = normalizeFilterText(item.nome).includes(normalizedSearch);
      const emailMatch = normalizeFilterText(item.email).includes(normalizedSearch);
      const telMatch = searchDigits.length >= 3 ? telDigits.includes(searchDigits) : false;
      const cpfMatch = (item.cpf_mascarado || '').includes(normalizedSearch) || 
                       (searchDigits.length >= 3 && cpfDigits.includes(searchDigits));
      const vagaMatch = normalizeFilterText(item.vaga_interesse).includes(normalizedSearch);

      if (!nomeMatch && !emailMatch && !telMatch && !cpfMatch && !vagaMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Calcula os indicadores e gráficos do Dashboard Administrativo
 * de forma puramente reativa e precisa a partir da lista de itens filtrados.
 */
export function calculateDashboardStats(items: CandidatoAdminItem[]): {
  stats: KPIStats;
  timelineData: { date: string; count: number; fullDate: Date }[];
  heatmapData: number[];
} {
  const uniqueCandidatosSet = new Set<string>();
  const uniqueCandidaturasSet = new Set<string>();
  const uniqueLojasSet = new Set<string>();
  let bancoTalentosCount = 0;

  const porLoja: Record<string, number> = {};
  const porCidade: Record<string, number> = {};
  const porCargo: Record<string, number> = {};
  const porDia: Record<string, number> = {};
  const tMap: Record<string, { count: number; dateObj: Date }> = {};
  const hMap = new Array(24).fill(0);

  (items || []).forEach(cand => {
    // 1. Candidatos únicos: contagem por candidatos.id
    const candId = cand.candidato_id || cand.id;
    if (candId) uniqueCandidatosSet.add(candId);

    // 2. Total de candidaturas: contagem por candidaturas.id
    const canduraId = cand.candidatura_id || cand.id;
    if (canduraId) uniqueCandidaturasSet.add(canduraId);

    // 3. Unidades com candidaturas
    if (cand.loja_id) uniqueLojasSet.add(cand.loja_id);

    // 4. Candidaturas no Banco de Talentos
    if (cand.status_candidatura === 'Banco de Talentos' || cand.cargo_id === null) {
      bancoTalentosCount++;
    }

    // Gráfico 1: Candidaturas por Unidade (agrupando por loja_id e exibindo loja_nome)
    const nomeLoja = cand.loja_nome || 'Unidade Geral / Matriz';
    porLoja[nomeLoja] = (porLoja[nomeLoja] || 0) + 1;

    // Gráfico 2: Residência dos Candidatos (normalizada sem duplicações de UF)
    const rawCidade = cand.candidato_cidade || cand.cidade;
    const rawEstado = cand.candidato_estado || cand.estado;
    const cidadeNorm = normalizeCidadeResidencia(rawCidade, rawEstado);
    porCidade[cidadeNorm] = (porCidade[cidadeNorm] || 0) + 1;

    // Gráfico 3: Distribuição por Vaga
    const cargoNome = cand.vaga_interesse || 'Geral';
    porCargo[cargoNome] = (porCargo[cargoNome] || 0) + 1;

    // Timeline e Heatmap
    if (cand.created_at) {
      const d = new Date(cand.created_at);
      if (!isNaN(d.getTime())) {
        const diaStr = d.toLocaleDateString('pt-BR');
        porDia[diaStr] = (porDia[diaStr] || 0) + 1;

        const key = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!tMap[key]) tMap[key] = { count: 0, dateObj: new Date(d.getFullYear(), d.getMonth(), d.getDate()) };
        tMap[key].count++;

        const hour = d.getHours();
        if (hour >= 0 && hour < 24) {
          hMap[hour]++;
        }
      }
    }
  });

  const sortedTimeline = Object.keys(tMap).map(k => ({
    date: k,
    count: tMap[k].count,
    fullDate: tMap[k].dateObj
  })).sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());

  return {
    stats: {
      total: uniqueCandidaturasSet.size || (items || []).length,
      totalCandidatosUnicos: uniqueCandidatosSet.size,
      totalCandidaturas: uniqueCandidaturasSet.size || (items || []).length,
      unidadesComCandidaturas: uniqueLojasSet.size,
      bancoTalentosTotal: bancoTalentosCount,
      porLoja,
      porCidade,
      porCargo,
      porDia
    },
    timelineData: sortedTimeline,
    heatmapData: hMap
  };
}
