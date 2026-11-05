/**
 * Estatística de janela e qualidade de sinal.
 *
 * Um número de processo só vale se a janela que o produziu for declarada:
 * quantas amostras entraram, em quanto tempo, com que dispersão.
 */

import type { Sample, TelemetryWindow } from './types.ts';

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return Math.sqrt(acc / (values.length - 1));
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Porção final da janela — o estado atual do ativo. */
export function tailSamples(window: TelemetryWindow, fraction = 0.2): Sample[] {
  const n = window.samples.length;
  const from = Math.max(0, Math.floor(n * (1 - fraction)));
  return window.samples.slice(from);
}

export interface QualityReport {
  sampleCount: number;
  durationS: number;
  /** lacunas maiores que 2× o intervalo nominal */
  gaps: number;
  /** maior lacuna observada, s */
  maxGapS: number;
  /** canais que ficaram travados (desvio padrão desprezível) */
  stuckChannels: string[];
  /** canais com valor fora de faixa física */
  outOfRangeChannels: string[];
  /** fração do intervalo nominal efetivamente coberta, 0..1 */
  coverage: number;
}

const RANGES: Record<string, [number, number]> = {
  flowSuctionM3h: [0, 400],
  flowDischargeM3h: [0, 400],
  pressSuctionBar: [0.05, 6],
  pressDischargeBar: [0.1, 25],
  motorPowerKw: [0, 200],
  windingTempC: [-20, 200],
  ambientTempC: [-20, 70],
  speedRpm: [0, 5000],
  valvePct: [0, 100],
};

/** Canais que precisam variar para a verificação ter sentido. */
const LIVE_CHANNELS: Array<keyof Sample> = [
  'flowDischargeM3h',
  'pressDischargeBar',
  'motorPowerKw',
  'windingTempC',
  'speedRpm',
];

export function assessQuality(window: TelemetryWindow): QualityReport {
  const samples = window.samples;
  const stuckChannels: string[] = [];
  const outOfRangeChannels: string[] = [];
  let gaps = 0;
  let maxGapS = 0;

  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tS - samples[i - 1].tS;
    if (dt > window.sampleIntervalS * 2) {
      gaps++;
      maxGapS = Math.max(maxGapS, dt);
    }
  }
  const durationS = samples.length > 1 ? samples[samples.length - 1].tS - samples[0].tS : 0;
  const expected = durationS / Math.max(window.sampleIntervalS, 1) + 1;
  const coverage = expected > 1 ? Math.min(1, samples.length / expected) : 0;

  for (const ch of LIVE_CHANNELS) {
    const values = samples.map((s) => s[ch] as number);
    if (values.length > 5 && stdev(values) < 1e-6) stuckChannels.push(ch);
  }

  for (const [ch, [lo, hi]] of Object.entries(RANGES)) {
    const bad = samples.some((s) => {
      const v = s[ch as keyof Sample] as number;
      return !Number.isFinite(v) || v < lo || v > hi;
    });
    if (bad) outOfRangeChannels.push(ch);
  }

  return {
    sampleCount: samples.length,
    durationS,
    gaps,
    maxGapS,
    stuckChannels,
    outOfRangeChannels,
    coverage,
  };
}

/** Variação relativa da vazão na janela — detecta troca de regime. */
export function flowVariationPct(samples: Sample[]): number {
  const q = samples.map((s) => s.flowDischargeM3h);
  const m = mean(q);
  if (m <= 0) return 0;
  return (stdev(q) / m) * 100;
}
