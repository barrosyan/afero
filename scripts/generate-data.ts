/**
 * Gera os arquivos de telemetria em data/scenarios/*.json.
 *
 * A saída é determinística: rodar de novo produz o mesmo arquivo, byte a byte.
 * Os JSON estão versionados no repositório para que a demo e a API usem
 * exatamente a mesma janela.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUMP_P101, SYSTEM_S101 } from '../packages/core/src/assets.ts';
import { generateScenario } from '../packages/core/src/sim/generator.ts';
import { SCENARIOS } from '../packages/core/src/sim/scenarios.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'scenarios');
mkdirSync(outDir, { recursive: true });

for (const cfg of SCENARIOS) {
  const window = generateScenario(cfg, PUMP_P101, SYSTEM_S101);
  const file = join(outDir, `${cfg.id}.json`);
  writeFileSync(file, JSON.stringify(window, null, 1) + '\n', 'utf8');
  console.log(`${cfg.id.padEnd(16)} ${window.samples.length} amostras → ${file.replace(here, '.')}`);
}

const manifest = SCENARIOS.map((cfg) => ({
  id: cfg.id,
  name: cfg.name,
  description: cfg.description,
  truth: cfg.truth,
}));
writeFileSync(join(outDir, 'index.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\nmanifesto com ${manifest.length} cenários escrito em data/scenarios/index.json`);
