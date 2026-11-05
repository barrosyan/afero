# Conformidade com o regulamento do Hack Brasil 2026

Checklist conferido contra o [regulamento](https://hackbrasil.com/regulamento).

## Repositório e código

| Exigência | Situação |
|---|---|
| Repositório público no GitHub | Sim — `barrosyan/afero` |
| Criado **após** o fim da sessão de abertura (04/11/2026, 21h) | Sim — criado em 05/11/2026, histórico de commits inteiro posterior |
| Sem código copiado de antes do evento | Sim — nenhum arquivo importado de projeto anterior. A ideia de continuidade é a de verificação física de modelos; a implementação é nova |
| Sem histórico importado | Sim — `git init` no dia 05/11, primeiro commit é o inicial |
| Repositório permanece público até 15/12/2026 | Compromisso: não será tornado privado nem apagado antes disso |
| Licença que permite ao júri ler, executar e testar | Sim — MIT (`LICENSE`), sem restrição de uso |
| Dependências de terceiros com licença respeitada | Sim — React, Vite e TypeScript sob MIT; nenhuma dependência no núcleo |

## Submissão

| Exigência | Situação |
|---|---|
| Uma trilha | Logística e automação |
| Demo funcionando, sem login | GitHub Pages, 100 % no navegador |
| Vídeo de até 3 minutos, acessível sem login | https://youtu.be/ZoxlmvQWWCg — 2 min 54 s, gravado a partir da própria demo, 1920×1080, narração em pt-BR, legendas embutidas. Roteiro em `docs/VIDEO.md` |
| Nome, tagline e descrição | `docs/SUBMISSAO.md` |
| Um envio por time | Sim |

## Dados e integridade

| Exigência | Situação |
|---|---|
| Não expor dado pessoal real de terceiros | Sim — não há dado pessoal algum |
| Projetos de saúde usam dado sintético | Não se aplica (trilha de automação) |
| Ferramentas de IA permitidas e recomendadas | Sim — o serviço opcional usa LLM, e o produto funciona sem ele |
| Nenhuma ferramenta de patrocinador é exigida | Sim — nenhum produto de patrocinador é obrigatório para rodar, julgar ou ganhar |
| Sem categorias proibidas | Sim — nada de conteúdo adulto, substâncias, armas, assédio ou malware |

## Coisas que o júri pode verificar rapidamente

```bash
git log --reverse --format='%h %ad %s' --date=short | head -1   # primeiro commit: 2026-11-05
npm ci && npm test && npm run benchmark                          # 18 testes, benchmark reproduzível
```

Nenhum número do README é digitado à mão: o benchmark é gerado por `scripts/benchmark.ts` e o CI
falha se `benchmarks/REPORT.md` divergir do que o código produz.
