import {
  emptyEducation,
  emptyExperience,
  emptyProject,
  type StructuredProfileDraft,
} from "@/lib/profiles/structured-profile";

export type ResumeSuggestion = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experiences: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    tenure: string;
  }>;
  education: Array<{ credential: string; institution: string }>;
  projects: Array<{ name: string }>;
  certifications: string[];
};

export function certificationReviewList(values: string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

/** Fill only sections the candidate has not started. Never replaces typed values. */
export function fillEmptyProfileFromSuggestion(
  draft: StructuredProfileDraft,
  suggestion: ResumeSuggestion,
): StructuredProfileDraft {
  const next = { ...draft };
  if (
    suggestion.experiences.length > 0 &&
    draft.experiences.every((role) => !role.title && !role.company)
  ) {
    next.experiences = suggestion.experiences.map((role) => ({
      ...emptyExperience(),
      title: role.title,
      company: role.company,
      startDate: role.startDate,
      endDate: role.endDate,
      summary: role.tenure,
    }));
  }
  if (
    suggestion.education.length > 0 &&
    draft.education.every((school) => !school.school && !school.degree)
  ) {
    next.education = suggestion.education.map((school) => ({
      ...emptyEducation(),
      school: school.institution,
      degree: school.credential,
    }));
  }
  if (
    suggestion.projects.length > 0 &&
    draft.projects.every((project) => !project.name)
  ) {
    next.projects = suggestion.projects.map((project) => ({
      ...emptyProject(),
      name: project.name,
    }));
  }
  return next;
}
