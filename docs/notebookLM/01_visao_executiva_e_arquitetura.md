# 1. Visão Executiva e Arquitetura do Sistema

## 1.1 Objetivo do Sistema
O Sistema de Banco de Currículos do **Grupo Abucci** é uma plataforma proprietária de ponta a ponta projetada para modernizar a atração, retenção e análise de talentos. Diferente de soluções de prateleira engessadas, a arquitetura foi desenvolvida com um foco técnico claro: **coleta de dados estruturados para viabilizar análises avançadas de Inteligência Artificial (AI Matching)**.

## 1.2 Arquitetura de Alto Nível
O sistema opera em uma arquitetura moderna baseada em microsserviços (Containerização) e Cloud-Native:
*   **Frontend (Apresentação e Coleta):** Desenvolvido em React (Vite) + TypeScript, garantindo alta performance, segurança de tipagem e uma interface responsiva (UI/UX) otimizada para conversão de candidatos.
*   **Backend & Database:** Supabase (PostgreSQL), rodando como backend-as-a-service (BaaS). Oferece segurança em nível de linha (RLS - Row Level Security) para proteção de dados sensíveis da LGPD.
*   **Object Storage (Arquivos):** MinIO, um cluster de armazenamento S3-compatible de alta performance e disponibilidade para hospedar milhares de currículos em PDF de forma criptografada e segura.
*   **Infraestrutura e Orquestração:** Implantação on-premise/cloud via Docker Swarm, com proxy reverso Traefik cuidando do balanceamento de carga e criptografia SSL/TLS automática para o domínio `rh.gbamecanica.com.br`.

## 1.3 Alinhamento Estratégico para a Diretoria
O principal valor agregado da plataforma não é ser apenas um repositório de currículos, mas sim um **Motor de Dados Preparado para IA**. Ao invés de lidar com caixas de e-mail desorganizadas, o sistema ingere informações de candidatos e resultados de pesquisas de clima em um banco de dados relacional (SQL) perfeitamente estruturado. Essa fundação técnica é o pré-requisito fundamental para a aplicação de algoritmos de Machine Learning e LLMs (Large Language Models) na etapa de triagem.
