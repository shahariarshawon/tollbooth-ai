'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardOverview, NamedCount } from '@/types/api';
import { formatCompactNumber, formatCurrency, formatNumber } from '@/utils/format';

/**
 * Presentational charts. Each takes plain data props, so connecting real analytics later means
 * changing the query that feeds them, not these components.
 */

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];
const GRID = 'var(--border)';
const AXIS = {
  stroke: 'var(--muted-foreground)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;
const TOOLTIP = {
  contentStyle: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--muted-foreground)' },
} as const;

const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function RequestVolumeChart({ data }: { data: DashboardOverview['requestVolume'] }) {
  return (
    <ChartCard title="Request volume" description="Requests per day">
      <AreaChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="requestFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...AXIS} />
        <YAxis tickFormatter={formatCompactNumber} width={48} {...AXIS} />
        <Tooltip
          {...TOOLTIP}
          labelFormatter={(label) => shortDate(String(label))}
          formatter={(value) => [formatNumber(Number(value)), 'Requests']}
        />
        <Area
          type="monotone"
          dataKey="requests"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#requestFill)"
        />
      </AreaChart>
    </ChartCard>
  );
}

export function CostTrendChart({ data }: { data: DashboardOverview['costTrend'] }) {
  return (
    <ChartCard title="Cost trend" description="Estimated spend per day">
      <LineChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...AXIS} />
        <YAxis tickFormatter={(value) => `$${value}`} width={48} {...AXIS} />
        <Tooltip
          {...TOOLTIP}
          labelFormatter={(label) => shortDate(String(label))}
          formatter={(value) => [formatCurrency(Number(value)), 'Cost']}
        />
        <Line type="monotone" dataKey="cost" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartCard>
  );
}

export function ModelUsageChart({ data }: { data: NamedCount[] }) {
  return (
    <ChartCard title="Model usage" description="Requests by model">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={formatCompactNumber} {...AXIS} />
        <YAxis type="category" dataKey="label" width={96} {...AXIS} />
        <Tooltip
          {...TOOLTIP}
          cursor={{ fill: 'var(--muted)' }}
          formatter={(value) => [formatNumber(Number(value)), 'Requests']}
        />
        <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ChartCard>
  );
}

export function ProviderUsageChart({ data }: { data: NamedCount[] }) {
  return (
    <ChartCard title="Provider usage" description="Share of requests by provider">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          stroke="var(--card)"
        >
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={COLORS[index % COLORS.length] ?? COLORS[0]!} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP} formatter={(value) => [formatNumber(Number(value)), 'Requests']} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ChartCard>
  );
}
