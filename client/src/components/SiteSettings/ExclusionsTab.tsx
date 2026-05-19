"use client";

import { IPExclusionManager } from "./IPExclusionManager";
import { CountryExclusionManager } from "./CountryExclusionManager";

interface ExclusionsTabProps {
  siteId: number;
  disabled?: boolean;
}

export function ExclusionsTab({ siteId, disabled = false }: ExclusionsTabProps) {
  return (
    <div className="space-y-6">
      <IPExclusionManager siteId={siteId} disabled={disabled} />
      <CountryExclusionManager siteId={siteId} disabled={disabled} />
    </div>
  );
}
