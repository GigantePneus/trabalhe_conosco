
import React from 'react';
import { 
  TrendingUp, 
  MapPin, 
  Users, 
  Award, 
  Briefcase, 
  GraduationCap 
} from 'lucide-react';

export const COLORS = {
  primary: '#FFD100', // Gigante Yellow
  secondary: '#1A1A1A', // Dark
  accent: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#F3F4F6'
};

export const ADVANTAGES = [
  { icon: <TrendingUp className="w-6 h-6" />, title: 'Oportunidades reais de crescimento profissional' },
  { icon: <MapPin className="w-6 h-6" />, title: 'Rede com atuação nacional' },
  { icon: <Users className="w-6 h-6" />, title: 'Ambiente de trabalho colaborativo' },
  { icon: <Award className="w-6 h-6" />, title: 'Valorização de talentos' },
  { icon: <Briefcase className="w-6 h-6" />, title: 'Possibilidade de atuar em diversas áreas' },
  { icon: <GraduationCap className="w-6 h-6" />, title: 'Aprendizado contínuo' },
];

export const APP_STEPS = [
  { id: 1, title: 'Localização', description: 'Escolha a cidade e a loja onde deseja trabalhar' },
  { id: 2, title: 'Função', description: 'Selecione a função desejada' },
  { id: 3, title: 'Envio', description: 'Envie seu currículo de forma rápida e segura' },
  { id: 4, title: 'Aguarde', description: 'Aguarde nosso contato' },
];
