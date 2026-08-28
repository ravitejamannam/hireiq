import PersonProfileView from "@/components/profiles/PersonProfileView";
import type { SafeInterviewerProfile } from "@/lib/interviewers/interviewer-profile-service";
import { isPersonProfilePublished } from "@/lib/profiles/structured-profile";

export default function InterviewerPublicProfile({
  profile,
  canEdit = false,
  editHref,
}: {
  profile: SafeInterviewerProfile;
  canEdit?: boolean;
  editHref?: string;
}) {
  const published = isPersonProfilePublished({
    roleTitle: profile.profile.roleTitle,
    aboutText: profile.profile.aboutText,
    experiences: profile.profile.experiences,
    education: profile.profile.education,
    githubUrl: profile.profile.githubUrl,
    linkedInUrl: profile.profile.linkedInUrl,
    leetcodeUrl: profile.profile.leetcodeUrl,
  });

  if (!published && !canEdit) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer
        </p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">{profile.name}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">
          {profile.name} has not published a profile yet. Background, experience,
          education, and public proof of work will show here once they fill it
          in.
        </p>
      </div>
    );
  }

  return (
    <PersonProfileView
      personKind="interviewer"
      canEdit={canEdit}
      editHref={editHref}
      emptyHint="This interviewer has not written an about section yet."
      profile={{
        name: profile.name,
        roleTitle: profile.profile.roleTitle,
        headline: profile.profile.roleTitle,
        location: profile.location,
        aboutText: profile.profile.aboutText,
        domains: profile.profile.domains,
        githubUrl: profile.profile.githubUrl,
        linkedInUrl: profile.profile.linkedInUrl,
        twitterUrl: profile.profile.twitterUrl,
        portfolioUrl: profile.profile.portfolioUrl,
        leetcodeUrl: profile.profile.leetcodeUrl,
        videoResumeUrl: profile.profile.videoUrl,
        socialLinks: profile.profile.socialLinks,
        githubProof: profile.githubProof,
        leetcodeProof: profile.leetcodeProof,
        experiences: profile.profile.experiences,
        education: profile.profile.education,
        projects: profile.profile.projects,
        experienceYears: profile.experienceYears,
      }}
    />
  );
}
