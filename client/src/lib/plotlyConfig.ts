/**
 * KINGA Branded Plotly Configuration
 * 
 * Provides consistent branding across all charts with:
 * - KINGA logo watermark
 * - Custom color scheme (blue/indigo gradient)
 * - Professional styling for client-facing reports
 */

// KINGA Brand Colors
// Using any types for Plotly Layout and Config to avoid import issues
type Layout = any;
type Config = any;

// KINGA Brand Colors
export const KINGA_COLORS = {
  primary: "#2563eb", // blue-600
  secondary: "#4f46e5", // indigo-600
  accent: "#06b6d4", // cyan-500
  success: "#10b981", // green-500
  warning: "#f59e0b", // amber-500
  danger: "#ef4444", // red-500
  gradient: ["#3b82f6", "#6366f1", "#8b5cf6"], // blue to indigo to purple
};

// KINGA Logo as base64 data URI (you can replace this with actual logo)
const KINGA_LOGO_BASE64 = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzI1NjNlYiIgcng9IjEwIi8+CiAgPHRleHQgeD0iNTAiIHk9IjU1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMzYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SzwvdGV4dD4KPC9zdmc+";

/**
 * Get branded Plotly layout configuration
 */
export function getBrandedLayout(baseLayout: Partial<Layout> = {}): Partial<Layout> {
  return {
    ...baseLayout,
    font: {
      family: "Inter, system-ui, sans-serif",
      size: 12,
      color: "#334155", // slate-700
    },
    paper_bgcolor: "rgba(255, 255, 255, 0.95)",
    plot_bgcolor: "rgba(248, 250, 252, 0.5)", // slate-50 with transparency
    margin: {
      l: 60,
      r: 40,
      t: 60,
      b: 60,
      ...baseLayout.margin,
    },
    // Add KINGA logo watermark
    images: [
      {
        source: KINGA_LOGO_BASE64,
        xref: "paper",
        yref: "paper",
        x: 0.95,
        y: 0.05,
        sizex: 0.1,
        sizey: 0.1,
        xanchor: "right",
        yanchor: "bottom",
        opacity: 0.3,
        layer: "below",
      },
      ...(baseLayout.images || []),
    ],
    // Professional styling
    xaxis: {
      showgrid: true,
      gridcolor: "#e2e8f0", // slate-200
      gridwidth: 1,
      zeroline: false,
      ...baseLayout.xaxis,
    },
    yaxis: {
      showgrid: true,
      gridcolor: "#e2e8f0", // slate-200
      gridwidth: 1,
      zeroline: false,
      ...baseLayout.yaxis,
    },
    hovermode: "closest",
    hoverlabel: {
      bgcolor: "#1e293b", // slate-800
      font: {
        family: "Inter, system-ui, sans-serif",
        size: 12,
        color: "white",
      },
    },
  };
}

/**
 * Get branded Plotly config
 */
export function getBrandedConfig(baseConfig: Partial<Config> = {}): Partial<Config> {
  return {
    ...baseConfig,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
    toImageButtonOptions: {
      format: "png",
      filename: "kinga_chart",
      height: 800,
      width: 1200,
      scale: 2,
    },
    responsive: true,
  };
}

/**
 * Get KINGA color scale for charts
 */
export function getColorScale(type: "sequential" | "diverging" | "categorical" = "sequential"): string[] {
  switch (type) {
    case "sequential":
      return [
        "#eff6ff", // blue-50
        "#dbeafe", // blue-100
        "#bfdbfe", // blue-200
        "#93c5fd", // blue-300
        "#60a5fa", // blue-400
        "#3b82f6", // blue-500
        "#2563eb", // blue-600
        "#1d4ed8", // blue-700
        "#1e40af", // blue-800
      ];
    case "diverging":
      return [
        "#ef4444", // red-500
        "#f97316", // orange-500
        "#f59e0b", // amber-500
        "#eab308", // yellow-500
        "#84cc16", // lime-500
        "#22c55e", // green-500
        "#10b981", // emerald-500
      ];
    case "categorical":
      return [
        "#3b82f6", // blue-500
        "#8b5cf6", // violet-500
        "#ec4899", // pink-500
        "#f59e0b", // amber-500
        "#10b981", // emerald-500
        "#06b6d4", // cyan-500
        "#6366f1", // indigo-500
      ];
  }
}
