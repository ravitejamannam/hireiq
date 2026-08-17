import TeamInvitePanel from "@/components/client/TeamInvitePanel";
import { requireClientPortal } from "@/lib/auth/authorization";
import { listCompanyTeam } from "@/lib/organizations/invitation-service";

export default async function ClientTeamPage() {
  const client = await requireClientPortal();

  if (client.membershipRole !== "OWNER") {
    return (
      <div>
        <h1 className="text-3xl font-bold text-black">Team</h1>
        <p className="mt-2 text-zinc-600">
          Only the company owner can invite or revoke members.
        </p>
      </div>
    );
  }

  const team = await listCompanyTeam(client.companyId);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Company
      </p>
      <h1 className="mt-2 text-3xl font-bold text-black">Team</h1>
      <p className="mt-2 text-zinc-600">
        Invite teammates as members. Invitations cannot create owners or
        administrators.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-black">Members</h2>
        <ul className="mt-4 space-y-3">
          {team.members.map((member) => (
            <li
              key={member.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <p className="text-sm font-medium text-black">
                {member.user.name}
              </p>
              <p className="text-sm text-zinc-600">{member.user.email}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                {member.role} · {member.status}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <TeamInvitePanel pendingInvitations={team.invitations} />
      </section>
    </div>
  );
}
