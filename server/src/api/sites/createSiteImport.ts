import { FastifyReply, FastifyRequest } from "fastify";
import { getUserHasAdminAccessToSite } from "../../lib/auth-utils.js";
import { ImportLimiter } from "../../services/import/importLimiter.js";
import { ImportQuotaTracker } from "../../services/import/importQuotaChecker.js";
import { DateTime } from "luxon";
import { z } from "zod";

const createSiteImportRequestSchema = z
  .object({
    params: z.object({
      site: z.string().min(1),
    }),
  })
  .strict();

type CreateSiteImportRequest = {
  Params: z.infer<typeof createSiteImportRequestSchema.shape.params>;
};

export async function createSiteImport(request: FastifyRequest<CreateSiteImportRequest>, reply: FastifyReply) {
  try {
    const parsed = createSiteImportRequestSchema.safeParse({
      params: request.params,
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation error" });
    }

    const { site } = parsed.data.params;
    const siteId = Number(site);

    const userHasAccess = await getUserHasAdminAccessToSite(request, site);
    if (!userHasAccess) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    // Check organization and get initial limit check
    const concurrentImportLimitResult = await ImportLimiter.checkConcurrentImportLimit(siteId);
    if (!concurrentImportLimitResult.allowed) {
      return reply.status(429).send({ error: concurrentImportLimitResult.reason });
    }

    const organization = concurrentImportLimitResult.organizationId;

    // Atomically create import status with concurrency check to prevent race conditions
    const importResult = await ImportLimiter.createImportWithConcurrencyCheck({
      siteId,
      organizationId: organization,
    });

    if (!importResult.success) {
      return reply.status(429).send({ error: importResult.reason });
    }

    // Get quota information to determine allowed date ranges
    const quotaTracker = await ImportQuotaTracker.create(organization);
    const summary = quotaTracker.getSummary();

    // Calculate the earliest and latest allowed dates
    const oldestAllowedDate = DateTime.fromFormat(summary.oldestAllowedMonth + "01", "yyyyMMdd", { zone: "utc" });
    const earliestAllowedDate = oldestAllowedDate.toFormat("yyyy-MM-dd");
    const latestAllowedDate = DateTime.utc().toFormat("yyyy-MM-dd");

    return reply.send({
      data: {
        importId: importResult.importId,
        allowedDateRange: {
          earliestAllowedDate,
          latestAllowedDate,
        },
      },
    });
  } catch (error) {
    console.error("Error creating import:", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
}
