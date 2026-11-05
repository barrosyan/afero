/**
 * Os cenários do Afero.
 *
 * Cada um é um caso com verdade conhecida. O diagnóstico NÃO recebe o rótulo:
 * ele recebe só a telemetria. O rótulo existe para o benchmark.
 */

import type { ScenarioConfig } from './generator.ts';

const base = {
  hours: 6,
  stepS: 60,
  trueH0Factor: 1,
  trueAFactor: 1,
  trueEtaFactor: 1,
  flowDischargeGain: 1,
  flowSuctionGain: 1,
  suctionPressureBar: 0.8,
  windingTempStuckAt: null,
  gapFromS: null,
  gapToS: null,
  valveSteps: [],
};

export const SCENARIOS: ScenarioConfig[] = [
  {
    ...base,
    id: 'normal',
    name: 'Operação normal',
    truth: 'NORMAL',
    description:
      'Conjunto motobomba em regime, sem degradação e com instrumentação calibrada.',
    seed: 11,
  },
  {
    ...base,
    id: 'sensor-deriva',
    name: 'Medidor de vazão descalibrado',
    truth: 'SENSOR_VAZAO_FORA_DE_CALIBRACAO',
    description:
      'O medidor de vazão do recalque lê 8 % abaixo do real. Bomba e processo estão sadios.',
    seed: 23,
    flowDischargeGain: 0.92,
  },
  {
    ...base,
    id: 'desgaste-rotor',
    name: 'Desgaste real do rotor',
    truth: 'DEGRADACAO_HIDRAULICA',
    description:
      'Rotor desgastado: a curva perde 6 % de altura e 10 % de rendimento. Sensores íntegros.',
    seed: 37,
    trueH0Factor: 0.94,
    trueAFactor: 1.03,
    trueEtaFactor: 0.9,
  },
  {
    ...base,
    id: 'cavitacao',
    name: 'Cavitação por NPSH insuficiente',
    truth: 'CAVITACAO',
    description:
      'Pressão de sucção caiu para 0,42 bar abs: o NPSH disponível fica abaixo do requerido.',
    seed: 41,
    suctionPressureBar: 0.42,
    trueEtaFactor: 0.98,
  },
  {
    ...base,
    id: 'transiente',
    name: 'Estrangulamento de válvula',
    truth: 'OPERACAO_FORA_DE_DOMINIO',
    description:
      'Válvula fechada de 100 % para 62 % no meio da janela: dois regimes na mesma janela.',
    seed: 53,
    valveSteps: [{ atS: 3 * 3600, pct: 62 }],
  },
  {
    ...base,
    id: 'dados-ruins',
    name: 'Instrumentação degradada',
    truth: 'DADOS_INSUFICIENTES',
    description:
      'Sensor de temperatura travado e lacuna de 70 minutos na aquisição.',
    seed: 67,
    windingTempStuckAt: 47.5,
    gapFromS: 2 * 3600,
    gapToS: 2 * 3600 + 70 * 60,
  },
];

export function scenarioById(id: string): ScenarioConfig {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`cenário desconhecido: ${id}`);
  return found;
}
