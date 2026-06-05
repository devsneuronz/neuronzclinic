export function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

export function parseDateOnly(value: string) {
  const match = value.match(dateOnlyPattern);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function formatDateTime(value: string, options: Intl.DateTimeFormatOptions) {
  if (!value) return "";

  const date = parseDateOnly(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", options).format(date);
}

export function getDateInputValue(value: string) {
  if (!value) return "";

  const dateOnlyMatch = value.match(dateOnlyPattern);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}
