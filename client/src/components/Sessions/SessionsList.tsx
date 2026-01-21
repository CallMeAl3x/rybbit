import { ChevronLeft, ChevronRight, Info, Rewind } from "lucide-react";
import { GetSessionsResponse } from "../../api/analytics/endpoints";
import { NothingFound } from "../NothingFound";
import { Button } from "../ui/button";
import { SessionCard, SessionCardSkeleton } from "./SessionCard";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import Link from "next/link";

interface SessionsListProps {
  sessions: GetSessionsResponse;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  emptyMessage?: string;
  userId?: string;
  identifiedOnly?: boolean;
  setIdentifiedOnly?: (identifiedOnly: boolean) => void;
  pageSize?: number;
}

export function SessionsList({
  sessions,
  isLoading,
  page,
  onPageChange,
  hasNextPage,
  hasPrevPage,
  emptyMessage = "Try a different date range or filter",
  userId,
  identifiedOnly,
  setIdentifiedOnly,
  pageSize,
}: SessionsListProps) {
  return (
    <div className="space-y-3">
      {/* Pagination controls */}
      <div className="flex items-center justify-between gap-2">
        {setIdentifiedOnly && (
          <div className="flex items-center justify-end gap-2">
            <Switch id="identified-only" checked={identifiedOnly} onCheckedChange={setIdentifiedOnly} />
            <Label htmlFor="identified-only" className="text-sm text-neutral-600 dark:text-neutral-400 cursor-pointer">
              Identified only
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="https://www.rybbit.io/docs/identify-users" target="_blank">
                  <Info className="h-4 w-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>Learn how to identify users</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="smIcon" onClick={() => onPageChange(page - 1)} disabled={!hasPrevPage}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Page {page}</span>
          <Button variant="ghost" size="smIcon" onClick={() => onPageChange(page + 1)} disabled={!hasNextPage}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sessions.length === 0 && !isLoading && (
        <NothingFound icon={<Rewind className="w-10 h-10" />} title={"No sessions found"} description={emptyMessage} />
      )}

      {/* Session cards */}
      {isLoading ? (
        <SessionCardSkeleton userId={userId} count={pageSize} />
      ) : (
        sessions.map((session, index) => (
          <SessionCard key={`${session.session_id}-${index}`} session={session} userId={userId} />
        ))
      )}
    </div>
  );
}
