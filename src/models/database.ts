// TypeScript types mirroring src/database/schema.sql.
// The `Database` type at the bottom matches the shape @supabase/supabase-js
// expects for SupabaseClient<Database>, enabling typed .from('table') queries.

// ─────────────────────────────── Enums ───────────────────────────────
export type PropertyStatus = 'active' | 'pending' | 'unavailable' | 'tenanted';
export type PetPolicy = 'allowed' | 'not_allowed' | 'unknown';
export type ContactMethod = 'call' | 'text' | 'email';
export type ShowingCategory = 'pending_showings' | 'canceled_showings' | 'confirmed_showings';
export type CallType = 'outbound_agent' | 'outbound_brokerage' | 'inbound';
export type CallStatus =
  | 'initiated'
  | 'answered'
  | 'no_answer'
  | 'voicemail'
  | 'completed'
  | 'failed';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'sent' | 'delivered' | 'failed' | 'received';

/** Workflow tags A..J (no I), per docs/TAGS.md. */
export type ShowingTag = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J';

// ─────────────────────────────── Rows ────────────────────────────────
export type Brokerage = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export type ListingAgent = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  brokerage_id: string | null;
  assistant_name: string | null;
  assistant_phone: string | null;
  preferred_contact: ContactMethod;
  created_at: string;
}

export type Property = {
  id: string;
  address: string | null;
  mls_number: string | null;
  listing_agent_id: string | null;
  status: PropertyStatus;
  pet_policy: PetPolicy;
  has_offers: boolean;
  brokerage_remarks: string | null;
  client_remarks: string | null;
  created_at: string;
  updated_at: string;
}

export type Showing = {
  id: string;
  property_id: string | null;
  category: ShowingCategory;
  status: string | null;
  tags: string[];
  rental_specialist_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CallLog = {
  id: string;
  listing_agent_id: string | null;
  property_ids: string[];
  call_type: CallType;
  status: CallStatus;
  transcript: string | null;
  duration_seconds: number | null;
  livekit_room_id: string | null;
  created_at: string;
}

export type Message = {
  id: string;
  direction: MessageDirection;
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  listing_agent_id: string | null;
  property_ids: string[];
  provider_message_id: string | null;
  status: MessageStatus;
  created_at: string;
}

export type WorkflowState = {
  id: string;
  listing_agent_id: string | null;
  property_ids: string[];
  current_stage: string | null;
  attempts: number;
  last_attempt_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ─────────────── Insert types (DB defaults make most optional) ────────
export type BrokerageInsert = {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
}

export type ListingAgentInsert = {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  brokerage_id?: string | null;
  assistant_name?: string | null;
  assistant_phone?: string | null;
  preferred_contact?: ContactMethod;
  created_at?: string;
}

export type PropertyInsert = {
  id?: string;
  address?: string | null;
  mls_number?: string | null;
  listing_agent_id?: string | null;
  status?: PropertyStatus;
  pet_policy?: PetPolicy;
  has_offers?: boolean;
  brokerage_remarks?: string | null;
  client_remarks?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ShowingInsert = {
  id?: string;
  property_id?: string | null;
  category?: ShowingCategory;
  status?: string | null;
  tags?: string[];
  rental_specialist_id?: string | null;
  scheduled_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CallLogInsert = {
  id?: string;
  listing_agent_id?: string | null;
  property_ids?: string[];
  call_type: CallType;
  status?: CallStatus;
  transcript?: string | null;
  duration_seconds?: number | null;
  livekit_room_id?: string | null;
  created_at?: string;
}

export type MessageInsert = {
  id?: string;
  direction: MessageDirection;
  from_number?: string | null;
  to_number?: string | null;
  body?: string | null;
  listing_agent_id?: string | null;
  property_ids?: string[];
  provider_message_id?: string | null;
  status?: MessageStatus;
  created_at?: string;
}

export type WorkflowStateInsert = {
  id?: string;
  listing_agent_id?: string | null;
  property_ids?: string[];
  current_stage?: string | null;
  attempts?: number;
  last_attempt_at?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

// ─────── Database type for SupabaseClient<Database> typed queries ─────
// `Relationships: []` is required by @supabase/supabase-js — without it the
// schema fails the GenericSchema constraint and all query types collapse to `never`.
type TableShape<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      brokerages: TableShape<Brokerage, BrokerageInsert>;
      listing_agents: TableShape<ListingAgent, ListingAgentInsert>;
      properties: TableShape<Property, PropertyInsert>;
      showings: TableShape<Showing, ShowingInsert>;
      call_logs: TableShape<CallLog, CallLogInsert>;
      messages: TableShape<Message, MessageInsert>;
      workflow_state: TableShape<WorkflowState, WorkflowStateInsert>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      property_status: PropertyStatus;
      pet_policy: PetPolicy;
      contact_method: ContactMethod;
      showing_category: ShowingCategory;
      call_type: CallType;
      call_status: CallStatus;
      message_direction: MessageDirection;
      message_status: MessageStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
