import { api } from '../lib/api';
import type { AgentDetail, AgentSummary, Property } from './types';

export const getAgents = () =>
  api.get<{ agents: AgentSummary[] }>('/api/agents').then((r) => r.agents);

export const getAgent = (id: string) =>
  api.get<{ agent: AgentDetail; properties: Property[] }>(`/api/agents/${id}`);

export const getProperties = (agentId: string) =>
  api.get<{ properties: Property[] }>(`/api/properties?agentId=${agentId}`).then((r) => r.properties);
