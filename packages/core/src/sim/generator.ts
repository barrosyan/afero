/**
 * Gerador de telemetria sintética.
 *
 * Não é dado de planta real e não usa dado de terceiro: cada cenário tem uma
 * verdade conhecida (degradação real, sensor descalibrado, cavitação, dados
 * ruins), a física é integrada a partir de um modelo declarado, e sobre ela
 * são injetados os defeitos de instrumentação. É isso que permite medir, no
 * benchmark, se o diagnóstico acerta a causa — e não só o sintoma.
 */

import { clamp, etaAt, npshAvailable, npshRequiredAt } from '../pump.ts';
import { solveOperatingPoint } from '../solver.ts';
import type { PumpSpec, Sample, SystemSpec, TelemetryWindow } from '../types.ts';

export interface ScenarioConfig {
  id: string;
  name: string;
  /** rótulo verdadeiro — usado só no benchmark, nunca pelo diagnóstico */
  truth: string;
  description: string;
  hours: number;
  stepS: number;
  seed: number;
  /** degradação real do equipamento (aplicada à física, não aos sensores) */
  trueH0Factor: number;
  trueAFactor: number;
  trueEtaFactor: number;
  /** defeitos de instrumentação */
  flowDischargeGain: number;
  flowSuctionGain: number;
  suctionPressureBar: number;
  windingTempStuckAt: number | null;
  gapFromS: number | null;
  gapToS: number | null;
  /** perfil operacional: degraus de abertura de válvula */
  valveSteps: Array<{ atS: number; pct: number }>;
}

/** PRNG determinístico (mulberry32) — o cenário é reproduzível bit a bit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number, sd: number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}

function degradedSpec(spec: PumpSpec, cfg: ScenarioConfig): PumpSpec {
  return {
    ...spec,
    h0: spec.h0 * cfg.trueH0Factor,
    a: spec.a * cfg.trueAFactor,
    etaMax: spec.etaMax * cfg.trueEtaFactor,
  };
}

export function generateScenario(
  cfg: ScenarioConfig,
  spec: PumpSpec,
  system: SystemSpec,
  assetName = 'Conjunto motobomba P-101',
): TelemetryWindow {
  const rand = mulberry32(cfg.seed);
  const trueSpec = degradedSpec(spec, cfg);
  const totalS = cfg.hours * 3600;
  const samples: Sample[] = [];

  let riseK = 0;
  let tAmb = 30;

  for (let t = 0; t <= totalS; t += cfg.stepS) {
    const valvePct = valveAt(cfg, t);

    // Ponto de operação verdadeiro, com a válvula no estado atual.
    const op = solveOperatingPoint(trueSpec, system, spec.n0, valvePct);
    let qTrue = op.value.qM3h;
    let headTrue = op.value.headM;
    let etaTrue = etaAt(qTrue, spec.n0, trueSpec);

    // Cavitação: se o NPSH disponível não cobre o requerido, a bomba perde
    // altura e rendimento — a física real, não um rótulo.
    const npsha = npshAvailable(cfg.suctionPressureBar, spec);
    const npshr = npshRequiredAt(qTrue, spec.n0, trueSpec);
    const cavitating = npsha < npshr;
    if (cavitating) {
      const deficit = clamp((npshr - npsha) / Math.max(npshr, 0.5), 0, 1);
      headTrue *= 1 - 0.35 * deficit;
      etaTrue *= 1 - 0.25 * deficit;
    }

    // Termodinâmica: perdas do motor aquecem o enrolamento (1ª ordem).
    const powerElecW =
      (spec.rho * spec.g * (qTrue / 3600) * headTrue) / (etaTrue * spec.motorEta);
    const lossW = powerElecW * (1 - spec.motorEta);
    const targetRise = lossW * spec.rThKW;
    const tauS = spec.rThKW * spec.cThJK;
    riseK += (targetRise - riseK) * (cfg.stepS / tauS);
    tAmb = 30 + Math.sin(t / 5400) * 1.5;

    const trueWinding = tAmb + riseK;
    // Sensor travado devolve sempre o mesmo valor — sem ruído de medição.
    const windingMeasured = cfg.windingTempStuckAt ?? trueWinding + gaussian(rand, 0.35);

    const caughtUp = !(cfg.gapFromS !== null && t > cfg.gapFromS && t < (cfg.gapToS ?? Infinity));

    if (caughtUp) {
      samples.push({
        tS: t,
        flowSuctionM3h: round3(qTrue * cfg.flowSuctionGain + gaussian(rand, 0.6)),
        flowDischargeM3h: round3(qTrue * cfg.flowDischargeGain + gaussian(rand, 0.6)),
        pressSuctionBar: round4(cfg.suctionPressureBar + gaussian(rand, 0.004)),
        pressDischargeBar: round4(
          cfg.suctionPressureBar + (headTrue * spec.rho * spec.g) / 1e5 + gaussian(rand, 0.006),
        ),
        motorPowerKw: round3(powerElecW / 1000 + gaussian(rand, 0.12)),
        windingTempC: round3(windingMeasured),
        ambientTempC: round3(tAmb),
        speedRpm: round3(spec.n0 + gaussian(rand, 3)),
        valvePct,
      });
    }
  }

  return {
    assetId: 'AST-P101',
    assetName,
    pumpId: spec.id,
    startedAt: '2026-11-05T06:00:00-03:00',
    sampleIntervalS: cfg.stepS,
    samples,
  };
}

function valveAt(cfg: ScenarioConfig, t: number): number {
  let pct = 100;
  for (const step of cfg.valveSteps) if (t >= step.atS) pct = step.pct;
  return pct;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
