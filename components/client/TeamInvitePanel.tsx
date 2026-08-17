"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  inviteOrganizationMember,
  revokeOrganizationInvitation,
} from "@/app/actions/organization-actions";

type PendingInvitation = {
  id: number;
  email: string;
  expiresAt: Date | string;
};

export default function TeamInvitePanel({
  pendingInvitations,
}: {
  pendingInvitations: PendingInvitation[];
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const router = useRouter();

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setIsLoading(true);

    try {
      const result = await inviteOrganizationMember(email);
      setEmail("");
      if (!result.emailSent) {
        setIsError(true);
        setMessage(
          `Invitation created for ${result.email}, but email delivery is unavailable.`,
        );
      } else {
        setMessage(`Invitation sent to ${result.email}.`);
      }
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Unable to send that invitation.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRevoke(invitationId: number) {
    setRevokingId(invitationId);
    setMessage("");
    setIsError(false);

    try {
      await revokeOrganizationInvitation(invitationId);
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to revoke that invitation.",
      );
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <form className="space-y-4" onSubmit={handleInvite}>
        <label className="block text-sm font-medium text-black">
          Invite a teammate
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@company.com"
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {isLoading ? "Sending..." : "Send invitation"}
        </button>
      </form>

      {message ? (
        <p
          className={`text-sm ${isError ? "text-red-600" : "text-zinc-700"}`}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold text-black">Pending invitations</h2>
        {pendingInvitations.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No pending invitations.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pendingInvitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-black">
                    {invitation.email}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleRevoke(invitation.id);
                  }}
                  disabled={revokingId === invitation.id}
                  className="text-sm font-medium text-zinc-700 hover:text-black disabled:opacity-60"
                >
                  {revokingId === invitation.id ? "Revoking..." : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
