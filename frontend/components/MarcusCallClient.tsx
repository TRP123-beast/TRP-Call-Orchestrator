'use client';

import { PhoneCall, Mic, Waves } from "lucide-react";
import { useMarcusCall } from "./useMarcusCall";

type MarcusCallClientProps = {
  leadId?: string;
};

function resolveStatusLabel(state: string): string {
  if (state === "idle") return "Ready to connect";
  if (state === "connecting") return "Connecting to Marcus...";
  if (state === "in-call") return "Live with Marcus";
  if (state === "ended") return "Call ended";
  return "Call failed";
}

function resolveStatusPill(state: string): { label: string; tone: string } {
  if (state === "in-call") {
    return {
      label: "On air",
      tone: "bg-emerald-400 text-slate-900 shadow-[0_0_20px_rgba(16,185,129,0.7)]",
    };
  }

  if (state === "connecting") {
    return {
      label: "Connecting",
      tone: "bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.7)]",
    };
  }

  if (state === "error") {
    return {
      label: "Issue",
      tone: "bg-rose-500 text-slate-900 shadow-[0_0_20px_rgba(244,63,94,0.7)]",
    };
  }

  return {
    label: "Idle",
    tone: "bg-slate-700 text-slate-100",
  };
}

export function MarcusCallClient({ leadId }: MarcusCallClientProps) {
  const { state, error, start, end, logs } = useMarcusCall({ leadId });
  const canStart = state === "idle" || state === "ended" || state === "error";
  const canEnd = state === "in-call" || state === "connecting";
  const status = resolveStatusPill(state);

  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6 text-sm text-zinc-50 shadow-[0_26px_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/40">
            <PhoneCall className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Marcus · Listing Agent
            </span>
            <span className="text-lg font-semibold">
              {resolveStatusLabel(state)}
            </span>
          </div>
        </div>
        <div
          className={`flex h-9 items-center gap-2 rounded-full px-3 text-[11px] font-medium uppercase tracking-wide ${status.tone}`}
        >
          <Waves className="h-3.5 w-3.5" />
          <span>{status.label}</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 max-sm:grid-cols-1">
        <div className="flex flex-col gap-3 rounded-2xl bg-zinc-900/70 p-3 ring-1 ring-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-zinc-300" />
              <span className="text-xs font-medium text-zinc-200">
                Call controls
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Lead {leadId ?? "demo"}
            </span>
          </div>
          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => {
                void start();
              }}
              disabled={!canStart}
              className={`flex-1 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold transition hover:translate-y-px active:translate-y-0 ${
                canStart
                  ? "bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                  : "cursor-not-allowed bg-zinc-800 text-zinc-500"
              }`}
            >
              {state === "in-call" || state === "connecting"
                ? "In progress"
                : "Start call"}
            </button>
            <button
              type="button"
              onClick={() => {
                void end();
              }}
              disabled={!canEnd}
              className={`flex-1 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold transition hover:translate-y-px active:translate-y-0 ${
                canEnd
                  ? "bg-rose-500 text-zinc-950 shadow-lg shadow-rose-500/30 hover:bg-rose-400"
                  : "cursor-not-allowed bg-zinc-900 text-zinc-600"
              }`}
            >
              End call
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-linear-to-b from-zinc-900/80 to-zinc-950/90 p-3 ring-1 ring-zinc-800">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Session insight
            </p>
            <p className="mt-1 text-xs text-zinc-300">
              Marcus follows your Listing Agent Call #1 workflow and updates
              showings, tags, and property records in real time.
            </p>
          </div>
          {error ? (
            <p className="rounded-xl bg-rose-900/40 px-3 py-2 text-[11px] text-rose-100 ring-1 ring-rose-500/40">
              {error}
            </p>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Noise cancellation</span>
              <span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
                Enabled
              </span>
            </div>
          )}
        </div>
      </div>

      {logs.length > 0 && (
        <div className="mt-6 rounded-2xl bg-zinc-900/80 p-4 ring-1 ring-zinc-800">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Diagnostics log
          </p>
          <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto rounded-xl bg-zinc-950/90 px-4 py-3 font-mono text-[12px] text-zinc-300">
            {logs.map((line, index) => (
              <p key={index} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

