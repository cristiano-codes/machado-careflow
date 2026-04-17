export type PtBrDateParts = {
  day: number;
  month: number;
  year: number;
};

const PT_BR_DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const API_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const API_DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})T/;
const ISO_DATE_WITH_SEPARATOR_REGEX = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;

function parseInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function formatPtBrDate(parts: PtBrDateParts) {
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${String(
    parts.year
  ).padStart(4, "0")}`;
}

export function sanitizeDateInput(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "").slice(0, 8);
}

export function detectIsoDateString(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return ISO_DATE_WITH_SEPARATOR_REGEX.test(normalized);
}

export function toPtBrFromIso(value: string | null | undefined) {
  const normalized = (value || "").trim();
  if (!detectIsoDateString(normalized)) return null;

  const match = normalized.match(ISO_DATE_WITH_SEPARATOR_REGEX);
  if (!match) return null;

  const year = parseInteger(match[1]);
  const month = parseInteger(match[2]);
  const day = parseInteger(match[3]);
  if (day === null || month === null || year === null) return null;

  const parts = { day, month, year };
  if (!isValidCalendarDate(parts)) return null;

  return formatPtBrDate(parts);
}

export function normalizePastedDateValue(value: string | null | undefined) {
  const normalized = (value || "").trim();
  if (!normalized) return "";

  const isoAsPtBr = toPtBrFromIso(normalized);
  if (isoAsPtBr) return isoAsPtBr;

  return normalized;
}

export function applyDateMask(value: string | null | undefined) {
  const digits = sanitizeDateInput(normalizePastedDateValue(value));
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

export function parsePtBrDate(value: string | null | undefined): PtBrDateParts | null {
  const normalized = (value || "").trim();
  const match = normalized.match(PT_BR_DATE_REGEX);
  if (!match) return null;

  const day = parseInteger(match[1]);
  const month = parseInteger(match[2]);
  const year = parseInteger(match[3]);
  if (day === null || month === null || year === null) return null;

  return { day, month, year };
}

export function isValidCalendarDate(parts: PtBrDateParts | null | undefined): parts is PtBrDateParts {
  if (!parts) return false;
  if (parts.day < 1 || parts.day > 31) return false;
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.year < 1000 || parts.year > 9999) return false;

  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    probe.getUTCFullYear() === parts.year &&
    probe.getUTCMonth() === parts.month - 1 &&
    probe.getUTCDate() === parts.day
  );
}

export function formatToApiDate(value: string | PtBrDateParts | null | undefined): string | null {
  const parts =
    typeof value === "string" || !value
      ? parsePtBrDate(value || "")
      : value;

  if (!isValidCalendarDate(parts)) return null;

  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function parseApiDate(value: string | null | undefined): PtBrDateParts | null {
  const normalized = (value || "").trim();
  if (!normalized) return null;

  const dateMatch = normalized.match(API_DATE_REGEX) || normalized.match(API_DATE_TIME_REGEX);
  if (!dateMatch) return null;

  const year = parseInteger(dateMatch[1]);
  const month = parseInteger(dateMatch[2]);
  const day = parseInteger(dateMatch[3]);
  if (day === null || month === null || year === null) return null;

  const parts = { day, month, year };
  return isValidCalendarDate(parts) ? parts : null;
}

export function formatFromApiDate(value: string | null | undefined) {
  const parsed = parseApiDate(value);
  if (!parsed) return "";
  return formatPtBrDate(parsed);
}
