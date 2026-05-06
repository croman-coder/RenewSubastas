import { z } from 'zod';

export const VehicleStatusSchema = z.enum(['draft', 'ready', 'in_auction', 'sold', 'archived']);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

export const TransmissionSchema = z.enum(['manual', 'automatic', 'cvt']);
export const FuelTypeSchema = z.enum(['gasoline', 'diesel', 'hybrid', 'electric']);
export const ConditionSchema = z.enum(['new', 'used', 'damaged']);

export const VehicleImageSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url(),
  order: z.number().int().nonnegative(),
});

export const VehicleSchema = z.object({
  id: z.string(),
  vin: z.string().optional(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  mileage: z.number().nonnegative().optional(),
  transmission: TransmissionSchema,
  fuelType: FuelTypeSchema,
  color: z.string().optional(),
  description: z.object({ es: z.string(), en: z.string().optional() }),
  images: z.array(VehicleImageSchema).default([]),
  condition: ConditionSchema,
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  status: VehicleStatusSchema,
});
export type Vehicle = z.infer<typeof VehicleSchema>;
