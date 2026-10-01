'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FormModal } from '@/components/ui/modal';
import { useProjects } from '@/features/projects/hooks';
import { useTeams } from '@/features/teams/hooks';
import type { IssuedApiKey } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { KEY_PERMISSIONS, useApiKeyMutations } from './hooks';

const schema = z.object({
  name: z.string().trim().min(1, 'Key name is required').max(200),
  projectId: z.string().min(1, 'Choose a project'),
  teamId: z.string().optional().or(z.literal('')),
  expiresInDays: z.string().optional().or(z.literal('')),
  permissions: z.array(z.string()).min(1, 'Choose at least one permission'),
  rateLimit: z
    .string()
    .trim()
    .regex(/^(\d{1,7})?$/, 'Enter a whole number of requests per minute')
    .refine((value) => value === '' || Number(value) >= 1, 'Must be at least 1'),
});

type FormValues = z.infer<typeof schema>;

interface CreateKeyDialogProps {
  onClose: () => void;
  /** Receives the newly issued key, which is shown to the user exactly once. */
  onCreated: (issued: IssuedApiKey) => void;
}

export function CreateKeyDialog({ onClose, onCreated }: CreateKeyDialogProps) {
  const { create } = useApiKeyMutations();
  const projects = useProjects();
  const { data: teams } = useTeams();
  const [error, setError] = React.useState<string | null>(null);
  const activeProjects = projects.data?.filter((project) => project.status === 'ACTIVE') ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      projectId: '',
      teamId: '',
      expiresInDays: '',
      permissions: ['chat:completions'],
      rateLimit: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      let expiresAt: string | undefined = undefined;
      if (values.expiresInDays && Number(values.expiresInDays) > 0) {
        const exp = new Date();
        exp.setDate(exp.getDate() + Number(values.expiresInDays));
        expiresAt = exp.toISOString();
      }

      const issued = await create.mutateAsync({
        name: values.name,
        projectId: values.projectId,
        teamId: values.teamId || undefined,
        permissions: values.permissions,
        expiresAt,
        ...(values.rateLimit ? { rateLimit: Number(values.rateLimit) } : {}),
      });
      // Drop the secret from the mutation cache so only the dialog state holds it.
      create.reset();
      onCreated(issued);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  });

  return (
    <FormModal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Create API key"
      description="The key is shown once after creation. Store it somewhere safe."
      submitLabel="Create key"
      submitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
    >
      <Field label="Name" htmlFor="key-name" error={errors.name?.message}>
        <Input
          id="key-name"
          placeholder="Production"
          aria-invalid={!!errors.name}
          {...register('name')}
        />
      </Field>

      <Field
        label="Project"
        htmlFor="key-project"
        error={errors.projectId?.message}
        {...(projects.isSuccess && activeProjects.length === 0
          ? { hint: 'There are no active projects. Create one first.' }
          : {})}
      >
        <Select id="key-project" aria-invalid={!!errors.projectId} {...register('projectId')}>
          <option value="">Select a project...</option>
          {activeProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Team Assignment" htmlFor="key-team" hint="Link key to a team for usage rollup & rate limit enforcement">
        <Select id="key-team" {...register('teamId')}>
          <option value="">No Team (Project default)</option>
          {teams?.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Expiration" htmlFor="key-expiry" hint="Automatic key lifecycle retirement">
        <Select id="key-expiry" {...register('expiresInDays')}>
          <option value="">No expiration (Never)</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="365">1 year</option>
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Permissions</legend>
        {KEY_PERMISSIONS.map((permission) => (
          <label key={permission.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              value={permission.value}
              className="size-4 rounded border-border accent-primary"
              {...register('permissions')}
            />
            {permission.label}
            <code className="text-xs text-muted-foreground">{permission.value}</code>
          </label>
        ))}
        {errors.permissions && (
          <p role="alert" className="text-xs text-destructive">
            {errors.permissions.message}
          </p>
        )}
      </fieldset>

      <Field
        label="Rate limit (requests per minute)"
        htmlFor="key-rate"
        error={errors.rateLimit?.message}
        hint="Leave empty to use the plan default."
      >
        <Input
          id="key-rate"
          inputMode="numeric"
          aria-invalid={!!errors.rateLimit}
          {...register('rateLimit')}
        />
      </Field>
    </FormModal>
  );
}
