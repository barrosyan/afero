/**
 * Modelo hidráulico e térmico da bomba centrífuga.
 *
 * Curva do fabricante, corrigida pelas leis de semelhança:
 *
 *   s   = n / n0
 *   H(Q) = s²·h0 − a·Q²          (altura, m, com Q em m³/h)
 *   η(Q) = ηmax·(1 − ((Q/s − qBep)/w)²)   limitada a [tolerância, ηmax]
 *   NPSHr(Q) = npshrBep·((Q/s)/qBep)²
 *
 * As leis de semelhança dão H ∝ n², Q ∝ n, e por isso a parábola de altura
 * contra vazão mantém o coeficiente `a` quando escrita nessa forma.
 */

import type { PumpSpec, SystemSpec } from './types.ts';

/** Piso de eficiência para não dividir por zero em vazão nula. */
const ETA_FLOOR = 0.05;

/** Altura fornecida pela bomba na rotação `nRpm`, em m. */
export function headAt(qM3h: number, nRpm: number, spec: PumpSpec): number {
  const s = nRpm / spec.n0;
  return s * s * spec.h0 - spec.a * qM3h * qM3h;
}

/** Eficiência hidráulica da bomba na rotação `nRpm`, fração. */
export function etaAt(qM3h: number, nRpm: number, spec: PumpSpec): number {
  const s = nRpm / spec.n0;
  const qRel = qM3h / s;
  const rel = (qRel - spec.qBep) / spec.etaWidth;
  const eta = spec.etaMax * (1 - rel * rel);
  return clamp(eta, ETA_FLOOR, spec.etaMax);
}

/** NPSH requerido pela bomba, em m. */
export function npshRequiredAt(qM3h: number, nRpm: number, spec: PumpSpec): number {
  const s = nRpm / spec.n0;
  const rel = qM3h / s / spec.qBep;
  return spec.npshrBep * rel * rel;
}

/** Altura geométrica exigida pelo sistema, em m. */
export function systemHeadAt(qM3h: number, system: SystemSpec, valvePct = 100): number {
  const k = valveCoefficient(system, valvePct);
  return system.staticHeadM + k * qM3h * qM3h;
}

/**
 * Perda de carga do sistema em função da abertura da válvula.
 * A válvula é um orifício: k cresce com o inverso do quadrado da área aberta.
 */
export function valveCoefficient(system: SystemSpec, valvePct: number): number {
  const open = clamp(valvePct, 5, 100) / 100;
  return system.kFriction / (open * open);
}

/** Potência hidráulica entregue ao fluido, W. */
export function hydraulicPowerW(qM3h: number, headM: number, rho: number, g: number): number {
  return rho * g * (qM3h / 3600) * headM;
}

/** Potência elétrica absorvida pelo conjunto, W. */
export function electricalPowerW(
  qM3h: number,
  headM: number,
  nRpm: number,
  spec: PumpSpec,
): number {
  const pHyd = hydraulicPowerW(qM3h, headM, spec.rho, spec.g);
  const eta = etaAt(qM3h, nRpm, spec);
  return pHyd / (eta * spec.motorEta);
}

/** NPSH disponível a partir da pressão absoluta na flange de sucção, m. */
export function npshAvailable(pSuctionBar: number, spec: PumpSpec): number {
  const pPa = pSuctionBar * 1e5;
  return (pPa - spec.vaporPressurePa) / (spec.rho * spec.g);
}

/** Altura manométrica entre as flanges (despreza cargas de velocidade). */
export function headFromPressures(pSuctionBar: number, pDischargeBar: number, spec: PumpSpec): number {
  return ((pDischargeBar - pSuctionBar) * 1e5) / (spec.rho * spec.g);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Elevação de temperatura do enrolamento em regime permanente, K.
 * Balanço concentrado: P_perda = ΔT / R_th.
 */
export function steadyTemperatureRiseK(powerLossW: number, spec: PumpSpec): number {
  return powerLossW * spec.rThKW;
}
