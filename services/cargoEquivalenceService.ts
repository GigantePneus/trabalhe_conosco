/**
 * Serviço Unificado de Equivalências e Padronização de Cargos (Prompt 95)
 * Projeto: Trabalhe Conosco — Gigante Pneus Multi-Lojas
 *
 * Mapeia e padroniza títulos de cargos entre:
 * 1. Tabela `cargos` do Supabase
 * 2. Campo `candidaturas.vaga_interesse`
 * 3. Nomes de subpastas no Google Drive
 * 4. Filtros e Dropdowns do Painel RH (AdminDashboard)
 */

export interface CanonicalCargoDefinition {
  titulo: string;
  driveFolder: string;
  sinonimos: string[];
}

export const CANONICAL_CARGOS: CanonicalCargoDefinition[] = [
  {
    titulo: 'Alinhador Automotivo',
    driveFolder: 'Alinhador',
    sinonimos: ['alinhador', 'alinhador automotivo', 'alinhamento', 'alinhador de direcao', 'alinhador de veiculos']
  },
  {
    titulo: 'Auxiliar de Pátio / Auxiliar de Mecânico',
    driveFolder: 'Auxiliar de Pátio',
    sinonimos: [
      'auxiliar de patio',
      'auxiliar de patio / auxiliar de mecanico',
      'aux patio',
      'auxiliar de mecanico',
      'auxiliar mecanico',
      'auxiliar de servicos gerais',
      'auxiliar geral',
      'ajudante geral',
      'ajudante de mecanico',
      'ajudante de patio',
      'auxiliar de patio-marisa da silva'
    ]
  },
  {
    titulo: 'Borracheiro',
    driveFolder: 'Borracheiro',
    sinonimos: ['borracheiro', 'borracharia', 'reparador de pneus', 'auxiliar de borracharia']
  },
  {
    titulo: 'Consultor de Vendas',
    driveFolder: 'Consultor de Vendas',
    sinonimos: ['consultor de vendas', 'consultora de vendas', 'vendas', 'vendedor', 'vendedora', 'consultor comercial', 'balconista']
  },
  {
    titulo: 'Estoquista',
    driveFolder: 'Estoquista',
    sinonimos: ['estoquista', 'estoque', 'auxiliar de estoque', 'almoxarife', 'conferente']
  },
  {
    titulo: 'Mecânico Automotivo',
    driveFolder: 'Mecânico',
    sinonimos: ['mecanico', 'mecanico automotivo', 'mecanica', 'mecanico de autos', 'mecanico geral', 'tecnico de mecanica']
  },
  {
    titulo: 'Recepcionista de Centro Automotivo',
    driveFolder: 'Recepcionista',
    sinonimos: ['recepcionista', 'recepcionista de centro automotivo', 'recepcao', 'atendente', 'atendimento ao cliente']
  }
];

/**
 * Normaliza string para comparação sem acentos, minúscula e com espaços comprimidos
 */
export function normalizeCargoText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Retorna o título canônico oficial a partir de qualquer sinônimo ou variação.
 * Caso não encontre correspondência, retorna o próprio texto higienizado.
 */
export function toCanonicalCargo(rawText: string | null | undefined): string {
  if (!rawText || typeof rawText !== 'string') return 'Banco de Talentos Geral';
  
  const norm = normalizeCargoText(rawText);
  if (!norm || norm === 'geral' || norm === 'banco de talentos' || norm.includes('espontanea')) {
    return 'Candidatura Espontânea / Banco de Talentos';
  }

  for (const def of CANONICAL_CARGOS) {
    const normTitulo = normalizeCargoText(def.titulo);
    if (norm === normTitulo) return def.titulo;
    for (const sin of def.sinonimos) {
      if (norm === normalizeCargoText(sin)) return def.titulo;
    }
  }

  // Se não foi match exato de lista, tenta match por inclusão segura de palavras-chave
  if (norm.includes('borrach')) return 'Borracheiro';
  if (norm.includes('alinhad')) return 'Alinhador Automotivo';
  if (norm.includes('estoqu') || norm.includes('almoxar')) return 'Estoquista';
  if (norm.includes('recep') || norm.includes('atendent')) return 'Recepcionista de Centro Automotivo';
  if (norm.includes('vend') || norm.includes('comercial')) return 'Consultor de Vendas';
  if (norm.includes('patio') || norm.includes('auxiliar')) {
    if (norm.includes('mecanic')) return 'Auxiliar de Pátio / Auxiliar de Mecânico';
    return 'Auxiliar de Pátio / Auxiliar de Mecânico';
  }
  if (norm.includes('mecanic')) return 'Mecânico Automotivo';

  return rawText.trim();
}

/**
 * Retorna o nome da subpasta no Google Drive a partir de qualquer título de cargo
 */
export function toDriveCargoSubfolder(rawText: string | null | undefined): string {
  const canonical = toCanonicalCargo(rawText);
  const found = CANONICAL_CARGOS.find(c => c.titulo === canonical);
  if (found) return found.driveFolder;
  return canonical.replace(/[/\\?%*:|"<>]/g, ' - ').replace(/\s+/g, ' ').trim();
}

/**
 * Verifica se dois cargos são equivalentes (ex: 'Mecânico' e 'Mecânico Automotivo')
 */
export function areCargosEquivalent(cargoA: string | null | undefined, cargoB: string | null | undefined): boolean {
  if (!cargoA || !cargoB) return false;
  const canonicalA = toCanonicalCargo(cargoA);
  const canonicalB = toCanonicalCargo(cargoB);
  if (canonicalA && canonicalB && canonicalA === canonicalB) return true;
  return normalizeCargoText(cargoA) === normalizeCargoText(cargoB);
}

/**
 * Determina se a candidatura é estritamente espontânea/geral (sem profissão identificada)
 */
export function isCandidaturaEspontanea(vagaInteresse: string | null | undefined): boolean {
  if (!vagaInteresse || typeof vagaInteresse !== 'string') return true;
  const norm = normalizeCargoText(vagaInteresse);
  if (!norm || norm === 'geral' || norm === 'banco de talentos geral' || norm === 'banco de talentos corporativo') {
    return true;
  }
  if (norm.includes('espontanea')) return true;

  // Se corresponder a qualquer cargo canônico, NÃO é espontânea
  for (const def of CANONICAL_CARGOS) {
    if (areCargosEquivalent(vagaInteresse, def.titulo)) return false;
  }

  return false;
}
