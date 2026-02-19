import { z } from "zod";

export const migrateExportSchema = z.object({
  query: z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
  }),
});

export const migrateImportSchema = z.object({
  body: z.object({
    data: z.any(),
  }),
});
