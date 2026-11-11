# 4. Infraestrutura Técnica e Pipeline CI/CD

O sistema foi arquitetado visando **escalabilidade corporativa** e facilidade de manutenção. Para garantir que as atualizações cheguem rapidamente à produção sem comprometer a estabilidade, construímos uma esteira automatizada (Continuous Integration / Continuous Deployment).

## 4.1 Pipeline de Automação (GitHub Actions)
Toda a base de código é versionada no GitHub. Sempre que uma nova funcionalidade é aprovada (um *Push* na branch `main`), a automação entra em ação:
1.  **Build Estático:** O código React é compilado usando Node.js, transformando TypeScript e TailwindCSS em arquivos hiper-otimizados.
2.  **Injeção de Secrets:** Variáveis sensíveis (Chaves do Supabase e MinIO) são injetadas em tempo de compilação a partir do GitHub Secrets, sem jamais ficarem expostas no código fonte.
3.  **Geração de Imagens Docker:** O sistema gera um container imutável da aplicação e o empurra (Push) para o DockerHub sob a conta corporativa (`gbacentrotecnico/rh-workspace`), tagueando a versão como `latest` e gerando um histórico numérico rastreável.

## 4.2 Orquestração de Produção (Docker Swarm & Traefik)
O ambiente de produção reside no Portainer, utilizando a robustez do Docker Swarm.

*   **Clusterização:** O frontend é configurado via arquivo Compose (`deploy-stack.yml`) com diretrizes estritas de alocação de nó (`node.role == manager`), isolando a camada de apresentação do banco de dados para evitar sobrecarga.
*   **Proxy Reverso e SSL:** O roteamento de entrada é assumido pelo **Traefik**. Ele intercepta automaticamente o tráfego do domínio oficial (`rh.gbamecanica.com.br`), aloca certificados HTTPS/SSL (Let's Encrypt) sob demanda e balanceia a carga interna para a porta 80 do Nginx que serve o React. Isso garante zero *downtime* e criptografia de ponta a ponta desde o momento em que o candidato digita o endereço no navegador.
