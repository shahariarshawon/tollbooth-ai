'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { FormModal } from '@/components/ui/modal';
import { useTeams } from '@/features/teams/hooks';
import type { Project } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useProjectMutations } from './hooks';

const AVAILABLE_MODELS = [
  'models/gemini-1.5-pro',
  'models/gemini-1.5-flash',
  'models/gemini-2.0-flash-exp',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
];

const schema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(200),
  description: z.string().trim().max(1000, 'At most 1000 characters').optional().or(z.literal('')),
  teamId: z.string().optional().or(z.literal('')),
  monthlyBudget: z.coerce.number().min(0).optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

export function ProjectFormDialog({
  project,
  onClose,
}: {
  project?: Project;
  onClose: () => void;
}) {
  const { create, update } = useProjectMutations();
  const { data: teams } = useTeams();
  const [error, setError] = React.useState<string | null>(null);
  const editing = project !== undefined;

  const [selectedModels, setSelectedModels] = React.useState<string[]>(
    project?.allowedModels ?? [],
  );

  const toggleModel = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model],
    );
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      teamId: project?.teamId ?? '',
      monthlyBudget: project?.monthlyBudget ?? null,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const payload = {
        name: values.name,
        description: values.description || undefined,
        teamId: values.teamId ? values.teamId : undefined,
        monthlyBudget: values.monthlyBudget ? Number(values.monthlyBudget) : undefined,
        allowedModels: selectedModels,
      };

      if (project) await update.mutateAsync({ id: project.id, input: payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  });

  return (
    <FormModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? 'Edit Project' : 'Create Project'}
      description="A project is an application or service that routes AI requests through Tollbooth."
      submitLabel={editing ? 'Save Changes' : 'Create Project'}
      submitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
    >
      <Field label="Project Name" htmlFor="name" error={errors.name?.message}>
        <Input
          id="name"
          placeholder="Customer Support Bot"
          aria-invalid={!!errors.name}
          {...register('name')}
        />
      </Field>

      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <Textarea
          id="description"
          placeholder="Handles automated customer tier-1 queries..."
          aria-invalid={!!errors.description}
          {...register('description')}
        />
      </Field>

      <Field label="Assigned Team" hint="Assign to an organizational team for budget tracking and limits">
        <select
          id="teamId"
          {...register('teamId')}
          className="w-full text-sm h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">No Team (Tenant General)</option>
          {teams?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Monthly Budget Limit ($)"
        htmlFor="monthlyBudget"
        hint="Optional spending ceiling for this project"
        error={errors.monthlyBudget?.message}
      >
        <Input
          id="monthlyBudget"
          type="number"
          step="1"
          placeholder="e.g. 500"
          {...register('monthlyBudget')}
        />
      </Field>

      <div>
        <label className="text-sm font-medium text-foreground block mb-1">
          Allowed Models (Whitelist)
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          Restrict this project to specific models, or leave empty to inherit team/tenant defaults.
        </p>
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/20 border border-border/60 rounded-lg">
          {AVAILABLE_MODELS.map((m) => {
            const active = selectedModels.includes(m);
            return (
              <Badge
                key={m}
                variant={active ? 'default' : 'outline'}
                onClick={() => toggleModel(m)}
                className="cursor-pointer text-xs font-mono py-1 px-2 select-none"
              >
                {m.replace(/^models\//, '')} {active ? '✓' : '+'}
              </Badge>
            );
          })}
        </div>
      </div>
    </FormModal>
  );
}
