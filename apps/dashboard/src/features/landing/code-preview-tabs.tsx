'use client';

import * as React from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { CODE_EXAMPLES } from './landing-content';

export function CodePreviewTabs() {
  const [activeLang, setActiveLang] = React.useState('curl');
  const [copied, setCopied] = React.useState(false);

  const currentExample =
    CODE_EXAMPLES.find((ex) => ex.language === activeLang) ?? CODE_EXAMPLES[0]!;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentExample.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#0B1220] shadow-xl">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-4 py-2.5">
        <div className="flex items-center gap-1 sm:gap-2">
          <Terminal className="mr-1.5 size-4 text-slate-400" />
          {CODE_EXAMPLES.map((ex) => (
            <button
              key={ex.language}
              type="button"
              onClick={() => setActiveLang(ex.language)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeLang === ex.language
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {ex.title}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          aria-label="Copy snippet"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <div className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
        <pre>
          <code>{currentExample.code}</code>
        </pre>
      </div>
    </div>
  );
}
