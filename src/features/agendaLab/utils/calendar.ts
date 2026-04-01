import {
  addDays,
  differenceInCalendarWeeks,
  endOfDay,
  endOfMonth,
  format,
  getISODay,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { AllocationRecurrence, GroupClass, Weekday } from "@/features/agendaLab/types";

export const OPERATIONAL_WEEKDAYS: Weekday[] = ["seg", "ter", "qua", "qui", "sex", "sab"];

const WEEKDAY_TO_ISO_DAY: Record<Weekday, number> = {
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
};

const ISO_DAY_TO_WEEKDAY: Partial<Record<number, Weekday>> = {
  1: "seg",
  2: "ter",
  3: "qua",
  4: "qui",
  5: "sex",
  6: "sab",
};

function parseLabDate(dateText: string | null | undefined): Date | null {
  if (!dateText) return null;
  try {
    const parsed = parseISO(dateText);
    if (Number.isNaN(parsed.getTime())) return null;
    return startOfDay(parsed);
  } catch {
    return null;
  }
}

function getFirstOccurrenceDate(classStartDate: Date, weekday: Weekday) {
  const startDay = getISODay(classStartDate);
  const targetDay = WEEKDAY_TO_ISO_DAY[weekday];
  const deltaDays = (targetDay - startDay + 7) % 7;
  return addDays(classStartDate, deltaDays);
}

function getWeekdayOccurrencesInMonth(monthDate: Date, weekday: Weekday) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const dates: Date[] = [];
  let cursor = monthStart;

  while (!isAfter(cursor, monthEnd)) {
    if (getISODay(cursor) === WEEKDAY_TO_ISO_DAY[weekday]) {
      dates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function matchesMonthlyRecurrence(date: Date, anchorDate: Date, weekday: Weekday) {
  const anchorOccurrences = getWeekdayOccurrencesInMonth(anchorDate, weekday);
  const anchorIndex = anchorOccurrences.findIndex((item) => isSameDay(item, anchorDate));
  if (anchorIndex < 0) return false;

  const monthOccurrences = getWeekdayOccurrencesInMonth(date, weekday);
  if (monthOccurrences.length === 0) return false;

  const targetIndex = Math.min(anchorIndex, monthOccurrences.length - 1);
  return isSameDay(date, monthOccurrences[targetIndex]);
}

function isInsideClassWindow(date: Date, classData: GroupClass) {
  const startDate = parseLabDate(classData.dataInicio);
  const endDate = parseLabDate(classData.dataTermino);
  const currentDay = startOfDay(date);

  if (startDate && isBefore(currentDay, startDate)) return false;
  if (endDate && isAfter(currentDay, endOfDay(endDate))) return false;

  return true;
}

export function getLabWeekdayFromDate(date: Date): Weekday | null {
  return ISO_DAY_TO_WEEKDAY[getISODay(date)] || null;
}

export function getOperationalWeekDates(referenceDate: Date) {
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return OPERATIONAL_WEEKDAYS.map((weekday) => ({
    weekday,
    date: addDays(weekStart, WEEKDAY_TO_ISO_DAY[weekday] - 1),
  }));
}

export function toIsoDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function allocationOccursOnDate(params: {
  date: Date;
  weekday: Weekday;
  recurrence: AllocationRecurrence;
  classData: GroupClass;
}) {
  const { date, weekday, recurrence, classData } = params;
  const currentDay = startOfDay(date);
  if (getLabWeekdayFromDate(currentDay) !== weekday) return false;
  if (!isInsideClassWindow(currentDay, classData)) return false;

  const classStart = parseLabDate(classData.dataInicio) || currentDay;
  const anchorDate = getFirstOccurrenceDate(classStart, weekday);
  if (isBefore(currentDay, anchorDate)) return false;

  if (recurrence === "semanal") return true;

  if (recurrence === "quinzenal") {
    const weeksDiff = differenceInCalendarWeeks(currentDay, anchorDate, { weekStartsOn: 1 });
    return weeksDiff >= 0 && weeksDiff % 2 === 0;
  }

  return matchesMonthlyRecurrence(currentDay, anchorDate, weekday);
}
