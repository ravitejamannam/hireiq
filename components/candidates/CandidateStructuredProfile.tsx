import PersonProfileView from "@/components/profiles/PersonProfileView";
import type { SafeCandidateProfile } from "@/lib/candidates/candidate-profile-types";

type CandidateStructuredProfileProps = {
  profile: Pick<
    SafeCandidateProfile,
    | "name"
    | "headline"
    | "roleTitle"
    | "location"
    | "aboutText"
    | "domains"
    | "linkedInUrl"
    | "githubUrl"
    | "portfolioUrl"
    | "twitterUrl"
    | "videoResumeUrl"
    | "leetcodeUrl"
    | "socialLinks"
    | "photoUrl"
    | "githubProof"
    | "leetcodeProof"
    | "experiences"
    | "education"
    | "projects"
    | "experienceYears"
  >;
  canEdit?: boolean;
  editHref?: string;
};

export default function CandidateStructuredProfile({
  profile,
  canEdit,
  editHref,
}: CandidateStructuredProfileProps) {
  return (
    <PersonProfileView
      personKind="candidate"
      canEdit={canEdit}
      editHref={editHref}
      emptyHint="This candidate has not written an about section yet."
      profile={{
        name: profile.name,
        roleTitle: profile.roleTitle,
        headline: profile.headline,
        location: profile.location,
        aboutText: profile.aboutText,
        domains: profile.domains,
        photoUrl: profile.photoUrl,
        githubUrl: profile.githubUrl,
        linkedInUrl: profile.linkedInUrl,
        twitterUrl: profile.twitterUrl,
        portfolioUrl: profile.portfolioUrl,
        leetcodeUrl: profile.leetcodeUrl,
        videoResumeUrl: profile.videoResumeUrl,
        socialLinks: profile.socialLinks ?? [],
        githubProof: profile.githubProof,
        leetcodeProof: profile.leetcodeProof,
        experiences: profile.experiences,
        education: profile.education,
        projects: profile.projects,
        experienceYears: profile.experienceYears,
      }}
    />
  );
}
