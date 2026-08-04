/**
 * Notification Preferences — Epic 5-B
 *
 * Per-user, per-module notification preferences.
 * Controls in-app, email (hook-ready), SMS (stub), and minimum priority threshold.
 */

import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Bell, Mail, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  claims: "Claims",
  fraud: "Fraud Detection",
  vehicle_passport: "Vehicle Passport",
  asset_passport: "Asset Passport",
  engineering: "Engineering",
  fleet: "Fleet Management",
  timeline: "Timeline Intelligence",
  recoveries: "Recoveries",
  portfolio: "Portfolio Intelligence",
  predictive: "Predictive Analytics",
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  claims: "New assignments, status changes, approvals required",
  fraud: "Fraud alerts, risk score changes, flagged claims",
  vehicle_passport: "Vehicle history updates, ownership changes",
  asset_passport: "Asset status changes, valuation updates",
  engineering: "Inspection assignments, report completions",
  fleet: "Fleet risk alerts, driver incidents",
  timeline: "Cross-claim timeline anomalies",
  recoveries: "Recovery milestones, subrogation updates",
  portfolio: "Portfolio risk threshold breaches",
  predictive: "Forecast alerts, anomaly detections",
};

const PRIORITY_OPTIONS = [
  { value: "low", label: "All (Low+)" },
  { value: "medium", label: "Medium+" },
  { value: "high", label: "High+" },
  { value: "urgent", label: "Urgent only" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NotificationPreferences() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: prefs = [], isLoading } =
    trpc.notifications.getPreferences.useQuery();

  const updatePref = trpc.notifications.updatePreference.useMutation({
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
      toast({ title: "Preferences saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const handleToggle = (
    module: string,
    field: "inAppEnabled" | "emailEnabled" | "smsEnabled",
    value: boolean
  ) => {
    const current = prefs.find((p) => p.module === module);
    if (!current) return;

    updatePref.mutate({
      module: module as any,
      inAppEnabled: field === "inAppEnabled" ? value : current.inAppEnabled,
      emailEnabled: field === "emailEnabled" ? value : current.emailEnabled,
      smsEnabled: field === "smsEnabled" ? value : current.smsEnabled,
      minPriority: current.minPriority as any,
    });
  };

  const handlePriorityChange = (module: string, minPriority: string) => {
    const current = prefs.find((p) => p.module === module);
    if (!current) return;

    updatePref.mutate({
      module: module as any,
      inAppEnabled: current.inAppEnabled,
      emailEnabled: current.emailEnabled,
      smsEnabled: current.smsEnabled,
      minPriority: minPriority as any,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setLocation("/notifications")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Notification Preferences</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4 px-1">
          <div className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            In-app
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Email
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            SMS
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              coming soon
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground p-8 text-center">
            Loading preferences…
          </div>
        ) : (
          prefs.map((pref) => (
            <div
              key={pref.module}
              className="rounded-lg border bg-card p-4 space-y-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {MODULE_LABELS[pref.module] ?? pref.module}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {MODULE_DESCRIPTIONS[pref.module] ?? ""}
                </p>
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                {/* In-app */}
                <div className="flex items-center gap-2">
                  <Switch
                    id={`${pref.module}-inapp`}
                    checked={pref.inAppEnabled}
                    onCheckedChange={(v) =>
                      handleToggle(pref.module, "inAppEnabled", v)
                    }
                    disabled={updatePref.isPending}
                  />
                  <Label
                    htmlFor={`${pref.module}-inapp`}
                    className="text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Bell className="h-3 w-3" />
                    In-app
                  </Label>
                </div>

                {/* Email */}
                <div className="flex items-center gap-2">
                  <Switch
                    id={`${pref.module}-email`}
                    checked={pref.emailEnabled}
                    onCheckedChange={(v) =>
                      handleToggle(pref.module, "emailEnabled", v)
                    }
                    disabled={updatePref.isPending}
                  />
                  <Label
                    htmlFor={`${pref.module}-email`}
                    className="text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="h-3 w-3" />
                    Email
                  </Label>
                </div>

                {/* SMS (stub) */}
                <div className="flex items-center gap-2 opacity-50">
                  <Switch
                    id={`${pref.module}-sms`}
                    checked={pref.smsEnabled}
                    disabled
                  />
                  <Label
                    htmlFor={`${pref.module}-sms`}
                    className="text-xs flex items-center gap-1"
                  >
                    <MessageSquare className="h-3 w-3" />
                    SMS
                  </Label>
                </div>

                {/* Min priority */}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Min priority:
                  </span>
                  <Select
                    value={pref.minPriority}
                    onValueChange={(v) =>
                      handlePriorityChange(pref.module, v)
                    }
                    disabled={updatePref.isPending}
                  >
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
