const {
  normalizeJourneyStatus: normalizeJourneyStatusFromJourney,
} = require('./journeyService');

const INSTITUTIONAL_TAXONOMY_VERSION = '2026.03.phase5';
const JOURNEY_COHERENCE_MATRIX_VERSION = '2026.03.phase5';

const AGENDA_PRIMARY_SCOPE = 'agenda:view';
const AGENDA_LEGACY_COMPAT_SCOPE = 'profissionais:view';
const AGENDA_LEGACY_COMPAT_PHASE = 'phase5_controlled_removal';

const AGENDA_READ_ACCESS_MODE = Object.freeze({
  AGENDA_SCOPE: 'agenda_scope',
  LEGACY_PROFISSIONAIS_SCOPE: 'legacy_profissionais_scope',
  ADMIN_ROLE_COMPAT: 'admin_role_compat',
});

const AGENDA_LEGACY_SCOPE_REASON = Object.freeze({
  LEGACY_SCOPE_PERMISSION: 'legacy_profissionais_scope_permission',
  ADMIN_ROLE_COMPATIBILITY: 'admin_role_compatibility',
});

const AGENDA_WRITE_ENFORCEMENT_MODE = Object.freeze({
  PRE_ENFORCEMENT: 'pre_enforcement',
  OBSERVE_ONLY: 'observe_only',
  SOFT_BLOCK: 'soft_block',
  HARD_BLOCK: 'hard_block',
});

const AGENDA_WRITE_VALIDATION_LEVEL = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  BLOCK_READY: 'block_ready',
});

const AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS = Object.freeze(
  Object.values(AGENDA_WRITE_VALIDATION_LEVEL)
);

const AGENDA_WRITE_ENFORCEMENT_ROLLOUT_PHASE = 'phase5_controlled_rollout';
const AGENDA_WRITE_ENFORCEMENT_DEFAULT_MODE = AGENDA_WRITE_ENFORCEMENT_MODE.PRE_ENFORCEMENT;

function parseBooleanFlag(value, fallbackValue = false) {
  if (typeof value !== 'string') return fallbackValue;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallbackValue;
  if (['1', 'true', 'yes', 'sim', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'nao', 'off'].includes(normalized)) return false;
  return fallbackValue;
}

const AGENDA_LEGACY_FALLBACK_ENABLED = parseBooleanFlag(
  process.env.AGENDA_LEGACY_FALLBACK_ENABLED,
  true
);
const AGENDA_WRITE_HARD_BLOCK_ENABLED = parseBooleanFlag(
  process.env.AGENDA_WRITE_HARD_BLOCK_ENABLED,
  false
);

const INSTITUTIONAL_EVENT_TYPE = Object.freeze({
  ENTREVISTA_SOCIAL: 'entrevista_social',
  AVALIACAO_MULTIDISCIPLINAR: 'avaliacao_multidisciplinar',
  ANALISE_VAGA: 'analise_vaga',
  DEVOLUTIVA_INSTITUCIONAL: 'devolutiva_institucional',
  MATRICULA_INSTITUCIONAL: 'matricula_institucional',
  ACOMPANHAMENTO_CONTINUADO: 'acompanhamento_continuado',
});

// Mantem compatibilidade com nomenclatura da fase anterior.
const LEGACY_EVENT_TYPE_ALIASES = Object.freeze({
  devolutiva_matricula: INSTITUTIONAL_EVENT_TYPE.DEVOLUTIVA_INSTITUCIONAL,
});

const JOURNEY_STATUS_EVENT_TYPE_MAP = Object.freeze({
  em_fila_espera: INSTITUTIONAL_EVENT_TYPE.ENTREVISTA_SOCIAL,
  entrevista_realizada: INSTITUTIONAL_EVENT_TYPE.AVALIACAO_MULTIDISCIPLINAR,
  em_avaliacao: INSTITUTIONAL_EVENT_TYPE.AVALIACAO_MULTIDISCIPLINAR,
  em_analise_vaga: INSTITUTIONAL_EVENT_TYPE.ANALISE_VAGA,
  aprovado: INSTITUTIONAL_EVENT_TYPE.DEVOLUTIVA_INSTITUCIONAL,
  encaminhado: INSTITUTIONAL_EVENT_TYPE.DEVOLUTIVA_INSTITUCIONAL,
  matriculado: INSTITUTIONAL_EVENT_TYPE.MATRICULA_INSTITUCIONAL,
  ativo: INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO,
  inativo_assistencial: INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO,
  desligado: INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO,
});

const EVENT_TYPE_ALLOWED_JOURNEY_STATUSES = Object.freeze({
  [INSTITUTIONAL_EVENT_TYPE.ENTREVISTA_SOCIAL]: ['em_fila_espera', 'entrevista_realizada'],
  [INSTITUTIONAL_EVENT_TYPE.AVALIACAO_MULTIDISCIPLINAR]: ['entrevista_realizada', 'em_avaliacao'],
  [INSTITUTIONAL_EVENT_TYPE.ANALISE_VAGA]: ['em_avaliacao', 'em_analise_vaga'],
  [INSTITUTIONAL_EVENT_TYPE.DEVOLUTIVA_INSTITUCIONAL]: [
    'em_analise_vaga',
    'aprovado',
    'encaminhado',
  ],
  [INSTITUTIONAL_EVENT_TYPE.MATRICULA_INSTITUCIONAL]: ['aprovado', 'matriculado'],
  [INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO]: [
    'matriculado',
    'ativo',
    'inativo_assistencial',
    'desligado',
  ],
});

const SERVICE_NAME_EVENT_TYPE_ENTRIES = [
  ['entrevista social', INSTITUTIONAL_EVENT_TYPE.ENTREVISTA_SOCIAL],
  ['entrevista inicial', INSTITUTIONAL_EVENT_TYPE.ENTREVISTA_SOCIAL],
  ['avaliacao', INSTITUTIONAL_EVENT_TYPE.AVALIACAO_MULTIDISCIPLINAR],
  ['avaliacao psicologica', INSTITUTIONAL_EVENT_TYPE.AVALIACAO_MULTIDISCIPLINAR],
  ['avaliacao neuropsicologica', INSTITUTIONAL_EVENT_TYPE.AVALIACAO_MULTIDISCIPLINAR],
  ['avaliacao vocacional', INSTITUTIONAL_EVENT_TYPE.AVALIACAO_MULTIDISCIPLINAR],
  ['analise de vaga', INSTITUTIONAL_EVENT_TYPE.ANALISE_VAGA],
  ['devolutiva', INSTITUTIONAL_EVENT_TYPE.DEVOLUTIVA_INSTITUCIONAL],
  ['matricula', INSTITUTIONAL_EVENT_TYPE.MATRICULA_INSTITUCIONAL],
  ['acompanhamento', INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO],
  ['sessao', INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO],
  ['terapia individual', INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO],
  ['terapia em grupo', INSTITUTIONAL_EVENT_TYPE.ACOMPANHAMENTO_CONTINUADO],
];

function normalizeText(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeCatalogKey(value) {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

const normalizeJourneyStatus = normalizeJourneyStatusFromJourney;

function normalizeInstitutionalEventType(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (!normalized) return null;

  if (LEGACY_EVENT_TYPE_ALIASES[normalized]) {
    return LEGACY_EVENT_TYPE_ALIASES[normalized];
  }

  const knownValues = Object.values(INSTITUTIONAL_EVENT_TYPE);
  if (knownValues.includes(normalized)) {
    return normalized;
  }

  return null;
}

const SERVICE_NAME_EVENT_TYPE_MAP = new Map(
  SERVICE_NAME_EVENT_TYPE_ENTRIES
    .map(([label, eventType]) => [normalizeCatalogKey(label), eventType])
    .filter(([label, eventType]) => Boolean(label) && Boolean(eventType))
);

function resolveInstitutionalEventType({
  journeyStatus,
  serviceName,
  explicitEventType = null,
}) {
  const normalizedExplicitEventType = normalizeInstitutionalEventType(explicitEventType);
  if (normalizedExplicitEventType) {
    return {
      eventType: normalizedExplicitEventType,
      source: 'explicit_event_type',
    };
  }

  const normalizedJourneyStatus = normalizeJourneyStatus(journeyStatus);
  if (normalizedJourneyStatus && JOURNEY_STATUS_EVENT_TYPE_MAP[normalizedJourneyStatus]) {
    return {
      eventType: JOURNEY_STATUS_EVENT_TYPE_MAP[normalizedJourneyStatus],
      source: 'journey_status_rule',
    };
  }

  const normalizedServiceName = normalizeCatalogKey(serviceName);
  if (normalizedServiceName && SERVICE_NAME_EVENT_TYPE_MAP.has(normalizedServiceName)) {
    return {
      eventType: SERVICE_NAME_EVENT_TYPE_MAP.get(normalizedServiceName),
      source: 'service_name_catalog',
    };
  }

  return {
    eventType: null,
    source: null,
  };
}

function evaluateJourneyCoherence({ journeyStatus, eventType }) {
  const normalizedJourneyStatus = normalizeJourneyStatus(journeyStatus);
  const normalizedEventType = normalizeInstitutionalEventType(eventType);

  if (!normalizedJourneyStatus) {
    return {
      status: 'warning',
      code: 'journey_status_missing',
      message:
        'Assistido sem status_jornada definido; nao foi possivel validar a coerencia do fluxo.',
      expectedJourneyStatuses: null,
    };
  }

  if (!normalizedEventType) {
    return {
      status: 'warning',
      code: 'event_type_unclassified',
      message:
        'Nao foi possivel classificar o tipo institucional deste agendamento com regra auditavel.',
      expectedJourneyStatuses: null,
    };
  }

  const allowedJourneyStatuses = EVENT_TYPE_ALLOWED_JOURNEY_STATUSES[normalizedEventType];
  if (!Array.isArray(allowedJourneyStatuses) || allowedJourneyStatuses.length === 0) {
    return {
      status: 'unknown',
      code: 'event_type_without_rule',
      message: null,
      expectedJourneyStatuses: null,
    };
  }

  if (allowedJourneyStatuses.includes(normalizedJourneyStatus)) {
    return {
      status: 'ok',
      code: null,
      message: null,
      expectedJourneyStatuses: allowedJourneyStatuses,
    };
  }

  return {
    status: 'warning',
    code: 'journey_event_mismatch',
    message:
      `Evento institucional "${normalizedEventType}" fora da etapa atual ` +
      `"${normalizedJourneyStatus}". Esperado: ${allowedJourneyStatuses.join(', ')}.`,
    expectedJourneyStatuses: allowedJourneyStatuses,
  };
}

function buildAgendaInstitutionalContext({
  journeyStatus,
  serviceName,
  explicitEventType = null,
}) {
  const classification = resolveInstitutionalEventType({
    journeyStatus,
    serviceName,
    explicitEventType,
  });
  const coherence = evaluateJourneyCoherence({
    journeyStatus,
    eventType: classification.eventType,
  });

  return {
    event_type_institutional: classification.eventType,
    event_type_institutional_source: classification.source,
    journey_consistency_status: coherence.status,
    journey_consistency_code: coherence.code,
    journey_consistency_message: coherence.message,
    journey_consistency_expected_statuses: coherence.expectedJourneyStatuses,
  };
}

function resolveWriteValidationLevelClassification({
  journeyConsistencyStatus,
  journeyConsistencyCode,
}) {
  const normalizedStatus = (journeyConsistencyStatus || '').toString().trim().toLowerCase();
  const normalizedCode = (journeyConsistencyCode || '').toString().trim().toLowerCase();

  if (normalizedStatus === 'ok') {
    return {
      level: AGENDA_WRITE_VALIDATION_LEVEL.INFO,
      action: 'observe_only',
      code: normalizedCode || 'journey_consistent',
      message: 'Coerencia da jornada validada para o contexto atual.',
    };
  }

  if (normalizedStatus === 'warning' && normalizedCode === 'journey_event_mismatch') {
    return {
      level: AGENDA_WRITE_VALIDATION_LEVEL.BLOCK_READY,
      action: 'would_block_when_enforced',
      code: normalizedCode,
      message:
        'Incoerencia relevante detectada. Em modo de enforcement futuro este caso deve ser bloqueado.',
    };
  }

  if (normalizedStatus === 'warning') {
    return {
      level: AGENDA_WRITE_VALIDATION_LEVEL.WARNING,
      action: 'warn_only',
      code: normalizedCode || 'journey_warning',
      message: 'Validacao de jornada em atencao. Mantido sem bloqueio nesta fase.',
    };
  }

  return {
    level: AGENDA_WRITE_VALIDATION_LEVEL.INFO,
    action: 'observe_only',
    code: normalizedCode || 'journey_validation_not_deterministic',
    message:
      'Sem determinacao robusta para bloqueio. Caso mantido em monitoramento de pre-enforcement.',
  };
}

function normalizeWriteEnforcementMode(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  const knownModes = Object.values(AGENDA_WRITE_ENFORCEMENT_MODE);
  if (knownModes.includes(normalized)) {
    return normalized;
  }
  return null;
}

function resolveAgendaWriteEnforcementMode({ requestedMode = null } = {}) {
  const requested = normalizeWriteEnforcementMode(requestedMode);
  const envMode = normalizeWriteEnforcementMode(process.env.AGENDA_WRITE_ENFORCEMENT_MODE);
  const configuredMode = requested || envMode || AGENDA_WRITE_ENFORCEMENT_DEFAULT_MODE;
  const legacyModeAlias =
    configuredMode === AGENDA_WRITE_ENFORCEMENT_MODE.PRE_ENFORCEMENT
      ? AGENDA_WRITE_ENFORCEMENT_MODE.PRE_ENFORCEMENT
      : null;

  let effectiveMode =
    configuredMode === AGENDA_WRITE_ENFORCEMENT_MODE.PRE_ENFORCEMENT
      ? AGENDA_WRITE_ENFORCEMENT_MODE.OBSERVE_ONLY
      : configuredMode;

  if (
    effectiveMode === AGENDA_WRITE_ENFORCEMENT_MODE.HARD_BLOCK &&
    AGENDA_WRITE_HARD_BLOCK_ENABLED !== true
  ) {
    effectiveMode = AGENDA_WRITE_ENFORCEMENT_MODE.SOFT_BLOCK;
  }

  return {
    configuredMode,
    effectiveMode,
    legacyModeAlias,
    hardBlockGloballyEnabled: AGENDA_WRITE_HARD_BLOCK_ENABLED === true,
    blockingActive:
      effectiveMode === AGENDA_WRITE_ENFORCEMENT_MODE.SOFT_BLOCK ||
      effectiveMode === AGENDA_WRITE_ENFORCEMENT_MODE.HARD_BLOCK,
    rolloutPhase: AGENDA_WRITE_ENFORCEMENT_ROLLOUT_PHASE,
  };
}

function resolveWriteValidationDecision({
  validationLevel,
  enforcementMode,
  fallbackCode = null,
}) {
  const level = (validationLevel || '').toString().trim().toLowerCase();
  const enforcement = resolveAgendaWriteEnforcementMode({ requestedMode: enforcementMode });
  const isWarningOrBlockReady =
    level === AGENDA_WRITE_VALIDATION_LEVEL.WARNING ||
    level === AGENDA_WRITE_VALIDATION_LEVEL.BLOCK_READY;

  if (enforcement.effectiveMode === AGENDA_WRITE_ENFORCEMENT_MODE.HARD_BLOCK) {
    const shouldBlock = level !== AGENDA_WRITE_VALIDATION_LEVEL.INFO;
    return {
      enforcement,
      shouldWarn: isWarningOrBlockReady,
      shouldBlock,
      wouldBlockWhenEnforced: shouldBlock,
      action: shouldBlock ? 'hard_block' : 'observe_only',
      code: fallbackCode || null,
    };
  }

  if (enforcement.effectiveMode === AGENDA_WRITE_ENFORCEMENT_MODE.SOFT_BLOCK) {
    const shouldBlock = level === AGENDA_WRITE_VALIDATION_LEVEL.BLOCK_READY;
    return {
      enforcement,
      shouldWarn: isWarningOrBlockReady,
      shouldBlock,
      wouldBlockWhenEnforced: shouldBlock,
      action: shouldBlock ? 'soft_block' : isWarningOrBlockReady ? 'warn_only' : 'observe_only',
      code: fallbackCode || null,
    };
  }

  return {
    enforcement,
    shouldWarn: isWarningOrBlockReady,
    shouldBlock: false,
    wouldBlockWhenEnforced: level === AGENDA_WRITE_VALIDATION_LEVEL.BLOCK_READY,
    action:
      level === AGENDA_WRITE_VALIDATION_LEVEL.BLOCK_READY
        ? 'would_block_when_enforced'
        : isWarningOrBlockReady
          ? 'warn_only'
          : 'observe_only',
    code: fallbackCode || null,
  };
}

function resolveWriteValidationPreEnforcement(args) {
  return resolveWriteValidationDecision({
    validationLevel: args?.validationLevel,
    enforcementMode: AGENDA_WRITE_ENFORCEMENT_MODE.PRE_ENFORCEMENT,
    fallbackCode: args?.fallbackCode || null,
  });
}

function resolveAgendaCompatibilityNotice({ compatibilityMode }) {
  if (compatibilityMode !== true) return null;

  return (
    'Compatibilidade temporaria ativa: leitura da agenda concedida por ' +
    `${AGENDA_LEGACY_COMPAT_SCOPE}. Planejar migracao para ${AGENDA_PRIMARY_SCOPE}.`
  );
}

function buildAgendaReadMetadata({
  accessMode = null,
  compatibilityMode = false,
  legacyReason = null,
  enforcementMode = null,
}) {
  const enforcement = resolveAgendaWriteEnforcementMode({
    requestedMode: enforcementMode,
  });

  return {
    access_mode: accessMode || null,
    compatibility_mode: compatibilityMode === true,
    compatibility_notice: resolveAgendaCompatibilityNotice({
      compatibilityMode: compatibilityMode === true,
    }),
    primary_scope_required: AGENDA_PRIMARY_SCOPE,
    legacy_scope_required: AGENDA_LEGACY_COMPAT_SCOPE,
    legacy_scope_fallback_enabled: AGENDA_LEGACY_FALLBACK_ENABLED === true,
    legacy_scope_active: compatibilityMode === true,
    legacy_scope_reason: compatibilityMode === true ? legacyReason || null : null,
    legacy_scope_deprecation_phase: AGENDA_LEGACY_COMPAT_PHASE,
    legacy_scope_requires_migration: compatibilityMode === true,
    legacy_scope_removal_ready: compatibilityMode !== true,
    institutional_taxonomy_version: INSTITUTIONAL_TAXONOMY_VERSION,
    coherence_matrix_version: JOURNEY_COHERENCE_MATRIX_VERSION,
    write_validation_ready: true,
    write_validation_mode: enforcement.configuredMode,
    write_validation_effective_mode: enforcement.effectiveMode,
    write_validation_rollout_phase: enforcement.rolloutPhase,
    write_validation_hard_block_enabled: enforcement.hardBlockGloballyEnabled,
    write_validation_legacy_mode_alias: enforcement.legacyModeAlias,
    write_validation_supported_levels: AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
    write_validation_blocking_active: enforcement.blockingActive,
    write_validation_enforcement_ready: true,
  };
}

function normalizeWriteValidationLevel(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS.includes(normalized)) {
    return normalized;
  }
  return AGENDA_WRITE_VALIDATION_LEVEL.INFO;
}

function summarizeWriteValidation(items) {
  const summary = {
    total: 0,
    info_count: 0,
    warning_count: 0,
    block_ready_count: 0,
    would_block_count: 0,
    blocking_count: 0,
  };

  if (!Array.isArray(items) || items.length === 0) {
    return summary;
  }

  for (const item of items) {
    const level = normalizeWriteValidationLevel(item?.write_validation_level || item?.level);
    const shouldBlock = item?.write_validation_should_block === true;
    summary.total += 1;
    if (level === AGENDA_WRITE_VALIDATION_LEVEL.BLOCK_READY) {
      summary.block_ready_count += 1;
      summary.would_block_count += 1;
    } else if (level === AGENDA_WRITE_VALIDATION_LEVEL.WARNING) {
      summary.warning_count += 1;
    } else {
      summary.info_count += 1;
    }

    if (shouldBlock) {
      summary.blocking_count += 1;
    }
  }

  return summary;
}

// Preparacao para futuras rotas de escrita (POST/PUT da agenda institucional).
function prepareAgendaWriteValidation({
  journeyStatus,
  serviceName,
  explicitEventType = null,
  enforcementMode = null,
}) {
  const context = buildAgendaInstitutionalContext({
    journeyStatus,
    serviceName,
    explicitEventType,
  });
  const classification = resolveWriteValidationLevelClassification({
    journeyConsistencyStatus: context.journey_consistency_status,
    journeyConsistencyCode: context.journey_consistency_code,
  });
  const decision = resolveWriteValidationDecision({
    validationLevel: classification.level,
    enforcementMode,
    fallbackCode: classification.code,
  });

  return {
    ...context,
    mode: decision.enforcement.configuredMode,
    effectiveMode: decision.enforcement.effectiveMode,
    rolloutPhase: decision.enforcement.rolloutPhase,
    hardBlockGloballyEnabled: decision.enforcement.hardBlockGloballyEnabled,
    legacyModeAlias: decision.enforcement.legacyModeAlias,
    level: classification.level,
    action: decision.action,
    code: classification.code || decision.code || null,
    message: classification.message,
    supportedLevels: AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
    shouldWarn: decision.shouldWarn,
    shouldBlock: decision.shouldBlock,
    wouldBlockWhenEnforced: decision.wouldBlockWhenEnforced,
    blockingActive: decision.enforcement.blockingActive,
    enforcementReady: true,
    taxonomyVersion: INSTITUTIONAL_TAXONOMY_VERSION,
    coherenceMatrixVersion: JOURNEY_COHERENCE_MATRIX_VERSION,
  };
}

function prepareAgendaWriteGuard({
  journeyStatus,
  serviceName,
  explicitEventType = null,
  enforcementMode = null,
  context = {},
}) {
  // Uso previsto nos futuros endpoints de escrita da agenda (POST/PUT/PATCH).
  // O endpoint pode retornar blockPayload quando canProceed === false.
  const validation = prepareAgendaWriteValidation({
    journeyStatus,
    serviceName,
    explicitEventType,
    enforcementMode,
  });

  const blocked = validation.shouldBlock === true;
  return {
    ...validation,
    canProceed: blocked !== true,
    statusCode: blocked ? 409 : null,
    blockPayload: blocked
      ? {
          success: false,
          code: 'agenda_write_blocked_by_journey',
          message:
            validation.message ||
            'Agendamento bloqueado por incoerencia de jornada para o modo de enforcement atual.',
          validation: {
            mode: validation.mode,
            effective_mode: validation.effectiveMode,
            level: validation.level,
            action: validation.action,
            reason_code: validation.code,
            context,
          },
        }
      : null,
  };
}

function toAgendaWriteValidationPayload(validation) {
  if (!validation || typeof validation !== 'object') {
    return {
      mode: null,
      effective_mode: null,
      rollout_phase: null,
      hard_block_enabled: false,
      legacy_mode_alias: null,
      level: null,
      action: null,
      reason_code: null,
      message: null,
      supported_levels: AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
      should_warn: false,
      should_block: false,
      would_block_when_enforced: false,
      blocking_active: false,
      enforcement_ready: false,
      taxonomy_version: INSTITUTIONAL_TAXONOMY_VERSION,
      coherence_matrix_version: JOURNEY_COHERENCE_MATRIX_VERSION,
    };
  }

  return {
    mode: validation.mode || null,
    effective_mode: validation.effectiveMode || null,
    rollout_phase: validation.rolloutPhase || null,
    hard_block_enabled: validation.hardBlockGloballyEnabled === true,
    legacy_mode_alias: validation.legacyModeAlias || null,
    level: validation.level || null,
    action: validation.action || null,
    reason_code: validation.code || null,
    message: validation.message || null,
    supported_levels:
      Array.isArray(validation.supportedLevels) && validation.supportedLevels.length > 0
        ? validation.supportedLevels
        : AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
    should_warn: validation.shouldWarn === true,
    should_block: validation.shouldBlock === true,
    would_block_when_enforced: validation.wouldBlockWhenEnforced === true,
    blocking_active: validation.blockingActive === true,
    enforcement_ready: validation.enforcementReady === true,
    taxonomy_version: validation.taxonomyVersion || INSTITUTIONAL_TAXONOMY_VERSION,
    coherence_matrix_version:
      validation.coherenceMatrixVersion || JOURNEY_COHERENCE_MATRIX_VERSION,
  };
}

module.exports = {
  AGENDA_PRIMARY_SCOPE,
  AGENDA_LEGACY_COMPAT_SCOPE,
  AGENDA_LEGACY_COMPAT_PHASE,
  AGENDA_LEGACY_FALLBACK_ENABLED,
  AGENDA_READ_ACCESS_MODE,
  AGENDA_LEGACY_SCOPE_REASON,
  AGENDA_WRITE_ENFORCEMENT_MODE,
  AGENDA_WRITE_ENFORCEMENT_DEFAULT_MODE,
  AGENDA_WRITE_ENFORCEMENT_ROLLOUT_PHASE,
  AGENDA_WRITE_VALIDATION_LEVEL,
  AGENDA_WRITE_VALIDATION_SUPPORTED_LEVELS,
  INSTITUTIONAL_EVENT_TYPE,
  INSTITUTIONAL_TAXONOMY_VERSION,
  JOURNEY_COHERENCE_MATRIX_VERSION,
  EVENT_TYPE_ALLOWED_JOURNEY_STATUSES,
  JOURNEY_STATUS_EVENT_TYPE_MAP,
  normalizeJourneyStatus,
  normalizeInstitutionalEventType,
  resolveInstitutionalEventType,
  evaluateJourneyCoherence,
  buildAgendaInstitutionalContext,
  buildAgendaReadMetadata,
  resolveAgendaCompatibilityNotice,
  normalizeWriteEnforcementMode,
  resolveAgendaWriteEnforcementMode,
  resolveWriteValidationLevelClassification,
  resolveWriteValidationDecision,
  resolveWriteValidationPreEnforcement,
  summarizeWriteValidation,
  prepareAgendaWriteValidation,
  prepareAgendaWriteGuard,
  toAgendaWriteValidationPayload,
};
