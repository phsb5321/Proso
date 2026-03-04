import { z } from 'zod';

export const LicenseValidateRequestSchema = z.object({
  licenseKey: z.string().min(1),
  deviceId: z.string().optional(),
});

export type LicenseValidateRequestParsed = z.infer<typeof LicenseValidateRequestSchema>;

export const LicenseActivateRequestSchema = z.object({
  licenseKey: z.string().min(1),
  email: z.string().email().optional(),
  deviceId: z.string().optional(),
});

export type LicenseActivateRequestParsed = z.infer<typeof LicenseActivateRequestSchema>;
