import { ConfigItem, JobLandingContent } from './types';

export const DEFAULT_JOB_HERO_IMAGE_PATH = '/imagens/banner%20vagas%20-%20gigante%20pneus.png';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const createDefaultJobLanding = (jobName: string): JobLandingContent => ({
  published: false,
  slug: slugify(jobName || 'nova-vaga'),
  title: jobName || 'Nova Vaga',
  heroImageUrl: DEFAULT_JOB_HERO_IMAGE_PATH,
  location: 'A combinar',
  workModel: 'Presencial',
  shortDescription: 'Descreva em 2 ou 3 linhas o impacto desta vaga para o time.',
  salary: 'A combinar',
  benefits: ['Vale alimentacao', 'Plano de saude'],
  responsibilities: ['Descreva as responsabilidades principais da funcao'],
  requirements: ['Descreva os requisitos obrigatorios da funcao'],
  agentContext: ''
});

export const parseJobLandingFromRequisitos = (cargo: ConfigItem): JobLandingContent => {
  const cargoNome = cargo.titulo || cargo.nome || 'Nova Vaga';
  const rawValue = cargo.requisitos as any;
  const raw = typeof rawValue === 'string' ? rawValue.trim() : (rawValue ? JSON.stringify(rawValue) : '');
  if (!raw) {
    return createDefaultJobLanding(cargoNome);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultJobLanding(cargoNome),
      ...parsed,
      title: parsed?.title || cargoNome,
      slug: parsed?.slug || slugify(cargoNome),
      benefits: Array.isArray(parsed?.benefits) ? parsed.benefits : createDefaultJobLanding(cargoNome).benefits,
      responsibilities: Array.isArray(parsed?.responsibilities) ? parsed.responsibilities : createDefaultJobLanding(cargoNome).responsibilities,
      requirements: Array.isArray(parsed?.requirements) ? parsed.requirements : createDefaultJobLanding(cargoNome).requirements
    };
  } catch {
    return {
      ...createDefaultJobLanding(cargoNome),
      requirements: [raw],
      agentContext: raw
    };
  }
};

export const serializeJobLanding = (landing: JobLandingContent) => JSON.stringify(landing);

export const toLines = (value: string) =>
  value
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);
