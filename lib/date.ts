export function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateTime(value: string, options: Intl.DateTimeFormatOptions) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", options).format(date);
}
