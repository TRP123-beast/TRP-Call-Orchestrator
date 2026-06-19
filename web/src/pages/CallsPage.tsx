import { Phone } from 'lucide-react';
import { EmptyState } from '../components/shared/EmptyState';

// Phase 4 will build the active-call monitor + history + transcripts here.
export function CallsPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={Phone}
        title="Calls — coming next"
        description="The call monitor and history view land in the next phase. Start a call from the dashboard for now."
        action={{ label: 'Go to Dashboard', href: '/' }}
      />
    </div>
  );
}
