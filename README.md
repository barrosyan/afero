<div align="center">

# Afero

### O gêmeo digital industrial que prova o que afirma — e se recusa a concluir quando o dado não sustenta.

[![ci](https://github.com/barrosyan/afero/actions/workflows/ci.yml/badge.svg)](https://github.com/barrosyan/afero/actions/workflows/ci.yml)
[![demo](https://img.shields.io/badge/demo-online-3ddc97)](https://barrosyan.github.io/afero/)
[![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)
[![testes](https://img.shields.io/badge/testes-18%20passando-3ddc97)](packages/core/tests/core.test.ts)

**[▶ abrir a demo](https://barrosyan.github.io/afero/)** · **[▶ vídeo de 2 min](https://youtu.be/ZoxlmvQWWCg)** · [arquitetura](docs/ARQUITETURA.md) · [benchmark](benchmarks/REPORT.md) · [roteiro do vídeo](docs/VIDEO.md)

</div>

---

## O problema que a demo resolve

Numa planta industrial, o painel de manutenção preditiva dispara: *"vazão 8 % abaixo do esperado — falha hidráulica, substituir rotor"*.
O rotor é trocado. A bomba estava boa. O que tinha derivado era o **medidor de vazão**.

Esse erro tem nome — falso positivo de manutenção — e custa caro nas duas pontas: peça e parada que não eram necessárias, e a confiança do time no sistema de monitoramento, que nunca mais volta ao que era.

O motivo é estrutural. Um detector por limiar olha **sintoma** (o número saiu da faixa) e responde com **causa** (o equipamento falhou). Entre uma coisa e outra existe física, e é essa física que o Afero executa.

## O que o Afero faz

Recebe uma janela de telemetria de um conjunto motobomba e devolve um laudo em que **cada número tem origem declarada**:

| Camada | O que faz |
|---|---|
| **Modelo físico nominal** | Curva da bomba, leis de semelhança, NPSH, balanço de energia, modelo térmico de 1ª ordem do motor |
| **Redundância de medição** | Vazão estimada pela potência elétrica (método do torque) e pela pressão — independentes do medidor |
| **Nove verificações independentes** | Cada uma com limite declarado, valor medido e evidência auditável |
| **Atribuição determinística de causa** | Regras que combinam verificações; um único desvio nunca identifica causa |
| **Procedência das afirmações** | Toda frase do relatório cita a verificação que a sustenta — inclusive quando a frase vem de um LLM |

E, quando não dá para concluir, ele **diz isso**: dados travados ou incompletos derrubam a cobertura e o índice de confiança, e o laudo vira "dados insuficientes" em vez de um palpite.

### O momento que resume o produto

Na demo, escolha o cenário **"Medidor de vazão descalibrado"**:

- o detector por limiar conclui **"Degradação hidráulica — abrir OS para substituir o rotor"** (R$ 38.000 + 12 h de parada);
- o Afero conclui **"Medidor fora de calibração"** (R$ 1.800 + 1 h), e mostra por quê: os dois medidores de vazão discordam 7,9 % entre si, a estimativa independente por potência confirma 120,1 m³/h, e **na vazão efetiva a altura medida bate com a curva da bomba em 0,05 %** — a bomba está sadia.

A peça certa, pelo motivo certo.

## Resultado medido, não prometido

`npm run benchmark` reexecuta os 6 cenários com 25 sementes de ruído cada (150 diagnósticos) e reescreve [`benchmarks/REPORT.md`](benchmarks/REPORT.md):

| Métrica | Afero | Detector por limiar |
|---|---|---|
| Diagnóstico exato | **150/150 (100 %)** | 50/150 (33 %) |
| Falsos positivos de falha do equipamento | **0** | 50 |
| Falsos negativos (deixou passar defeito) | **0** | 50 |

Nenhum número dessa tabela é digitado à mão: o relatório é gerado pelo script, e o CI falha se ele estiver desatualizado. Os seis cenários têm verdade conhecida e a **mesma** janela de telemetria alimenta os dois sistemas.

## Como rodar

```bash
npm install
npm test          # 18 testes do núcleo (física, verificações, atribuição, procedência)
npm run benchmark # reescreve benchmarks/REPORT.md
npm run dev       # demo em http://localhost:5173
npm run api       # serviço HTTP em http://localhost:8787 (opcional)
```

Sem servidor, sem banco, sem chave de API: a demo roda 100 % no navegador — o solver hidráulico, as verificações e o índice de confiança são TypeScript puro no cliente.

## Arquitetura

```
packages/core/      física, verificações, atribuição e procedência (TypeScript, zero dependências)
  src/pump.ts         curva da bomba, semelhança, NPSH, energia, térmica
  src/solver.ts       bissecção com resíduo declarado: ponto de operação e inversões
  src/checks.ts       as nove verificações, com limites num só lugar auditável
  src/attribution.ts  as regras de causa, na ordem física que importa
  src/claims.ts       validador de rastreabilidade (o mesmo para texto humano e de LLM)
  src/sim/            gerador de telemetria sintética com verdade conhecida
apps/web/           demo estática (React + Vite), publicada no GitHub Pages
apps/api/           HTTP: /v1/diagnose e /v1/workorders, com narrativa por LLM validada
data/scenarios/     as janelas usadas na demo e no benchmark
docs/               arquitetura, roteiro do vídeo, conformidade com o regulamento
```

Detalhes de projeto — por que a vazão efetiva é a estimada pela potência e não a do medidor, e por que isso torna "sensor ou desgaste?" uma pergunta **identificável** — estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Automação: do sensor à ordem de serviço

O laudo não morre na tela. `POST /v1/workorders` leva a conclusão **junto com a evidência** para o sistema de manutenção (`CMMS_WEBHOOK_URL`), incluindo o índice de confiança, a cobertura das verificações e o status de cada uma:

```json
{ "assetId": "AST-P101", "diagnosis": "SENSOR_VAZAO_FORA_DE_CALIBRACAO",
  "confidence": 0.93, "trustScore": 61, "trustCoverage": 0.96,
  "title": "Calibrar o medidor de vazão do recalque",
  "evidence": [{ "checkId": "massa.continuidade", "status": "fail", "value": 7.95 }, ...] }
```

É esse pacote que faz a diferença na prática: o mecânico recebe a OS com o motivo, não com um número solto.

## O que é real e o que é sintético

Transparência antes de qualquer coisa, porque um sistema que promete verificação precisa começar por si:

- **Real e executado:** o solver hidráulico, as nove verificações, o índice de confiança, a atribuição de causa, o validador de procedência, o benchmark e os testes. Tudo roda de verdade, offline, no seu navegador e no CI.
- **Sintético e declarado:** a telemetria. Não há dado de planta industrial neste repositório — as janelas vêm de um modelo físico com defeitos injetados (`packages/core/src/sim/`), e cada cenário tem a verdade rotulada, usada **só** pelo benchmark, nunca pelo diagnóstico.
- **Premissas declaradas:** custos de manutenção (R$ 38.000 por rotor, R$ 1.800 por calibração) e tempos de parada são premissas do cenário, não cotação de mercado. A curva da bomba é de fabricante hipotético, e o laudo diz quando a curva não foi confirmada em campo.
- **Narrativa por LLM:** opcional e subordinada. Se `ANTHROPIC_API_KEY` estiver configurada, o serviço pede o texto ao modelo, que precisa citar a verificação de cada número; texto reprovado é descartado e o relatório determinístico prevalece. Sem chave — ou com chave inválida — o agente determinístico responde, e o laudo **declara** qual dos dois gerou o texto.

## Trilha

**Logística e automação** — o laço que o produto fecha é de automação de fluxo industrial: telemetria → verificação física → diagnóstico atribuído → ordem de serviço no sistema de manutenção, com conectores (`/v1/workorders`) e recusa explícita quando não há base para agir.

## Licença

MIT — ver [LICENSE](LICENSE). Leia, execute, teste e adapte.
