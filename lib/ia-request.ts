export interface IaRequest {
  id: string;
  status: string;
  chosenDate: string;
  procedureId: string;
  procedureName: string;
  professionalName?: string;
  situation: string;
  context: string;
  createdAt: string;
  chatId: string;
  action: string;
  professionalScheduleId: string;
}
