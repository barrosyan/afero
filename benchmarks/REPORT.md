# Benchmark — Afero contra detector por limiar

Gerado por `npm run benchmark` (`scripts/benchmark.ts`). Reproduzível: as
sementes de ruído são fixas e o gerador é determinístico.

- **Cenários:** 6
- **Sementes por cenário:** 25
- **Execuções de diagnóstico:** 150

## Resultado por cenário

| Cenário | Verdade | Afero | Limiar | Trust médio |
|---|---|---|---|---|
| Operação normal | `NORMAL` | 25/25 | 25/25 | 96 |
| Medidor de vazão descalibrado | `SENSOR_VAZAO_FORA_DE_CALIBRACAO` | 25/25 | 0/25 | 61 |
| Desgaste real do rotor | `DEGRADACAO_HIDRAULICA` | 25/25 | 25/25 | 67 |
| Cavitação por NPSH insuficiente | `CAVITACAO` | 25/25 | 0/25 | 81 |
| Estrangulamento de válvula | `OPERACAO_FORA_DE_DOMINIO` | 25/25 | 0/25 | 89 |
| Instrumentação degradada | `DADOS_INSUFICIENTES` | 25/25 | 0/25 | 25 |

## Total

| Métrica | Afero | Detector por limiar |
|---|---|---|
| Diagnóstico exato | **150/150 (100.0%)** | 50/150 (33.3%) |
| Falsos positivos de falha do equipamento | 0 | 50 |
| Falsos negativos (deixou passar defeito) | 0 | 50 |

## Custo evitado nos falsos positivos

Premissas declaradas, não dado de mercado: substituição de rotor
R$ 38.000 + 12 h de parada; calibração de medidor
R$ 1.800 + 1 h.

Nas 50 execuções em que o detector por limiar mandaria abrir OS de
substituição de rotor sem que houvesse degradação, o custo evitado seria de
**R$ 1.810.000** — sob as premissas acima.

## Como reproduzir

```bash
npm run benchmark
```

O relatório é reescrito com os números da execução. Nenhum número deste arquivo
é digitado à mão.
