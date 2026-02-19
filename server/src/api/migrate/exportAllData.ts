import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { db } from "../../db/postgres/postgres.js";
import { migrateExportSchema } from "./schema.js";

// Export all data from Railway instance for migration
export async function exportAllData(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = migrateExportSchema.safeParse({
      query: request.query,
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation error", details: parsed.error });
    }

    const { format = 'json' } = parsed.data.query;

    const exportData: any = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        postgres: {},
        clickhouse: {},
      },
    };

    // 1. Export PostgreSQL data
    // Get all tables from schema
    const { user, sites, organization, goals, funnels } = await import("../../db/postgres/schema.js");

    // Export users
    const users = await db.select().from(user);
    exportData.data.postgres.users = users;

    // Export sites
    const sitesData = await db.select().from(sites);
    exportData.data.postgres.sites = sitesData;

    // Export organizations
    const orgs = await db.select().from(organization);
    exportData.data.postgres.organizations = orgs;

    // Export goals
    const goalsData = await db.select().from(goals);
    exportData.data.postgres.goals = goalsData;

    // Export funnels
    const funnelsData = await db.select().from(funnels);
    exportData.data.postgres.funnels = funnelsData;

    // 2. Export ClickHouse data
    // Export events (in batches to avoid memory issues)
    const eventsResultSet = await clickhouse.query({
      query: "SELECT * FROM events FORMAT JSONEachRow",
      format: "JSONEachRow",
    });

    const events: any[] = [];
    for await (const row of eventsResultSet.jsonObjects()) {
      events.push(row);
    }
    exportData.data.clickhouse.events = events;

    // Export monitor_events
    try {
      const monitorResultSet = await clickhouse.query({
        query: "SELECT * FROM monitor_events FORMAT JSONEachRow",
        format: "JSONEachRow",
      });

      const monitorEvents: any[] = [];
      for await (const row of monitorResultSet.jsonObjects()) {
        monitorEvents.push(row);
      }
      exportData.data.clickhouse.monitor_events = monitorEvents;
    } catch (e) {
      // Table might not exist
      console.log("No monitor events to export");
    }

    // Export session_replay_events
    try {
      const replayResultSet = await clickhouse.query({
        query: "SELECT * FROM session_replay_events FORMAT JSONEachRow",
        format: "JSONEachRow",
      });

      const replayEvents: any[] = [];
      for await (const row of replayResultSet.jsonObjects()) {
        replayEvents.push(row);
      }
      exportData.data.clickhouse.session_replay_events = replayEvents;
    } catch (e) {
      console.log("No session replay events to export");
    }

    // Export session_replay_metadata
    try {
      const replayMetaResultSet = await clickhouse.query({
        query: "SELECT * FROM session_replay_metadata FORMAT JSONEachRow",
        format: "JSONEachRow",
      });

      const replayMetadata: any[] = [];
      for await (const row of replayMetaResultSet.jsonObjects()) {
        replayMetadata.push(row);
      }
      exportData.data.clickhouse.session_replay_metadata = replayMetadata;
    } catch (e) {
      console.log("No session replay metadata to export");
    }

    // Set headers for download
    reply.header("Content-Type", "application/json");
    reply.header("Content-Disposition", `attachment; filename="rybbit-export-${Date.now()}.json"`);

    return reply.send(exportData);
  } catch (error) {
    console.error("Error exporting data:", error);
    return reply.status(500).send({ error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" });
  }
}
