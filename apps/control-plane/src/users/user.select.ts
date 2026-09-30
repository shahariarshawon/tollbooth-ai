import type { Prisma } from '@tollbooth/database';

/** The only user columns ever returned to clients. Never add passwordHash here. */
export const USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserResponse = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;
