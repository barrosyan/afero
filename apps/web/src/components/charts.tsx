import { useMemo } from 'react';
import type { PumpSpec, Sample, SystemSpec } from '@afero/core';
import { headAt, impliedFlowFromPower, systemHeadAt } from '@afero/core';

const PAD = { l: 54, r: 54, t: 16, b: 30 };
const W = 760;

export interface SeriesDef {
  label: string;
  color: string;
  values: number[];
  axis?: 'left' | 'right';
  dashed?: boolean;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function fmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

interface LineChartProps {
  x: number[];
  series: SeriesDef[];
  leftLabel: string;
  rightLabel?: string;
  height?: number;
  leftFormat?: (v: number) => string;
  rightFormat?: (v: number) => string;
}

/** Gráfico de linhas com quebra onde a aquisição tem lacuna. */
export function LineChart({
  x,
  series,
  leftLabel,
  rightLabel,
  height = 220,
  leftFormat = fmt,
  rightFormat = fmt,
}: LineChartProps) {
  const left = series.filter((s) => (s.axis ?? 'left') === 'left');
  const right = series.filter((s) => s.axis === 'right');
  const leftValues = left.flatMap((s) => s.values).filter(Number.isFinite);
  const rightValues = right.flatMap((s) => s.values).filter(Number.isFinite);

  if (x.length < 2 || leftValues.length === 0) {
    return <div className="chart-empty">Sem dados suficientes para o gráfico.</div>;
  }

  const yLeft = extent(leftValues);
  const yRight = rightValues.length > 0 ? extent(rightValues) : yLeft;
  const xMin = x[0];
  const xMax = x[x.length - 1];
  const innerW = W - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;

  const sx = (v: number) => PAD.l + ((v - xMin) / Math.max(xMax - xMin, 1e-9)) * innerW;
  const syLeft = (v: number) => PAD.t + innerH - ((v - yLeft.min) / Math.max(yLeft.max - yLeft.min, 1e-9)) * innerH;
  const syRight = (v: number) =>
    PAD.t + innerH - ((v - yRight.min) / Math.max(yRight.max - yRight.min, 1e-9)) * innerH;

  const dts = x.slice(1).map((v, i) => v - x[i]);
  const medianDt = median(dts);
  const maxDt = medianDt * 2.5;

  const paths = series.map((s) => {
    const sy = (s.axis ?? 'left') === 'left' ? syLeft : syRight;
    let d = '';
    let open = false;
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (!Number.isFinite(v)) {
        open = false;
        continue;
      }
      const gap = i > 0 && Number.isFinite(s.values[i - 1]) && x[i] - x[i - 1] > maxDt;
      if (gap) open = false;
      d += `${open ? 'L' : 'M'}${sx(x[i]).toFixed(1)} ${sy(v).toFixed(1)}`;
      open = true;
    }
    return { series: s, d };
  });

  const leftTicks = niceTicks(yLeft.min, yLeft.max);
  const rightTicks = niceTicks(yRight.min, yRight.max);
  const xTicks = niceTicks(xMin, xMax, 4);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={leftLabel}>
      {leftTicks.map((t) => (
        <g key={`l${t}`}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={syLeft(t)}
            y2={syLeft(t)}
            stroke="#16202b"
            strokeWidth="1"
          />
          <text x={PAD.l - 9} y={syLeft(t) + 3.5} textAnchor="end" fill="#5d6b7a" fontSize="13">
            {leftFormat(t)}
          </text>
        </g>
      ))}
      {right.length > 0 &&
        rightTicks.map((t) => (
          <text
            key={`r${t}`}
            x={W - PAD.r + 9}
            y={syRight(t) + 3.5}
            textAnchor="start"
            fill="#5d6b7a"
            fontSize="13"
          >
            {rightFormat(t)}
          </text>
        ))}
      {xTicks.map((t) => {
        const anchor = edgeAnchor(sx(t));
        return (
          <text
            key={`x${t}`}
            x={sx(t)}
            y={height - 9}
            textAnchor={anchor}
            fill="#5d6b7a"
            fontSize="13"
          >
            {fmt(t / 3600)}h
          </text>
        );
      })}

      {paths.map(({ series: s, d }) => (
        <path
          key={s.label}
          d={d}
          fill="none"
          stroke={s.color}
          strokeWidth="1.7"
          strokeDasharray={s.dashed ? '4 3' : undefined}
          strokeLinejoin="round"
        />
      ))}

      <text x={PAD.l} y={11} fill="#5d6b7a" fontSize="12.5">
        {leftLabel}
      </text>
      {rightLabel !== undefined && (
        <text x={W - PAD.r} y={11} textAnchor="end" fill="#5d6b7a" fontSize="12.5">
          {rightLabel}
        </text>
      )}
    </svg>
  );
}

function extent(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  const pad = (max - min) * 0.12 || 1;
  return { min: min - pad, max: max + pad };
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Rótulos das pontas são ancorados para dentro, senão colidem com o eixo Y. */
function edgeAnchor(x: number): 'start' | 'middle' | 'end' {
  if (x < PAD.l + 22) return 'start';
  if (x > W - PAD.r - 22) return 'end';
  return 'middle';
}

interface PumpCurveChartProps {
  spec: PumpSpec;
  system: SystemSpec;
  nRpm: number;
  valvePct: number;
  qMeasured: number;
  qEffective: number;
  headMeasured: number;
  headNominalAtQEffective: number;
}

/**
 * Curva da bomba contra curva do sistema, com o ponto de operação medido.
 * Quando a vazão do medidor e a vazão efetiva (por potência) caem em lugares
 * diferentes, o desvio é visível antes de qualquer explicação.
 */
export function PumpCurveChart({
  spec,
  system,
  nRpm,
  valvePct,
  qMeasured,
  qEffective,
  headMeasured,
  headNominalAtQEffective,
}: PumpCurveChartProps) {
  const height = 250;
  const innerW = W - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  const qMax = spec.qBep * 1.5;

  const pump = useMemo(() => {
    const pts: Array<[number, number]> = [];
    for (let q = 0; q <= qMax; q += qMax / 120) pts.push([q, headAt(q, nRpm, spec)]);
    return pts;
  }, [spec, nRpm, qMax]);

  const sys = useMemo(() => {
    const pts: Array<[number, number]> = [];
    for (let q = 0; q <= qMax; q += qMax / 120) pts.push([q, systemHeadAt(q, system, valvePct)]);
    return pts;
  }, [system, valvePct, qMax]);

  const yMax = Math.max(...pump.map((p) => p[1]), ...sys.map((p) => p[1]), headMeasured) * 1.08;

  const sx = (q: number) => PAD.l + (q / qMax) * innerW;
  const sy = (h: number) => PAD.t + innerH - (h / yMax) * innerH;

  const path = (pts: Array<[number, number]>) =>
    pts.map(([q, h], i) => `${i === 0 ? 'M' : 'L'}${sx(q).toFixed(1)} ${sy(h).toFixed(1)}`).join('');

  const yTicks = niceTicks(0, yMax, 4);
  const xTicks = niceTicks(0, qMax, 4);

  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Curva da bomba e do sistema">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="#16202b" />
            <text x={PAD.l - 9} y={sy(t) + 3.5} textAnchor="end" fill="#5d6b7a" fontSize="13">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={t}
            x={sx(t)}
            y={height - 9}
            textAnchor={edgeAnchor(sx(t))}
            fill="#5d6b7a"
            fontSize="13"
          >
            {fmt(t)}
          </text>
        ))}

        <path d={path(pump)} fill="none" stroke="#3ddc97" strokeWidth="2" />
        <path d={path(sys)} fill="none" stroke="#5aa9ff" strokeWidth="1.6" strokeDasharray="5 4" />

        {/* vazão efetiva → altura prevista pela curva nominal */}
        <line
          x1={sx(qEffective)}
          y1={sy(headNominalAtQEffective)}
          x2={sx(qEffective)}
          y2={sy(headMeasured)}
          stroke="#f5b942"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
        <circle cx={sx(qEffective)} cy={sy(headNominalAtQEffective)} r="4" fill="none" stroke="#3ddc97" strokeWidth="1.6" />
        <circle cx={sx(qEffective)} cy={sy(headMeasured)} r="5" fill="#3ddc97" />

        {/* vazão do medidor */}
        <rect
          x={sx(qMeasured) - 4}
          y={sy(headMeasured) - 4}
          width="8"
          height="8"
          fill="none"
          stroke="#f5b942"
          strokeWidth="1.6"
        />
        <text x={sx(qMeasured) + 9} y={sy(headMeasured) + 4} fill="#f5b942" fontSize="12.5">
          medidor
        </text>

        <text x={PAD.l} y={11} fill="#5d6b7a" fontSize="12.5">
          H (m)
        </text>
        <text x={W - PAD.r} y={11} textAnchor="end" fill="#5d6b7a" fontSize="12.5">
          Q (m³/h)
        </text>
      </svg>
      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#3ddc97' }} /> curva da bomba
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#5aa9ff' }} /> curva do sistema
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#f5b942' }} /> leitura do medidor
        </span>
      </div>
    </>
  );
}

/**
 * Séries temporais: a vazão do medidor e a estimativa independente feita a
 * partir da potência elétrica, amostra por amostra. Quando as duas linhas se
 * abrem, ou o instrumento está errado ou o rendimento caiu.
 */
export function seriesFromSamples(
  samples: Sample[],
  spec: PumpSpec,
): {
  x: number[];
  flowMeasured: number[];
  flowFromPower: number[];
  power: number[];
  temp: number[];
  ambient: number[];
} {
  const measured = samples.map((s) => s.flowDischargeM3h);
  const fromPower = samples.map(
    (s) => impliedFlowFromPower(s.motorPowerKw, s.speedRpm, spec).value,
  );
  const times = samples.map((s) => s.tS);
  return {
    x: times,
    // média móvel: a inversão da potência amplifica o ruído do medidor
    flowMeasured: movingAverage(measured, 5, times),
    flowFromPower: movingAverage(fromPower, 5, times),
    power: movingAverage(samples.map((s) => s.motorPowerKw), 5, times),
    temp: samples.map((s) => s.windingTempC),
    ambient: samples.map((s) => s.ambientTempC),
  };
}

/** Média móvel que não atravessa lacuna de aquisição. */
function movingAverage(values: number[], window: number, times: number[]): number[] {
  const half = Math.floor(window / 2);
  const step = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : 60;
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j];
      if (!Number.isFinite(v)) continue;
      if (j !== i && Math.abs(times[j] - times[i]) > step * window) continue;
      sum += v;
      count++;
    }
    return count > 0 ? sum / count : NaN;
  });
}
