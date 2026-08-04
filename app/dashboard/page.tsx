import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatCard from "@/components/dashboard/StatCard";
import ActivityItem from "@/components/dashboard/ActivityItem";
import InterviewItem from "@/components/dashboard/InterviewItem";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div>
        <h2 className="text-3xl font-bold text-black">Welcome back 👋</h2>

        <p className="mt-2 text-zinc-600">Here's what's happening today.</p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Companies" value={12} />

        <StatCard title="Candidates" value={184} />

        <StatCard title="Interviews" value={27} />

        <StatCard title="Evaluations" value={96} />
      </div>

      <section className="mt-12">
        <h3 className="text-2xl font-bold text-black">Recent Activity</h3>

        <div className="mt-6 space-y-4">
          <ActivityItem
            title="John completed the React interview."
            time="2 minutes ago"
          />

          <ActivityItem
            title="Acme Inc. invited three candidates."
            time="15 minutes ago"
          />

          <ActivityItem
            title="Sarah scheduled a backend interview."
            time="1 hour ago"
          />

          <ActivityItem title="Technical evaluation submitted." time="Today" />
        </div>
      </section>

      <section className="mt-12">
        <h3 className="text-2xl font-bold text-black">Today Interviews</h3>

        <div className="mt-6 space-y-4">
          <InterviewItem
            time="09:00 AM"
            candidate="John Anderson"
            status="Scheduled"
          />

          <InterviewItem
            time="11:30 AM"
            candidate="Sarah Chen"
            status="In Progress"
          />

          <InterviewItem
            time="02:00 PM"
            candidate="Michael Brown"
            status="Scheduled"
          />
        </div>
      </section>
    </DashboardLayout>
  );
}
