/**
 * Epic 5-A — Platform Navigation
 * GlobalSearchBar — compact trigger button for the UniversalSearchModal.
 *
 * Drop this into any portal layout header.
 * Keyboard shortcut: Ctrl+K / Cmd+K
 */
import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UniversalSearchModal } from "./UniversalSearchModal";
import { cn } from "@/lib/utils";

interface Props {
  /** Visual variant — "bar" renders a full-width search bar, "icon" renders a compact icon button */
  variant?: "bar" | "icon";
  className?: string;
  placeholder?: string;
}

export function GlobalSearchBar({
  variant = "bar",
  className,
  placeholder = "Search claims, vehicles, assets…",
}: Props) {
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (variant === "icon") {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className={cn("h-8 w-8", className)}
          aria-label="Open search"
          title="Search (Ctrl+K)"
        >
          <Search className="h-4 w-4" />
        </Button>
        <UniversalSearchModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 w-full max-w-sm px-3 py-1.5 rounded-md border border-input bg-background",
          "text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        aria-label="Open search"
        title="Search (Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{placeholder}</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded border border-border">
          <span>⌘</span><span>K</span>
        </kbd>
      </button>
      <UniversalSearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
