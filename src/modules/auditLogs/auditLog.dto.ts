import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  actorId: z.string().optional(),
  limit: z.string().optional(),
});

export type AuditLogQueryDto = z.infer<typeof auditLogQuerySchema>;
