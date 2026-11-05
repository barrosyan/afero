import { useMemo, useState } from 'react';
import {
  PUMP_P101,
  SCENARIOS,
  SYSTEM_S101,
  diagnose,
  generateScenario,
  scenarioById,
} from '@afero/core';
import {
  LineChart,
  PumpCurveChart,
  seriesFromSamples,
} from './components/charts.tsx';
import {
  ChecksPanel,
  ComparePanel,
  DiagnosisPanel,
  KpiStrip,
  ProvenancePanel,
  TrustPanel,
  WorkOrderPanel,
} from './components/panels.tsx';

const REPO_URL = 'https://github.com/barrosyan/afero';

/** Cenário inicial via link direto: ?cenario=desgaste-rotor */
function initialScenario(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('cenario');
  return SCENARIOS.some((s) => s.id === fromUrl) ? (fromUrl as string) : 'sensor-deriva';
}

export function App() {
  const [scenarioId, setScenarioId] = useState(initialScenario);
  const [audit, setAudit] = useState(true);

  const selectScenario = (id: string) => {
    setScenarioId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('cenario', id);
    window.history.replaceState({}, '', url);
  };

  const telemetry = useMemo(
    () => generateScenario(scenarioById(scenarioId), PUMP_P101, SYSTEM_S101),
    [scenarioId],
  );
  const diagnosis = useMemo(() => diagnose(telemetry, PUMP_P101), [telemetry]);
  const series = useMemo(
    () => seriesFromSamples(telemetry.samples, PUMP_P101),
    [telemetry],
  );

  const scenario = scenarioById(scenarioId);
  const last = telemetry.samples[telemetry.samples.length - 1];

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">Æ</span>
          <span>Afero</span>
        </div>
        <div className="tagline">
          O gêmeo digital industrial que prova o que afirma — e se recusa a concluir quando o dado não
          sustenta.
        </div>
        <div className="topbar-right">
          <span className="pill">Hack Brasil 2026</span>
          <span className="pill">Logística e automação</span>
          <a className="pill" href={REPO_URL} target="_blank" rel="noreferrer">
            código ↗
          </a>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <section className="panel tight">
            <div className="panel-title" style={{ marginBottom: 10 }}>
              <h2>Cenários</h2>
              <span className="hint">dados sintéticos</span>
            </div>
            <div className="scenario-list">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  className="scenario"
                  aria-pressed={s.id === scenarioId}
                  onClick={() => selectScenario(s.id)}
                >
                  <div className="scenario-name">{s.name}</div>
                  <div className="scenario-desc">{s.description}</div>
                  {audit && <div className="scenario-truth">verdade: {s.truth}</div>}
                </button>
              ))}
            </div>
          </section>

          <section className="panel tight">
            <label className="toggle">
              <input type="checkbox" checked={audit} onChange={(e) => setAudit(e.target.checked)} />
              modo auditoria (mostra a verdade do cenário)
            </label>
          </section>

          <section className="panel tight">
            <div className="panel-title" style={{ marginBottom: 8 }}>
              <h2>Ativo</h2>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              <div className="mono" style={{ color: 'var(--text)' }}>
                {telemetry.assetId} · {PUMP_P101.name}
              </div>
              <div style={{ marginTop: 6 }}>
                janela de {telemetry.samples.length} amostras · intervalo de{' '}
                {telemetry.sampleIntervalS / 60} min
              </div>
              <div>início {new Date(telemetry.startedAt).toLocaleString('pt-BR')}</div>
              <div style={{ marginTop: 6 }}>
                válvula em {last?.valvePct ?? '—'}% · {last?.speedRpm.toFixed(0) ?? '—'} rpm
              </div>
            </div>
          </section>
        </aside>

        <main className="main">
          <KpiStrip diagnosis={diagnosis} />

          <TrustPanel trust={diagnosis.trust} />

          <div className="chart-grid">
            <section className="panel">
              <div className="panel-title">
                <h2>Ponto de operação</h2>
                <span className="hint">curva da bomba × curva do sistema</span>
              </div>
              <PumpCurveChart
                spec={PUMP_P101}
                system={SYSTEM_S101}
                nRpm={diagnosis.operating.speedRpm}
                valvePct={last?.valvePct ?? 100}
                qMeasured={diagnosis.operating.qMeasured}
                qEffective={diagnosis.operating.qFromPower}
                headMeasured={diagnosis.operating.headMeasured}
                headNominalAtQEffective={diagnosis.operating.headNominalAtQFromPower}
              />
            </section>

            <section className="panel">
              <div className="panel-title">
                <h2>Vazão: medidor × potência</h2>
                <span className="hint">duas medidas independentes da mesma coisa</span>
              </div>
              <LineChart
                x={series.x}
                leftLabel="m³/h"
                series={[
                  { label: 'medidor do recalque', color: '#f5b942', values: series.flowMeasured },
                  { label: 'estimativa por potência', color: '#3ddc97', values: series.flowFromPower, dashed: true },
                ]}
                height={230}
                leftFormat={(v) => v.toFixed(0)}
              />
              <div className="legend">
                <span className="legend-item">
                  <span className="legend-swatch" style={{ background: '#f5b942' }} /> medidor do recalque
                </span>
                <span className="legend-item">
                  <span className="legend-swatch" style={{ background: '#3ddc97' }} /> estimativa por potência
                </span>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-title">
              <h2>Potência e temperatura do enrolamento</h2>
              <span className="hint">o modelo térmico roda sobre a potência medida</span>
            </div>
            <LineChart
              x={series.x}
              leftLabel="potência (kW)"
              rightLabel="temperatura (°C)"
              series={[
                { label: 'potência', color: '#5aa9ff', values: series.power },
                { label: 'T enrolamento', color: '#ff6161', values: series.temp, axis: 'right' },
                { label: 'T ambiente', color: '#667686', values: series.ambient, axis: 'right', dashed: true },
              ]}
              height={210}
            />
            <div className="legend">
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: '#5aa9ff' }} /> potência elétrica
              </span>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: '#ff6161' }} /> temperatura do enrolamento
              </span>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: '#667686' }} /> temperatura ambiente
              </span>
            </div>
          </section>

          <DiagnosisPanel diagnosis={diagnosis} />

          <ComparePanel diagnosis={diagnosis} />

          <ChecksPanel checks={diagnosis.checks} />

          <ProvenancePanel diagnosis={diagnosis} />

          <WorkOrderPanel key={scenarioId} diagnosis={diagnosis} />
        </main>
      </div>

      <footer className="footer">
        <strong>Cenário selecionado:</strong> {scenario.name} — {scenario.description}
        <br />
        <strong>O que é real nesta demo:</strong> o solver hidráulico, as verificações, o índice de
        confiança, a atribuição de causa e o validador de procedência rodam de verdade no seu
        navegador, sobre telemetria sintética gerada por um modelo físico declarado. Não há dado de
        planta industrial real neste repositório.
        <br />
        <strong>Licença:</strong> Apache-2.0 · <strong>Código:</strong>{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          github.com/barrosyan/afero
        </a>
      </footer>
    </div>
  );
}
