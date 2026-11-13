import React, { useState } from 'react';
import { Briefcase, Building2 } from 'lucide-react';

export const DEFAULT_JOB_HERO_IMAGE = '/imagens/banner%20vagas%20-%20gigante%20pneus.png';
export const DEFAULT_JOB_MOBILE_IMAGE = '/imagens/banner%20vagas%20-%20mobile%20-%20Gigante%20Pneus.png';

/**
 * Normaliza caminhos legados ou temporários para os ativos estáticos oficiais e permanentes.
 */
export function normalizeJobImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') {
    return DEFAULT_JOB_HERO_IMAGE;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_JOB_HERO_IMAGE;
  }

  // Mapeia referências antigas compiladas do Vite (/assets/banner vagas...) para a rota estática pública (/imagens/...)
  if (
    trimmed.startsWith('/assets/banner%20vagas') ||
    trimmed.startsWith('/assets/banner vagas') ||
    trimmed.includes('banner%20vagas%20-%20gigante%20pneus') ||
    trimmed.includes('banner vagas - gigante pneus')
  ) {
    return DEFAULT_JOB_HERO_IMAGE;
  }

  return trimmed;
}

export interface JobImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  containerClassName?: string;
  lojaNome?: string | null;
  titulo?: string | null;
  aspectRatio?: 'hero' | 'card' | 'thumbnail' | 'square';
  priority?: boolean;
}

/**
 * Componente reutilizável de imagem de vaga com fallback visual da Gigante Pneus.
 * - No modo 'hero' (página de detalhes): acompanha a proporção natural da imagem (width: 100%, height: auto)
 *   sem forçar corte, sem object-fit: cover e sem limites arbitrários de altura.
 * - Nos modos menores ('card', 'thumbnail', 'square'): preserva os layouts fixos compactos.
 * - Se a URL falhar, tenta o banner institucional padrão e, em última instância, fallback vetorial estético.
 */
export const JobImage: React.FC<JobImageProps> = ({
  src,
  alt,
  className = '',
  containerClassName = '',
  lojaNome,
  titulo,
  aspectRatio = 'hero',
  priority = false
}) => {
  const normalizedSrc = normalizeJobImageUrl(src);
  const [currentSrc, setCurrentSrc] = useState<string>(normalizedSrc);
  const [hasTriedFallback, setHasTriedFallback] = useState<boolean>(normalizedSrc === DEFAULT_JOB_HERO_IMAGE);
  const [hasFailedCompletely, setHasFailedCompletely] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isHero = aspectRatio === 'hero';

  // Proporções para modos não-hero
  const fixedRatioClasses = {
    card: 'aspect-[16/9] w-full',
    thumbnail: 'w-16 h-16 shrink-0',
    square: 'aspect-square w-full'
  }[aspectRatio as 'card' | 'thumbnail' | 'square'] || '';

  const handleImageError = () => {
    setIsLoading(false);
    if (!hasTriedFallback && currentSrc !== DEFAULT_JOB_HERO_IMAGE) {
      // Tenta o banner institucional padrão da Gigante Pneus
      setHasTriedFallback(true);
      setCurrentSrc(DEFAULT_JOB_HERO_IMAGE);
    } else {
      // Se até o arquivo local padrão falhar, ativa o fallback vetorial elegante
      setHasFailedCompletely(true);
    }
  };

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  // Se falhou completamente em carregar qualquer imagem física
  if (hasFailedCompletely) {
    const fallbackRatio = isHero ? 'aspect-[16/9] min-h-[220px] md:min-h-[300px] w-full' : fixedRatioClasses;
    return (
      <div
        className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0c3c7a] via-[#072a5a] to-[#041733] border border-[#0c3c7a] flex flex-col items-center justify-center p-6 text-center shadow-xl text-white ${fallbackRatio} ${containerClassName}`}
        role="img"
        aria-label={alt}
      >
        <div className="absolute inset-0 bg-[radial-gradient(#ffcc00_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />
        <div className="relative z-10 space-y-2 max-w-md">
          <div className="w-12 h-12 bg-red-600/90 rounded-2xl flex items-center justify-center mx-auto shadow-lg text-white">
            <Briefcase className="h-6 w-6" />
          </div>
          <h3 className="text-lg md:text-xl font-black tracking-tight leading-tight text-white line-clamp-1">
            {titulo || alt}
          </h3>
          {lojaNome && (
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Building2 className="h-3.5 w-3.5" /> {lojaNome}
            </p>
          )}
        </div>
      </div>
    );
  }

  // MODO HERO: Proporção natural 100% visível, sem cortes e sem barras vazias
  if (isHero) {
    return (
      <div className={`relative overflow-hidden w-full ${containerClassName}`}>
        {isLoading && (
          <div className="aspect-[1620/971] w-full bg-slate-200 dark:bg-slate-800 animate-pulse rounded-[2rem]" />
        )}
        <img
          src={currentSrc}
          alt={alt}
          width={1620}
          height={971}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={handleImageError}
          onLoad={handleImageLoad}
          className={`w-full h-auto block rounded-[2rem] transition-opacity duration-300 ${
            isLoading ? 'opacity-0 absolute inset-0' : 'opacity-100 relative'
          } ${className}`}
        />
      </div>
    );
  }

  // DEMAIS MODOS (card, thumbnail, square): Layout fixo
  return (
    <div className={`relative overflow-hidden ${fixedRatioClasses} ${containerClassName}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-[2rem]" />
      )}
      <img
        src={currentSrc}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={handleImageError}
        onLoad={handleImageLoad}
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'} ${className}`}
      />
    </div>
  );
};

export default JobImage;
