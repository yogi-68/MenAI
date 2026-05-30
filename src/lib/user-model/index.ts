export type { UserModel, UserModelSecondaryOutcome, UserModelConfidence } from "@/lib/user-model/types";
export { loadExecutionContext, resolvePrimaryInitiative, orderInitiativesWithPrimaryFirst } from "@/lib/user-model/resolve-context";
export type { ExecutionContext } from "@/lib/user-model/resolve-context";
export { getUserModel, refreshUserModel } from "@/lib/user-model/loader";
export { synthesizeUserModel, scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
export { computeExecutionAllocation, formatExecutionAllocationForPrompt } from "@/lib/user-model/execution-allocation";
export type { ActivePortfolioEntry, AllocationRole, ExecutionAllocationEntry } from "@/lib/user-model/execution-allocation";
export { formatUserModelForPrompt, formatUserModelSummary, userModelToCoachBriefing } from "@/lib/user-model/format-for-prompt";
export { buildWhoAmIAnswerFromContext, synthesizeWhoAmIAnswer } from "@/lib/user-model/identity-synthesis";
