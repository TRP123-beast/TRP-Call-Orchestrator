import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import {
  fetchPropertyDetails,
  fetchShowingRequests,
  getConversationContext,
  updateShowings,
  updatePropertyRecords,
  manageRentalSpecialist,
  triggerWorkflow,
  setTag,
} from '../tools/executors.js';
import { MARCUS_SYSTEM_PROMPT } from './instructions.js';

const fetchPropertyDetailsTool = llm.tool({
  description:
    'Fetches detailed information for a single property from the external TRP property API using the backend property ID.',
  parameters: z.object({
    propertyId: z.string().describe('Backend property ID string'),
  }),
  execute: async (params) =>
    fetchPropertyDetails(params as Record<string, unknown>),
});

const fetchShowingRequestsTool = llm.tool({
  description:
    'Fetches showing requests from the database. Use to list showings by status, user, or date before starting a call.',
  parameters: z.object({
    id: z.string().optional().describe('Showing ID or comma-separated IDs'),
    propertyId: z.string().optional().describe('Property ID or comma-separated IDs'),
    groupName: z.string().optional().describe('Filter by group name'),
    status: z
      .string()
      .optional()
      .describe('Filter by status: pending, confirmed, cancelled, scheduled, done, rescheduled'),
    userId: z.string().uuid().optional().describe('Filter by user ID'),
    scheduledDate: z
      .string()
      .optional()
      .describe('Filter by scheduled date (YYYY-MM-DD)'),
    limit: z.number().optional().describe('Max results (default 50, max 100)'),
  }),
  execute: async (params) =>
    fetchShowingRequests(params as Record<string, unknown>),
});

const getConversationContextTool = llm.tool({
  description:
    'Fetches property and showing context for a batch before or during the call. Call first with showing IDs to get addresses, tags, remarks, and status.',
  parameters: z.object({
    showingIds: z
      .string()
      .describe('Comma-separated showing request IDs (UUIDs)'),
  }),
  execute: async (params) =>
    getConversationContext(params as Record<string, unknown>),
});

const updateShowingsTool = llm.tool({
  description:
    'Updates property showings table: category (Pending/Canceled/Confirmed), status string, and optionally releases rental specialist and triggers route plan.',
  parameters: z.object({
    showingIds: z.string().describe('Comma-separated showing IDs or single ID to update'),
    category: z
      .string()
      .describe(
        'Category: Pending Showings, Canceled Showings, or Confirmed Showings'
      ),
    status: z
      .string()
      .describe(
        'Status string e.g. Unavailable - Tenanted, Unavailable - No Pets Allowed, Temporarily Unavailable - Landlord Reviewing Offer'
      ),
    releaseSpecialist: z
      .boolean()
      .optional()
      .describe('Whether to release the assigned rental specialist'),
    triggerRoutePlan: z
      .boolean()
      .optional()
      .describe('Whether to run Showings Route Plan - Final workflow'),
  }),
  execute: async (params) => updateShowings(params as Record<string, unknown>),
});

const updatePropertyRecordsTool = llm.tool({
  description:
    'Updates property records: pets allowed flag and/or offer requirements. Use when agent confirms pets policy or adds new offer criteria.',
  parameters: z.object({
    propertyIds: z.string().describe('Comma-separated property IDs'),
    petsAllowed: z.boolean().optional().describe('Whether pets are allowed at the property'),
    offerRequirements: z
      .string()
      .optional()
      .describe('Additional offer criteria specified by listing agent (Tag B)'),
  }),
  execute: async (params) =>
    updatePropertyRecords(params as Record<string, unknown>),
});

const manageRentalSpecialistTool = llm.tool({
  description:
    'Release or confirm rental specialist assignment for given showings.',
  parameters: z.object({
    action: z.enum(['release', 'confirm']).describe('release or confirm'),
    showingIds: z.string().describe('Comma-separated showing IDs'),
  }),
  execute: async (params) =>
    manageRentalSpecialist(params as Record<string, unknown>),
});

const triggerWorkflowTool = llm.tool({
  description:
    'Triggers a workflow. Use Showings Route Plan - Final after cancellations/confirmations, or Brokerage Remarks to be Addressed by Tenant for Tag J.',
  parameters: z.object({
    workflowName: z
      .string()
      .describe(
        'Workflow name: Showings Route Plan - Final or Brokerage Remarks to be Addressed by Tenant'
      ),
    context: z
      .string()
      .optional()
      .describe('Optional context (e.g. showing IDs) for the workflow'),
  }),
  execute: async (params) => triggerWorkflow(params as Record<string, unknown>),
});

const setTagTool = llm.tool({
  description:
    'Sets a tag on showing/property batch. Tags: A (client package), B (offer criteria), C (wait offer), D (remark), E (pets pending), F (agent follow-up), G (we follow-up), H (pets unknown), J (under review).',
  parameters: z.object({
    tag: z
      .string()
      .describe('Tag letter: A, B, C, D, E, F, G, H, or J'),
    showingIds: z.string().describe('Comma-separated showing IDs'),
  }),
  execute: async (params) => setTag(params as Record<string, unknown>),
});

export class MarcusAgent extends voice.Agent {
  constructor() {
    super({
      instructions: MARCUS_SYSTEM_PROMPT,
      tools: {
        fetch_property_details: fetchPropertyDetailsTool,
        fetch_showing_requests: fetchShowingRequestsTool,
        get_conversation_context: getConversationContextTool,
        update_showings: updateShowingsTool,
        update_property_records: updatePropertyRecordsTool,
        manage_rental_specialist: manageRentalSpecialistTool,
        trigger_workflow: triggerWorkflowTool,
        set_tag: setTagTool,
      },
    });
  }
}
