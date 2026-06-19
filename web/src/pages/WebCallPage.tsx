import { useRef, useState } from 'react';
import { Mic, PhoneCall, PhoneOff, Loader2, AlertCircle } from 'lucide-react';
import { webcallStart, webcallTurn, webcallEnd } from '../api/webcall';
import { useToast } from '../components/ui/Toast';

type Phase = 'idle' | 'connecting' | 'active';
type Status = 'greeting' | 'ready' | 'recording' | 'thinking' | 'speaking';
interface Line {
  role: 'caller' | 'ai';
  text: string;
}

const STATUS_LABEL: Record<Status, string> = {
  greeting: 'Connecting…',
  ready: 'Hold the mic to talk',
  recording: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
};

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function WebCallPage() {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<Status>('ready');
  const [feed, setFeed] = useState<Line[]>([]);
  const [permError, setPermError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<string>('');
  const mimeRef = useRef<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined';

  const playAudio = (dataUrl: string | null): Promise<void> =>
    new Promise((resolve) => {
      if (!dataUrl) return resolve();
      setStatus('speaking');
      const a = new Audio(dataUrl);
      audioRef.current = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      void a.play().catch(() => resolve());
    });

  const startCall = async () => {
    setPermError(null);
    setPhase('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = pickMime();
      sessionRef.current = crypto.randomUUID();
      setPhase('active');
      setStatus('greeting');
      setFeed([]);
      // AI greets first.
      const { reply, audio } = await webcallStart(sessionRef.current);
      setFeed([{ role: 'ai', text: reply }]);
      await playAudio(audio);
      setStatus('ready');
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      if (/permission|denied|notallowed/i.test(m)) {
        setPermError('Microphone access was blocked. Allow it in your browser and try again.');
      } else {
        setPermError(m);
      }
      setPhase('idle');
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  };

  const endCall = () => {
    audioRef.current?.pause();
    recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (sessionRef.current) void webcallEnd(sessionRef.current);
    setPhase('idle');
    setStatus('ready');
  };

  const startRec = () => {
    if (phase !== 'active' || status !== 'ready' || !streamRef.current) return;
    const rec = new MediaRecorder(streamRef.current, mimeRef.current ? { mimeType: mimeRef.current } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => void sendUtterance();
    recorderRef.current = rec;
    rec.start();
    setStatus('recording');
  };

  const stopRec = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const sendUtterance = async () => {
    const mime = mimeRef.current || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mime });
    if (blob.size < 1200) {
      setStatus('ready'); // too short — ignore
      return;
    }
    setStatus('thinking');
    try {
      const b64 = await blobToBase64(blob);
      const { transcript, reply, audio, empty } = await webcallTurn(sessionRef.current, b64, mime);
      if (empty || !transcript) {
        setStatus('ready');
        return;
      }
      setFeed((f) => [...f, { role: 'caller', text: transcript }, { role: 'ai', text: reply }]);
      await playAudio(audio);
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Call turn failed' });
    } finally {
      setStatus('ready');
    }
  };

  if (!supported) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-trp-muted">
        Your browser doesn’t support microphone capture (getUserMedia / MediaRecorder). Try Chrome or
        Edge over http://localhost.
      </div>
    );
  }

  const recording = status === 'recording';
  const canTalk = phase === 'active' && (status === 'ready' || recording);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
      <div className="mb-4">
        <h1 className="text-base font-bold">Talk to the AI assistant</h1>
        <p className="text-xs text-trp-muted">
          A live voice call in your browser — Whisper transcribes, Forge answers, Kokoro speaks. Mic
          permission only; no phone needed.
        </p>
      </div>

      {permError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-trp-error/40 bg-trp-error/10 px-3 py-2 text-sm text-trp-error">
          <AlertCircle size={16} /> {permError}
        </div>
      )}

      {/* Live transcript feed */}
      <div className="flex-1 overflow-y-auto rounded-[14px] border border-trp-border bg-trp-surface p-4">
        {feed.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-trp-muted">
            <PhoneCall size={26} />
            <p className="text-sm">
              {phase === 'idle' ? 'Start the call, then hold the mic and speak.' : 'Connecting…'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {feed.map((l, i) => (
              <div key={i} className={`flex ${l.role === 'caller' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] animate-trp-fade-in rounded-2xl px-3.5 py-2 text-sm ${
                    l.role === 'caller'
                      ? 'rounded-br-sm bg-trp-success/20 text-trp-text'
                      : 'rounded-bl-sm bg-trp-surface-hover text-trp-text'
                  }`}
                >
                  <span className={`mb-0.5 block text-[10px] font-semibold uppercase ${l.role === 'caller' ? 'text-trp-success' : 'text-trp-accent'}`}>
                    {l.role === 'caller' ? 'You' : 'AI'}
                  </span>
                  {l.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="h-5 text-xs font-medium text-trp-muted">
          {phase === 'active' ? STATUS_LABEL[status] : ''}
        </div>
        {phase === 'idle' ? (
          <button
            onClick={() => void startCall()}
            className="flex items-center gap-2 rounded-full bg-trp-accent px-6 py-3 text-sm font-bold text-trp-bg transition hover:bg-trp-accent-hover"
          >
            <PhoneCall size={18} /> Start Call
          </button>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onPointerDown={startRec}
              onPointerUp={stopRec}
              onPointerLeave={stopRec}
              disabled={!canTalk}
              className={`flex h-20 w-20 select-none touch-none items-center justify-center rounded-full text-white transition disabled:opacity-40 ${
                recording ? 'scale-110 bg-trp-error shadow-[0_0_24px] shadow-trp-error/50' : 'bg-trp-accent hover:bg-trp-accent-hover'
              }`}
            >
              {status === 'thinking' ? (
                <Loader2 size={28} className="animate-trp-spin" />
              ) : (
                <Mic size={28} />
              )}
            </button>
            <button
              onClick={endCall}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-trp-error text-white transition hover:opacity-90"
              aria-label="End call"
            >
              <PhoneOff size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
