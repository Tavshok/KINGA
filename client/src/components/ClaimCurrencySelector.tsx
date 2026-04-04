/**
 * ClaimCurrencySelector
 *
 * Allows a claims manager or processor to set the currency for a specific claim
 * based on the policy insured. Propagates the change to all related AI assessments
 * and panel beater quotes via the `claims.updateCurrency` tRPC mutation.
 *
 * Supported currencies:
 *   USD → "US$"  (primary for Zimbabwe deployment)
 *   ZIG → "ZIG"  (Zimbabwe Gold — secondary)
 *   ZAR → "R"    (South African Rand — legacy / cross-border policies)
 *
 * Usage:
 *   <ClaimCurrencySelector
 *     claimId={claim.id}
 *     currentCurrency={claim.currencyCode ?? "USD"}
 *     onSuccess={(code) => console.log("Updated to", code)}
 *   />
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { getCurrencySymbolForCode } from "../../../shared/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";

// ── Supported currencies ────────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "US$", flag: "🇺🇸" },
  { code: "ZIG", label: "Zimbabwe Gold", symbol: "ZIG", flag: "🇿🇼" },
  { code: "ZAR", label: "South African Rand", symbol: "R", flag: "🇿🇦" },
] as const;

type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

// ── Props ────────────────────────────────────────────────────────────────────

interface ClaimCurrencySelectorProps {
  claimId: number;
  currentCurrency?: string | null;
  /** Called after a successful currency update with the new code */
  onSuccess?: (currencyCode: CurrencyCode) => void;
  /** Compact mode: shows only a small badge + click-to-edit; no label */
  compact?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ClaimCurrencySelector({
  claimId,
  currentCurrency,
  onSuccess,
  compact = false,
}: ClaimCurrencySelectorProps) {
  const resolvedCode = (currentCurrency?.toUpperCase() ?? "USD") as CurrencyCode;
  const [selected, setSelected] = useState<CurrencyCode>(resolvedCode);
  const [saved, setSaved] = useState(false);

  const utils = trpc.useUtils();

  const updateCurrency = trpc.claims.updateCurrency.useMutation({
    onSuccess: (data) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Invalidate the claim so all consumers re-render with the new currency
      utils.claims.getById.invalidate({ id: claimId });
      utils.claims.byStatus.invalidate();
      toast.success(`Currency updated to ${data.currencyCode} (${getCurrencySymbolForCode(data.currencyCode)})`);
      onSuccess?.(data.currencyCode as CurrencyCode);
    },
    onError: (err) => {
      toast.error(`Failed to update currency: ${err.message}`);
    },
  });

  const isDirty = selected !== resolvedCode;
  const isLoading = updateCurrency.isPending;

  const handleSave = () => {
    if (!isDirty || isLoading) return;
    updateCurrency.mutate({ claimId, currencyCode: selected });
  };

  // ── Compact mode: badge that expands on click ──────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Select
          value={selected}
          onValueChange={(v) => setSelected(v as CurrencyCode)}
          disabled={isLoading}
        >
          <SelectTrigger className="h-6 w-[80px] text-xs border-dashed border-slate-300 dark:border-border bg-transparent px-2 py-0 focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code} className="text-xs">
                <span className="mr-1">{c.flag}</span>
                {c.symbol} {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isDirty && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-teal-600 hover:bg-teal-50 dark:bg-teal-950/30"
            onClick={handleSave}
            disabled={isLoading}
            title="Save currency"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </Button>
        )}
        {saved && !isDirty && (
          <Check className="h-3 w-3 text-green-500" />
        )}
      </div>
    );
  }

  // ── Full mode: labelled selector with save button ──────────────────────────
  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-400 dark:text-muted-foreground flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          Policy Currency
        </label>
        <Select
          value={selected}
          onValueChange={(v) => setSelected(v as CurrencyCode)}
          disabled={isLoading}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                <div className="flex items-center gap-2">
                  <span>{c.flag}</span>
                  <span className="font-medium">{c.symbol}</span>
                  <span className="text-slate-700 dark:text-slate-400 dark:text-muted-foreground text-xs">{c.label}</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                    {c.code}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        size="sm"
        onClick={handleSave}
        disabled={!isDirty || isLoading}
        className={`h-9 transition-all ${
          saved
            ? "bg-green-600 hover:bg-green-700"
            : "bg-teal-600 hover:bg-teal-700"
        }`}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <>
            <Check className="h-4 w-4 mr-1" />
            Saved
          </>
        ) : (
          "Set Currency"
        )}
      </Button>
    </div>
  );
}
