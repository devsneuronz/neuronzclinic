export function onlyPhoneDigits(value: string) {
  return value.replace(/\D/g, "")
}

function getExplicitInternationalDigits(value: string, digits: string) {
  const compactValue = value.trim().replace(/[\s().-]/g, "")

  if (compactValue.startsWith("+")) return digits
  if (compactValue.startsWith("00")) return digits.replace(/^00/, "")

  return ""
}

export function normalizeWhatsappPhone(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  const digits = onlyPhoneDigits(text)
  if (!digits) return ""

  const explicitInternationalDigits = getExplicitInternationalDigits(text, digits)
  if (explicitInternationalDigits) return explicitInternationalDigits

  if (digits.startsWith("55") || digits.length > 11) return digits

  return `55${digits}`
}

export function getCanonicalWhatsappChatId(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  if (text.endsWith("@s.whatsapp.net") || text.endsWith("@g.us")) return text

  const normalizedPhone = normalizeWhatsappPhone(text)
  return normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : ""
}
