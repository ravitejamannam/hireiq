"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import RequirementContextNav from "@/components/dashboard/RequirementContextNav";

type RequirementRef = {
  id: number;
  title: string;
};

type WorkflowRequirementNavProps = {
  requirements?: RequirementRef[];
};

function parseRequirementId(raw: string | null) {
  if (!raw) return null;
  const requirementId = Number(raw);
  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    return null;
  }
  return requirementId;
}

export function useRequirementIdFilter() {
  const searchParams = useSearchParams();
  return parseRequirementId(searchParams.get("requirementId"));
}

function WorkflowRequirementNavInner({
  requirements = [],
}: WorkflowRequirementNavProps) {
  const requirementId = useRequirementIdFilter();
  const requirementTitle =
    requirementId === null
      ? null
      : (requirements.find((requirement) => requirement.id === requirementId)
          ?.title ?? null);

  return (
    <RequirementContextNav
      requirementId={requirementId}
      requirementTitle={requirementTitle}
    />
  );
}

export default function WorkflowRequirementNav(
  props: WorkflowRequirementNavProps,
) {
  return (
    <Suspense fallback={null}>
      <WorkflowRequirementNavInner {...props} />
    </Suspense>
  );
}
