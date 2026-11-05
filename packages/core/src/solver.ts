/**
 * Solvers numéricos do núcleo.
 *
 * Nada aqui é aproximação de IA: são bissecções com critério de parada
 * declarado, e todo resultado carrega quantas iterações e qual o resíduo
 * final — número sem resíduo não entra no relatório.
 */

import { etaAt, headAt, valveCoefficient } from './pump.ts';
import type { PumpSpec, SystemSpec } from './types.ts';

export interface SolveReport<T> {
  value: T;
  iterations: number;
  residual: number;
  converged: boolean;
}

const MAX_ITER = 200;

/**
 * Ponto de operação: interseção entre a curva da bomba e a curva do sistema.
 * f(Q) = H_bomba(Q) − H_sistema(Q) é estritamente decrescente, então há raiz
 * única no intervalo positivo e a bissecção converge sempre.
 */
export function solveOperatingPoint(
  spec: PumpSpec,
  system: SystemSpec,
  nRpm: number,
  valvePct = 100,
): SolveReport<{ qM3h: number; headM: number }> {
  const k = valveCoefficient(system, valvePct);
  const f = (q: number) => headAt(q, nRpm, spec) - (system.staticHeadM + k * q * q);

  let lo = 0;
  let hi = 1e-6 + Math.sqrt(Math.max(spec.h0, 1) * 4 / (spec.a + k)) * 2;
  // garante sinal oposto nas extremidades
  for (let i = 0; i < 60 && f(hi) > 0; i++) hi *= 1.5;

  let iterations = 0;
  let mid = 0;
  while (iterations < MAX_ITER && hi - lo > 1e-9) {
    mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
    iterations++;
  }
  const q = (lo + hi) / 2;
  return {
    value: { qM3h: q, headM: headAt(q, nRpm, spec) },
    iterations,
    residual: Math.abs(f(q)),
    converged: Math.abs(f(q)) < 1e-6,
  };
}

/**
 * Vazão estimada a partir da potência elétrica — o "método do torque".
 *
 * A potência elétrica depende de Q de forma monótona crescente na faixa
 * operacional (a partir de ~30 % do BEP), o que permite invertê-la. É esta
 * estimativa que independe do medidor de vazão e por isso permite acusar
 * um medidor descalibrado.
 */
export function impliedFlowFromPower(
  powerKw: number,
  nRpm: number,
  spec: PumpSpec,
): SolveReport<number> {
  const target = powerKw * 1000;
  const powerModel = (q: number) => {
    const h = headAt(q, nRpm, spec);
    const eta = etaAt(q, nRpm, spec);
    return (spec.rho * spec.g * (q / 3600) * h) / (eta * spec.motorEta);
  };

  let lo = 0.05 * spec.qBep;
  let hi = 1.35 * spec.qBep;
  while (powerModel(hi) < target && hi < 2.2 * spec.qBep) hi += 0.05 * spec.qBep;

  let iterations = 0;
  let mid = lo;
  while (iterations < MAX_ITER && hi - lo > 1e-9) {
    mid = (lo + hi) / 2;
    if (powerModel(mid) < target) lo = mid;
    else hi = mid;
    iterations++;
  }
  const q = (lo + hi) / 2;
  const residual = Math.abs(powerModel(q) - target);
  return { value: q, iterations, residual, converged: residual < 5 };
}

/**
 * Vazão estimada a partir da altura medida e da curva nominal.
 * Inversão analítica: H = s²h0 − aQ²  ⇒  Q = sqrt((s²h0 − H)/a).
 */
export function impliedFlowFromHead(headM: number, nRpm: number, spec: PumpSpec): number {
  const s = nRpm / spec.n0;
  const num = s * s * spec.h0 - headM;
  if (num <= 0) return 0;
  return Math.sqrt(num / spec.a);
}

/**
 * Fração de impulsores desgastados: compara a altura medida com a prevista
 * pela curva nominal na vazão efetiva, em %.
 */
export function headDeficitPct(
  headMeasuredM: number,
  qEffectiveM3h: number,
  nRpm: number,
  spec: PumpSpec,
): number {
  const predicted = headAt(qEffectiveM3h, nRpm, spec);
  if (predicted <= 0) return 0;
  return ((predicted - headMeasuredM) / predicted) * 100;
}
