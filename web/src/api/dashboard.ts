import { api } from '../lib/api';
import type { ActivityItem, DashboardStats, Health, Workflow } from './types';

export const getHealth = () => api.get<Health>('/api/health');
export const getStats = () => api.get<DashboardStats>('/api/dashboard/stats');

export const getActiveWorkflows = () =>
  api.get<{ workflows: Workflow[] }>('/api/workflows/active').then((r) => r.workflows);

export const getActivity = () =>
  api.get<{ activity: ActivityItem[] }>('/api/activity/recent').then((r) => r.activity);
