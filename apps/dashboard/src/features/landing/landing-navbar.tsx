'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo } from '@/components/ui/navbar';
import { REPO_URL } from './landing-content';

export function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0B1220]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Logo href="/" light />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main Navigation">
            <a
              href="#features"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              How It Works
            </a>
            <a
              href="#architecture"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              Architecture
            </a>
            <a
              href="#use-cases"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              Use Cases
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              GitHub
            </a>
          </nav>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            Sign In
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-500 hover:shadow-md active:translate-y-0.5"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400"></span>
            </span>
            Explore Live Demo
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-md p-2 text-slate-400 hover:text-white md:hidden"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-slate-800 bg-[#0B1220] px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              How It Works
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Architecture
            </a>
            <a
              href="#use-cases"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Use Cases
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              GitHub
            </a>
            <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-slate-800">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full rounded-md border border-slate-700 px-3 py-2 text-center text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                Sign In
              </Link>
              <Link
                href="/demo"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-500"
              >
                Explore Live Demo
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
