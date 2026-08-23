import TeamInvitePanel from "@/components/client/TeamInvitePanel";
import TeamMemberActions from "@/components/client/TeamMemberActions";
import { requireClientPortal } from "@/lib/auth/authorization";
import { listCompanyTeam } from "@/lib/organizations/invitation-service";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  SUSPENDED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  REMOVED: "bg-zinc-100 text-zinc-500 ring-zinc-500/20",
};

export default async function ClientTeamPage() {
  const client = await requireClientPortal();

  if (client.membershipRole !== "OWNER") {
    return (
      <div>
        <h1 className="text-3xl font-bold text-black">Team</h1>
        <p className="mt-2 text-zinc-600">
          Only the company owner can manage team members.
        </p>
      </div>
    );
  }

  const isOwner = client.membershipRole === "OWNER";
  const team = await listCompanyTeam(client.companyId);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Company
      </p>
      <h1 className="mt-2 text-3xl font-bold text-black">Team</h1>
      <p className="mt-2 text-zinc-600">
        Invite teammates as members, suspend or remove access, and transfer
        ownership. Invitations cannot create owners or administrators.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-black">Members</h2>
        <ul className="mt-4 space-y-3">
          {team.members.map((member) => (
            <li
              key={member.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-black">
                    {member.user.name}
                    {member.role === "OWNER" ? (
                      <span className="ml-2 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                        Owner
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-zinc-600">{member.user.email}</p>
                  <span
                    className={`mt-2 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      STATUS_STYLES[member.status] ?? "bg-zinc-50 text-zinc-600 ring-zinc-500/20"
                    }`}
                  >
                    {member.status}
                  </span>
                </div>
                {isOwner ? (
                  <TeamMemberActions
                    member={{
                      id: member.id,
                      name: member.user.name ?? member.user.email,
                      email: member.user.email,
                      role: member.role,
                      status: member.status,
                    }}
                  />
                ) : null}
              </div>
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
