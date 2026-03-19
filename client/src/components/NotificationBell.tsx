import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { NotificationList } from "./NotificationList";

/**
 * NotificationBell Component
 * 
 * Displays a bell icon with unread notification count badge.
 * Opens a popover with notification list when clicked.
 * Automatically refreshes unread count every 30 seconds.
 */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  
  // Query unread notification count
  const { data: unreadData, refetch } = trpc.notifications.getUnreadCount.useQuery(
    undefined,
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      refetchIntervalInBackground: false,
    }
  );

  const unreadCount = (unreadData as any)?.count || 0;

  // Refetch when popover opens
  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <NotificationList onClose={() => setIsOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
