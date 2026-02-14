import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = ""
}: EmptyStateProps) {
  return (
    <Card className={`p-12 ${className}`}>
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>

        {/* Text Content */}
        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Actions */}
        {(actionLabel || secondaryActionLabel) && (
          <div className="flex items-center gap-3 pt-2">
            {actionLabel && onAction && (
              <Button onClick={onAction} className="bg-emerald-600 hover:bg-emerald-700">
                {actionLabel}
              </Button>
            )}
            {secondaryActionLabel && onSecondaryAction && (
              <Button onClick={onSecondaryAction} variant="outline">
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
