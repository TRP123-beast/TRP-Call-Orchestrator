import { MarcusCallClient } from "@/components/MarcusCallClient";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-b from-zinc-950 via-zinc-950 to-black px-4 py-10">
      <div className="flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex max-w-xl flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400/80">
            TRP · Marcus Voice Agent
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Call listing agents with a dedicated AI specialist.
          </h1>
          <p className="max-w-lg text-sm text-zinc-400">
            Spin up a LiveKit-powered call with Marcus, sync status back to your
            workflows, and keep showings, tags, and property records aligned.
          </p>
        </div>
        <div className="w-full max-w-2xl">
          <MarcusCallClient leadId="demo-lead" />
        </div>
      </div>
    </main>
  );
}
