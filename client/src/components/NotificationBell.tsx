/**
 * NotificationBell — Epic 5-B
 *
 * Reusable bell icon with unread badge.
 * Clicking navigates to the full Notification Centre at /notifications.
 * Used in all portal layouts.
 */

import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  className?: string;
  size?: "sm" | "md";
}

export function NotificationBell({ className, size = "md" }: NotificationBellProps) {
  const [, setLocation] = useLocation();
  const { data } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const count = data?.count ?? 0;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative", btnSize, className)}
      onClick={() => setLocation("/notifications")}
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
    >
      <Bell className={iconSize} />
      {count > 0 && (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full bg-red-500 text-white font-bold leading-none",
            count > 9 ? "h-4 w-4 text-[9px]" : "h-3.5 w-3.5 text-[8px]"
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Button>
  );
}
