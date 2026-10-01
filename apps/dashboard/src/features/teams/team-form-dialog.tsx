'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { Team } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useTeamMutations } from './hooks';

const POPULAR_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-sonnet-4-5',
];

interface TeamFormDialogProps {
  team?: Team;
  onClose: () => void;
}

export function TeamFormDialog({ team, onClose }: TeamFormDialogProps) {
  const isEditing = !!team;
  const { create, update } = useTeamMutations();
  const { toast } = useToast();

  const [name, setName] = React.useState(team?.name ?? '');
  const [description, setDescription] = React.useState(team?.description ?? '');
  const [rateLimitRpm, setRateLimitRpm] = React.useState(team?.rateLimitRpm ? String(team.rateLimitRpm) : '');
  const [rateLimitRpd, setRateLimitRpd] = React.useState(team?.rateLimitRpd ? String(team.rateLimitRpd) : '');
  const [tokenLimitTpm, setTokenLimitTpm] = React.useState(team?.tokenLimitTpm ? String(team.tokenLimitTpm) : '');
  const [tokenLimitTpd, setTokenLimitTpd] = React.useState(team?.tokenLimitTpd ? String(team.tokenLimitTpd) : '');
  const [monthlyBudget, setMonthlyBudget] = React.useState(team?.monthlyBudget ? String(team.monthlyBudget) : '');
  const [dailyBudget, setDailyBudget] = React.useState(team?.dailyBudget ? String(team.dailyBudget) : '');
  const [allowedModels, setAllowedModels] = React.useState<string[]>(team?.allowedModels ?? []);

  const toggleModel = (model: string) => {
    setAllowedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        rateLimitRpm: rateLimitRpm ? parseInt(rateLimitRpm, 10) : undefined,
        rateLimitRpd: rateLimitRpd ? parseInt(rateLimitRpd, 10) : undefined,
        tokenLimitTpm: tokenLimitTpm ? parseInt(tokenLimitTpm, 10) : undefined,
        tokenLimitTpd: tokenLimitTpd ? parseInt(tokenLimitTpd, 10) : undefined,
        monthlyBudget: monthlyBudget ? parseFloat(monthlyBudget) : undefined,
        dailyBudget: dailyBudget ? parseFloat(dailyBudget) : undefined,
        allowedModels,
      };

      if (isEditing) {
        await update.mutateAsync({ id: team.id, input: payload });
        toast.success(`Team "${name}" updated successfully`);
      } else {
        await create.mutateAsync(payload);
        toast.success(`Team "${name}" created successfully`);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Team & Limits' : 'Create New Team'}</DialogTitle>
            <DialogDescription>
              Configure team limits, quotas, and AI model permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field label="Team Name" htmlFor="name" required>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Engineering Team"
                required
              />
            </Field>

            <Field label="Description" htmlFor="description">
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this team build?"
              />
            </Field>

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Request Limits (Quota)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Requests / Minute (RPM)" htmlFor="rpm">
                  <Input
                    id="rpm"
                    type="number"
                    min="1"
                    value={rateLimitRpm}
                    onChange={(e) => setRateLimitRpm(e.target.value)}
                    placeholder="e.g. 60"
                  />
                </Field>
                <Field label="Requests / Day (RPD)" htmlFor="rpd">
                  <Input
                    id="rpd"
                    type="number"
                    min="1"
                    value={rateLimitRpd}
                    onChange={(e) => setRateLimitRpd(e.target.value)}
                    placeholder="e.g. 10000"
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Token Limits
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tokens / Minute (TPM)" htmlFor="tpm">
                  <Input
                    id="tpm"
                    type="number"
                    min="1"
                    value={tokenLimitTpm}
                    onChange={(e) => setTokenLimitTpm(e.target.value)}
                    placeholder="e.g. 100000"
                  />
                </Field>
                <Field label="Tokens / Day (TPD)" htmlFor="tpd">
                  <Input
                    id="tpd"
                    type="number"
                    min="1"
                    value={tokenLimitTpd}
                    onChange={(e) => setTokenLimitTpd(e.target.value)}
                    placeholder="e.g. 2000000"
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Budget Limits
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly Budget ($)" htmlFor="monthlyBudget">
                  <Input
                    id="monthlyBudget"
                    type="number"
                    step="0.01"
                    min="1"
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(e.target.value)}
                    placeholder="e.g. 200"
                  />
                </Field>
                <Field label="Daily Budget ($)" htmlFor="dailyBudget">
                  <Input
                    id="dailyBudget"
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    placeholder="e.g. 20"
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Model Permissions
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                Select allowed AI models for this team (empty means all models permitted).
              </p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_MODELS.map((model) => {
                  const checked = allowedModels.includes(model);
                  return (
                    <button
                      type="button"
                      key={model}
                      onClick={() => toggleModel(model)}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                        checked
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-accent/40'
                      }`}
                    >
                      <span className="truncate">{model}</span>
                      <span className={`size-3 rounded-full border flex items-center justify-center ${
                        checked ? 'bg-primary border-primary' : 'border-border'
                      }`}>
                        {checked && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {isEditing ? 'Save Changes' : 'Create Team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
