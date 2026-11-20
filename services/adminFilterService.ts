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
