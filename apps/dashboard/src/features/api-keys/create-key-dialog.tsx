'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FormModal } from '@/components/ui/modal';
import { useProjects } from '@/features/projects/hooks';
import type { IssuedApiKey } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { KEY_PERMISSIONS, useApiKeyMutations } from './hooks';

const schema = z.object({
  name: z.string().trim().min(1, 'Key name is required').max(200),
  projectId: z.string().min(1, 'Choose a project'),
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
  const [error, setError] = React.useState<string | null>(null);
  const activeProjects = projects.data?.filter((project) => project.status === 'ACTIVE') ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', projectId: '', permissions: ['chat:completions'], rateLimit: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const issued = await create.mutateAsync({
        name: values.name,
        projectId: values.projectId,
        permissions: values.permissions,
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
