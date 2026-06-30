export type ClinicAssistantInfo = {
  id: string | null;
  name: string;
  generalInfo: string;
  initialMessage: string;
};

export type newClinicAssistantInfo = {
  id: string | null;
  name: string;
  generalInfo: string;
  initialMessage: string;
  gender: string;
  style: string;
  useEmojis: boolean;
};

export type ClinicProcedure = {
  id: string;
  name: string;
  interestId?: string;
  interest: string;
  interestColor?: string;
  description: string;
  active: boolean;
};

export type ClinicInfoPayload = {
  assistant: ClinicAssistantInfo;
  procedures: ClinicProcedure[];
};
