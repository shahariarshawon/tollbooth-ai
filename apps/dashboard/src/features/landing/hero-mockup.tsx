'use client';

import * as React from 'react';
import { Activity, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

export function HeroMockup() {
  const [activeTab, setActiveTab] = React.useState<'stream' | 'providers'>('stream');

  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-2xl border border-slate-700/60 bg-[#111C30] shadow-2xl shadow-blue-950/50 backdrop-blur-sm">
      {/* Window Chrome Header */}
      <div className="flex h-11 items-center justify-between border-b border-slate-800/80 px-4">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-rose-500/80" />
          <span className="size-3 rounded-full bg-amber-500/80" />
          <span className="size-3 rounded-full bg-emerald-500/80" />
          <span className="ml-2 font-mono text-xs text-slate-400">
            https://gateway.tollbooth.ai/v1/chat/completions
          </span>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            99.98% Uptime
          </span>
          <span className="font-mono text-xs text-slate-400">182ms p95</span>
        </div>
      </div>

      {/* Metric Cards Top Row */}
      <div className="grid grid-cols-2 gap-px border-b border-slate-800/80 bg-slate-800/40 sm:grid-cols-4">
        <div className="bg-[#111C30] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Requests (30d)</span>
            <Activity className="size-3.5 text-blue-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-white">1,248,590</span>
            <span className="text-xs font-semibold text-emerald-400">+14.2%</span>
          </div>
        </div>

        <div className="bg-[#111C30] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Spend / Cap</span>
            <Zap className="size-3.5 text-amber-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-white">$1,234.50</span>
            <span className="text-xs text-slate-400 font-mono">/ $2,880</span>
          </div>
        </div>

        <div className="bg-[#111C30] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Providers</span>
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-white">3 / 3</span>
            <span className="text-xs font-medium text-emerald-400">Circuits Closed</span>
          </div>
        </div>

        <div className="bg-[#111C30] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Guardrail Blocks</span>
            <ShieldCheck className="size-3.5 text-indigo-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-white">14</span>
            <span className="text-xs text-slate-400">PII & Injections</span>
          </div>
        </div>
      </div>

      {/* Main Console Area */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('stream')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'stream'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Live Request Stream
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('providers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'providers'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Provider Circuit Status
            </button>
          </div>
          <span className="hidden font-mono text-xs text-slate-500 sm:inline">
            Redis 7 Lua Engine • Kafka Stream Active
          </span>
        </div>

        {activeTab === 'stream' ? (
          <div className="space-y-2 font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0B1220]/70 p-3 text-slate-300">
              <div className="flex items-center gap-3">
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-400 font-semibold">
                  200 OK
                </span>
                <span className="text-white font-medium">gemini-2.0-flash</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  tenant: acme-corp
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <span>1,420 tokens</span>
                <span className="text-slate-200 font-semibold">$0.0018</span>
                <span className="text-emerald-400">142ms</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0B1220]/70 p-3 text-slate-300">
              <div className="flex items-center gap-3">
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-400 font-semibold">
                  200 OK
                </span>
                <span className="text-white font-medium">gpt-4o</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  tenant: fintech-core
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <span>840 tokens</span>
                <span className="text-slate-200 font-semibold">$0.0042</span>
                <span className="text-emerald-400">310ms</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0B1220]/70 p-3 text-slate-300">
              <div className="flex items-center gap-3">
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-400 font-semibold">
                  200 OK
                </span>
                <span className="text-white font-medium">claude-3-5-sonnet</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  tenant: analytics-svc
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <span>2,100 tokens</span>
                <span className="text-slate-200 font-semibold">$0.0063</span>
                <span className="text-emerald-400">265ms</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-amber-200">
              <div className="flex items-center gap-3">
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-400 font-semibold">
                  429 RATE_LIMIT
                </span>
                <span className="text-white font-medium">gemini-2.0-flash</span>
                <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300">
                  tenant: dev-sandbox
                </span>
              </div>
              <div className="flex items-center gap-4 text-amber-300">
                <span>Token bucket exceeded</span>
                <span className="text-amber-400 font-semibold">$0.0000</span>
                <span>2ms</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Google Gemini</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  CIRCUIT CLOSED
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Success Rate</span>
                  <span className="text-white font-medium">99.98%</span>
                </div>
                <div className="flex justify-between">
                  <span>Latency</span>
                  <span className="text-white font-medium">142ms</span>
                </div>
                <div className="flex justify-between">
                  <span>State</span>
                  <span className="text-emerald-400 font-medium">Healthy</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">OpenAI</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  CIRCUIT CLOSED
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Success Rate</span>
                  <span className="text-white font-medium">99.91%</span>
                </div>
                <div className="flex justify-between">
                  <span>Latency</span>
                  <span className="text-white font-medium">285ms</span>
                </div>
                <div className="flex justify-between">
                  <span>State</span>
                  <span className="text-emerald-400 font-medium">Healthy</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Anthropic</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  CIRCUIT CLOSED
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Success Rate</span>
                  <span className="text-white font-medium">99.95%</span>
                </div>
                <div className="flex justify-between">
                  <span>Latency</span>
                  <span className="text-white font-medium">260ms</span>
                </div>
                <div className="flex justify-between">
                  <span>State</span>
                  <span className="text-emerald-400 font-medium">Healthy</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
