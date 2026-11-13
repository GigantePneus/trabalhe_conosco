/**
 * Serviço de Filtragem Estruturada do Banco de Talentos (Prompt 65)
 * Projeto: Trabalhe Conosco — Gigante Pneus Multi-Lojas
 */

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
  cargoId?: string; // UUID ou 'espontanea'
  cidade?: string;
  estado?: string;
  status?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  searchTerm?: string;
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

  return items.filter(item => {
    // 1. Filtro Estruturado por Unidade Franqueada (loja_id)
    if (lojaId && lojaId.trim() !== '') {
      if (!item.loja_id || item.loja_id !== lojaId) {
        return false;
      }
    }

    // 2. Filtro Estruturado por Cargo / Vaga (cargo_id ou Candidatura Espontânea)
    if (cargoId && cargoId.trim() !== '') {
      if (cargoId === 'espontanea') {
        const isEspontanea = !item.cargo_id || 
          normalizeFilterText(item.vaga_interesse).includes('espontanea') ||
          normalizeFilterText(item.vaga_interesse) === 'geral';
        if (!isEspontanea) return false;
      } else {
        if (item.cargo_id !== cargoId) {
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
