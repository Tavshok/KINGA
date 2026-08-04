/**
 * Epic 5-A — Platform Navigation
 * SearchResultCard — renders a single search result item.
 */
import { Badge } from "@/components/ui/badge";
import { FileText, Car, Wrench, Package, Truck, User, ShieldCheck, ClipboardList, BarChart2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchResultType =
  | "claim"
  | "vehicle"
  | "inspection"
  | "asset"
  | "fleet"
  | "driver"
  | "panel_beater"
  | "assessor"
  | "report"
  | "user";

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "secondary" | "outline";
}

const TYPE_ICONS: Record<SearchResultType, React.ReactNode> = {
  claim: <FileText className="h-4 w-4" />,
  vehicle: <Car className="h-4 w-4" />,
  inspection: <ClipboardList className="h-4 w-4" />,
  asset: <Package className="h-4 w-4" />,
  fleet: <Truck className="h-4 w-4" />,
  driver: <User className="h-4 w-4" />,
  panel_beater: <Wrench className="h-4 w-4" />,
  assessor: <ShieldCheck className="h-4 w-4" />,
  report: <BarChart2 className="h-4 w-4" />,
  user: <Users className="h-4 w-4" />,
};

const TYPE_COLORS: Record<SearchResultType, string> = {
  claim: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  vehicle: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  inspection: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  asset: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  fleet: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  driver: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  panel_beater: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  assessor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  report: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  user: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

interface Props {
  item: SearchResultItem;
  onSelect: (item: SearchResultItem) => void;
  isHighlighted?: boolean;
}

export function SearchResultCard({ item, onSelect, isHighlighted }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isHighlighted && "bg-accent text-accent-foreground"
      )}
    >
      {/* Type icon */}
      <span className={cn("flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md", TYPE_COLORS[item.type])}>
        {TYPE_ICONS[item.type]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.title}</span>
          {item.badge && (
            <Badge variant={item.badgeVariant ?? "secondary"} className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
              {item.badge}
            </Badge>
          )}
        </div>
        {(item.subtitle || item.meta) && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {[item.subtitle, item.meta].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Type label */}
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex-shrink-0">
        {item.type.replace(/_/g, " ")}
      </span>
    </button>
  );
}
