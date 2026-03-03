import 'dotenv/config';
import {
  type JobContext,
  type JobProcess,
  cli,
  defineAgent,
  voice,
  ServerOptions,
} from '@livekit/agents';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as openai from '@livekit/agents-plugin-openai';
import type { TTSVoices } from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { fileURLToPath } from 'node:url';
import { MarcusAgent } from './agent.js';
import { MARCUS_FIRST_MESSAGE } from './instructions.js';

function createSession(ctx: JobContext): voice.AgentSession {
  const base = {
    turnDetection: new livekit.turnDetector.MultilingualModel(),
    vad: ctx.proc.userData.vad as silero.VAD,
    voiceOptions: { preemptiveGeneration: true },
  };

  return new voice.AgentSession({
    ...base,
    stt: new openai.STT({ model: 'gpt-4o-transcribe', language: 'en' }),
    llm: new openai.responses.LLM({ model: 'gpt-4o-mini' }),
    tts: new openai.TTS({
      model: 'gpt-4o-mini-tts',
      voice: (process.env.LIVEKIT_TTS_VOICE_ID ?? 'ash') as TTSVoices,
    }),
  });
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const session = createSession(ctx);

    await session.start({
      agent: new MarcusAgent(),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    await ctx.connect();

    await session.generateReply({
      instructions: `Say exactly this first: "${MARCUS_FIRST_MESSAGE}"`,
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'marcus-listing-agent',
  })
);
