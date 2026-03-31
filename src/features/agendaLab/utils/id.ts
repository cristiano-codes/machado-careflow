export function makeLabId(prefix: string) {
  const salt = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${salt}`;
}

