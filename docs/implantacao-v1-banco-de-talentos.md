# CHECKLIST DE IMPLANTAÇÃO — BANCO DE TALENTOS V1 DEFINITIVA

**Projeto:** Trabalhe Conosco — Gigante Pneus Multi-Lojas  
**Ambiente Alvo:** Supabase Oficial (`hidayzojjztfyuefmknz`) + Vercel Production  
**Documento Técnico:** Plano Operacional de Ativação  
**Data de Criação:** 13/11/2026

---

## VISÃO GERAL E CRITÉRIOS DE SEGURANÇA

Este procedimento estabelece a sequência coordenada para a implantação da V1 definitiva do Banco de Talentos Corporativo, garantindo:
1. **Zero Downtime:** A aplicação em produção não sofrerá descontinuidade durante a janela.
2. **Compatibilidade Transacional:** Uso da RPC versionada `registrar_candidatura_transacional_v2` sem `DROP FUNCTION CASCADE`.
3. **Preservação Operacional:** Isolamento estrito de 28 lojas, cargos, permissões e usuários.
4. **Capacidade de Rollback:** Reversão atômica em qualquer etapa antes da validação final.

---

## FASE A — PRÉ-IMPLANTAÇÃO

### A.1 Estado do Repositório Git
- [ ] Verificar que não há alterações não commitadas acidentais (`git status`).
- [ ] Confirmar que o diretório `backups/` e arquivos sensíveis permanecem estritamente ignorados pelo `.gitignore`.
- [ ] Confirmar que nenhuma credencial ou chave privada foi exposta.

### A.2 Estado do Banco Supabase Oficial
- [ ] Executar contagem prévia de segurança:
  * `SELECT count(*) FROM public.candidatos;` (Esperado: 6)
  * `SELECT count(*) FROM public.candidaturas;` (Esperado: 8)
  * `SELECT count(*) FROM public.lojas;` (Esperado: 28)
  * `SELECT count(*) FROM public.cargos;` (Esperado: 2)

### A.3 Backup Comprovado
- [ ] Confirmar a presença dos arquivos de backup locais:
  * `backups/backup_homologacao_2026-11-13T13-59-40-079Z.json`
  * `backups/restauracao_homologacao_2026-11-13T13-59-40-079Z.sql`
- [ ] Validar hashes SHA-256 dos arquivos de backup.

### A.4 Critério de Aprovação da Fase A
> **Condição:** Contagens batendo 100% com o inventário e backup íntegro.  
> **Ação em caso de divergência:** **ABORTAR** imediatamente para nova conferência.

---

## FASE B — LIMPEZA CONTROLADA DOS DADOS DE HOMOLOGAÇÃO

### B.1 Autorização Humana
- [ ] Obter autorização expressa do responsável técnico/direção para zerar os registros de teste.

### B.2 Execução no Supabase SQL Editor
- [ ] Abrir o arquivo `scripts/limpeza_homologacao_segura.sql`.
- [ ] Substituir a última instrução de `ROLLBACK;` para `COMMIT;`.
- [ ] Executar o script em bloco único transacional.

### B.3 Verificação Pós-Limpeza
- [ ] Confirmar que as tabelas de recrutamento foram zeradas:
  * `candidatos` = 0
  * `candidaturas` = 0
  * `candidato_curriculos` = 0
  * `upload_transacoes` = 0
- [ ] Confirmar que as tabelas operacionais estão intactas:
  * `lojas` = 28
  * `cargos` = 2
  * `perfis` >= 2

### B.4 Limpeza de Arquivos no Google Drive Corporativo
- [ ] Excluir os 4 arquivos de teste identificados no manifesto:
  1. `1wekYXU_2flBOShWaE1H20Vjs0Wa211lc`
  2. `1k22grkDJb7axlesZYFlNLpuyLXjDodmF`
  3. `1fmcCkXxedd1ona1qrouIoBigmM0ikDTk`
  4. `1He0raALPog5LbA5jMyw4DiXL3mBw3tRY`

### B.5 Critério de Aprovação da Fase B
> **Condição:** Tabelas de recrutamento zeradas e infraestrutura operacional 100% preservada.  
> **Ação em caso de erro:** Rollback imediato no PostgreSQL (abortar transação).

---

## FASE C — ATIVAÇÃO DA MIGRATION 007 E RPC V2

### C.1 Aplicação do Schema
- [ ] Executar o arquivo `supabase/migrations/007_v1_banco_de_talentos_schema.sql` no Supabase SQL Editor:
  * Adiciona colunas `apresentacao_pessoal` e `experiencia_profissional` em `candidaturas`.
  * Cria constraint `chk_candidaturas_apresentacao_length` (80 - 2.000 caracteres).
  * Cria função transacional versionada `public.registrar_candidatura_transacional_v2`.
  * Concede permissão `EXECUTE` para `postgres` e `service_role`.

### C.2 Recarga do Schema Cache do PostgREST
- [ ] Executar no SQL Editor:
  ```sql
  NOTIFY pgrst, 'reload schema';
  ```
- [ ] Aguardar 5 segundos para a propagação no gateway de API do Supabase.

### C.3 Validação da Função no Banco
- [ ] Executar query de verificação:
  ```sql
  SELECT proname, prosecdef 
  FROM pg_proc 
  WHERE proname = 'registrar_candidatura_transacional_v2';
  ```

### C.4 Critério de Aprovação da Fase C
> **Condição:** Função `registrar_candidatura_transacional_v2` criada com sucesso e acessível via PostgREST.  
> **Plano de Reversão da Fase C:** Executar `supabase/migrations/007_rollback_v1_banco_de_talentos_schema.sql`.

---

## FASE D — HOMOLOGAÇÃO REAL CONTROLADA

Executar os 5 testes canônicos no ambiente de testes:

### Teste D.1 — Candidatura SEM Currículo (Currículo Opcional V1)
- [ ] Preencher formulário com identificação válida.
- [ ] Preencher Apresentação Pessoal com 120 caracteres.
- [ ] Preencher histórico profissional com última empresa e cargo.
- [ ] Não anexar arquivo PDF.
- [ ] Submeter candidatura.
- [ ] **Critério:** Protocolo gerado, `curriculo_id` = NULL, registro criado com sucesso.

### Teste D.2 — Candidatura COM Currículo (Upload Real Google Drive)
- [ ] Preencher formulário completo.
- [ ] Anexar currículo em PDF legítimo.
- [ ] Submeter candidatura.
- [ ] **Critério:** Arquivo enviado ao Google Drive corporativo na pasta da loja, protocolo gerado, `curriculo_id` preenchido.
- [ ] Abrir Painel RH e clicar em "Ver Currículo" -> PDF abre perfeitamente.

### Teste D.3 — Primeiro Emprego
- [ ] Selecionar opção "Primeiro Emprego" no formulário.
- [ ] Preencher disponibilidade de início.
- [ ] Submeter candidatura.
- [ ] **Critério:** Painel RH exibe badge azul "Primeiro Emprego" e oculta campos vazios de empresas anteriores.

### Teste D.4 — Filtros Estruturados do Banco de Talentos
- [ ] Filtrar por Unidade Franqueada -> exibe apenas candidatos daquela loja.
- [ ] Filtrar por Cargo -> exibe apenas inscritos na vaga selecionada.
- [ ] Filtrar por Candidatura Espontânea -> exibe inscrições espontâneas.
- [ ] Filtrar por Status -> exibe status correspondente.
- [ ] Clicar em "Limpar Filtros" -> lista completa é restaurada.

### Teste D.5 — Permissões de Acesso por Unidade (RLS)
- [ ] Acessar com perfil de Franqueado de Loja -> enxerga apenas candidatos da sua própria loja.
- [ ] Acessar com perfil Gestor Master -> visão consolidada de todas as lojas.

### D.6 Critério de Aprovação da Fase D
> **Condição:** Todos os 5 testes aprovados com persistência e visualização corretas.

---

## FASE E — PUBLICAÇÃO E DEPLOY EM PRODUÇÃO

### E.1 Compilação e Verificação de Build
- [ ] Executar `npx tsc --noEmit` -> 0 erros.
- [ ] Executar `npm run build:serverless` -> Bundles gerados em `/api`.
- [ ] Executar `npm run build` -> Frontend Vite minificado em `/dist`.
- [ ] Executar todas as 3 suítes de testes automatizados:
  * `node scripts/test-v1-talentos.mjs`
  * `node scripts/test-progresso-candidato.mjs`
  * `node scripts/test-filtros-rh.mjs`

### E.2 Publicação no Repositório Remoto
- [ ] `git add` arquivos de código aprovados (sem incluir backups nem PII).
- [ ] `git commit -m "feat(v1): Banco de Talentos Definitivo Gigante Pneus - Curriculo Opcional e RPC V2"`.
- [ ] `git push origin main`.

### E.3 Deploy na Vercel
- [ ] Acompanhar o build e deploy na Vercel Production.
- [ ] Verificar logs de runtime das Serverless Functions.
- [ ] Realizar teste de fumaça na URL de produção:
  * Abrir formulário público `/cadastro` (progresso inicia em 0%).
  * Acessar Painel RH `/admin` (filtros e dossiê profissional funcionando).

### E.4 Plano de Rollback da Fase E
> Em caso de falha crítica na Vercel:
> 1. Executar rollback instantâneo para o deployment anterior no painel da Vercel.
> 2. O banco continuará compatível pois a RPC v1 legada permanece ativa.
