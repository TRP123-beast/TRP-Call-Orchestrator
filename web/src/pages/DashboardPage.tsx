import { StatCards } from '../components/dashboard/StatCards';
import { QuickActions } from '../components/dashboard/QuickActions';
import { ActiveWorkflows } from '../components/dashboard/ActiveWorkflows';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';

export function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <StatCards />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <QuickActions />
          <ActiveWorkflows />
        </div>
        <div className="xl:col-span-1">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
