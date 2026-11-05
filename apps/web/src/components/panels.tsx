import { useState } from 'react';
import type { CheckResult, Diagnosis, TrustIndex } from '@afero/core';
import { LABEL_TEXT, toWorkOrder } from '@afero/core';

const num = (v: number, d = 2) =>
  Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—';

const VERDICT_TEXT: Record<TrustIndex['verdict'], { label: string; cls: string }> = {
  CONFIAVEL: { label: 'Medições e modelo consistentes', cls: 'ok' },
  ATENCAO: { label: 'Medições divergem entre si', cls: 'warn' },
  NAO_CONFIAVEL: { label: 'Sem base para concluir', cls: 'bad' },
};

export function TrustPanel({ trust }: { trust: TrustIndex }) {
  const v = VERDICT_TEXT[trust.verdict];
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Índice de confiança nos números</h2>
        <span className="hint">dados + modelo, antes de qualquer conclusão</span>
      </div>
      <div className="trust">
        <div>
          <div className="trust-score" style={{ color: trust.score >= 75 ? 'var(--accent)' : trust.score >= 45 ? 'var(--warn)' : 'var(--fail)' }}>
            {trust.score}
            <span style={{ fontSize: 15, color: 'var(--muted-2)' }}>/100</span>
          </div>
        </div>
        <div className="trust-meta">
          <span className={`verdict ${v.cls}`}>
            <span className={`check-dot dot-${trust.verdict === 'CONFIAVEL' ? 'pass' : trust.verdict === 'ATENCAO' ? 'warn' : 'fail'}`} />
            {trust.refusesConclusion ? 'O Afero recusa concluir com esta janela' : v.label}
          </span>
          <div className="coverage-bar">
            <span style={{ width: `${Math.round(trust.coverage * 100)}%` }} />
          </div>
          <span className="coverage-text">
            cobertura das verificações: {num(trust.coverage * 100, 0)}% do peso — o que não rodou não vira nota
          </span>
        </div>
      </div>
    </section>
  );
}

export function KpiStrip({ diagnosis }: { diagnosis: Diagnosis }) {
  const { operating, checks } = diagnosis;
  const dataCheck = checks.find((c) => c.id === 'dados.qualidade');
  const npshMargin = operating.npshAvailableM - operating.npshRequiredM;
  const items = [
    {
      label: 'Vazão efetiva',
      value: num(operating.qFromPower, 1),
      unit: 'm³/h',
      note: 'estimada pela potência, sem o medidor',
      cls: '',
    },
    {
      label: 'Vazão medida',
      value: num(operating.qMeasured, 1),
      unit: 'm³/h',
      note: 'medidor do recalque',
      cls: '',
    },
    {
      label: 'Altura manométrica',
      value: num(operating.headMeasured, 1),
      unit: 'm',
      note: 'entre as flanges',
      cls: '',
    },
    {
      label: 'Potência elétrica',
      value: num(operating.powerMeasuredKw, 1),
      unit: 'kW',
      note: `nominal do motor 30 kW`,
      cls: '',
    },
    {
      label: 'Margem de NPSH',
      value: num(npshMargin, 2),
      unit: 'm',
      note: 'disponível − requerido',
      cls: npshMargin < 0.5 ? 'bad' : npshMargin < 1.5 ? 'warn' : 'good',
    },
    {
      label: 'Cobertura da aquisição',
      value: num(dataCheck?.value ?? 0, 0),
      unit: '%',
      note: 'do intervalo esperado',
      cls: (dataCheck?.value ?? 100) < 95 ? 'warn' : 'good',
    },
  ];
  return (
    <div className="kpis">
      {items.map((it) => (
        <div className={`kpi ${it.cls}`} key={it.label}>
          <div className="kpi-label">{it.label}</div>
          <div className="kpi-value">
            {it.value}
            <span className="kpi-unit">{it.unit}</span>
          </div>
          <div className="kpi-note">{it.note}</div>
        </div>
      ))}
    </div>
  );
}

const STATUS_ORDER: Record<CheckResult['status'], number> = {
  fail: 0,
  warn: 1,
  not_run: 3,
  pass: 2,
};

export function ChecksPanel({ checks }: { checks: CheckResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...checks].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.weight - a.weight,
  );

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Verificações executadas</h2>
        <span className="hint">cada uma independente; o peso define o índice</span>
      </div>
      <div className="checks">
        {sorted.map((c) => {
          const isOpen = open === c.id;
          return (
            <div className="check" key={c.id}>
              <button
                className="check-head"
                onClick={() => setOpen(isOpen ? null : c.id)}
                aria-expanded={isOpen}
              >
                <span className={`check-dot dot-${c.status}`} />
                <span className="check-title">{c.title}</span>
                <span className="check-value">
                  {c.status === 'not_run' || c.value === null ? (
                    <strong style={{ color: 'var(--muted-2)' }}>não executada</strong>
                  ) : (
                    <>
                      <strong>{num(c.value, Math.abs(c.value) < 10 ? 2 : 1)}</strong> {c.unit}
                    </>
                  )}
                </span>
                <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <>
                  <div className="check-detail">{c.detail}</div>
                  <div className="check-threshold">limite declarado: {c.threshold}</div>
                  <div className="evidence">
                    {Object.entries(c.evidence).map(([k, v]) => (
                      <span key={k}>
                        {k} = {num(v, Math.abs(v) < 10 ? 3 : 1)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function DiagnosisPanel({ diagnosis }: { diagnosis: Diagnosis }) {
  const { attribution } = diagnosis;
  const action = attribution.actions[0];
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Diagnóstico</h2>
        <span className="hint">causa atribuída, com a evidência que a sustenta</span>
      </div>
      <div className="diag-head">
        <div>
          <div className="diag-label">{LABEL_TEXT[attribution.label]}</div>
          <div className="diag-sub">
            severidade {attribution.severity} · {attribution.actions.length} ação(ões) recomendada(s)
          </div>
        </div>
        <div className="confidence">
          confiança do diagnóstico
          <strong>{Math.round(attribution.confidence * 100)}%</strong>
        </div>
      </div>

      <ul className="rationale">
        {attribution.rationale.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      {action !== undefined && (
        <div className={`action ${attribution.severity === 'critico' ? 'critical' : ''}`}>
          <div className="action-title">→ {action.title}</div>
          <div className="action-text">{action.rationale}</div>
          <div className="action-meta">
            <span>
              custo estimado:{' '}
              {action.estimatedCostBrl === null
                ? 'não estimado'
                : `R$ ${action.estimatedCostBrl.toLocaleString('pt-BR')}`}
            </span>
            <span>
              parada:{' '}
              {action.estimatedDowntimeH === null ? 'não estimada' : `${action.estimatedDowntimeH} h`}
            </span>
            <span>premissa declarada, não cotação</span>
          </div>
        </div>
      )}

      <div className="next">Próximo melhor dado: {attribution.nextBestAction}</div>
    </section>
  );
}

export function ComparePanel({ diagnosis }: { diagnosis: Diagnosis }) {
  const same = diagnosis.baseline.label === diagnosis.attribution.label;
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Com e sem verificação</h2>
        <span className="hint">a mesma janela, dois sistemas</span>
      </div>
      <div className="compare">
        <div className={`compare-card ${same ? '' : 'bad'}`}>
          <div className="compare-kicker">detector por limiar (mercado)</div>
          <div className="compare-verdict">{LABEL_TEXT[diagnosis.baseline.label]}</div>
          <div className="compare-text">{diagnosis.baseline.text}</div>
        </div>
        <div className={`compare-card ${same ? '' : 'good'}`}>
          <div className="compare-kicker">afero (física verificada)</div>
          <div className="compare-verdict">{LABEL_TEXT[diagnosis.attribution.label]}</div>
          <div className="compare-text">
            {diagnosis.attribution.rationale[0]} Ação: {diagnosis.attribution.actions[0]?.title ?? '—'}.
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProvenancePanel({ diagnosis }: { diagnosis: Diagnosis }) {
  const src =
    diagnosis.narrativeSource === 'llm-validado'
      ? 'narrativa: LLM validada contra as verificações'
      : diagnosis.narrativeSource === 'llm-rejeitado-fallback'
        ? 'narrativa: LLM reprovada e descartada — relatório determinístico mantido'
        : 'narrativa: agente determinístico';
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Procedência das afirmações</h2>
        <span className="hint">{src}</span>
      </div>
      <div className="prov-head">
        <span className={`prov-badge ${diagnosis.provenance.ok ? '' : 'bad'}`}>
          {diagnosis.provenance.traced}/{diagnosis.provenance.total} afirmações rastreadas a uma verificação
        </span>
        {!diagnosis.provenance.ok && <span className="hint">há afirmações rejeitadas — ver abaixo</span>}
      </div>
      <ul className="claims">
        {diagnosis.claims.map((c) => (
          <li className="claim" key={c.id}>
            <code>{c.checkId}</code>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      {diagnosis.provenance.problems.length > 0 && (
        <ul className="claims" style={{ marginTop: 12 }}>
          {diagnosis.provenance.problems.map((p, i) => (
            <li className="claim" key={i}>
              <code style={{ color: 'var(--fail)' }}>rejeitado</code>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WorkOrderPanel({ diagnosis }: { diagnosis: Diagnosis }) {
  const [sent, setSent] = useState(false);
  const order = toWorkOrder(diagnosis);
  const json = JSON.stringify(order, null, 2);

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Ordem de serviço gerada</h2>
        <span className="hint">a automação que fecha o ciclo com a manutenção</span>
      </div>
      <pre className="wo">{json}</pre>
      <div className="wo-status">
        <span className="dot" style={{ background: sent ? 'var(--accent)' : 'var(--muted-2)' }} />
        {sent
          ? 'POST /webhooks/manutencao → 202 aceito · payload acima'
          : 'nenhum sistema de manutenção configurado nesta demo'}
        {!sent && (
          <button
            className="pill accent"
            style={{ marginLeft: 'auto' }}
            onClick={() => setSent(true)}
          >
            simular envio
          </button>
        )}
      </div>
    </section>
  );
}
