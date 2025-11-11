import Papa from "papaparse";
import { DateTime } from "luxon";
import type { UmamiEvent } from "./types";

export class CSVWorkerManager {
  private aborted = false;
  private quotaExceeded = false;
  private siteId: number = 0;
  private importId: string = "";

  private earliestAllowedDate: DateTime | null = null;
  private latestAllowedDate: DateTime | null = null;

  startImport(
    file: File,
    siteId: number,
    importId: string,
    earliestAllowedDate: string,
    latestAllowedDate: string
  ): void {
    this.siteId = siteId;
    this.importId = importId;

    this.earliestAllowedDate = DateTime.fromFormat(earliestAllowedDate, "yyyy-MM-dd", { zone: "utc" }).startOf("day");
    this.latestAllowedDate = DateTime.fromFormat(latestAllowedDate, "yyyy-MM-dd", { zone: "utc" }).endOf("day");

    if (!this.earliestAllowedDate.isValid) {
      this.handleError(`Invalid earliest allowed date: ${earliestAllowedDate}`);
      return;
    }

    if (!this.latestAllowedDate.isValid) {
      this.handleError(`Invalid latest allowed date: ${latestAllowedDate}`);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      chunkSize: 9 * 1024 * 1024,
      chunk: async (results, parser) => {
        if (this.aborted || this.quotaExceeded) {
          parser.abort();
          return;
        }

        parser.pause();

        const validEvents: UmamiEvent[] = [];
        for (const row of results.data) {
          const event = this.transformRow(row);
          if (event && event.created_at && this.isDateInRange(event.created_at)) {
            validEvents.push(event);
          }
        }

        // Upload chunk and wait for completion
        await this.uploadChunk(validEvents, false);

        // Only resume if not aborted
        if (!this.aborted && !this.quotaExceeded) {
          parser.resume();
        }
      },
      complete: async () => {
        if (this.aborted) return;

        // Send finalization signal
        await this.uploadChunk([], true);
        console.log("Import completed successfully");
      },
      error: error => {
        if (this.aborted) return;
        this.handleError(error.message);
      },
    });
  }

  private isDateInRange(dateStr: string): boolean {
    const createdAt = DateTime.fromFormat(dateStr, "yyyy-MM-dd HH:mm:ss", { zone: "utc" });
    if (!createdAt.isValid) {
      return false;
    }

    if (this.earliestAllowedDate && createdAt < this.earliestAllowedDate) {
      return false;
    }

    if (this.latestAllowedDate && createdAt > this.latestAllowedDate) {
      return false;
    }

    return true;
  }

  private transformRow(row: unknown): UmamiEvent | null {
    const rawEvent = row as Record<string, string>;

    const umamiEvent: UmamiEvent = {
      session_id: rawEvent.session_id,
      hostname: rawEvent.hostname,
      browser: rawEvent.browser,
      os: rawEvent.os,
      device: rawEvent.device,
      screen: rawEvent.screen,
      language: rawEvent.language,
      country: rawEvent.country,
      region: rawEvent.region,
      city: rawEvent.city,
      url_path: rawEvent.url_path,
      url_query: rawEvent.url_query,
      referrer_path: rawEvent.referrer_path,
      referrer_query: rawEvent.referrer_query,
      referrer_domain: rawEvent.referrer_domain,
      page_title: rawEvent.page_title,
      event_type: rawEvent.event_type,
      event_name: rawEvent.event_name,
      distinct_id: rawEvent.distinct_id,
      created_at: rawEvent.created_at,
    };


    if (!umamiEvent.created_at) {
      return null;
    }

    return umamiEvent;
  }

  private handleError(message: string): void {
    console.error("CSV Import Error:", message);
    this.terminate();
  }

  private async uploadChunk(events: UmamiEvent[], isLastBatch: boolean): Promise<void> {
    if (this.quotaExceeded) {
      return;
    }

    // Skip empty chunks unless it's the last one (needed for finalization)
    if (events.length === 0 && !isLastBatch) {
      return;
    }

    try {
      const response = await fetch(`/api/batch-import-events/${this.siteId}/${this.importId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          events,
          isLastBatch,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.quotaExceeded) {
        this.quotaExceeded = true;
        this.aborted = true;
        console.log("Import completed with quota limits:", data.message);
        return;
      }
    } catch (error) {
      // Critical failure - network error, server error, etc.
      console.error("Upload failed:", error instanceof Error ? error.message : "Unknown error");
      this.terminate();
      return;
    }
  }

  terminate(): void {
    this.aborted = true;
  }
}
