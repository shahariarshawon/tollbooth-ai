'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FormModal } from '@/components/ui/modal';
import type { Tenant, TenantPlan } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { humanize } from '@/utils/format';
import { useTenantMutations } from './hooks';

const PLANS: TenantPlan[] = ['FREE', 'STARTUP', 'BUSINESS', 'ENTERPRISE'];

const createSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Slug must be at least 2 characters')
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens'),
  plan: z.enum(['FREE', 'STARTUP', 'BUSINESS', 'ENTERPRISE']),
});
const editSchema = createSchema.omit({ slug: true });

type FormValues = z.infer<typeof createSchema>;

interface TenantFormDialogProps {
  /** Present when editing, absent when creating. */
  tenant?: Tenant;
  onClose: () => void;
}

export function TenantFormDialog({ tenant, onClose }: TenantFormDialogProps) {
  const { create, update } = useTenantMutations();
  const [error, setError] = React.useState<string | null>(null);
  const editing = tenant !== undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // The slug is permanent, so the edit form does not validate or send it.
    resolver: zodResolver(editing ? (editSchema as unknown as typeof createSchema) : createSchema),
    defaultValues: {
      companyName: tenant?.companyName ?? '',
      slug: tenant?.slug ?? '',
      plan: tenant?.plan ?? 'FREE',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      if (tenant) {
        await update.mutateAsync({
          id: tenant.id,
          input: { companyName: values.companyName, plan: values.plan },
        });
      } else {
        await create.mutateAsync(values);
      }
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  });

  return (
    <FormModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? 'Edit tenant' : 'Create tenant'}
      description={
        editing ? 'Update the company name or plan.' : 'Add a new company to the platform.'
      }
      submitLabel={editing ? 'Save changes' : 'Create tenant'}
      submitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
    >
      <Field label="Company name" htmlFor="companyName" error={errors.companyName?.message}>
        <Input id="companyName" aria-invalid={!!errors.companyName} {...register('companyName')} />
      </Field>
      {!editing && (
        <Field
          label="Slug"
          htmlFor="slug"
          error={errors.slug?.message}
          hint="Used in URLs. Lowercase letters, numbers and hyphens. Cannot be changed later."
        >
          <Input id="slug" aria-invalid={!!errors.slug} {...register('slug')} />
        </Field>
      )}
      <Field label="Plan" htmlFor="plan" error={errors.plan?.message}>
        <Select id="plan" {...register('plan')}>
          {PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {humanize(plan)}
            </option>
          ))}
        </Select>
      </Field>
    </FormModal>
  );
}
