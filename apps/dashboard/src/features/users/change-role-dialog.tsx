'use client';

import * as React from 'react';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { FormModal } from '@/components/ui/modal';
import type { AssignableRole, User } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { fullName } from '@/utils/format';
import { useUserMutations } from './hooks';
import { ASSIGNABLE_ROLES } from './roles';

export function ChangeRoleDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { update } = useUserMutations();
  const [role, setRole] = React.useState<AssignableRole>(
    user.role === 'SUPER_ADMIN' ? 'DEVELOPER' : user.role,
  );
  const [error, setError] = React.useState<string | null>(null);
  const description = ASSIGNABLE_ROLES.find((option) => option.value === role)?.description;

  return (
    <FormModal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Change role"
      description={`Choose a new role for ${fullName(user)}. It applies on their next request.`}
      submitLabel="Change role"
      submitting={update.isPending}
      error={error}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await update.mutateAsync({ id: user.id, input: { role } });
          onClose();
        } catch (caught) {
          setError(errorMessage(caught));
        }
      }}
    >
      <Field label="Role" htmlFor="change-role" {...(description ? { hint: description } : {})}>
        <Select
          id="change-role"
          value={role}
          onChange={(event) => setRole(event.target.value as AssignableRole)}
        >
          {ASSIGNABLE_ROLES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </FormModal>
  );
}
