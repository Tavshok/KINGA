/**
 * Epic 5-A — Platform Navigation
 * UniversalSearchModal — full-screen command-palette-style search modal.
 *
 * Features:
 * - Debounced search (300ms) via trpc.globalSearch.search
 * - Keyboard navigation (↑↓ to move, Enter to navigate, Esc to close)
 * - Recent searches from trpc.globalSearch.getRecentSearches
 * - Result click analytics via trpc.globalSearch.recordClick
 * - Permission-aware: results are filtered server-side by role
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Clock, X, Loader2, SearchX } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SearchResultCard, type SearchResultItem } from "./SearchResultCard";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

export function UniversalSearchModal({ open, onClose }: Props) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Reset highlight when results change
  useEffect(() => { setHighlightedIndex(-1); }, [debouncedQuery]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  // Search query
  const searchEnabled = debouncedQuery.length >= MIN_QUERY_LEN;
  const { data: searchData, isFetching } = trpc.globalSearch.search.useQuery(
    { query: debouncedQuery, limit: 8 },
    { enabled: searchEnabled, staleTime: 10_000 }
  );

  // Recent searches
  const { data: recentSearches } = trpc.globalSearch.getRecentSearches.useQuery(
    undefined,
    { staleTime: 30_000 }
  );

  // Analytics mutation
  const recordClick = trpc.globalSearch.recordClick.useMutation();

  // Clear history mutation
  const clearHistory = trpc.globalSearch.clearHistory.useMutation({
    onSuccess: () => utils.globalSearch.getRecentSearches.invalidate(),
  });

  const results: SearchResultItem[] = searchData?.results ?? [];

  const handleSelect = useCallback((item: SearchResultItem) => {
    recordClick.mutate({ query: debouncedQuery || query, clickedType: item.type, clickedId: item.id });
    onClose();
    navigate(item.href);
  }, [debouncedQuery, query, navigate, onClose, recordClick]);

  const handleRecentSelect = (q: string) => {
    setQuery(q);
    setDebouncedQuery(q);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightedIndex]);
    }
  };

  const showRecent = !searchEnabled && (recentSearches?.length ?? 0) > 0;
  const showResults = searchEnabled;
  const showEmpty = searchEnabled && !isFetching && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden"
        aria-label="Universal Search"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search claims, vehicles, inspections, assets, fleets, drivers…"
            className="border-0 shadow-none focus-visible:ring-0 text-sm h-8 p-0"
          />
          {isFetching && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />}
          {query && !isFetching && (
            <button
              type="button"
              onClick={() => { setQuery(""); setDebouncedQuery(""); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {/* Recent searches */}
          {showRecent && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Searches</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-xs text-muted-foreground px-1"
                  onClick={() => clearHistory.mutate()}
                >
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches?.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleRecentSelect(r.query)}
                    className="flex items-center gap-1 text-xs bg-muted hover:bg-accent rounded-full px-2.5 py-1 transition-colors"
                  >
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span>{r.query}</span>
                    {r.resultCount > 0 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 ml-0.5">
                        {r.resultCount}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search results */}
          {showResults && results.length > 0 && (
            <div className="p-2">
              {/* Group by type */}
              {(["claim", "vehicle", "inspection", "asset", "fleet", "driver", "panel_beater", "assessor", "report", "user"] as const).map(type => {
                const group = results.filter(r => r.type === type);
                if (!group.length) return null;
                const typeLabel = type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + "s";
                return (
                  <div key={type} className="mb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1">
                      {typeLabel}
                    </p>
                    {group.map(item => {
                      const globalIdx = results.indexOf(item);
                      return (
                        <SearchResultCard
                          key={`${item.type}-${item.id}`}
                          item={item}
                          onSelect={handleSelect}
                          isHighlighted={globalIdx === highlightedIndex}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No results for &ldquo;{debouncedQuery}&rdquo;</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try a claim number, registration, VIN, or name.
              </p>
            </div>
          )}

          {/* Prompt to type */}
          {!searchEnabled && !showRecent && (
            <div className="py-10 text-center">
              <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Type at least 2 characters to search
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Claims · Vehicles · Inspections · Assets · Fleets · Drivers · Reports
              </p>
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="flex items-center gap-4 px-4 py-2 text-[10px] text-muted-foreground">
          <span><kbd className="font-mono bg-muted px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono bg-muted px-1 rounded">↵</kbd> open</span>
          <span><kbd className="font-mono bg-muted px-1 rounded">Esc</kbd> close</span>
          {searchData && (
            <span className="ml-auto">{searchData.totalCount} result{searchData.totalCount !== 1 ? "s" : ""}</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
