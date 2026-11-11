# 3. Módulo de Pesquisas e AI Matching (Diferencial Tecnológico)

## 3.1 A Importância Estratégica das Pesquisas (Surveys)
O grande diferencial da plataforma do Grupo Abucci em relação aos sistemas ATS tradicionais é a integração nativa de um **Módulo de Pesquisas Dinâmicas**. Ele foi construído não apenas para avaliação de clima organizacional, mas como um vetor de captação de *soft skills*, alinhamento cultural e fit comportamental.

### Estrutura Técnica
*   **Tabela `pesquisas`:** Define os questionários. Podem ser ativados ou desativados (`is_active`) e expostos publicamente via links gerados pelo sistema.
*   **Tabela `respostas`:** Armazena de forma vinculada cada resposta ao seu questionário de origem, armazenando metadados como Nome, Contato, Setor/Unidade e as considerações abertas.

## 3.2 O Conceito de AI Matching
Ter o recrutamento e as avaliações organizacionais operando sobre a mesma fundação de dados no Supabase permite o que chamamos de **AI Matching**.

### Como a IA atua na arquitetura atual:
Como todos os dados textuais (currículos em PDF extraídos e campos abertos das pesquisas) estão centralizados, ferramentas como o **NotebookLM** (ou modelos LLMs acoplados via API no futuro) podem cruzar informações multidimensionais.

1.  **Análise de Sentimento nas Pesquisas:** A IA pode ler centenas de entradas da tabela `respostas` para identificar gargalos operacionais ocultos ou padrões de satisfação por setor (Ex: "A unidade X tem alta menção de problemas de infraestrutura").
2.  **Match Candidato x Cultura (Vaga):** Ao alimentar um LLM com as diretrizes do RH e o perfil desejado para a vaga, a IA pode cruzar os requisitos com os metadados da tabela `candidatos` e realizar parsing (leitura) dos PDFs hospedados no MinIO, ranqueando os candidatos com maior índice de adequação técnica e cultural de forma autônoma.
3.  **Redução de Viés:** O processamento via IA estruturada foca exclusivamente nas qualificações e respostas técnicas, mitigando o viés humano na primeira camada de triagem.
