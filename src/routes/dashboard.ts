import { Router, type Request, type Response } from 'express';
import {
  getAllAgents,
  getListingAgentById,
  getBrokerageById,
  getPropertiesByAgent,
  getActiveWorkflows,
  getRecentCalls,
  getRecentMessages,
} from '../services/supabase';
import { logger } from '../lib/logger';
import type { CallLog, ListingAgent, Message, Property, WorkflowState } from '../models/database';

/**
 * Dashboard read API (Express, port 3000) consumed by the React web app.
 *
 *   GET /api/agents                       list agents (dropdowns + agents list)
 *   GET /api/agents/:id                   agent detail + brokerage + properties
 *   GET /api/properties?agentId=          properties for an agent
 *   GET /api/dashboard/stats              KPI stat cards
 *   GET /api/workflows/active             active workflow cards (enriched)
 *   GET /api/activity/recent              merged calls+messages activity feed
 *   GET /api/sms/conversations            grouped SMS conversation list
 *   GET /api/sms/conversation/:agentId    full message thread for one agent
 *   GET /api/calls/active                 calls currently in progress
 *   GET /api/calls/:id/transcript         a single call's transcript + metadata
 *
 * All read endpoints degrade gracefully: if Supabase is unavailable they return
 * an empty-but-valid shape with `degraded: true` rather than erroring the UI.
 */

const router = Router();

// ─────────────────────────────── helpers ───────────────────────────────

const startOfToday = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const DAY_MS = 86_400_000;

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Canonical 5-step text/call workflow → step index (1-based) + display status. */
function stageInfo(stage: string | null): { step: number; total: number; status: string } {
  const s = (stage ?? '').toLowerCase();
  const total = 5;
  if (s.startsWith('completed')) {
    const status = s.includes('cancel') || s.includes('unavail') ? 'canceled' : 'confirmed';
    return { step: total, total, status };
  }
  const order = ['initial', 'availability', 'offers', 'pets', 'confirm'];
  const idx = order.findIndex((k) => s.includes(k));
  return { step: idx >= 0 ? idx + 1 : 1, total, status: 'pending' };
}

/** The number on the "other side" of a conversation (the agent, not us). */
function counterparty(m: Message): string {
  return (m.direction === 'inbound' ? m.from_number : m.to_number) ?? 'unknown';
}

// ─────────────────────────────── agents ───────────────────────────────

router.get('/api/agents', async (_req: Request, res: Response) => {
  try {
    const agents = await getAllAgents(200);
    res.json({ agents: agents.map(toAgentSummary) });
  } catch (err) {
    logger.warn('agents list unavailable', { message: msg(err) });
    res.json({ agents: [], degraded: true });
  }
});

router.get('/api/agents/:id', async (req: Request, res: Response) => {
  try {
    const agent = await getListingAgentById(String(req.params.id));
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const [properties, brokerage] = await Promise.all([
      getPropertiesByAgent(agent.id),
      agent.brokerage_id ? getBrokerageById(agent.brokerage_id) : Promise.resolve(null),
    ]);
    res.json({
      agent: {
        ...toAgentSummary(agent),
        email: agent.email,
        assistantName: agent.assistant_name,
        assistantPhone: agent.assistant_phone,
        brokerage: brokerage?.name ?? null,
      },
      properties: properties.map(toProperty),
    });
  } catch (err) {
    logger.error('agent detail failed', { message: msg(err) });
    res.status(500).json({ error: msg(err) });
  }
});

router.get('/api/properties', async (req: Request, res: Response) => {
  const agentId = req.query.agentId as string | undefined;
  if (!agentId) {
    res.status(400).json({ error: 'agentId query param is required' });
    return;
  }
  try {
    const properties = await getPropertiesByAgent(agentId);
    res.json({ properties: properties.map(toProperty) });
  } catch (err) {
    logger.warn('properties unavailable', { message: msg(err) });
    res.json({ properties: [], degraded: true });
  }
});

// ───────────────────────────── dashboard ─────────────────────────────

router.get('/api/dashboard/stats', async (_req: Request, res: Response) => {
  try {
    const [calls, messages, workflows] = await Promise.all([
      getRecentCalls(500),
      getRecentMessages(500),
      getActiveWorkflows(100),
    ]);

    const today = startOfToday();
    const yesterday = today - DAY_MS;
    const inToday = (iso: string): boolean => new Date(iso).getTime() >= today;
    const inYesterday = (iso: string): boolean => {
      const t = new Date(iso).getTime();
      return t >= yesterday && t < today;
    };

    const callsToday = calls.filter((c) => inToday(c.created_at)).length;
    const callsYesterday = calls.filter((c) => inYesterday(c.created_at)).length;
    const messagesToday = messages.filter((m) => inToday(m.created_at)).length;

    const completed = calls.filter((c) => c.status === 'completed').length;
    const successRate = pct(completed, calls.length);

    res.json({
      activeWorkflows: workflows.length,
      callsToday,
      callsTrendPct: callsYesterday === 0 ? null : pct(callsToday - callsYesterday, callsYesterday),
      messagesToday,
      successRate,
    });
  } catch (err) {
    logger.warn('dashboard stats unavailable', { message: msg(err) });
    res.json({
      activeWorkflows: 0,
      callsToday: 0,
      callsTrendPct: null,
      messagesToday: 0,
      successRate: 0,
      degraded: true,
    });
  }
});

router.get('/api/workflows/active', async (req: Request, res: Response) => {
  const agentId = req.query.agentId as string | undefined;
  try {
    let workflows = await getActiveWorkflows(50);
    if (agentId) workflows = workflows.filter((w) => w.listing_agent_id === agentId);

    // Enrich with agent name/phone (one lookup per distinct agent).
    const agentIds = [...new Set(workflows.map((w) => w.listing_agent_id).filter(Boolean))] as string[];
    const agentMap = new Map<string, ListingAgent>();
    await Promise.all(
      agentIds.map(async (id) => {
        const a = await getListingAgentById(id).catch(() => null);
        if (a) agentMap.set(id, a);
      }),
    );

    res.json({ workflows: workflows.map((w) => toWorkflow(w, w.listing_agent_id ? agentMap.get(w.listing_agent_id) : undefined)) });
  } catch (err) {
    logger.warn('active workflows unavailable', { message: msg(err) });
    res.json({ workflows: [], degraded: true });
  }
});

router.get('/api/activity/recent', async (_req: Request, res: Response) => {
  try {
    const [calls, messages] = await Promise.all([getRecentCalls(25), getRecentMessages(25)]);
    const items = [
      ...calls.map((c) => ({
        id: `call-${c.id}`,
        type: 'call' as const,
        title: `${c.call_type === 'inbound' ? 'Inbound' : 'Outbound'} call — ${callStatusLabel(c.status)}`,
        detail: c.duration_seconds ? formatDuration(c.duration_seconds) : '',
        status: c.status,
        at: c.created_at,
        link: { page: 'calls', id: c.id },
      })),
      ...messages.map((m) => ({
        id: `msg-${m.id}`,
        type: 'sms' as const,
        title: `${m.direction === 'inbound' ? 'SMS from' : 'SMS to'} ${counterparty(m)}`,
        detail: (m.body ?? '').slice(0, 80),
        status: m.status,
        at: m.created_at,
        link: { page: 'messages', id: m.listing_agent_id ?? '' },
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 30);
    res.json({ activity: items });
  } catch (err) {
    logger.warn('activity feed unavailable', { message: msg(err) });
    res.json({ activity: [], degraded: true });
  }
});

// ────────────────────────────── sms ──────────────────────────────

router.get('/api/sms/conversations', async (_req: Request, res: Response) => {
  try {
    const messages = await getRecentMessages(500);
    const byKey = new Map<string, { agentId: string | null; party: string; msgs: Message[] }>();
    for (const m of messages) {
      const key = m.listing_agent_id ?? counterparty(m);
      const entry = byKey.get(key) ?? { agentId: m.listing_agent_id, party: counterparty(m), msgs: [] };
      entry.msgs.push(m);
      byKey.set(key, entry);
    }

    const agentIds = [...byKey.values()].map((e) => e.agentId).filter(Boolean) as string[];
    const agentMap = new Map<string, ListingAgent>();
    await Promise.all(
      [...new Set(agentIds)].map(async (id) => {
        const a = await getListingAgentById(id).catch(() => null);
        if (a) agentMap.set(id, a);
      }),
    );

    const conversations = [...byKey.entries()]
      .map(([key, e]) => {
        const sorted = e.msgs.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const last = sorted[sorted.length - 1];
        const agent = e.agentId ? agentMap.get(e.agentId) : undefined;
        return {
          key,
          agentId: e.agentId,
          name: agent?.name ?? e.party,
          phone: agent?.phone ?? e.party,
          lastMessage: (last?.body ?? '').slice(0, 80),
          lastAt: last?.created_at ?? null,
          unread: sorted.filter((m) => m.direction === 'inbound' && m.status === 'received').length,
          messageCount: sorted.length,
        };
      })
      .sort((a, b) => new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime());

    res.json({ conversations });
  } catch (err) {
    logger.warn('conversations unavailable', { message: msg(err) });
    res.json({ conversations: [], degraded: true });
  }
});

router.get('/api/sms/conversation/:agentId', async (req: Request, res: Response) => {
  const agentId = String(req.params.agentId);
  try {
    const agent = await getListingAgentById(agentId).catch(() => null);
    const messages = await getRecentMessages(500);
    const thread = messages
      .filter((m) =>
        agent
          ? m.listing_agent_id === agent.id || counterparty(m) === agent.phone
          : counterparty(m) === agentId,
      )
      .map(toMessage)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json({
      agent: agent ? toAgentSummary(agent) : null,
      messages: thread,
    });
  } catch (err) {
    logger.error('conversation thread failed', { message: msg(err) });
    res.status(500).json({ error: msg(err) });
  }
});

// ────────────────────────────── calls ──────────────────────────────

router.get('/api/calls/active', async (_req: Request, res: Response) => {
  try {
    const calls = await getRecentCalls(50);
    const active = calls.filter((c) => c.status === 'answered' || c.status === 'initiated');
    res.json({ calls: active.map(toCall) });
  } catch (err) {
    logger.warn('active calls unavailable', { message: msg(err) });
    res.json({ calls: [], degraded: true });
  }
});

router.get('/api/calls/:id/transcript', async (req: Request, res: Response) => {
  try {
    const calls = await getRecentCalls(500);
    const call = calls.find((c) => c.id === String(req.params.id));
    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }
    res.json({ call: toCall(call), transcript: call.transcript ?? '' });
  } catch (err) {
    logger.error('call transcript failed', { message: msg(err) });
    res.status(500).json({ error: msg(err) });
  }
});

// ───────────────────────── shape mappers ─────────────────────────

function toAgentSummary(a: ListingAgent) {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    preferredContact: a.preferred_contact,
  };
}

function toProperty(p: Property) {
  return {
    id: p.id,
    address: p.address,
    mlsNumber: p.mls_number,
    status: p.status,
    petPolicy: p.pet_policy,
    hasOffers: p.has_offers,
  };
}

function toWorkflow(w: WorkflowState, agent?: ListingAgent) {
  const info = stageInfo(w.current_stage);
  return {
    id: w.id,
    agentId: w.listing_agent_id,
    agentName: agent?.name ?? 'Unknown agent',
    agentPhone: agent?.phone ?? null,
    propertyIds: w.property_ids,
    stage: w.current_stage,
    step: info.step,
    totalSteps: info.total,
    status: info.status,
    channel: (w.metadata?.channel as string) ?? 'call',
    attempts: w.attempts,
    startedAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

function toMessage(m: Message) {
  return {
    id: m.id,
    direction: m.direction,
    from: m.from_number,
    to: m.to_number,
    body: m.body,
    status: m.status,
    createdAt: m.created_at,
  };
}

function toCall(c: CallLog) {
  return {
    id: c.id,
    agentId: c.listing_agent_id,
    propertyIds: c.property_ids,
    callType: c.call_type,
    status: c.status,
    durationSeconds: c.duration_seconds,
    transcript: c.transcript,
    createdAt: c.created_at,
  };
}

function callStatusLabel(s: string): string {
  return ({ no_answer: 'No answer', voicemail: 'Voicemail' } as Record<string, string>)[s] ?? s;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default router;
