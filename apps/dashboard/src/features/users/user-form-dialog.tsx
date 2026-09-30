'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { FormModal } from '@/components/ui/modal';
import type { User } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { useUserMutations } from './hooks';
import { ASSIGNABLE_ROLES } from './roles';

// Mirrors the control plane rules; the server remains the authority.
const password = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

const createSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password,
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  role: z.enum(['TENANT_ADMIN', 'DEVELOPER', 'FINANCE']),
});
const editSchema = createSchema.pick({ firstName: true, lastName: true });

type FormValues = z.infer<typeof createSchema>;

interface UserFormDialogProps {
  /** Present when editing, absent when inviting a new user. */
  user?: User;
  onClose: () => void;
}

export function UserFormDialog({ user, onClose }: UserFormDialogProps) {
  const { create, update } = useUserMutations();
  const [error, setError] = React.useState<string | null>(null);
  const editing = user !== undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(editing ? (editSchema as unknown as typeof createSchema) : createSchema),
    defaultValues: {
      email: user?.email ?? '',
      password: '',
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      role: 'DEVELOPER',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          input: { firstName: values.firstName, lastName: values.lastName },
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
      title={editing ? 'Edit user' : 'Create user'}
      description={
        editing
          ? 'Update the name of this user.'
          : 'The user becomes active the first time they sign in.'
      }
      submitLabel={editing ? 'Save changes' : 'Create user'}
      submitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
          <Input
            id="firstName"
            autoComplete="off"
            aria-invalid={!!errors.firstName}
            {...register('firstName')}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
          <Input
            id="lastName"
            autoComplete="off"
            aria-invalid={!!errors.lastName}
            {...register('lastName')}
          />
        </Field>
      </div>
      {!editing && (
        <>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
          </Field>
          <Field
            label="Temporary password"
            htmlFor="password"
            error={errors.password?.message}
            hint="At least 8 characters with an uppercase letter, a lowercase letter and a number. Share it securely."
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          <Field label="Role" htmlFor="role" error={errors.role?.message}>
            <Select id="role" {...register('role')}>
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
    </FormModal>
  );
}
