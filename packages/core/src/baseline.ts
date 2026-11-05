/**
 * O detector sem verificação — o contraponto.
 *
 * É o que uma solução de manutenção preditiva "de limiar" faz: compara a vazão
 * e a potência com o esperado e, ao sair da faixa, declara falha do
 * equipamento. Está aqui para ser medido no benchmark, não para ser usado:
 * ele erra sempre que o defeito está no instrumento.
 */

import type { FaultLabel, OperatingPoint } from './types.ts';

const NOMINAL_Q = 120;
const NOMINAL_POWER_KW = 21.95;

export function baselineDetector(op: OperatingPoint): {
  label: FaultLabel;
  text: string;
} {
  const qDev = Math.abs((op.qMeasured - NOMINAL_Q) / NOMINAL_Q) * 100;
  const pDev = Math.abs((op.powerMeasuredKw - NOMINAL_POWER_KW) / NOMINAL_POWER_KW) * 100;

  if (qDev > 5 || pDev > 10) {
    return {
      label: 'DEGRADACAO_HIDRAULICA',
      text: `Limiar simples: vazão ${qDev.toFixed(1)}% e potência ${pDev.toFixed(1)}% fora do nominal → falha hidráulica. Abrir OS para substituição do rotor.`,
    };
  }
  return {
    label: 'NORMAL',
    text: `Limiar simples: vazão ${qDev.toFixed(1)}% e potência ${pDev.toFixed(1)}% dentro da faixa → sem anomalia.`,
  };
}
