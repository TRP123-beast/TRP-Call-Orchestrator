import { MessageSquare } from 'lucide-react';
import { EmptyState } from '../components/shared/EmptyState';

// Phase 3 will build the 3-panel SMS inbox here.
export function MessagesPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={MessageSquare}
        title="Messages — coming next"
        description="The conversation inbox lands in the next phase. You can send a text from the dashboard Quick Actions."
        action={{ label: 'Go to Dashboard', href: '/' }}
      />
    </div>
  );
}
