import React from 'react';
import { 
  ProgressCalculationParams, 
  ProgressResult, 
  calculateFormProgress, 
  getProgressMessage, 
  defaultIsValidCPF 
} from '../services/formProgressService';

export { 
  type ProgressCalculationParams, 
  type ProgressResult, 
  calculateFormProgress, 
  getProgressMessage, 
  defaultIsValidCPF 
};

export interface CandidateFormProgressProps {
  progress: number;
  message?: string;
  className?: string;
}

export const CandidateFormProgress: React.FC<CandidateFormProgressProps> = ({
  progress,
  message,
  className = ''
}) => {
  const currentMessage = message || getProgressMessage(progress);
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div 
      className={`w-full py-2.5 sm:py-3 px-3 sm:px-6 rounded-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-100 dark:border-gray-800 shadow-sm transition-all duration-300 ${className}`}
      aria-label="Progresso do preenchimento do cadastro"
    >
      {/* Linha de Cabeçalho: Mensagem de Incentivo e Percentual */}
      <div className="flex items-center justify-between text-xs mb-1.5 sm:mb-2 select-none">
        <span className="font-bold text-gray-700 dark:text-gray-300 truncate tracking-tight text-[11px] sm:text-xs">
          {currentMessage}
        </span>
        <span 
          className="font-mono font-black text-red-600 dark:text-red-400 text-xs sm:text-sm shrink-0 ml-2"
          aria-hidden="true"
        >
          {clampedProgress}%
        </span>
      </div>

      {/* Barra de Progresso Acessível */}
      <div 
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedProgress}
        aria-valuetext={`${clampedProgress}% concluído: ${currentMessage}`}
        className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 sm:h-2 overflow-hidden relative"
      >
        <div 
          className="bg-red-600 dark:bg-red-500 h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
};

export default CandidateFormProgress;
