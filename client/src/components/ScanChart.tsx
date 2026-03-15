import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScanSummary } from "../api/scan";

// Colour palette (sufficient contrast in both modes) 
const COLOR_WITH_ALT = "#10b981"; // emerald-500
const COLOR_WITHOUT_ALT = "#ef4444"; // red-500

// Pie chart (single-scan breakdown) 

interface PieProps {
  mode: "pie";
  withAlt: number;
  withoutAlt: number;
}

// Bar chart (history trend) 

interface BarProps {
  mode: "bar";
  scans: ScanSummary[];
}

type ScanChartProps = PieProps | BarProps;

/**
 * Visualises scan data using Recharts.
 *
 * WCAG / ARIA:
 *  - Wrapped in a <figure> with a <figcaption> that describes the chart
 *    data in text so the information is available without interpreting
 *    the visual.
 *  - role="img" + aria-label on the chart container for AT users.
 *  - Data is also visible in the surrounding ScanResults table / history
 *    list so the chart is supplemental, never the sole source.
 *  - Colours chosen for sufficient contrast; legend uses text labels, not
 *    colour alone.
 */
export default function ScanChart(props: ScanChartProps) {
  if (props.mode === "pie") {
    return <PieBreakdown withAlt={props.withAlt} withoutAlt={props.withoutAlt} />;
  }
  return <HistoryBar scans={props.scans} />;
}

// Pie breakdown

function PieBreakdown({
  withAlt,
  withoutAlt,
}: {
  withAlt: number;
  withoutAlt: number;
}) {
  const total = withAlt + withoutAlt;
  const data = [
    { name: "With alt text", value: withAlt },
    { name: "Missing alt text", value: withoutAlt },
  ];

  const pct = total > 0 ? Math.round((withAlt / total) * 100) : 0;

  return (
    <figure aria-label={`Accessibility breakdown: ${pct}% of images have alt text`}>
      <figcaption className="mb-2 text-center text-sm font-medium text-gray-600">
        Alt text coverage:{" "}
        <span className="font-bold text-gray-900">{pct}%</span> (
        {withAlt} of {total} images)
      </figcaption>
      <div
        role="img"
        aria-label={`Pie chart: ${withAlt} images with alt text, ${withoutAlt} missing alt text`}
      >
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              <Cell fill={COLOR_WITH_ALT} />
              <Cell fill={COLOR_WITHOUT_ALT} />
            </Pie>
            <Tooltip
              formatter={(value, name) => [value, name]}
            />
            <Legend
              formatter={(value: string) => (
                <span className="text-sm text-gray-700">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

// History bar chart

function HistoryBar({ scans }: { scans: ScanSummary[] }) {
  const completed = scans
    .filter((s) => s.status === "completed")
    .slice(0, 10) // show up to the 10 most recent completed scans
    .map((s) => ({
      name: truncateDomain(s.url),
      withAlt: s.images_with_alt,
      withoutAlt: s.images_without_alt,
    }))
    .reverse(); // chronological order left-to-right

  if (completed.length === 0) return null;

  return (
    <figure aria-label="Alt text coverage across recent scans">
      <figcaption className="mb-2 text-sm font-medium text-gray-600">
        Alt text coverage — last {completed.length} completed scan
        {completed.length !== 1 ? "s" : ""}
      </figcaption>
      <div
        role="img"
        aria-label="Grouped bar chart comparing images with and without alt text per scan"
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={completed}
            margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={40}
            />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
            <Tooltip />
            <Legend
              formatter={(value: string) => (
                <span className="text-sm text-gray-700">
                  {value === "withAlt" ? "With alt text" : "Missing alt text"}
                </span>
              )}
            />
            <Bar dataKey="withAlt" name="withAlt" fill={COLOR_WITH_ALT} radius={[3, 3, 0, 0]} />
            <Bar dataKey="withoutAlt" name="withoutAlt" fill={COLOR_WITHOUT_ALT} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

// Helpers 

function truncateDomain(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname === "/" ? "" : pathname.slice(0, 12) + (pathname.length > 12 ? "…" : "");
    return hostname.replace(/^www\./, "") + path;
  } catch {
    return url.slice(0, 20);
  }
}
