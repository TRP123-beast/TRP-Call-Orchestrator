import { askForge, parseWithForge } from '../services/llm';
import { sendSMS } from '../services/sms/twilio-sms';
import {
  getDb,
  getListingAgentById,
  getPropertiesByIds,
} from '../services/supabase';
import type { ListingAgent, WorkflowState } from '../models/database';
import { logger } from '../lib/logger';

/**
 * Text-based version of the Listing Agent Call #1 workflow (WORKFLOW.md
 * "text preference" branch). A small stage machine persisted in
 * `workflow_state`; ALL message understanding is done by the Forge model.
 *
 * Stages: initial_text_sent → availability_confirmed → completed_confirmed
 *                           ↘ completed_unavailable
 *
 * Adaptation note: the target schema has no workflow_state.channel column, so
 * the channel is stored in metadata ({ channel: 'text' }). Showing detail goes
 * in showings.status (not status_message), and message SID in
 * messages.provider_message_id.
 */

const COMPANY = process.env.COMPANY_NAME ?? 'TRP';
const AI_NAME = process.env.AI_AGENT_NAME ?? 'the TRP AI assistant';

const TEXT_CHANNEL = 'text';

/** True when a workflow row is an in-progress text conversation. */
export function isActiveTextWorkflow(wf: WorkflowState | null): wf is WorkflowState {
  if (!wf) return false;
  const channel = (wf.metadata as Record<string, unknown> | null)?.channel;
  const stage = String(wf.current_stage ?? '');
  return channel === TEXT_CHANNEL && !stage.startsWith('completed');
}

// Stage 1: create the workflow and send the initial availability question.
export async function startTextFlow(agentId: string, propertyIds: string[]): Promise<string> {
  const agent = await getListingAgentById(agentId);
  if (!agent) throw new Error(`Listing agent ${agentId} not found`);
  if (!agent.phone) throw new Error(`Listing agent ${agentId} has no phone number`);

  const properties = await getPropertiesByIds(propertyIds);
  const addresses = properties.map((p) => p.address).filter(Boolean).join(', ') || 'your listing';

  const { data: workflow, error } = await getDb()
    .from('workflow_state')
    .insert({
      listing_agent_id: agentId,
      property_ids: propertyIds,
      current_stage: 'initial_text_sent',
      attempts: 1,
      metadata: { channel: TEXT_CHANNEL },
    })
    .select()
    .single();

  if (error) throw new Error(`startTextFlow: failed to create workflow_state: ${error.message}`);

  const message = `Hi ${agent.name}, this is ${AI_NAME}. We have a showing request for your listing at ${addresses}. Is the property still available for showing? (Reply YES or NO)`;

  await sendSMS(agent.phone, message, { listingAgentId: agentId, propertyIds });

  logger.info(`Text flow started for agent ${agent.name}`, {
    workflowId: workflow.id,
    propertyIds,
  });

  return workflow.id;
}

// Handle a reply at the current stage. ALL parsing via Forge.
export async function handleTextFlowResponse(
  workflow: WorkflowState,
  agent: ListingAgent,
  incomingMessage: string,
): Promise<string> {
  const propertyIds = workflow.property_ids;
  const metadata = (workflow.metadata as Record<string, unknown> | null) ?? {};

  switch (workflow.current_stage) {
    case 'initial_text_sent': {
      const parsed = await parseWithForge<{ available: boolean; unclear: boolean }>(
        incomingMessage,
        `The user is a listing agent responding about property availability.
Determine if they said the property is available or not.
Return JSON: { "available": true/false, "unclear": true/false }
If the message is ambiguous or doesn't answer the question, set unclear to true.`,
        { available: false, unclear: true },
      );

      if (parsed.unclear) {
        return "Sorry, I didn't catch that. Is the property still available for showing? Please reply YES or NO.";
      }

      if (!parsed.available) {
        const reason = await parseWithForge<{ reason: string }>(
          incomingMessage,
          `Extract the reason the property is unavailable.
Common reasons: tenanted, sold, withdrawn, under renovation, owner occupied.
Return JSON: { "reason": "tenanted" | "sold" | "withdrawn" | "other" }`,
          { reason: 'unknown' },
        );

        for (const propId of propertyIds) {
          await safeUpdate('properties', { status: 'unavailable' }, 'id', propId);
          await safeUpdate(
            'showings',
            { category: 'canceled_showings', status: `Unavailable — ${reason.reason}` },
            'property_id',
            propId,
          );
        }

        await safeUpdate(
          'workflow_state',
          { current_stage: 'completed_unavailable', metadata: { ...metadata, reason: reason.reason } },
          'id',
          workflow.id,
        );

        return `Thank you for letting us know, ${agent.name}. We've updated our records. Have a great day!`;
      }

      await safeUpdate('workflow_state', { current_stage: 'availability_confirmed' }, 'id', workflow.id);

      return `Great! A few quick questions:\n1. Are there any current offers on the property?\n2. Is the property pet-friendly?\n3. Any special showing conditions we should know about?`;
    }

    case 'availability_confirmed': {
      const details = await parseWithForge<{
        has_offers: boolean;
        pet_friendly: boolean | null;
        conditions: string | null;
      }>(
        incomingMessage,
        `The listing agent is answering questions about a rental property.
Extract:
1. Whether there are current offers on the property
2. Whether the property is pet-friendly
3. Any special showing conditions or remarks
Return JSON: {
  "has_offers": true/false,
  "pet_friendly": true/false/null (null if not mentioned),
  "conditions": "string or null"
}`,
        { has_offers: false, pet_friendly: null, conditions: null },
      );

      const petPolicy =
        details.pet_friendly === true ? 'allowed' : details.pet_friendly === false ? 'not_allowed' : 'unknown';

      // Tags: A = offers exist, C = no pets (per docs/TAGS.md usage in spec).
      const tags: string[] = [];
      if (details.has_offers) tags.push('A');
      if (details.pet_friendly === false) tags.push('C');

      for (const propId of propertyIds) {
        await safeUpdate(
          'properties',
          { has_offers: details.has_offers, pet_policy: petPolicy, client_remarks: details.conditions },
          'id',
          propId,
        );
        await safeUpdate(
          'showings',
          { category: 'confirmed_showings', status: 'Confirmed via text — availability verified', tags },
          'property_id',
          propId,
        );
      }

      await safeUpdate(
        'workflow_state',
        { current_stage: 'completed_confirmed', metadata: { ...metadata, ...details } },
        'id',
        workflow.id,
      );

      return `Thank you, ${agent.name}! We'll schedule the showing and confirm the details. We'll be in touch.`;
    }

    default: {
      // Completed or unknown stage — general response via Forge.
      return askForge(
        `You are a ${COMPANY} assistant texting with listing agent ${agent.name}.
The showing workflow for this property is already complete.
Be helpful, brief, and professional.`,
        incomingMessage,
        { maxTokens: 128 },
      );
    }
  }
}

/**
 * Best-effort typed update that never throws (Supabase may be unreachable).
 * Centralizes the eq().update() pattern; `table`/`column` are constrained to
 * the few we touch so the typed client stays happy.
 */
async function safeUpdate(
  table: 'properties' | 'showings' | 'workflow_state',
  values: Record<string, unknown>,
  column: 'id' | 'property_id',
  value: string,
): Promise<void> {
  try {
    const patch = { ...values, updated_at: new Date().toISOString() };
    // The typed client's Update shapes differ per table; values are validated
    // by the callers above, so a single cast keeps this helper generic.
    const { error } = await getDb()
      .from(table)
      .update(patch as never)
      .eq(column as never, value as never);
    if (error) logger.warn(`text-flow: ${table} update skipped`, { message: error.message });
  } catch (err) {
    logger.warn(`text-flow: ${table} update failed`, {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
