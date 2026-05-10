/**
 * ClaimCurrencyOverride
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editable currency selector for a specific claim.
 *
 * Renders as a compact badge showing the current currency code. Clicking it
 * opens a dropdown that lets claims managers / processors override the currency
 * for the claim (and propagates the change to all related KINGA assessments and
 * panel beater quotes via the tRPC mutation).
 *
 * Roles that can edit: claims_manager, claims_processor, insurer, admin
 * All other roles see a read-only badge.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── All currencies supported by the pipeline ────────────────────────────────
const CURRENCY_OPTIONS: { code: string; label: string }[] = [
  { code: "USD",  label: "USD — US Dollar" },
  { code: "ZWG",  label: "ZWG — Zimbabwe Gold (ZiG)" },
  { code: "ZWL",  label: "ZWL — Zimbabwe Dollar (legacy)" },
  { code: "ZAR",  label: "ZAR — South African Rand" },
  { code: "ZMW",  label: "ZMW — Zambian Kwacha" },
  { code: "BWP",  label: "BWP — Botswana Pula" },
  { code: "NAD",  label: "NAD — Namibian Dollar" },
  { code: "MZN",  label: "MZN — Mozambican Metical" },
  { code: "MWK",  label: "MWK — Malawian Kwacha" },
  { code: "TZS",  label: "TZS — Tanzanian Shilling" },
  { code: "KES",  label: "KES — Kenyan Shilling" },
  { code: "UGX",  label: "UGX — Ugandan Shilling" },
  { code: "GBP",  label: "GBP — British Pound" },
  { code: "EUR",  label: "EUR — Euro" },
];

const EDITABLE_ROLES = new Set(["claims_manager", "claims_processor", "insurer", "admin"]);

interface Props {
  claimId: number;
  currentCurrencyCode: string | null | undefined;
  /** Called after a successful update so the parent can refresh its data. */
  onUpdated?: (newCode: string) => void;
}

export default function ClaimCurrencyOverride({ claimId, currentCurrencyCode, onUpdated }: Props) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string>(currentCurrencyCode ?? "USD");

  const utils = trpc.useUtils();

  const updateCurrency = trpc.claims.updateCurrency.useMutation({
    onSuccess: (data) => {
      toast.success(`Claim currency updated to ${data.currencyCode}`);
      setEditing(false);
      // Invalidate the claim query so the parent re-fetches
      utils.claims.getById.invalidate({ id: claimId });
      onUpdated?.(data.currencyCode);
    },
    onError: (err) => {
      toast.error(`Failed to update currency: ${err.message}`);
    },
  });

  const canEdit = user && EDITABLE_ROLES.has(user.role);
  const displayCode = currentCurrencyCode ?? "USD";

  if (!canEdit) {
    // Read-only badge for non-editor roles
    return (
      <Badge variant="outline" className="text-xs font-mono px-2 py-0.5">
        {displayCode}
      </Badge>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setSelected(displayCode); setEditing(true); }}
        className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-primary/5 transition-colors"
        title="Click to change claim currency"
      >
        <span>{displayCode}</span>
        <Pencil className="h-2.5 w-2.5 opacity-50" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-7 text-xs w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CURRENCY_OPTIONS.map((opt) => (
            <SelectItem key={opt.code} value={opt.code} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        variant="default"
        className="h-7 px-2"
        disabled={updateCurrency.isPending || selected === displayCode}
        onClick={() =>
          updateCurrency.mutate({ claimId, currencyCode: selected as any })
        }
      >
        {updateCurrency.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={() => setEditing(false)}
        disabled={updateCurrency.isPending}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
