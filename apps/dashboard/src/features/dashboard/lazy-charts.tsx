'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/states';

/**
 * The chart components, loaded on demand. Recharts is the largest dependency in the app; importing it
 * lazily keeps it out of the JavaScript every page loads, and the card skeleton holds the layout still
 * until it arrives.
 */
const loading = () => <Skeleton className="h-80" role="status" aria-label="Loading chart" />;

export const RequestVolumeChart = dynamic(
  () => import('./charts').then((module) => module.RequestVolumeChart),
  { ssr: false, loading },
);
export const TokenUsageChart = dynamic(
  () => import('./charts').then((module) => module.TokenUsageChart),
  { ssr: false, loading },
);
export const CostTrendChart = dynamic(
  () => import('./charts').then((module) => module.CostTrendChart),
  { ssr: false, loading },
);
export const ModelUsageChart = dynamic(
  () => import('./charts').then((module) => module.ModelUsageChart),
  { ssr: false, loading },
);
export const ProviderUsageChart = dynamic(
  () => import('./charts').then((module) => module.ProviderUsageChart),
  { ssr: false, loading },
);
