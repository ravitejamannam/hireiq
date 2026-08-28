"use server";

import { auth } from "@/auth";
import { fetchGithubProof } from "@/lib/profiles/github-public";
import { fetchLeetcodeProof } from "@/lib/profiles/leetcode-public";

export async function fetchLinkedPublicProof(input: {
  githubUrl?: string | null;
  leetcodeUrl?: string | null;
}) {
  const session = await auth();
  if (!session?.user) {
    return { githubProof: null, leetcodeProof: null };
  }
  const [githubProof, leetcodeProof] = await Promise.all([
    fetchGithubProof(input.githubUrl),
    fetchLeetcodeProof(input.leetcodeUrl),
  ]);
  return { githubProof, leetcodeProof };
}
