"use client";
import { useNivoTheme } from "@/lib/nivo";
import { ResponsiveLine } from "@nivo/line";
import { useWindowSize } from "@uidotdev/usehooks";
import { DateTime } from "luxon";
import { useState } from "react";
import { useGetOrgEventCount } from "../api/analytics/hooks/useGetOrgEventCount";
import { userLocale } from "../lib/dateTimeUtils";
import { formatter } from "../lib/utils";
import { Badge } from "./ui/badge";
import { ChartTooltip } from "./charts/ChartTooltip";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

// Colors matching EVENT_TYPE_CONFIG order: pageview, custom_event, performance, outbound, error, button_click, copy, form_submit, input_change
const CHART_COLORS = [
  "#60a5fa", // blue-400 (pageviews)
  "#fbbf24", // amber-400 (custom events)
  "#a78bfa", // violet-400 (performance)
  "#a3e635", // lime-400 (outbound)
  "#f87171", // red-400 (error)
  "#4ade80", // green-400 (button click)
  "#38bdf8", // sky-400 (copy)
  "#c084fc", // purple-400 (form submit)
  "#f472b6", // pink-400 (input change)
];

const PERIODS = [
  { value: "7", label: "7D" },
  { value: "14", label: "14D" },
  { value: "30", label: "30D" },
  { value: "60", label: "60D" },
  { value: "all", label: "All" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

function getPeriodDates(period: PeriodValue): { startDate?: string; endDate?: string } {
  if (period === "all") return {};
  const end = DateTime.now().toFormat("yyyy-MM-dd");
  const start = DateTime.now().minus({ days: Number(period) }).toFormat("yyyy-MM-dd");
  return { startDate: start, endDate: end };
}

interface UsageChartProps {
  organizationId: string;
  startDate?: string;
  endDate?: string;
  timeZone?: string;
}

export function UsageChart({ organizationId, timeZone = "UTC" }: UsageChartProps) {
  const { width } = useWindowSize();
  const nivoTheme = useNivoTheme();
  const [period, setPeriod] = useState<PeriodValue>("30");

  const { startDate, endDate } = getPeriodDates(period);

  // Fetch the data inside the component
  const { data, isLoading, error } = useGetOrgEventCount({
    organizationId,
    startDate,
    endDate,
    timeZone,
  });

  const maxTicks = Math.round((width ?? Infinity) / 200);

  const mapEventData = (key: keyof NonNullable<typeof data>["data"][number]) =>
    data?.data
      ?.map(e => {
        const timestamp = DateTime.fromSQL(e.event_date).toUTC();
        if (timestamp > DateTime.now()) return null;
        return {
          x: timestamp.toFormat("yyyy-MM-dd"),
          y: e[key] as number,
          currentTime: timestamp,
        };
      })
      .filter(e => e !== null) || [];

  const allSeries = [
    { id: "pageviews", data: mapEventData("pageview_count") },
    { id: "custom events", data: mapEventData("custom_event_count") },
    { id: "performance", data: mapEventData("performance_count") },
    { id: "outbound", data: mapEventData("outbound_count") },
    { id: "error", data: mapEventData("error_count") },
    { id: "button click", data: mapEventData("button_click_count") },
    { id: "copy", data: mapEventData("copy_count") },
    { id: "form submit", data: mapEventData("form_submit_count") },
    { id: "input change", data: mapEventData("input_change_count") },
  ];

  const activeIndices = allSeries
    .map((s, i) => (s.data.some(d => d.y > 0) ? i : -1))
    .filter(i => i !== -1);
  const chartData = activeIndices.map(i => allSeries[i]);
  const activeColors = activeIndices.map(i => CHART_COLORS[i]);

  const maxValue = Math.max(
    ...chartData.flatMap(series => series.data.map(d => d.y)),
    1
  );

  const seriesTotals = chartData
    .map((series, i) => ({
      id: series.id,
      total: series.data.reduce((acc, d) => acc + d.y, 0),
      color: activeColors[i],
    }))
    .sort((a, b) => b.total - a.total);

  const totalEvents = seriesTotals.reduce((acc, s) => acc + s.total, 0);

  const periodLabel = period === "all" ? "All Time" : `Last ${period} Days`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm text-neutral-600 dark:text-neutral-300 flex items-center gap-2">
          {periodLabel} Usage
          <Badge variant="outline" className="text-neutral-600 dark:text-neutral-300">
            {totalEvents.toLocaleString()} events
          </Badge>
        </h3>
        <Tabs value={period} onValueChange={v => setPeriod(v as PeriodValue)}>
          <TabsList className="h-7">
            {PERIODS.map(p => (
              <TabsTrigger key={p.value} value={p.value} className="text-xs px-2 py-0.5">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex gap-6">
        <div className="h-48 flex-1 min-w-0">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Loading usage data...</div>
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Failed to load usage data</div>
            </div>
          ) : (
          <ResponsiveLine
            data={chartData}
            theme={nivoTheme}
            margin={{ top: 10, right: 10, bottom: 25, left: 35 }}
            xScale={{
              type: "time",
              format: "%Y-%m-%d",
              precision: "day",
              useUTC: true,
            }}
            yScale={{
              type: "linear",
              min: 0,
              stacked: false,
              reverse: false,
              max: maxValue,
            }}
            enableGridX={false}
            enableGridY={true}
            gridYValues={5}
            yFormat=" >-.0f"
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 0,
              tickPadding: 10,
              tickRotation: 0,
              truncateTickAt: 0,
              tickValues: Math.min(maxTicks, 6),
              format: value => {
                const dt = DateTime.fromJSDate(value).setLocale(userLocale);
                return dt.toFormat("MMM d");
              },
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 10,
              tickRotation: 0,
              truncateTickAt: 0,
              tickValues: 5,
              format: formatter,
            }}
            enableTouchCrosshair={true}
            enablePoints={false}
            useMesh={true}
            animate={false}
            enableSlices={"x"}
            colors={activeColors}
            enableArea={false}
            sliceTooltip={({ slice }: any) => {
              const currentTime = slice.points[0].data.currentTime as DateTime;

              const total = slice.points.reduce((acc: number, point: any) => acc + Number(point.data.yFormatted), 0);

              return (
                <ChartTooltip>
                  <div className="p-3 min-w-[100px]">
                    <div className="font-medium mb-1">{currentTime.toLocaleString(DateTime.DATE_MED)}</div>
                    {slice.points
                      .sort((a: any, b: any) => Number(b.data.yFormatted) - Number(a.data.yFormatted))
                      .map((point: any) => {
                        return (
                          <div key={point.serieId} className="flex justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: point.seriesColor }} />
                              <span>{point.seriesId.charAt(0).toUpperCase() + point.seriesId.slice(1)}</span>
                            </div>
                            <div>{Number(point.data.yFormatted).toLocaleString()}</div>
                          </div>
                        );
                      })}
                    <div className="mt-2 flex justify-between border-t border-neutral-100 dark:border-neutral-750 pt-2">
                      <div>Total</div>
                      <div className="font-semibold">{total.toLocaleString()}</div>
                    </div>
                  </div>
                </ChartTooltip>
              );
            }}
          />
          )}
        </div>
        <div className="flex flex-col justify-center text-xs min-w-[140px] gap-1.5">
          {seriesTotals.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-neutral-600 dark:text-neutral-400 truncate">
                  {s.id.charAt(0).toUpperCase() + s.id.slice(1)}
                </span>
              </div>
              <span className="font-medium tabular-nums">{s.total.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 dark:border-neutral-700 pt-1.5 mt-0.5">
            <span className="text-neutral-600 dark:text-neutral-400">Total</span>
            <span className="font-semibold tabular-nums">{totalEvents.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
