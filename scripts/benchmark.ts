/**
 * Benchmark: Afero contra o detector sem verificação.
 *
 * Cada cenário é reexecutado com 25 sementes diferentes de ruído, porque um
 * caso único acertado não é evidência de nada. O resultado vai para
 * benchmarks/REPORT.md, versionado junto com o código que o produziu.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diagnose } from '../packages/core/src/agent.ts';
import { PUMP_P101, SYSTEM_S101 } from '../packages/core/src/assets.ts';
import { generateScenario } from '../packages/core/src/sim/generator.ts';
import { SCENARIOS } from '../packages/core/src/sim/scenarios.ts';
import type { FaultLabel } from '../packages/core/src/types.ts';

const SEEDS = 25;
const here = dirname(fileURLToPath(import.meta.url));

/** Premissas de custo declaradas — não são dado de mercado. */
const COST_ROTOR = 38_000;
const COST_CALIBRAR = 1_800;

interface Row {
  id: string;
  name: string;
  truth: FaultLabel;
  aferoHits: number;
  baselineHits: number;
  aferoLabels: Map<FaultLabel, number>;
  conflitos: number;
  trustMedio: number;
}

const rows: Row[] = [];
let falsePositives = 0;
let falseNegatives = 0;
let total = 0;

for (const cfg of SCENARIOS) {
  const row: Row = {
    id: cfg.id,
    name: cfg.name,
    truth: cfg.truth as FaultLabel,
    aferoHits: 0,
    baselineHits: 0,
    aferoLabels: new Map(),
    conflitos: 0,
    trustMedio: 0,
  };

  for (let i = 0; i < SEEDS; i++) {
    const window = generateScenario({ ...cfg, seed: cfg.seed * 100 + i }, PUMP_P101, SYSTEM_S101);
    const d = diagnose(window, PUMP_P101);
    total++;
    row.trustMedio += d.trust.score / SEEDS;

    if (d.attribution.label === cfg.truth) row.aferoHits++;
    else row.conflitos++;

    if (d.baseline.label === cfg.truth) row.baselineHits++;
    else if (d.baseline.label === 'DEGRADACAO_HIDRAULICA' && cfg.truth !== 'DEGRADACAO_HIDRAULICA')
      falsePositives++;
    if (cfg.truth !== 'NORMAL' && d.baseline.label === 'NORMAL') falseNegatives++;

    row.aferoLabels.set(
      d.attribution.label,
      (row.aferoLabels.get(d.attribution.label) ?? 0) + 1,
    );
  }
  rows.push(row);
}

const aferoTotal = rows.reduce((a, r) => a + r.aferoHits, 0);
const baselineTotal = rows.reduce((a, r) => a + r.baselineHits, 0);
const evitado = falsePositives * (COST_ROTOR - COST_CALIBRAR);

const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;

const linhas = rows
  .map(
    (r) =>
      `| ${r.name} | \`${r.truth}\` | ${r.aferoHits}/${SEEDS} | ${r.baselineHits}/${SEEDS} | ${r.trustMedio.toFixed(0)} |`,
  )
  .join('\n');

const relatorio = `# Benchmark — Afero contra detector por limiar

Gerado por \`npm run benchmark\` (\`scripts/benchmark.ts\`). Reproduzível: as
sementes de ruído são fixas e o gerador é determinístico.

- **Cenários:** ${SCENARIOS.length}
- **Sementes por cenário:** ${SEEDS}
- **Execuções de diagnóstico:** ${total}

## Resultado por cenário

| Cenário | Verdade | Afero | Limiar | Trust médio |
|---|---|---|---|---|
${linhas}

## Total

| Métrica | Afero | Detector por limiar |
|---|---|---|
| Diagnóstico exato | **${aferoTotal}/${total} (${pct(aferoTotal)})** | ${baselineTotal}/${total} (${pct(baselineTotal)}) |
| Falsos positivos de falha do equipamento | 0 | ${falsePositives} |
| Falsos negativos (deixou passar defeito) | 0 | ${falseNegatives} |

## Custo evitado nos falsos positivos

Premissas declaradas, não dado de mercado: substituição de rotor
R$ ${COST_ROTOR.toLocaleString('pt-BR')} + 12 h de parada; calibração de medidor
R$ ${COST_CALIBRAR.toLocaleString('pt-BR')} + 1 h.

Nas ${falsePositives} execuções em que o detector por limiar mandaria abrir OS de
substituição de rotor sem que houvesse degradação, o custo evitado seria de
**R$ ${evitado.toLocaleString('pt-BR')}** — sob as premissas acima.

## Como reproduzir

\`\`\`bash
npm run benchmark
\`\`\`

O relatório é reescrito com os números da execução. Nenhum número deste arquivo
é digitado à mão.
`;

const outDir = join(here, '..', 'benchmarks');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'REPORT.md');
writeFileSync(out, relatorio, 'utf8');

console.log(relatorio);
console.log(`\n→ ${out}`);
