import type { ChatRecord } from "@/lib/supabase-rest"

export interface ChatTag {
  id: string
  label: string
  color?: string
}

export const CHAT_INTEREST_FIELD_CANDIDATES = [
  "json_interests_parsed",
  "json_interests",
  "interest_tags_array",
  "interest_tags",
  "interests",
  "json_interesses_parsed",
  "json_interesses",
  "interesses_array",
  "interesses",
  "tag_interesse_array",
  "tags_interesse",
  "tags_interesses",
]

type TagLike = {
  fields?: Record<string, unknown>
  id?: unknown
  Tag?: unknown
  tag?: unknown
  label?: unknown
  name?: unknown
  Nome?: unknown
  HEXCOR?: unknown
  hexcor?: unknown
  hex_status?: unknown
  color?: unknown
  cor?: unknown
  "IDA TAG"?: unknown
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeColor(value: unknown) {
  const color = asString(value)
  return /^#[0-9a-f]{6}$/i.test(color) ? color : undefined
}

function getTagFromObject(value: TagLike): ChatTag | null {
  const source = value.fields ?? value
  const label =
    asString(source.Tag) ||
    asString(source.tag) ||
    asString(source.label) ||
    asString(source.name) ||
    asString(source.Nome)

  if (!label) return null

  const id = asString(source["IDA TAG"]) || asString(source.id) || asString(value.id) || label
  const color =
    normalizeColor(source.HEXCOR) ||
    normalizeColor(source.hexcor) ||
    normalizeColor(source.hex_status) ||
    normalizeColor(source.color) ||
    normalizeColor(source.cor)

  return { id, label, color }
}

function normalizeTag(value: unknown): ChatTag | null {
  if (typeof value === "string") {
    const label = value.trim()
    if (!label) return null

    if ((label.startsWith("{") && label.endsWith("}")) || (label.startsWith("[") && label.endsWith("]"))) {
      try {
        const parsed = JSON.parse(label)
        const parsedTags = tagsFromCandidate(parsed)

        return parsedTags[0] ?? null
      } catch {
        return { id: label, label }
      }
    }

    return label ? { id: label, label } : null
  }

  if (value && typeof value === "object") {
    return getTagFromObject(value as TagLike)
  }

  return null
}

function tagsFromCandidate(candidate: unknown): ChatTag[] {
  if (!candidate) return []

  if (Array.isArray(candidate)) {
    return candidate.map(normalizeTag).filter((tag): tag is ChatTag => Boolean(tag))
  }

  if (typeof candidate === "string") {
    try {
      const parsed = JSON.parse(candidate)
      const parsedTags = tagsFromCandidate(parsed)
      if (parsedTags.length > 0) return parsedTags
    } catch {
      return candidate
        .split(",")
        .map(normalizeTag)
        .filter((tag): tag is ChatTag => Boolean(tag))
    }
  }

  return []
}

export function getChatTags(chat?: Partial<ChatRecord>): ChatTag[] {
  if (!chat) return []

  const candidates = [chat.json_tags_parsed, chat.json_tags, chat.tag_chat_array]
  const seen = new Set<string>()
  const tags: ChatTag[] = []

  for (const candidate of candidates) {
    for (const tag of tagsFromCandidate(candidate)) {
      const key = tag.id || tag.label
      if (seen.has(key)) continue

      seen.add(key)
      tags.push(tag)
    }
  }

  return tags
}

export function getChatInterestTags(chat?: Partial<ChatRecord>): ChatTag[] {
  if (!chat) return []

  const source = chat as Partial<ChatRecord> & Record<string, unknown>
  const candidates = CHAT_INTEREST_FIELD_CANDIDATES.map((field) => source[field])
  const seen = new Set<string>()
  const tags: ChatTag[] = []

  for (const candidate of candidates) {
    for (const tag of tagsFromCandidate(candidate)) {
      const key = tag.id || tag.label
      if (seen.has(key)) continue

      seen.add(key)
      tags.push(tag)
    }
  }

  return tags
}

export function getReadableTextColor(backgroundColor?: string) {
  if (!backgroundColor) return undefined

  const hex = backgroundColor.replace("#", "")
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

  return luminance > 0.62 ? "#111827" : "#ffffff"
}
