const pool = require('../config/pg');

const REGISTRATION_MODES = Object.freeze([
  'ADMIN_ONLY',
  'PUBLIC_SIGNUP',
  'INVITE_ONLY',
]);

const PUBLIC_SIGNUP_DEFAULT_STATUSES = Object.freeze([
  'pendente',
  'ativo',
]);

const LINK_POLICIES = Object.freeze([
  'MANUAL_LINK_ADMIN',
  'AUTO_LINK_BY_EMAIL',
  'SELF_CLAIM_WITH_APPROVAL',
]);

const DEFAULT_ACCESS_SETTINGS = Object.freeze({
  registration_mode: 'INVITE_ONLY',
  public_signup_default_status: 'pendente',
  link_policy: 'MANUAL_LINK_ADMIN',
  allow_create_user_from_professional: true,
  block_duplicate_email: true,
  allow_public_registration: false,
});

function normalizeRegistrationMode(value) {
  const normalized = (value || '').toString().trim().toUpperCase();
  if (REGISTRATION_MODES.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_ACCESS_SETTINGS.registration_mode;
}

function normalizePublicSignupDefaultStatus(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (PUBLIC_SIGNUP_DEFAULT_STATUSES.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_ACCESS_SETTINGS.public_signup_default_status;
}

function normalizeLinkPolicy(value) {
  const normalized = (value || '').toString().trim().toUpperCase();
  if (LINK_POLICIES.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_ACCESS_SETTINGS.link_policy;
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function deriveAllowPublicRegistration(registrationMode) {
  return normalizeRegistrationMode(registrationMode) === 'PUBLIC_SIGNUP';
}

function normalizeAccessSettings(raw = {}) {
  const registration_mode = normalizeRegistrationMode(
    raw.registration_mode ||
      (raw.allow_public_registration === true ? 'PUBLIC_SIGNUP' : null)
  );

  return {
    registration_mode,
    public_signup_default_status: normalizePublicSignupDefaultStatus(
      raw.public_signup_default_status
    ),
    link_policy: normalizeLinkPolicy(raw.link_policy),
    allow_create_user_from_professional: normalizeBoolean(
      raw.allow_create_user_from_professional,
      DEFAULT_ACCESS_SETTINGS.allow_create_user_from_professional
    ),
    block_duplicate_email: normalizeBoolean(
      raw.block_duplicate_email,
      DEFAULT_ACCESS_SETTINGS.block_duplicate_email
    ),
    allow_public_registration: deriveAllowPublicRegistration(registration_mode),
  };
}

async function readAccessSettings(db = pool) {
  const { rows } = await db.query(
    `
      SELECT
        registration_mode,
        public_signup_default_status,
        link_policy,
        allow_create_user_from_professional,
        block_duplicate_email,
        allow_public_registration
      FROM public.system_settings
      LIMIT 1
    `
  );

  return normalizeAccessSettings(rows[0] || {});
}

module.exports = {
  REGISTRATION_MODES,
  PUBLIC_SIGNUP_DEFAULT_STATUSES,
  LINK_POLICIES,
  DEFAULT_ACCESS_SETTINGS,
  normalizeRegistrationMode,
  normalizePublicSignupDefaultStatus,
  normalizeLinkPolicy,
  deriveAllowPublicRegistration,
  normalizeAccessSettings,
  readAccessSettings,
};
