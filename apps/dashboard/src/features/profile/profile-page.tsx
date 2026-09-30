'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Permission } from '@tollbooth/shared';
import { QueryBoundary } from '@/components/query-boundary';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-provider';
import { usePermission } from '@/hooks/use-permission';
import { authService } from '@/services/auth.service';
import { tenantService } from '@/services/tenant.service';
import { userService } from '@/services/user.service';
import type { SessionUser } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { formatDate, fullName, humanize } from '@/utils/format';

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
});
type FormValues = z.infer<typeof schema>;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-32 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function EditNameForm({ user }: { user: SessionUser }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user.firstName, lastName: user.lastName },
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await userService.update(user.id, values);
      const updated = await authService.updateDisplayName(values.firstName, values.lastName);
      queryClient.setQueryData(['session'], updated);
      reset({ firstName: updated.firstName, lastName: updated.lastName });
      setMessage({ kind: 'ok', text: 'Profile updated.' });
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="profile-first" error={errors.firstName?.message}>
          <Input id="profile-first" aria-invalid={!!errors.firstName} {...register('firstName')} />
        </Field>
        <Field label="Last name" htmlFor="profile-last" error={errors.lastName?.message}>
          <Input id="profile-last" aria-invalid={!!errors.lastName} {...register('lastName')} />
        </Field>
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}
        >
          {message.text}
        </p>
      )}
      <div>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function OrganizationTab({ tenantId }: { tenantId: string | null }) {
  const tenant = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantService.get(tenantId as string),
    enabled: tenantId !== null,
  });

  if (tenantId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        You are a platform administrator and are not tied to a single tenant.
      </p>
    );
  }

  return (
    <QueryBoundary query={tenant} loading={<Skeleton className="h-24 max-w-md" />}>
      {(data) => (
        <dl className="flex flex-col gap-3">
          <Detail label="Company">{data.companyName}</Detail>
          <Detail label="Slug">{data.slug}</Detail>
          <Detail label="Plan">
            <Badge variant="outline">{humanize(data.plan)}</Badge>
          </Detail>
          <Detail label="Status">
            <StatusBadge status={data.status} />
          </Detail>
          <Detail label="Created">{formatDate(data.createdAt)}</Detail>
        </dl>
      )}
    </QueryBoundary>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const canEdit = usePermission(Permission.USER_UPDATE);
  if (!user) return null;

  return (
    <>
      <PageHeader title="Profile" description="Your account and organization." />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
              <CardDescription>How you appear across the dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <dl className="flex flex-col gap-3">
                <Detail label="Name">{fullName(user)}</Detail>
                <Detail label="Email">{user.email}</Detail>
                <Detail label="Role">
                  <Badge variant="outline">{humanize(user.role)}</Badge>
                </Detail>
              </dl>
              {/* Updating a user needs USER_UPDATE and a tenant, which is what the control plane requires. */}
              {canEdit && user.tenantId !== null ? (
                <EditNameForm user={user} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your name is managed by a tenant administrator.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
              <CardDescription>The tenant you belong to.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrganizationTab tenantId={user.tenantId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
