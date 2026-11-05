/**
 * Observáveis derivados: transforma a janela de telemetria no conjunto de
 * números sobre o qual as verificações são feitas.
 *
 * A escolha do método importa: a vazão "efetiva" usada para interrogar a curva
 * da bomba é a estimada pela potência elétrica, não a do medidor. É essa
 * escolha que torna o diagnóstico identificável — ver docs/ARQUITETURA.md.
 */

import { electricalPowerW, etaAt, headAt, headFromPressures, npshAvailable, npshRequiredAt } from './pump.ts';
import { impliedFlowFromHead, impliedFlowFromPower } from './solver.ts';
import { mean, tailSamples } from './telemetry.ts';
import type { OperatingPoint, PumpSpec, TelemetryWindow } from './types.ts';

export function deriveOperatingPoint(window: TelemetryWindow, spec: PumpSpec): OperatingPoint {
  const tail = tailSamples(window, 0.2);

  const qMeasured = mean(tail.map((s) => s.flowDischargeM3h));
  const qSuction = mean(tail.map((s) => s.flowSuctionM3h));
  const pSuction = mean(tail.map((s) => s.pressSuctionBar));
  const pDischarge = mean(tail.map((s) => s.pressDischargeBar));
  const powerMeasuredKw = mean(tail.map((s) => s.motorPowerKw));
  const speedRpm = mean(tail.map((s) => s.speedRpm));
  const ambientTempC = mean(tail.map((s) => s.ambientTempC));
  const windingTempC = tail.length > 0 ? tail[tail.length - 1].windingTempC : NaN;

  const headMeasured = headFromPressures(pSuction, pDischarge, spec);
  const powerSolve = impliedFlowFromPower(powerMeasuredKw, speedRpm, spec);
  const qFromPower = powerSolve.value;
  const qFromHead = impliedFlowFromHead(headMeasured, speedRpm, spec);

  return {
    qMeasured,
    qSuction,
    headMeasured,
    powerMeasuredKw,
    speedRpm,
    windingTempC,
    ambientTempC,
    qFromPower,
    qFromHead,
    headNominalAtQFromPower: headAt(qFromPower, speedRpm, spec),
    headNominalAtQMeasured: headAt(qMeasured, speedRpm, spec),
    etaNominal: etaAt(qFromPower, speedRpm, spec),
    npshAvailableM: npshAvailable(pSuction, spec),
    npshRequiredM: npshRequiredAt(qFromPower, speedRpm, spec),
  };
}

/** Potência elétrica que o modelo nominal prevê para um ponto de operação. */
export function modelPowerKw(
  qM3h: number,
  headM: number,
  nRpm: number,
  spec: PumpSpec,
): number {
  return electricalPowerW(qM3h, headM, nRpm, spec) / 1000;
}
