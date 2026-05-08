/**
 * ThirdPartyProfiles
 *
 * Searchable directory of all third parties (individuals and their insurers)
 * that appear across recovery cases. Groups by identity (name + registration),
 * shows case history, insurer associations, and settlement patterns.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, Search, AlertTriangle, Building2, Car, Phone,
  MapPin, Hash, ChevronRight, FileText, TrendingUp, DollarSign,
  CheckSquare, Gavel, Loader2, User,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending",
  under_investigation: "Investigating",
  open: "Open",
  demand_sent: "Demand Sent",
  disputed_legal: "Disputed",
  settled_full: "Settled (Full)",
  settled_partial: "Settled (Partial)",
  closed_no_recovery: "Closed",
  archived: "Archived",
};

const STATUS_COLOR: Record<string, string> = {
  pending_review: "text-blue-400",
  under_investigation: "text-amber-400",
  open: "text-teal-400",
  demand_sent: "text-violet-400",
  disputed_legal: "text-rose-400",
  settled_full: "text-emerald-400",
  settled_partial: "text-emerald-400",
  closed_no_recovery: "text-slate-400",
  archived: "text-slate-400",
};

function formatCurrency(cents: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function ThirdPartyProfiles() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Debounce search input
  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._tpSearchTimer);
    (window as any)._tpSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const { data, isLoading } = trpc.recovery.getThirdPartyProfiles.useQuery(
    { search: debouncedSearch || undefined, page, pageSize: 20 },
    { keepPreviousData: true }
  );

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <InsurerPortalLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <Users className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Third-Party Profiles</h1>
            <p className="text-sm text-muted-foreground">
              Consolidated directory of all third parties across recovery cases — individuals, vehicles, and their insurers
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, vehicle registration, ID number, or insurer…"
            className="pl-9 text-sm"
          />
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <span><span className="font-semibold text-foreground">{total}</span> profile{total !== 1 ? "s" : ""}</span>
              {debouncedSearch && <span>matching &ldquo;{debouncedSearch}&rdquo;</span>}
            </>
          )}
        </div>

        {/* Profile list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-border p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/4 mb-3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-lg border border-border p-10 text-center text-muted-foreground text-sm">
            {debouncedSearch
              ? `No third-party profiles match "${debouncedSearch}".`
              : "No third-party profiles yet. Profiles are built automatically from recovery cases."}
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => {
              const isExpanded = expandedKey === profile.key;
              const settlementRate = profile.totalCases > 0
                ? Math.round((profile.settledCases / profile.totalCases) * 100)
                : 0;
              const recoveryEfficiency = profile.totalApprovedCents > 0
                ? Math.round((profile.totalRecoveredCents / profile.totalApprovedCents) * 100)
                : 0;

              return (
                <div
                  key={profile.key}
                  className={`rounded-lg border transition-colors ${
                    isExpanded ? "border-violet-500/30 bg-violet-500/5" : "border-border bg-card hover:border-violet-500/20"
                  }`}
                >
                  {/* Profile header row */}
                  <button
                    className="w-full p-5 text-left flex items-center justify-between gap-4"
                    onClick={() => setExpandedKey(isExpanded ? null : profile.key)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">
                          {profile.thirdPartyName ?? "Unknown Individual"}
                        </span>
                        {profile.thirdPartyRegistration && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Car className="h-3 w-3" />
                            {profile.thirdPartyRegistration}
                          </Badge>
                        )}
                        {profile.isRepeatOffender && (
                          <Badge variant="outline" className="text-xs text-rose-400 border-rose-500/30 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Repeat Offender
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {profile.insurers.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {profile.insurers.join(", ")}
                          </span>
                        )}
                        {profile.thirdPartyIdNumber && (
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            ID: {profile.thirdPartyIdNumber}
                          </span>
                        )}
                        {profile.thirdPartyPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {profile.thirdPartyPhone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-5 flex-shrink-0">
                      {/* Stats */}
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-foreground">{profile.totalCases}</div>
                        <div className="text-xs text-muted-foreground">Cases</div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className={`text-sm font-bold ${
                          settlementRate >= 70 ? "text-emerald-400" :
                          settlementRate >= 40 ? "text-amber-400" : "text-rose-400"
                        }`}>{settlementRate}%</div>
                        <div className="text-xs text-muted-foreground">Settled</div>
                      </div>
                      <div className="text-right hidden md:block">
                        <div className="text-sm font-bold text-foreground">
                          {formatCurrency(profile.totalApprovedCents)}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Quantum</div>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Contact details */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" /> Individual Details
                          </h4>
                          {profile.thirdPartyName && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Name: </span>
                              <span className="text-foreground font-medium">{profile.thirdPartyName}</span>
                            </div>
                          )}
                          {profile.thirdPartyRegistration && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Vehicle: </span>
                              <span className="text-foreground font-medium">{profile.thirdPartyRegistration}</span>
                            </div>
                          )}
                          {profile.thirdPartyIdNumber && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">ID/Passport: </span>
                              <span className="text-foreground font-medium">{profile.thirdPartyIdNumber}</span>
                            </div>
                          )}
                          {profile.thirdPartyPhone && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Phone: </span>
                              <span className="text-foreground font-medium">{profile.thirdPartyPhone}</span>
                            </div>
                          )}
                          {profile.thirdPartyAddress && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Address: </span>
                              <span className="text-foreground font-medium">{profile.thirdPartyAddress}</span>
                            </div>
                          )}
                        </div>

                        {/* Insurer details */}
                        {profile.insurers.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" /> Insurer Details
                            </h4>
                            {profile.insurers.map((ins) => (
                              <div key={ins} className="text-sm text-foreground font-medium">{ins}</div>
                            ))}
                            {profile.insurerPhone && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Phone: </span>
                                <span className="text-foreground font-medium">{profile.insurerPhone}</span>
                              </div>
                            )}
                            {profile.insurerAddress && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Address: </span>
                                <span className="text-foreground font-medium">{profile.insurerAddress}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Recovery stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold text-foreground">{profile.totalCases}</div>
                          <div className="text-xs text-muted-foreground">Total Cases</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className={`text-lg font-bold ${settlementRate >= 70 ? "text-emerald-400" : settlementRate >= 40 ? "text-amber-400" : "text-rose-400"}`}>
                            {settlementRate}%
                          </div>
                          <div className="text-xs text-muted-foreground">Settlement Rate</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className={`text-lg font-bold ${profile.disputedCases > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                            {profile.disputedCases}
                          </div>
                          <div className="text-xs text-muted-foreground">Disputed</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className={`text-lg font-bold ${recoveryEfficiency >= 80 ? "text-emerald-400" : recoveryEfficiency >= 50 ? "text-amber-400" : "text-rose-400"}`}>
                            {recoveryEfficiency}%
                          </div>
                          <div className="text-xs text-muted-foreground">Recovery Efficiency</div>
                        </div>
                      </div>

                      {/* Case history */}
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5" /> Case History
                        </h4>
                        <div className="space-y-1.5">
                          {profile.cases.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => navigate(`/insurer-portal/recovery/${c.id}`)}
                              className="w-full rounded-lg border border-border p-3 text-left hover:border-violet-500/30 hover:bg-violet-500/5 transition-colors flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-foreground">
                                    {c.claimNumber ?? `RC-${c.id}`}
                                  </span>
                                  <span className={`text-xs font-medium ${STATUS_COLOR[c.status] ?? "text-muted-foreground"}`}>
                                    {STATUS_LABEL[c.status] ?? c.status}
                                  </span>
                                </div>
                                {c.incidentDate && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    Incident: {new Date(c.incidentDate).toLocaleDateString("en-ZA")}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {c.approvedSettlementAmount != null && (
                                  <div className="text-right hidden sm:block">
                                    <div className="text-xs font-medium text-foreground">
                                      {formatCurrency(c.approvedSettlementAmount, c.currencyCode ?? "ZAR")}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Quantum</div>
                                  </div>
                                )}
                                {c.recoveryPotentialScore != null && (
                                  <div className="text-right">
                                    <div className={`text-xs font-bold ${
                                      c.recoveryPotentialScore >= 70 ? "text-emerald-400" :
                                      c.recoveryPotentialScore >= 40 ? "text-amber-400" : "text-rose-400"
                                    }`}>{c.recoveryPotentialScore}</div>
                                    <div className="text-xs text-muted-foreground">RPS</div>
                                  </div>
                                )}
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            </button>
                          ))}
                          {profile.totalCases > profile.cases.length && (
                            <p className="text-xs text-muted-foreground text-center pt-1">
                              Showing {profile.cases.length} of {profile.totalCases} cases — open the individual case for full history
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </InsurerPortalLayout>
  );
}
