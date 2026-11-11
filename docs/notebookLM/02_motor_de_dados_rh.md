# 2. Motor de Dados: Vagas e Candidatos

## 2.1 Estrutura de Vagas (Cargos e Cidades)
O sistema possui uma modelagem de dados normalizada no PostgreSQL para garantir a integridade da informação.

*   **Tabela `cidades`:** Mantém o dicionário geográfico da empresa, permitindo análises futuras de densidade de talentos por região.
*   **Tabela `cargos` (Vagas):** Onde as oportunidades são registradas. Cada vaga pode ser ativada/desativada instantaneamente no painel público (`is_active`). Os cargos estão diretamente vinculados às cidades, formando a tríade de atração: Qual a posição, Onde ela se encontra, e Qual o status.

## 2.2 Ingestão de Dados do Candidato
A tabela `candidatos` é o coração do banco de talentos. Diferente de plataformas antigas, a coleta de dados divide-se em duas camadas:

1.  **Metadados Estruturados:** Nome, Email, Telefone, Idade, Link do LinkedIn/Portfólio. Esses dados são validados no frontend (React) antes de chegarem ao banco, garantindo que algoritmos de filtro possam atuar sem necessidade de processamento de linguagem natural pesada em um primeiro momento.
2.  **Blob Data (O Currículo):** O PDF enviado pelo candidato não é salvo no banco de dados para evitar estrangulamento de performance. Ele é enviado via pipeline seguro para o **MinIO (S3 Bucket: `curriculos`)**. O banco de dados salva apenas uma URI (`curriculo_url`), estabelecendo um ponteiro direto.

## 2.3 Fluxo Operacional
O painel administrativo consome esses dados em tempo real. Graças ao protocolo WebSocket do Supabase (embora usado via queries REST rápidas na implementação atual), as inscrições ficam disponíveis para o RH imediatamente. O painel inclui filtros combinados (Vaga + Cidade), permitindo que a triagem humana seja feita em segundos, enquanto a arquitetura permanece limpa para futuras integrações de APIs de triagem autônoma.
