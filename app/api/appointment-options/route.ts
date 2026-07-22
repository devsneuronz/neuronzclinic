import { NextResponse } from "next/server"

import { getString, supabaseJson } from "@/lib/supabase-server"
import { normalizeUserRole } from "@/lib/user-roles"

type OptionRow = { set_key: string; value: string; label: string; active: boolean | null; sort_order: number | null }
type ContactRow = { id: string; name: string | null; phone: string | null; active: boolean | null }
type UserRow = { id: string; email: string; role: string | null; active: boolean | null; can_access_untagged_chats: boolean | null }
type UserSectorRow = { user_id: string; sector_id: string }
type UserTagRow = { user_id: string; tag_id: string }
type SectorTagRow = { sector_id: string; tag_id: string }
type ContactTagRow = { contact_id: string | null; tag_id: string | null }
type ContactInterestTagRow = { contact_id: string | null; tag_id: string | null; tags: { label: string | null } | null }
type ProfessionalRow = { id: string; metadata: Record<string, unknown> | null }
type ProcedureRow = { id: string; interest: string | null; interest_tag_id: string | null }

function optionLabels(rows: OptionRow[], key: string) {
  return rows
    .filter((row) => row.set_key === key)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label, "pt-BR"))
    .map((row) => row.label || row.value)
}

async function getUserAccess(email: string) {
  if (!email) return null

  const normalizedEmail = email.trim().toLowerCase()
  const [user] = await supabaseJson<UserRow[]>(
    `app_users?select=id,email,role,active,can_access_untagged_chats&email=eq.${encodeURIComponent(normalizedEmail)}&active=is.true&limit=1`,
  )
  if (!user) return null

  const [userTags, userSectors, sectorTags] = await Promise.all([
    supabaseJson<UserTagRow[]>(`user_tags?select=user_id,tag_id&user_id=eq.${encodeURIComponent(user.id)}`),
    supabaseJson<UserSectorRow[]>(`user_sectors?select=user_id,sector_id&user_id=eq.${encodeURIComponent(user.id)}`),
    supabaseJson<SectorTagRow[]>("sector_tags?select=sector_id,tag_id"),
  ])
  const sectorIds = new Set(userSectors.map((link) => link.sector_id))
  const tagIds = new Set(userTags.map((link) => link.tag_id))

  for (const link of sectorTags) {
    if (sectorIds.has(link.sector_id)) tagIds.add(link.tag_id)
  }

  return {
    role: normalizeUserRole(user.role),
    tagIds,
    canAccessUntaggedChats: Boolean(user.can_access_untagged_chats) || userSectors.some((sector) => !sectorTags.some((link) => link.sector_id === sector.sector_id)),
  }
}

async function filterPatientsByUserAccess(patients: ContactRow[], email: string) {
  const access = await getUserAccess(email)
  if (!access || access.role === "admin") return patients

  const contactIds = patients.map((patient) => patient.id)
  if (contactIds.length === 0) return []

  const contactTags = await supabaseJson<ContactTagRow[]>(
    `contact_tags?select=contact_id,tag_id&contact_id=in.(${contactIds.map(encodeURIComponent).join(",")})`,
  )
  const accessibleContactIds = new Set<string>()
  const contactIdsWithTags = new Set<string>()

  for (const tag of contactTags) {
    if (!tag.contact_id) continue
    contactIdsWithTags.add(tag.contact_id)
    if (tag.tag_id && access.tagIds.has(tag.tag_id)) {
      accessibleContactIds.add(tag.contact_id)
    }
  }

  if (access.canAccessUntaggedChats) {
    for (const contactId of contactIds) {
      if (!contactIdsWithTags.has(contactId)) accessibleContactIds.add(contactId)
    }
  }

  return patients.filter((patient) => accessibleContactIds.has(patient.id))
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(getString).filter(Boolean) : []
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

async function getProfessionalInterestFilters(professionalId: string) {
  if (!professionalId) return { tagIds: new Set<string>(), labels: new Set<string>() }

  const [professional] = await supabaseJson<ProfessionalRow[]>(
    `professionals?select=id,metadata&id=eq.${encodeURIComponent(professionalId)}&active=is.true&limit=1`,
  )
  const procedureIds = getStringArray(professional?.metadata?.procedure_ids)
  if (procedureIds.length === 0) return { tagIds: new Set<string>(), labels: new Set<string>() }

  const procedures = await supabaseJson<ProcedureRow[]>(
    `clinic_procedures?select=id,interest,interest_tag_id&id=in.(${procedureIds.map(encodeURIComponent).join(",")})&status=is.true`,
  )

  return {
    tagIds: new Set(procedures.map((procedure) => procedure.interest_tag_id).filter((id): id is string => Boolean(id))),
    labels: new Set(procedures.map((procedure) => (procedure.interest ? normalizeLabel(procedure.interest) : "")).filter(Boolean)),
  }
}

async function filterPatientsByProfessionalInterests(patients: ContactRow[], professionalId: string) {
  const filters = await getProfessionalInterestFilters(professionalId)
  if (filters.tagIds.size === 0 && filters.labels.size === 0) return []

  const contactIds = patients.map((patient) => patient.id)
  if (contactIds.length === 0) return []

  const interestTags = await supabaseJson<ContactInterestTagRow[]>(
    `contact_interest_tags?select=contact_id,tag_id,tags(label)&contact_id=in.(${contactIds.map(encodeURIComponent).join(",")})`,
  )
  const accessibleContactIds = new Set<string>()

  for (const interestTag of interestTags) {
    if (!interestTag.contact_id) continue
    const label = interestTag.tags?.label ? normalizeLabel(interestTag.tags.label) : ""
    if ((interestTag.tag_id && filters.tagIds.has(interestTag.tag_id)) || (label && filters.labels.has(label))) {
      accessibleContactIds.add(interestTag.contact_id)
    }
  }

  return patients.filter((patient) => accessibleContactIds.has(patient.id))
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const email = getString(searchParams.get("email"))
    const professionalId = getString(searchParams.get("professionalId"))
    const [options, patients] = await Promise.all([
      supabaseJson<OptionRow[]>("app_options?select=set_key,value,label,active,sort_order&active=is.true&set_key=in.(appointment_type,appointment_status,attendance_mode)&order=sort_order.asc"),
      supabaseJson<ContactRow[]>("contacts?select=id,name,phone,active&active=is.true&order=name.asc&limit=500"),
    ])
    const accessFilteredPatients = email ? await filterPatientsByUserAccess(patients, email) : patients
    const visiblePatients = professionalId ? await filterPatientsByProfessionalInterests(accessFilteredPatients, professionalId) : accessFilteredPatients

    return NextResponse.json({
      types: optionLabels(options, "appointment_type"),
      professionals: [],
      patients: visiblePatients.map((patient) => ({ id: patient.id, label: patient.name || patient.phone || patient.id })),
      status: optionLabels(options, "appointment_status"),
      attendanceModes: optionLabels(options, "attendance_mode"),
      errors: [],
    })
  } catch (error) {
    return NextResponse.json(
      {
        types: [],
        professionals: [],
        patients: [],
        status: [],
        attendanceModes: [],
        errors: [error instanceof Error ? error.message : "Nao foi possivel carregar opcoes do Supabase."],
      },
      { status: 200 },
    )
  }
}
