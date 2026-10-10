import { z } from "zod";

export const createOwnerProfileSchema = z.object({
  phoneNumber: z.string().trim().min(7).max(30),
  addressLine1: z.string().trim().min(1).max(100),
  addressLine2: z.string().trim().max(100).optional(),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(1).max(20),
});

export const createDogSchema = z.object({
  name: z.string().trim().min(1).max(100),
  breed: z.string().trim().max(100).optional(),
  dateOfBirth: z.string().date().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateOwnerProfileSchema = createOwnerProfileSchema
  .partial()
  .extend({
    addressLine2: z.string().trim().max(100).nullable().optional(),
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: "Provide at least one field to update" },
  );

export const updateDogSchema = createDogSchema
  .partial()
  .extend({
    breed: z.string().trim().max(100).nullable().optional(),
    dateOfBirth: z.string().date().nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: "Provide at least one field to update" },
  );