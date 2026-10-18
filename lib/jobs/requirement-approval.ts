export type OwnedRequirement = {
  id: number;
  requirementType: "REQUIRED" | "PREFERRED";
  evidenceType: "RESUME" | "ASSESSMENT" | "INTERVIEW" | null;
  approvalStatus: "DRAFT" | "APPROVED" | "REJECTED";
  displayOrder: number;
};

export function reorderRequirements<T extends { id: number; displayOrder: number }>(
  rows: T[],
  orderedIds: number[],
) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.map((id, index) => {
    const row = byId.get(id);
    if (!row) throw new Error(`Unknown requirement ${id}.`);
    return { ...row, displayOrder: index };
  });
}

export function canPublishRequirements(rows: OwnedRequirement[]) {
  return rows.some(
    (row) =>
      row.approvalStatus === "APPROVED" &&
      row.requirementType === "REQUIRED" &&
      row.evidenceType !== null,
  );
}

export function assertPublishableRequirements(rows: OwnedRequirement[]) {
  if (!canPublishRequirements(rows)) {
    throw new Error(
      "Publish needs at least one approved required item with an evidence type.",
    );
  }
}
