// Shapes returned by the Express dashboard API (src/routes/*.ts).

export type ServiceState = string; // 'reachable' | 'configured' | 'missing' | ...
export interface Health {
  status: string;
  services: { whisper: ServiceState; llm: ServiceState; tts: ServiceState; twilio: ServiceState };
}

export interface AgentSummary {
  id: string;
  name: string;
  phone: string | null;
  preferredContact: 'call' | 'text' | 'email';
}

export interface AgentDetail extends AgentSummary {
  email: string | null;
  assistantName: string | null;
  assistantPhone: string | null;
  brokerage: string | null;
}

export interface Property {
  id: string;
  address: string | null;
  mlsNumber: string | null;
  status: string;
  petPolicy: string;
  hasOffers: boolean;
}

export interface DashboardStats {
  activeWorkflows: number;
  callsToday: number;
  callsTrendPct: number | null;
  messagesToday: number;
  successRate: number;
  degraded?: boolean;
}

export interface Workflow {
  id: string;
  agentId: string | null;
  agentName: string;
  agentPhone: string | null;
  propertyIds: string[];
  stage: string | null;
  step: number;
  totalSteps: number;
  status: 'pending' | 'confirmed' | 'canceled';
  channel: string;
  attempts: number;
  startedAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'call' | 'sms';
  title: string;
  detail: string;
  status: string;
  at: string;
  link: { page: string; id: string };
}

export interface Conversation {
  key: string;
  agentId: string | null;
  name: string;
  phone: string;
  lastMessage: string;
  lastAt: string | null;
  unread: number;
  messageCount: number;
}

export interface SmsMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string | null;
  to: string | null;
  body: string | null;
  status: string;
  createdAt: string;
}

export interface CallRecord {
  id: string;
  agentId: string | null;
  propertyIds: string[];
  callType: string;
  status: string;
  durationSeconds: number | null;
  transcript: string | null;
  createdAt: string;
}
