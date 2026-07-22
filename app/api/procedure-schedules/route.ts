import { getString, isUuid, supabaseJson } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

type ScheduleRow = { id: string; id_profissional: string | null; status: string | null };
type ProfessionalRow = { id: string; name: string | null; email: string | null };
type RuleRow = { id: string; schedule_id: string; weekday: string; is_open: boolean | null };
type PeriodRow = { rule_id: string; id_procedure: string; is_enabled: boolean | null; start_time: string; end_time: string };
type LinkRow = { id_professional_schedule: string; id_clinic_procedure: string };

const weekdayLabels: Record<string, string> = {
  sunday: "Dom",
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sab",
};

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

async function getScheduleOptions(procedureId: string) {
  const periods = await supabaseJson<PeriodRow[]>(
    `professional_schedule_periods?select=rule_id,id_procedure,is_enabled,start_time,end_time&id_procedure=eq.${encodeURIComponent(procedureId)}&is_enabled=is.true&order=start_time.asc`,
  );
  const ruleIds = Array.from(new Set(periods.map((period) => period.rule_id).filter(Boolean)));
  if (ruleIds.length === 0) return [];

  const rules = await supabaseJson<RuleRow[]>(
    `professional_schedule_rules?select=id,schedule_id,weekday,is_open&id=in.(${ruleIds.map(encodeURIComponent).join(",")})&is_open=is.true`,
  );
  const scheduleIds = Array.from(new Set(rules.map((rule) => rule.schedule_id).filter(Boolean)));
  if (scheduleIds.length === 0) return [];

  const [schedules, links] = await Promise.all([
    supabaseJson<ScheduleRow[]>(
      `professional_schedule?select=id,id_profissional,status&id=in.(${scheduleIds.map(encodeURIComponent).join(",")})&status=eq.active`,
    ),
    supabaseJson<LinkRow[]>(
      `professional_schedule_to_clinic_procedures?select=id_professional_schedule,id_clinic_procedure&id_clinic_procedure=eq.${encodeURIComponent(procedureId)}`,
    ),
  ]);
  const professionalIds = Array.from(new Set(schedules.map((schedule) => schedule.id_profissional).filter((id): id is string => Boolean(id))));
  const professionals =
    professionalIds.length > 0
      ? await supabaseJson<ProfessionalRow[]>(`professionals?select=id,name,email&id=in.(${professionalIds.map(encodeURIComponent).join(",")})`)
      : [];

  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const professionalById = new Map(professionals.map((professional) => [professional.id, professional]));
  const selectedScheduleIds = new Set(links.map((link) => link.id_professional_schedule));

  return schedules
    .map((schedule) => {
      const professional = schedule.id_profissional ? professionalById.get(schedule.id_profissional) : null;
      const schedulePeriods = periods.filter((period) => rulesById.get(period.rule_id)?.schedule_id === schedule.id);
      const slots = schedulePeriods
        .map((period) => {
          const rule = rulesById.get(period.rule_id);
          return `${weekdayLabels[rule?.weekday ?? ""] ?? rule?.weekday ?? "Dia"} ${normalizeTime(period.start_time)}-${normalizeTime(period.end_time)}`;
        })
        .filter((slot, index, all) => all.indexOf(slot) === index);

      return {
        id: schedule.id,
        professionalId: schedule.id_profissional || "",
        professionalName: professional?.name || professional?.email || "Profissional",
        slots,
        selected: selectedScheduleIds.has(schedule.id),
      };
    })
    .sort((a, b) => a.professionalName.localeCompare(b.professionalName, "pt-BR"));
}

export async function GET(request: NextRequest) {
  try {
    const procedureId = getString(request.nextUrl.searchParams.get("procedureId"));
    if (!isUuid(procedureId)) throw new Error("Procedimento invalido.");

    return NextResponse.json({ schedules: await getScheduleOptions(procedureId) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel carregar agendas." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { procedureId?: unknown; scheduleIds?: unknown };
    const procedureId = getString(body.procedureId);
    const scheduleIds = Array.isArray(body.scheduleIds) ? Array.from(new Set(body.scheduleIds.map(getString).filter(isUuid))) : [];
    if (!isUuid(procedureId)) throw new Error("Procedimento invalido.");

    await supabaseJson<unknown>(`professional_schedule_to_clinic_procedures?id_clinic_procedure=eq.${encodeURIComponent(procedureId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    if (scheduleIds.length > 0) {
      await supabaseJson<unknown>("professional_schedule_to_clinic_procedures", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(scheduleIds.map((scheduleId) => ({ id_professional_schedule: scheduleId, id_clinic_procedure: procedureId }))),
      });
    }

    return NextResponse.json({ ok: true, scheduleIds, schedules: await getScheduleOptions(procedureId) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Nao foi possivel vincular agendas." }, { status: 500 });
  }
}
