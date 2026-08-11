import type { RoutineCondition, RoutineConditionGroup, RoutineConditionOperator, RoutineTrigger } from "@/lib/routines";

export type RoutineTriggerIssue = {
  code: "manual_exclusive" | "duplicate_condition" | "conflicting_status" | "conflicting_date" | "conflicting_exact_message" | "incompatible_events";
  message: string;
  groupIds: string[];
  conditionIds: string[];
};

const eventFamilies = ["manual", "message", "specific_date", "birthday", "tag", "status"] as const;
type EventFamily = (typeof eventFamilies)[number];

function normalize(value: string | undefined) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function conditionFamilies(type: RoutineTrigger): Set<EventFamily> {
  if (type === "manual") return new Set(["manual"]);
  if (type === "specific_message" || type === "ai_message") return new Set(["message"]);
  if (type === "specific_date") return new Set(["specific_date"]);
  if (type === "birthday") return new Set(["birthday"]);
  return new Set(eventFamilies);
}

function combineFamilies(sets: Set<EventFamily>[], operator: RoutineConditionOperator) {
  if (!sets.length) return new Set<EventFamily>();
  if (operator === "any") return new Set(sets.flatMap((set) => Array.from(set)));
  return new Set(Array.from(sets[0]).filter((family) => sets.slice(1).every((set) => set.has(family))));
}

function activeConditions(group: RoutineConditionGroup) {
  return group.conditions.filter((condition) => condition.active !== false);
}

function conditionKey(condition: RoutineCondition) {
  const target = condition.type === "tag" ? condition.targetId || condition.targetLabel || condition.value : condition.value;
  return `${condition.type}:${condition.comparisonOperator}:${normalize(target)}`;
}

export function validateRoutineTriggerLogic(groups: RoutineConditionGroup[], operator: RoutineConditionOperator): RoutineTriggerIssue[] {
  const issues: RoutineTriggerIssue[] = [];
  const allConditions = groups.flatMap(activeConditions);
  const manualConditions = allConditions.filter((condition) => condition.type === "manual");

  if (manualConditions.length > 0 && allConditions.length > 1) {
    issues.push({
      code: "manual_exclusive",
      message: "O gatilho Manual deve ser usado sozinho. Para executar uma rotina automática manualmente, use Executar agora na listagem.",
      groupIds: groups.filter((group) => activeConditions(group).length > 0).map((group) => group.id),
      conditionIds: allConditions.map((condition) => condition.id),
    });
  }

  for (const group of groups) {
    const conditions = activeConditions(group);
    const duplicates = new Map<string, RoutineCondition[]>();
    for (const condition of conditions) {
      const key = conditionKey(condition);
      if (!normalize(key.split(":").slice(2).join(":")) && !["manual", "birthday"].includes(condition.type)) continue;
      duplicates.set(key, [...(duplicates.get(key) || []), condition]);
    }
    for (const repeated of duplicates.values()) {
      if (repeated.length < 2) continue;
      issues.push({ code: "duplicate_condition", message: "Esta condição está repetida no mesmo grupo.", groupIds: [group.id], conditionIds: repeated.map((condition) => condition.id) });
    }

    if (group.operator === "all") {
      const statuses = conditions.filter((condition) => condition.type === "status");
      if (new Set(statuses.map((condition) => normalize(condition.value))).size > 1) {
        issues.push({ code: "conflicting_status", message: "Um contato só pode ter um status por vez. Troque o grupo para OU ou mantenha apenas um status.", groupIds: [group.id], conditionIds: statuses.map((condition) => condition.id) });
      }

      const dates = conditions.filter((condition) => condition.type === "specific_date");
      if (new Set(dates.map((condition) => normalize(condition.value))).size > 1) {
        issues.push({ code: "conflicting_date", message: "Uma execução não pode ocorrer em duas datas diferentes ao mesmo tempo. Use OU ou separe em rotinas.", groupIds: [group.id], conditionIds: dates.map((condition) => condition.id) });
      }

      const exactMessages = conditions.filter((condition) => condition.type === "specific_message" && condition.comparisonOperator === "equals");
      if (new Set(exactMessages.map((condition) => normalize(condition.value))).size > 1) {
        issues.push({ code: "conflicting_exact_message", message: "Uma mensagem não pode ser exatamente igual a dois textos diferentes. Use OU ou o operador Contém.", groupIds: [group.id], conditionIds: exactMessages.map((condition) => condition.id) });
      }
    }

    const possibleFamilies = combineFamilies(conditions.map((condition) => conditionFamilies(condition.type)), group.operator);
    if (conditions.length > 0 && possibleFamilies.size === 0) {
      issues.push({ code: "incompatible_events", message: "Estes gatilhos dependem de eventos diferentes e não podem acontecer juntos com E. Use OU ou separe em grupos.", groupIds: [group.id], conditionIds: conditions.map((condition) => condition.id) });
    }
  }

  if (operator === "all") {
    for (const rule of [
      { matches: (condition: RoutineCondition) => condition.type === "status", code: "conflicting_status" as const, message: "Os grupos exigem status incompatíveis. Um contato só pode ter um status por vez; use QUALQUER grupo ou ajuste os valores." },
      { matches: (condition: RoutineCondition) => condition.type === "specific_date", code: "conflicting_date" as const, message: "Os grupos exigem datas incompatíveis. Use QUALQUER grupo ou separe as datas em rotinas diferentes." },
      { matches: (condition: RoutineCondition) => condition.type === "specific_message" && condition.comparisonOperator === "equals", code: "conflicting_exact_message" as const, message: "Os grupos exigem mensagens exatas incompatíveis. Use QUALQUER grupo ou o operador Contém." },
    ]) {
      const constraints = groups.flatMap((group) => {
        const conditions = activeConditions(group);
        const matching = conditions.filter((condition) => rule.matches(condition) && normalize(condition.value));
        if (!matching.length) return [];
        if (group.operator === "any" && conditions.some((condition) => !rule.matches(condition))) return [];
        return [{ group, conditions: matching, values: new Set(matching.map((condition) => normalize(condition.value))) }];
      });
      if (constraints.length > 1) {
        const intersection = Array.from(constraints[0].values).filter((value) => constraints.slice(1).every((constraint) => constraint.values.has(value)));
        if (intersection.length === 0) {
          issues.push({ code: rule.code, message: rule.message, groupIds: constraints.map((constraint) => constraint.group.id), conditionIds: constraints.flatMap((constraint) => constraint.conditions.map((condition) => condition.id)) });
        }
      }
    }
  }

  const populatedGroups = groups.filter((group) => activeConditions(group).length > 0);
  const routineFamilies = combineFamilies(
    populatedGroups.map((group) => combineFamilies(activeConditions(group).map((condition) => conditionFamilies(condition.type)), group.operator)),
    operator,
  );
  if (operator === "all" && populatedGroups.length > 1 && routineFamilies.size === 0) {
    issues.push({
      code: "incompatible_events",
      message: "Os grupos dependem de eventos diferentes e nunca poderão ser verdadeiros ao mesmo tempo com TODOS os grupos.",
      groupIds: populatedGroups.map((group) => group.id),
      conditionIds: populatedGroups.flatMap(activeConditions).map((condition) => condition.id),
    });
  }

  return issues;
}

export function getTriggerOptionConflict(
  groups: RoutineConditionGroup[],
  operator: RoutineConditionOperator,
  conditionId: string,
  type: RoutineTrigger,
) {
  const candidateGroups = groups.map((group) => ({
    ...group,
    conditions: group.conditions.map((condition) => condition.id === conditionId
      ? { ...condition, type, comparisonOperator: type === "manual" ? "exists" : condition.comparisonOperator, value: "", targetId: "", targetLabel: "" }
      : condition),
  }));
  return validateRoutineTriggerLogic(candidateGroups, operator).find((issue) => issue.conditionIds.includes(conditionId))?.message || "";
}
