'use client';

import * as React from 'react';
import {
  Building2,
  Shield,
  Bot,
  Bell,
  Cpu,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { AccessDenied, Can } from '@/features/auth/can';
import type {
  AllSettings,
  GeneralSettings,
  SecuritySettings,
  AiSettings,
  NotificationSettings,
  SystemSettings,
} from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useSettings, useUpdateSettings } from './hooks';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dhaka',
  'Australia/Sydney',
];

const AVAILABLE_MODELS = [
  'models/gemini-1.5-pro',
  'models/gemini-1.5-flash',
  'models/gemini-2.0-flash-exp',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'claude-3-5-haiku',
];

// --- Tab 1: General Settings ---
function GeneralTab({ data }: { data: GeneralSettings }) {
  const [form, setForm] = React.useState<GeneralSettings>(data);
  const update = useUpdateSettings('general');
  const { toast } = useToast();

  React.useEffect(() => {
    setForm(data);
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast.success('General settings updated successfully.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card className="p-6 border-border/70 max-w-3xl">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Organization Profile</h3>
          <p className="text-xs text-muted-foreground">
            Basic details and branding for your Tollbooth tenant.
          </p>
        </div>

        <Field label="Organization Name">
          <Input
            value={form.orgName}
            onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            placeholder="Acme Corporation"
            required
          />
        </Field>

        <Field label="Logo URL" hint="Direct link to a square PNG or SVG logo">
          <Input
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            placeholder="https://example.com/logo.png"
          />
        </Field>

        <Field label="Timezone">
          <select
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="w-full text-sm h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Contact / Support Email">
          <Input
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            placeholder="admin@acme.corp"
            required
          />
        </Field>

        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={update.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving...' : 'Save General Settings'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// --- Tab 2: Security Settings ---
function SecurityTab({ data }: { data: SecuritySettings }) {
  const [form, setForm] = React.useState<SecuritySettings>(data);
  const update = useUpdateSettings('security');
  const { toast } = useToast();

  React.useEffect(() => {
    setForm(data);
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast.success('Security settings updated successfully.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card className="p-6 border-border/70 max-w-3xl">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Security & Access Policy</h3>
          <p className="text-xs text-muted-foreground">
            Configure authentication timeouts, password complexity, and API key lifespans.
          </p>
        </div>

        <Field label="Session Timeout (Minutes)" hint="Inactivity timeout before re-authentication is required">
          <Input
            type="number"
            min={5}
            max={1440}
            value={form.sessionTimeoutMinutes}
            onChange={(e) => setForm({ ...form, sessionTimeoutMinutes: Number(e.target.value) })}
          />
        </Field>

        <Field label="Minimum Password Length" hint="Enforced for new users and credential updates">
          <Input
            type="number"
            min={8}
            max={64}
            value={form.passwordMinLength}
            onChange={(e) => setForm({ ...form, passwordMinLength: Number(e.target.value) })}
          />
        </Field>

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Require Special Characters</div>
            <div className="text-xs text-muted-foreground">
              Require at least one symbol or non-alphanumeric character in passwords.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.requireSpecialChar}
            onChange={(e) => setForm({ ...form, requireSpecialChar: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <Field label="Default API Key Expiry (Days)" hint="Set to 0 for keys without automatic expiration">
          <Input
            type="number"
            min={0}
            max={730}
            value={form.defaultKeyExpiryDays}
            onChange={(e) => setForm({ ...form, defaultKeyExpiryDays: Number(e.target.value) })}
          />
        </Field>

        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={update.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving...' : 'Save Security Policy'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// --- Tab 3: AI Governance Settings ---
function AiTab({ data }: { data: AiSettings }) {
  const [form, setForm] = React.useState<AiSettings>(data);
  const update = useUpdateSettings('ai');
  const { toast } = useToast();

  React.useEffect(() => {
    setForm(data);
  }, [data]);

  const toggleModel = (model: string) => {
    const current = form.allowedModels || [];
    if (current.includes(model)) {
      setForm({ ...form, allowedModels: current.filter((m) => m !== model) });
    } else {
      setForm({ ...form, allowedModels: [...current, model] });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast.success('AI Governance settings updated successfully.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card className="p-6 border-border/70 max-w-3xl">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">AI Governance & Gateway Defaults</h3>
          <p className="text-xs text-muted-foreground">
            Control allowed LLM providers, model access whitelists, and maximum token ceilings.
          </p>
        </div>

        <Field label="Default Gateway Provider">
          <select
            value={form.defaultProvider}
            onChange={(e) => setForm({ ...form, defaultProvider: e.target.value })}
            className="w-full text-sm h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="google-vertex">Google Vertex AI / Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic Claude</option>
          </select>
        </Field>

        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">
            Allowed Tenant Models Whitelist
          </label>
          <div className="flex flex-wrap gap-2 p-3 bg-muted/20 border border-border/60 rounded-lg">
            {AVAILABLE_MODELS.map((model) => {
              const selected = form.allowedModels?.includes(model);
              return (
                <button
                  type="button"
                  key={model}
                  onClick={() => toggleModel(model)}
                  className={`text-xs font-mono px-2.5 py-1 rounded-md border transition-colors ${
                    selected
                      ? 'bg-primary text-primary-foreground border-primary font-medium'
                      : 'bg-card text-muted-foreground border-border/70 hover:border-foreground/40'
                  }`}
                >
                  {model} {selected ? '✓' : '+'}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Leave empty or select all to permit any model allowed by provider credentials.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Max Input Tokens Ceiling" hint="Global safety clamp per request">
            <Input
              type="number"
              min={100}
              max={1000000}
              value={form.maxInputTokens}
              onChange={(e) => setForm({ ...form, maxInputTokens: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max Output Tokens Ceiling" hint="Global generation ceiling">
            <Input
              type="number"
              min={100}
              max={128000}
              value={form.maxOutputTokens}
              onChange={(e) => setForm({ ...form, maxOutputTokens: Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={update.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving...' : 'Save AI Settings'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// --- Tab 4: Notifications Settings ---
function NotificationsTab({ data }: { data: NotificationSettings }) {
  const [form, setForm] = React.useState<NotificationSettings>(data);
  const update = useUpdateSettings('notifications');
  const { toast } = useToast();

  React.useEffect(() => {
    setForm(data);
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast.success('Notification settings updated successfully.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card className="p-6 border-border/70 max-w-3xl">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Alerts & Email Notifications</h3>
          <p className="text-xs text-muted-foreground">
            Configure automated email notifications for budget threshold crossings and system notices.
          </p>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Enable Email Alerts</div>
            <div className="text-xs text-muted-foreground">
              Send notifications when approaching monthly spending caps.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.emailAlerts}
            onChange={(e) => setForm({ ...form, emailAlerts: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <Field label="Alert Notification Email">
          <Input
            type="email"
            value={form.alertEmail}
            onChange={(e) => setForm({ ...form, alertEmail: e.target.value })}
            placeholder="billing-alerts@acme.corp"
          />
        </Field>

        <Field
          label={`Budget Alert Threshold (${form.budgetAlertThresholdPercent ?? form.budgetThresholds?.[0] ?? 80}%)`}
          hint="Send notification when tenant monthly spending hits this percentage of monthly budget limit"
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={form.budgetAlertThresholdPercent ?? form.budgetThresholds?.[0] ?? 80}
              onChange={(e) => {
                const val = Number(e.target.value);
                setForm({
                  ...form,
                  budgetAlertThresholdPercent: val,
                  budgetThresholds: [val],
                });
              }}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="font-mono text-sm font-semibold w-12 text-right">
              {form.budgetAlertThresholdPercent ?? form.budgetThresholds?.[0] ?? 80}%
            </span>
          </div>
        </Field>

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Daily Usage Summary Digest</div>
            <div className="text-xs text-muted-foreground">
              Receive a 24-hour summary of token consumption and API errors.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.dailyDigestEnabled ?? true}
            onChange={(e) => setForm({ ...form, dailyDigestEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={update.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving...' : 'Save Notification Settings'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// --- Tab 5: System & Feature Flags ---
function SystemTab({ data }: { data: SystemSettings }) {
  const [form, setForm] = React.useState<SystemSettings>(data);
  const update = useUpdateSettings('system');
  const { toast } = useToast();

  React.useEffect(() => {
    setForm(data);
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast.success('System configuration updated successfully.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card className="p-6 border-border/70 max-w-3xl">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">System Governance & Feature Flags</h3>
          <p className="text-xs text-muted-foreground">
            Activate global safety guardrails, streaming, and tenant-level maintenance mode.
          </p>
        </div>

        {form.maintenanceMode && (
          <div className="flex items-center gap-3 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <span className="font-semibold">Maintenance Mode Active:</span> Non-admin requests to the AI
              gateway will be blocked with a 503 Service Unavailable status.
            </div>
          </div>
        )}

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Maintenance Mode</div>
            <div className="text-xs text-muted-foreground">
              Temporarily reject incoming client API requests for scheduled gateway maintenance.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.maintenanceMode}
            onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Team Rate Limits & Budgets</div>
            <div className="text-xs text-muted-foreground">
              Enforce per-team RPM, TPM, and daily/monthly budget caps across API keys.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.teamLimitsEnabled ?? form.featureFlags?.['teamLimits'] ?? true}
            onChange={(e) =>
              setForm({
                ...form,
                teamLimitsEnabled: e.target.checked,
                featureFlags: { ...form.featureFlags, teamLimits: e.target.checked },
              })
            }
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Streaming Responses (SSE)</div>
            <div className="text-xs text-muted-foreground">
              Allow clients to request real-time chunked server-sent event streams.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.streamingEnabled ?? form.featureFlags?.['streamingEnabled'] ?? false}
            onChange={(e) =>
              setForm({
                ...form,
                streamingEnabled: e.target.checked,
                featureFlags: { ...form.featureFlags, streamingEnabled: e.target.checked },
              })
            }
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Automatic PII Masking</div>
            <div className="text-xs text-muted-foreground">
              Sanitize SSNs, credit card numbers, and emails from prompts before forwarding to LLM providers.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.piiMaskingEnabled ?? form.featureFlags?.['piiMasking'] ?? true}
            onChange={(e) =>
              setForm({
                ...form,
                piiMaskingEnabled: e.target.checked,
                featureFlags: { ...form.featureFlags, piiMasking: e.target.checked },
              })
            }
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-muted/20">
          <div>
            <div className="text-sm font-medium text-foreground">Prompt Injection Guard</div>
            <div className="text-xs text-muted-foreground">
              Inspect user inputs for jailbreak and system-prompt leak attempts.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.promptGuardEnabled ?? form.featureFlags?.['promptGuard'] ?? true}
            onChange={(e) =>
              setForm({
                ...form,
                promptGuardEnabled: e.target.checked,
                featureFlags: { ...form.featureFlags, promptGuard: e.target.checked },
              })
            }
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={update.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving...' : 'Save System Settings'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SettingsContent() {
  const settingsQuery = useSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & System Governance"
        description="Configure organization identity, security rules, AI provider defaults, notification alerts, and gateway feature flags."
      />

      <QueryBoundary
        query={settingsQuery}
        loading={<TableSkeleton columns={3} rows={5} />}
      >
        {(settings: AllSettings) => (
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid grid-cols-5 w-full max-w-2xl">
              <TabsTrigger value="general" className="gap-1.5 text-xs">
                <Building2 className="h-3.5 w-3.5" />
                General
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 text-xs">
                <Shield className="h-3.5 w-3.5" />
                Security
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5 text-xs">
                <Bot className="h-3.5 w-3.5" />
                AI Gateway
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1.5 text-xs">
                <Bell className="h-3.5 w-3.5" />
                Alerts
              </TabsTrigger>
              <TabsTrigger value="system" className="gap-1.5 text-xs">
                <Cpu className="h-3.5 w-3.5" />
                System
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-5">
              <GeneralTab data={settings.general} />
            </TabsContent>

            <TabsContent value="security" className="mt-5">
              <SecurityTab data={settings.security} />
            </TabsContent>

            <TabsContent value="ai" className="mt-5">
              <AiTab data={settings.ai} />
            </TabsContent>

            <TabsContent value="notifications" className="mt-5">
              <NotificationsTab data={settings.notifications} />
            </TabsContent>

            <TabsContent value="system" className="mt-5">
              <SystemTab data={settings.system} />
            </TabsContent>
          </Tabs>
        )}
      </QueryBoundary>
    </div>
  );
}

export function SettingsPage() {
  return (
    <Can
      permission={Permission.MANAGE_SETTINGS}
      fallback={<AccessDenied />}
    >
      <SettingsContent />
    </Can>
  );
}
