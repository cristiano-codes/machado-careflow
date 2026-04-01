const FILTERS_OPEN_KEY_PREFIX = "agenda_lab_filters_open_v1:";

export function readLabFiltersOpen(pageKey: string, defaultValue = false) {
  try {
    const raw = localStorage.getItem(`${FILTERS_OPEN_KEY_PREFIX}${pageKey}`);
    if (raw === null) return defaultValue;
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

export function writeLabFiltersOpen(pageKey: string, isOpen: boolean) {
  try {
    localStorage.setItem(`${FILTERS_OPEN_KEY_PREFIX}${pageKey}`, isOpen ? "1" : "0");
  } catch {
    // Ignore storage write errors.
  }
}

export function readAgendaLabDashboardFiltersOpen(defaultValue = false) {
  return readLabFiltersOpen("agenda-dashboard", defaultValue);
}

export function writeAgendaLabDashboardFiltersOpen(isOpen: boolean) {
  writeLabFiltersOpen("agenda-dashboard", isOpen);
}
