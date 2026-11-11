# 5. Proposta de Processos Operacionais (RH)

Sendo uma plataforma recém-inaugurada e altamente escalável, ela atua como uma folha em branco onde o Grupo Abucci pode desenhar seus fluxos de trabalho ideais. Abaixo, são propostos os pilares operacionais (SOPs - Standard Operating Procedures) desenhados com base nas capacidades técnicas que a plataforma já oferece nativamente.

## 5.1 Processo 1: Abertura e Encerramento de Vagas (Lifecycle)
*   **Criação:** Toda necessidade de contratação deve gerar uma entrada na tabela de `Cargos` pelo painel de controle administrativo. A nomenclatura do cargo deve ser padronizada para facilitar o AI Matching (ex: "Técnico de Manutenção Jr.").
*   **Vínculo Geográfico:** A vaga deve ser obrigatoriamente atrelada a uma cidade pré-cadastrada, garantindo que os candidatos tenham clareza do local de atuação.
*   **Congelamento:** Assim que a triagem fechar um *shortlist* (lista curta de aprovados), o RH não deve deletar a vaga. O botão de ativação/desativação no painel deve ser usado. Isso garante que as métricas de tempo de fechamento da vaga fiquem gravadas no banco de dados para auditoria.

## 5.2 Processo 2: Triagem e Banco Ativo (Talent Pool)
*   **Triagem Primária:** A triagem deve iniciar pelos metadados estruturados (Cidade desejada e Cargo). Currículos fora desses espectros são filtrados imediatamente pela interface.
*   **Reciclagem:** Como os currículos estão salvos com segurança no MinIO, candidatos não selecionados para uma vaga na "Cidade A" tornam-se um *Talent Pool* ativo. O RH pode consultar o histórico de inscritos nas tabelas do sistema antes de abrir vagas externas pagas em outras plataformas.
*   **Segurança LGPD:** Os arquivos PDF (blob data) no bucket do MinIO não são de acesso público indexável pelo Google; apenas a aplicação possui as chaves de requisição de visualização. O processo interno do RH deve proibir o download de currículos em máquinas locais, encorajando a visualização em tela dentro do painel protegido por senha.

## 5.3 Processo 3: Ciclo de Pesquisas e Avaliações (Surveys)
*   As pesquisas não precisam ser apenas para clima organizacional. Podem ser usadas para **testes técnicos**.
*   **Processo Sugerido:** Criar um formulário ("Pesquisa") com perguntas técnicas cruciais para a área de manutenção/engenharia. Os candidatos finalistas recebem o link específico daquela pesquisa. As respostas caem na plataforma e podem ser imediatamente jogadas contra o motor do NotebookLM para analisar coerência técnica antes mesmo da entrevista final.
