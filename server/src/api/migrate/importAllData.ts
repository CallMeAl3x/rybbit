import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { db } from "../../db/postgres/postgres.js";
import { migrateImportSchema } from "./schema.js";
import { user, sites, organization, goals, funnels } from "../../db/postgres/schema.js";

// Import all data from export file
export async function importAllData(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = migrateImportSchema.safeParse({
      body: request.body,
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation error", details: parsed.error });
    }

    const { data } = parsed.data.body;

    if (!data || !data.postgres || !data.clickhouse) {
      return reply.status(400).send({ error: "Invalid export data format" });
    }

    const results = {
      postgres: { imported: 0, errors: 0 },
      clickhouse: { imported: 0, errors: 0 },
    };

    // 1. Import PostgreSQL data
    try {
      // Import organizations first (they don't depend on anything)
      if (data.postgres.organizations && Array.isArray(data.postgres.organizations)) {
        for (const org of data.postgres.organizations) {
          try {
            await db.insert(organization).values(org).onConflictDoNothing();
            results.postgres.imported++;
          } catch (e) {
            console.error("Error importing organization:", e);
            results.postgres.errors++;
          }
        }
      }

      // Import users
      if (data.postgres.users && Array.isArray(data.postgres.users)) {
        for (const userData of data.postgres.users) {
          try {
            await db.insert(user).values(userData).onConflictDoNothing();
            results.postgres.imported++;
          } catch (e) {
            console.error("Error importing user:", e);
            results.postgres.errors++;
          }
        }
      }

      // Import sites
      if (data.postgres.sites && Array.isArray(data.postgres.sites)) {
        for (const site of data.postgres.sites) {
          try {
            await db.insert(sites).values(site).onConflictDoNothing();
            results.postgres.imported++;
          } catch (e) {
            console.error("Error importing site:", e);
            results.postgres.errors++;
          }
        }
      }

      // Import goals
      if (data.postgres.goals && Array.isArray(data.postgres.goals)) {
        for (const goal of data.postgres.goals) {
          try {
            await db.insert(goals).values(goal).onConflictDoNothing();
            results.postgres.imported++;
          } catch (e) {
            console.error("Error importing goal:", e);
            results.postgres.errors++;
          }
        }
      }

      // Import funnels
      if (data.postgres.funnels && Array.isArray(data.postgres.funnels)) {
        for (const funnel of data.postgres.funnels) {
          try {
            await db.insert(funnels).values(funnel).onConflictDoNothing();
            results.postgres.imported++;
          } catch (e) {
            console.error("Error importing funnel:", e);
            results.postgres.errors++;
          }
        }
      }
    } catch (e) {
      console.error("PostgreSQL import error:", e);
    }

    // 2. Import ClickHouse data
    try {
      // Import events
      if (data.clickhouse.events && Array.isArray(data.clickhouse.events) && data.clickhouse.events.length > 0) {
        try {
          await clickhouse.insert({
            table: "events",
            values: data.clickhouse.events,
            format: "JSONEachRow",
          });
          results.clickhouse.imported += data.clickhouse.events.length;
        } catch (e) {
          console.error("Error importing events:", e);
          results.clickhouse.errors += data.clickhouse.events.length;
        }
      }

      // Import monitor_events
      if (data.clickhouse.monitor_events && Array.isArray(data.clickhouse.monitor_events) && data.clickhouse.monitor_events.length > 0) {
        try {
          await clickhouse.insert({
            table: "monitor_events",
            values: data.clickhouse.monitor_events,
            format: "JSONEachRow",
          });
          results.clickhouse.imported += data.clickhouse.monitor_events.length;
        } catch (e) {
          console.error("Error importing monitor_events:", e);
        }
      }

      // Import session_replay_events
      if (data.clickhouse.session_replay_events && Array.isArray(data.clickhouse.session_replay_events) && data.clickhouse.session_replay_events.length > 0) {
        try {
          await clickhouse.insert({
            table: "session_replay_events",
            values: data.clickhouse.session_replay_events,
            format: "JSONEachRow",
          });
          results.clickhouse.imported += data.clickhouse.session_replay_events.length;
        } catch (e) {
          console.error("Error importing session_replay_events:", e);
        }
      }

      // Import session_replay_metadata
      if (data.clickhouse.session_replay_metadata && Array.isArray(data.clickhouse.session_replay_metadata) && data.clickhouse.session_replay_metadata.length > 0) {
        try {
          await clickhouse.insert({
            table: "session_replay_metadata",
            values: data.clickhouse.session_replay_metadata,
            format: "JSONEachRow",
          });
          results.clickhouse.imported += data.clickhouse.session_replay_metadata.length;
        } catch (e) {
          console.error("Error importing session_replay_metadata:", e);
        }
      }
    } catch (e) {
      console.error("ClickHouse import error:", e);
    }

    return reply.send({
      success: true,
      results,
      message: "Data imported successfully",
    });
  } catch (error) {
    console.error("Error importing data:", error);
    return reply.status(500).send({ error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" });
  }
}
