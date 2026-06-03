import 'dotenv/config';
import { cli, ServerOptions } from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import agent from './agent.js';

// The worker loads this file for its default export; re-export the agent
// definition from agent.ts so the agent's tools/config/entry live there.
export default agent;

// `pnpm run livekit:dev|start` runs this file; cli parses the dev/start/download-files arg.
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'marcus-listing-agent',
  }),
);
