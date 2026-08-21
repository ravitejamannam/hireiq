"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createInterviewer,
  deleteInterviewer,
  resendInterviewerInvite,
  revokeInterviewerInvite,
  updateInterviewer,
} from "@/app/actions/interviewer-actions";
import type { getInterviewers } from "@/lib/repositories/interviewer-repository";
import { resolveInterviewerLoginStatus } from "@/lib/interviewers/interviewer-invitation-errors";
import InterviewerCard from "@/components/interviewers/InterviewerCard";
import InterviewerModal from "@/components/interviewers/InterviewerModal";
import type { InterviewerFormData } from "@/components/interviewers/InterviewerForm";

type Interviewer = Awaited<ReturnType<typeof getInterviewers>>[number];

type InterviewersClientProps = {
  initialInterviewers: Interviewer[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function InterviewersClient({
  initialInterviewers,
}: InterviewersClientProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingInterviewer, setEditingInterviewer] =
    useState<Interviewer | null>(null);
  const [actionError, setActionError] = useState("");

  function openCreateModal() {
    setEditingInterviewer(null);
    setActionError("");
    setIsModalOpen(true);
  }

  function handleEditInterviewer(id: number) {
    const interviewer = initialInterviewers.find(
      (interviewer) => interviewer.id === id,
    );
    if (!interviewer) return;

    setActionError("");
    setEditingInterviewer(interviewer);
    setIsModalOpen(true);
  }

  async function handleSaveInterviewer(interviewer: InterviewerFormData) {
    setIsSaving(true);
    setActionError("");

    try {
      if (editingInterviewer) {
        await updateInterviewer(
          editingInterviewer.id,
          interviewer.name,
          interviewer.category,
          interviewer.availability,
        );
      } else {
        await createInterviewer(
          interviewer.name,
          interviewer.category,
          interviewer.availability,
          interviewer.email,
        );
      }

      setEditingInterviewer(null);
      setIsModalOpen(false);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteInterviewer(id: number) {
    setActionError("");

    try {
      await deleteInterviewer(id);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleResendInvite(id: number) {
    setActionError("");
    try {
      await resendInterviewerInvite(id);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleRevokeInvite(invitationId: number) {
    setActionError("");
    try {
      await revokeInterviewerInvite(invitationId);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Interviewers / Experts
          </p>
          <h1 className="mt-2 text-3xl font-bold text-black">
            Interviewer Directory
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-600">
            Create a profile and invite a work email. The interviewer sets their
            own password. Assign requirements only after they have a login when
            you need email delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          + Add Interviewer
        </button>
      </div>

      {actionError && !isModalOpen && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {initialInterviewers.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
          <div className="text-5xl">👤</div>
          <h2 className="mt-6 text-2xl font-bold text-black">
            No interviewers yet
          </h2>
          <p className="mt-3 text-center text-zinc-600">
            Invite internal experts before assigning requirements.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {initialInterviewers.map((interviewer) => {
            const activeUser = interviewer.users[0] ?? null;
            const pendingInvite = interviewer.invitations[0] ?? null;
            const loginStatus = resolveInterviewerLoginStatus({
              hasActiveUser: Boolean(activeUser),
              pendingInviteEmail: pendingInvite?.email ?? null,
            });

            return (
              <InterviewerCard
                key={interviewer.id}
                id={interviewer.id}
                name={interviewer.name}
                category={interviewer.category}
                availability={interviewer.availability}
                assignedJobs={interviewer.assignedJobs}
                loginStatus={loginStatus}
                loginEmail={activeUser?.email ?? pendingInvite?.email ?? null}
                pendingInvitationId={pendingInvite?.id ?? null}
                onEdit={handleEditInterviewer}
                onDelete={handleDeleteInterviewer}
                onResendInvite={handleResendInvite}
                onRevokeInvite={handleRevokeInvite}
              />
            );
          })}
        </div>
      )}

      <InterviewerModal
        isOpen={isModalOpen}
        requireEmail={!editingInterviewer}
        initialValues={
          editingInterviewer
            ? {
                name: editingInterviewer.name,
                category: editingInterviewer.category,
                availability: editingInterviewer.availability,
              }
            : undefined
        }
        errorMessage={actionError}
        isSaving={isSaving}
        onClose={() => {
          setEditingInterviewer(null);
          setActionError("");
          setIsModalOpen(false);
        }}
        onSave={handleSaveInterviewer}
      />
    </>
  );
}
