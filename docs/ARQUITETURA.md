# Arquitetura e decisões de projeto

Este documento explica **por que** o Afero é construído assim. O código é curto; o que
justifica as escolhas é o que está aqui.

---

## 1. O ativo e o modelo nominal

Conjunto motobomba P-101, água a 25 °C, 120 m³/h @ 45 m, motor de 30 kW, 3550 rpm.
Todos os parâmetros estão em [`packages/core/src/assets.ts`](../packages/core/src/assets.ts), num
único objeto auditável.

**Curva da bomba**, corrigida pelas leis de semelhança (`s = n/n₀`):

```
H(Q) = s²·h₀ − a·Q²              h₀ = 55 m, a = 6,944·10⁻⁴ m/(m³/h)²
η(Q) = ηmax·(1 − ((Q/s − Qbep)/w)²)   ηmax = 0,72, Qbep = 120 m³/h, w = 132 m³/h
NPSHr(Q) = 4,5·((Q/s)/Qbep)²
```

**Sistema:** `H_sys(Q) = 20 + k·Q²`, com `k = 1,736·10⁻³` a válvula 100 % aberta. A válvula é
tratada como orifício (`k ∝ 1/abertura²`), o que permite simular estrangulamento.

**Energia:** `P_hid = ρgQH`, `P_eixo = P_hid/η`, `P_elétrica = P_eixo/0,93`.

**Térmica do motor** (concentrada, 1ª ordem): `C dΔT/dt = P_perda − ΔT/R_th`, com
`R_th = 0,0367 K/W` e `τ = R_th·C = 121 min`. É a mesma equação que a verificação integra.

**NPSH disponível:** `NPSHa = (p_sucção − p_vapor)/(ρg)`, com `p_vapor = 3,17 kPa`.

O solver do ponto de operação é **bissecção com critério de parada declarado** e devolve
número de iterações e resíduo final. Nenhum resultado entra no laudo sem resíduo.

---

## 2. Identificabilidade: por que "sensor ou desgaste?" tem resposta

Esta é a decisão de projeto mais importante do sistema.

Um erro de ganho no medidor de vazão e um desgaste real de rotor produzem o **mesmo sintoma
superficial**: a vazão lida fica abaixo do esperado. Um sistema que decide por sintoma acusa
o equipamento nos dois casos — e acerta 50 % das vezes.

A saída não é um modelo melhor: é **medir a mesma grandeza por dois caminhos independentes** e
perguntar qual hipótese explica os três instrumentos ao mesmo tempo.

O Afero estima a vazão por **potência elétrica** (método do torque): inverte
`P_elétrica(Q) = ρgQH_nominal(Q)/(η(Q)·0,93)` por bissecção. Essa estimativa não usa o medidor
de vazão. Com ela, a curva da bomba passa a ser interrogada na **vazão efetiva**, e não na vazão
medida — e é isso que separa as hipóteses:

| Cenário | Continuidade de massa | Balanço de energia | Curva @ vazão efetiva | Diagnóstico |
|---|---|---|---|---|
| Operação normal | 0,06 % | 0,12 % | −0,01 % | normal |
| **Medidor com deriva de ganho** | **7,95 %** | 7,52 % | **0,05 %** | instrumento |
| **Desgaste real do rotor** | 0,17 % | 9,95 % | **6,16 %** | equipamento |
| Cavitação | 0,06 % | 4,86 % | 3,55 % | NPSH insuficiente |
| Estrangulamento de válvula | 0,01 % | 0,15 % | 0,12 % | fora do envelope |
| Instrumentação degradada | 0,14 % | 0,05 % | −0,06 % | dados insuficientes |

Repare na coluna que decide: com o medidor descalibrado, a curva continua aderente (0,05 %) —
a bomba está sadia. Com desgaste real, a curva cai 6,16 % **com os dois medidores concordando**.
Nenhuma verificação isolada separa os dois casos; a **combinação** separa.

Os limiares (3 % de aviso, 4 % de falha na curva; 2 % e 3,5 % na massa) foram fixados **antes**
de rodar o benchmark e ficam com margem de mais de 50 % para o pior caso de ruído observado.
A tabela acima é reproduzível com `npm run benchmark`.

### O que também é identificável, e o que não é

- **Cavitação** é identificada pela margem de NPSH, que é medida direta — e tem precedência
  sobre as demais, porque é causa física que produz os outros desvios.
- **Estrangulamento** não é falha: é mudança de envelope. O sistema recusa o laudo de falha e
  pede uma janela no ponto nominal. Recusar é a resposta correta aqui.
- **Não** é identificável, com esta instrumentação, separar um erro de ganho do medidor de uma
  degradação combinada de altura **e** rendimento. A regra exige que a curva esteja aderente
  para acusar instrumento; se as duas coisas estiverem erradas ao mesmo tempo, o sistema cai em
  "degradação" — e a recomendação é inspecionar, não substituir.

---

## 3. As nove verificações

Peso e limite vivem em `THRESHOLDS` e nos pesos de `checks.ts` — um só lugar, para poder ser
contestado.

| Verificação | Peso | Métrica | Aviso / Falha |
|---|---|---|---|
| `dados.qualidade` | 0,16 | cobertura, lacunas, canais travados | cobertura < 95 % / canal travado |
| `massa.continuidade` | 0,12 | \|Q_sucção − Q_recalque\| / Q_sucção | 2 % / 3,5 % |
| `energia.balanco` | 0,15 | \|P_medida − P_modelo(Q,H)\| / P_medida | 3 % / 5 % |
| `redundancia.vazao` | 0,13 | \|Q_medidor − Q_potência\| / Q_potência | 2 % / 3,5 % |
| `curva.bomba` | 0,13 | (H_nominal(Q_ef) − H_medida) / H_nominal | 3 % / 4 % |
| `termico.regime` | 0,09 | resíduo médio do modelo de 1ª ordem (30 min) | 3 K / 6 K |
| `npsh.margem` | 0,09 | NPSHa − NPSHr | 1,5 m / 0,5 m |
| `dominio.operacao` | 0,09 | Q/Q_BEP, rotação, variação de regime | 6 % / 10 % de variação |
| `calibracao.curva` | 0,04 | ensaio de campo da curva | **não executada** por padrão |

A última linha existe de propósito. Não há ensaio de campo neste ativo, então ela aparece como
**"não executada"** — e não como nota neutra inventada. Um sistema de confiança que arredonda a
própria ignorância para "ok" não é um sistema de confiança.

---

## 4. Índice de confiança

```
cobertura = Σ peso das verificações executadas / Σ peso total
score     = 100 · cobertura · Σ (score_i · peso_i) / Σ peso_i
```

- `score` responde **"posso confiar nos números desta janela?"** — não "o equipamento está bem?".
- **Portão de dados:** se `dados.qualidade` falha, o índice é limitado a 25 e o laudo recusa
  concluir, por melhores que estejam as outras verificações.
- Cobertura abaixo de 60 % também bloqueia a conclusão.

O **diagnóstico tem confiança própria** (`attribution.confidence`), separada e explícita: uma
janela pode ter números ruins e um diagnóstico firme — *"seu medidor está errado"* é exatamente
esse caso, com índice 61 e confiança de atribuição 93 %. Misturar as duas coisas esconderia
justamente a informação mais útil.

---

## 5. Atribuição de causa, na ordem física

1. **O dado existe e é confiável?** Não → `DADOS_INSUFICIENTES`, nenhuma conclusão sobre o ativo.
2. **O fluido está cavitando?** Margem de NPSH < 0,5 m → `CAVITACAO` (causa física dominante).
3. **O instrumento concorda consigo mesmo?** Massa e redundância falham com curva aderente → `SENSOR_VAZAO_FORA_DE_CALIBRACAO`.
4. **O equipamento perdeu curva?** Déficit > 4 % com medidores concordando → `DEGRADACAO_HIDRAULICA`.
5. **O ponto está fora do envelope validado?** → `OPERACAO_FORA_DE_DOMINIO`.
6. Caso contrário → `NORMAL`.

É uma árvore determinística, não um modelo treinado. Duas consequências pretendidas: o mesmo
dado produz sempre o mesmo laudo, e cada decisão pode ser lida e contestada em vinte linhas de
código.

---

## 6. Procedência: o validador que o LLM também obedece

`validateClaims` recebe as afirmações do relatório e as verificações executadas. Uma afirmação é
aceita apenas se:

1. cita o `id` de uma verificação que existe;
2. essa verificação **foi executada** (não `not_run`);
3. quando afirma um número, o valor bate com o medido dentro de 3 % (mínimo de 0,05).

O narrador determinístico sempre passa. Um texto gerado por LLM passa pelo **mesmo** validador;
se qualquer frase citar número que nenhuma verificação mediu, o texto inteiro é descartado e o
relatório determinístico prevalece — e o laudo registra `narrativeSource: llm-rejeitado-fallback`.
Ambiguidade sobre a origem do texto não existe por construção.

---

## 7. Limitações declaradas

O que este modelo **não** faz — e que um engenheiro precisa saber antes de confiar nele:

- Um ativo, uma bomba. Não modela rede, nem bombas em paralelo, nem transitórios hidráulicos.
- Fluido único (água a 25 °C). Viscosidade e temperatura do fluido entram como constante.
- Motor com rendimento constante; a curva do motor não é modelada.
- Térmica concentrada, sem gradiente espacial nem modelo de classe de isolamento.
- Sem vibração, sem análise espectral de corrente — que seriam os instrumentos naturais para
  separar desgaste de desalinhamento.
- Envelope validado entre 75 % e 115 % do BEP, em regime. Fora disso, o sistema declara
  fora de domínio em vez de extrapolar.
- Custo e parada são **premissas do cenário**, não cotação.

---

## 8. Reprodutibilidade

- Gerador de telemetria determinístico (PRNG com semente fixa): a mesma janela sai byte a byte igual.
- Benchmark com 25 sementes por cenário; o CI falha se `benchmarks/REPORT.md` divergir do gerado.
- Testes cobrem física, separação de hipóteses, recusa por dados ruins, determinismo e o
  validador de procedência (inclusive rejeitando um número inventado).
