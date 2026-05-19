export function getAvatarInitials(value: string | null | undefined, fallback = "U") {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)

  const initials = normalized
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return initials || fallback
}
