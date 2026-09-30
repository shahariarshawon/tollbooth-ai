'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { FormModal } from '@/components/ui/modal';
import type { Project } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useProjectMutations } from './hooks';

const schema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(200),
  description: z.string().trim().max(1000, 'At most 1000 characters'),
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
  const [error, setError] = React.useState<string | null>(null);
  const editing = project !== undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: project?.name ?? '', description: project?.description ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      if (project) await update.mutateAsync({ id: project.id, input: values });
      else await create.mutateAsync(values);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  });

  return (
    <FormModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? 'Edit project' : 'Create project'}
      description="A project is an application that calls AI models through Tollbooth."
      submitLabel={editing ? 'Save changes' : 'Create project'}
      submitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
    >
      <Field label="Name" htmlFor="name" error={errors.name?.message}>
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
          aria-invalid={!!errors.description}
          {...register('description')}
        />
      </Field>
    </FormModal>
  );
}
