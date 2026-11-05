/**
 * Afero — tipos públicos do núcleo.
 *
 * Tudo aqui é dado de processo industrial: uma janela de telemetria de um
 * conjunto motobomba e o resultado das verificações físicas sobre ela.
 */

/** Uma amostra de telemetria. Unidades no nome do campo, sempre no SI prático. */
export interface Sample {
  /** segundos desde o início da janela */
  tS: number;
  /** vazão medida na sucção, m³/h */
  flowSuctionM3h: number;
  /** vazão medida no recalque, m³/h */
  flowDischargeM3h: number;
  /** pressão absoluta na flange de sucção, bar */
  pressSuctionBar: number;
  /** pressão absoluta na flange de recalque, bar */
  pressDischargeBar: number;
  /** potência elétrica ativa medida no inversor/medidor, kW */
  motorPowerKw: number;
  /** temperatura do enrolamento do motor, °C */
  windingTempC: number;
  /** temperatura ambiente, °C */
  ambientTempC: number;
  /** rotação medida, rpm */
  speedRpm: number;
  /** abertura da válvula de controle no recalque, % (100 = aberta) */
  valvePct: number;
}

/** Janela de telemetria de um ativo. */
export interface TelemetryWindow {
  assetId: string;
  assetName: string;
  pumpId: string;
  /** ISO-8601 do instante da primeira amostra */
  startedAt: string;
  /** intervalo nominal entre amostras, s */
  sampleIntervalS: number;
  samples: Sample[];
}

/** Especificação da bomba — o modelo nominal, o que o fabricante declara. */
export interface PumpSpec {
  id: string;
  name: string;
  /** rotação nominal, rpm */
  n0: number;
  /** altura de elevação a vazão nula, m (na rotação nominal) */
  h0: number;
  /** coeficiente da curva H = s²·h0 − a·Q², m/(m³/h)² */
  a: number;
  /** vazão de melhor eficiência (BEP), m³/h */
  qBep: number;
  /** eficiência máxima, fração */
  etaMax: number;
  /** meia-largura da parábola de eficiência, m³/h */
  etaWidth: number;
  /** NPSH requerido na vazão de BEP, m */
  npshrBep: number;
  /** rendimento nominal do motor, fração */
  motorEta: number;
  /** potência nominal do motor, kW */
  motorRatedKw: number;
  /** massa específica do fluido, kg/m³ */
  rho: number;
  /** pressão de vapor do fluido na temperatura de serviço, Pa (absoluta) */
  vaporPressurePa: number;
  /** capacidade térmica concentrada do motor, J/K */
  cThJK: number;
  /** resistência térmica motor→ambiente, K/W */
  rThKW: number;
  /** aceleração da gravidade, m/s² */
  g: number;
}

/** Curva do sistema: H = z + k·Q² (estática + perdas distribuídas). */
export interface SystemSpec {
  /** altura estática, m */
  staticHeadM: number;
  /** coeficiente de perda na válvula 100% aberta, m/(m³/h)² */
  kFriction: number;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'not_run';

/** Resultado de uma verificação física. Nunca existe nota sem número por trás. */
export interface CheckResult {
  id: string;
  title: string;
  /** peso relativo dentro do índice de confiança */
  weight: number;
  status: CheckStatus;
  /** valor medido da métrica da verificação (null quando não executada) */
  value: number | null;
  unit: string;
  /** limite declarado, em texto, para aparecer no relatório */
  threshold: string;
  /** 0..1 — quanto esta verificação sustenta a conclusão */
  score: number;
  /** explicação em pt-BR, com os números reais */
  detail: string;
  /** números brutos que sustentam a verificação (rastreabilidade) */
  evidence: Record<string, number>;
}

export type FaultLabel =
  | 'NORMAL'
  | 'SENSOR_VAZAO_FORA_DE_CALIBRACAO'
  | 'DEGRADACAO_HIDRAULICA'
  | 'CAVITACAO'
  | 'OPERACAO_FORA_DE_DOMINIO'
  | 'DADOS_INSUFICIENTES';

export type Severity = 'info' | 'atencao' | 'critico';

export interface Action {
  kind: 'calibrar' | 'inspecionar' | 'substituir' | 'coletar_dado' | 'nenhuma';
  title: string;
  rationale: string;
  /** custo estimado declarado como premissa, em BRL (null = não estimado) */
  estimatedCostBrl: number | null;
  /** parada estimada, horas (null = não estimada) */
  estimatedDowntimeH: number | null;
}

export interface Attribution {
  label: FaultLabel;
  /** 0..1 — quanta evidência sustenta o rótulo */
  confidence: number;
  severity: Severity;
  /** frases com os números que sustentam o rótulo */
  rationale: string[];
  actions: Action[];
  /** próximo dado a coletar quando a evidência não basta */
  nextBestAction: string;
}

/** Afirmação do relatório. Só é aceita se aponta para uma verificação. */
export interface Claim {
  id: string;
  /** texto exibido ao usuário */
  text: string;
  /** id da verificação que sustenta a afirmação (null = não sustentada) */
  checkId: string | null;
  /** valor numérico afirmado (null = afirmação qualitativa) */
  value: number | null;
  unit: string;
}

export interface Provenance {
  total: number;
  traced: number;
  ok: boolean;
  problems: string[];
}

export interface TrustIndex {
  /** 0..100 */
  score: number;
  /** 0..1 — fração do peso total que efetivamente rodou */
  coverage: number;
  verdict: 'CONFIAVEL' | 'ATENCAO' | 'NAO_CONFIAVEL';
  /** true quando a cobertura é baixa demais para emitir conclusão */
  refusesConclusion: boolean;
}

/** Observáveis derivados da janela — o que o modelo "enxerga". */
export interface OperatingPoint {
  /** vazão média medida no recalque, m³/h */
  qMeasured: number;
  /** vazão média medida na sucção, m³/h */
  qSuction: number;
  /** altura manométrica medida, m */
  headMeasured: number;
  /** potência elétrica média, kW */
  powerMeasuredKw: number;
  /** rotação média, rpm */
  speedRpm: number;
  /** temperatura do enrolamento no fim da janela, °C */
  windingTempC: number;
  /** temperatura ambiente média, °C */
  ambientTempC: number;
  /** vazão estimada a partir da potência elétrica (método do torque), m³/h */
  qFromPower: number;
  /** vazão estimada a partir da altura medida e da curva nominal, m³/h */
  qFromHead: number;
  /** altura que a curva nominal prevê na vazão estimada por potência, m */
  headNominalAtQFromPower: number;
  /** altura que a curva nominal prevê na vazão medida, m */
  headNominalAtQMeasured: number;
  /** eficiência nominal na vazão estimada por potência, fração */
  etaNominal: number;
  /** NPSH disponível calculado, m */
  npshAvailableM: number;
  /** NPSH requerido na vazão estimada, m */
  npshRequiredM: number;
}

export interface Diagnosis {
  window: TelemetryWindow;
  operating: OperatingPoint;
  checks: CheckResult[];
  trust: TrustIndex;
  attribution: Attribution;
  claims: Claim[];
  provenance: Provenance;
  /** narrativa final em pt-BR (agente determinístico ou LLM validado) */
  narrative: string;
  /** origem da narrativa — declarada, nunca implícita */
  narrativeSource: 'agente-deterministico' | 'llm-validado' | 'llm-rejeitado-fallback';
  /** o que um detector sem verificação diria (para comparação) */
  baseline: {
    label: FaultLabel;
    text: string;
  };
}
