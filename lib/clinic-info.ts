export type ClinicAssistantInfo = {
  id: string | null
  name: string
  generalInfo: string
  initialMessage: string
}

export type ClinicProcedure = {
  id: string
  name: string
  interest: string
  description: string
  active: boolean
}

export type ClinicInfoPayload = {
  assistant: ClinicAssistantInfo
  procedures: ClinicProcedure[]
}
