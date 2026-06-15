import 'dotenv/config';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import OpenAI from 'openai';
import { MARCUS_SYSTEM_PROMPT } from './agent/instructions.js';

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

function createClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function runTurn(
  client: OpenAI,
  history: ChatMessage[],
  userInput: string
): Promise<ChatMessage> {
  const messages: ChatMessage[] = [
    { role: 'system', content: MARCUS_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userInput },
  ];

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
  });

  const choice = response.choices[0];
  if (!choice.message.content) {
    return { role: 'assistant', content: '' };
  }

  return {
    role: 'assistant',
    content: choice.message.content,
  };
}

async function runRepl(): Promise<void> {
  const client = createClient();
  const history: ChatMessage[] = [];

  const rl = readline.createInterface({ input, output });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const line = await new Promise<string>((resolve) => {
      rl.question('Listing agent> ', (answer) => resolve(answer));
    });

    if (!line.trim() || line.trim().toLowerCase() === 'exit') {
      break;
    }

    const reply = await runTurn(client, history, line);
    history.push({ role: 'user', content: line });
    history.push(reply);

    // eslint-disable-next-line no-console
    console.log(`Marcus> ${reply.content}\n`);
  }

  rl.close();
}

runRepl().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

