import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import KingaLogo from "@/components/KingaLogo";
import { LogOut, ArrowLeft, Bell } from "lucide-react";
import { useLocation } from "wouter";
import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * KINGA Dashboard Layout Component
 * 
 * Provides consistent branding and layout across all dashboards:
 * - KINGA brand colors (teal/navy gradient)
 * - Pattern background inspired by African shield
 * - Modern header with user profile and notifications
 * - Responsive grid for metrics cards
 * - Smooth animations and hover effects
 */

interface KingaDashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backPath?: string;
  actions?: ReactNode;
}

export default function KingaDashboardLayout({
  children,
  title,
  subtitle,
  showBackButton = false,
  backPath = "/portal-hub",
  actions,
}: KingaDashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Fetch unread notifications count
  const { data: notifications } = trpc.notifications.list.useQuery(
    { limit: 100 },
    { refetchInterval: 30000 }
  );
  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

  return (
    <div className="min-h-screen pattern-bg">
      {/* Header with KINGA gradient */}
      <header className="bg-white/90 dark:bg-card/90 backdrop-blur-md border-b border-primary/10 shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Logo and Title */}
            <div className="flex items-center gap-4">
              {showBackButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation(backPath)}
                  className="btn-hover"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="flex items-center gap-3">
                <KingaLogo size="sm" showText={false} />
                <div>
                  <h1 className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Actions, Notifications, User Profile */}
            <div className="flex items-center gap-3">
              {actions}

              {/* Dark / Light Mode Toggle */}
              <ThemeToggle />

              {/* Notifications Bell */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/notifications")}
                className="relative btn-hover"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs gradient-primary border-0">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </Button>

              {/* User Profile */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                <div className="text-right">
                  <p className="text-sm font-medium text-secondary">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                </div>
              </div>

              {/* Logout Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => logout()}
                className="btn-hover border-primary/20 hover:border-primary/40"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-primary/10 bg-white/50 dark:bg-card/50 backdrop-blur-sm mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>© 2026 KINGA. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLocation("/portal-hub")}
                className="hover:text-primary transition-colors"
              >
                Switch Portal
              </button>
              <button className="hover:text-primary transition-colors">
                Help & Support
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * KINGA Metric Card Component
 * 
 * Reusable metric display card with KINGA branding
 */
interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  variant?: "primary" | "secondary" | "accent" | "success" | "warning";
  onClick?: () => void;
}

export function KingaMetricCard({
  title,
  value,
  icon,
  trend,
  variant = "primary",
  onClick,
}: MetricCardProps) {
  const gradientClasses = {
    primary: "gradient-primary",
    secondary: "gradient-secondary",
    accent: "gradient-accent",
    success: "bg-success",
    warning: "bg-warning",
  };

  return (
    <Card
      className={`card-hover bg-white/80 dark:bg-card/80 backdrop-blur-sm overflow-hidden relative ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={onClick}
    >
      {/* Gradient accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${gradientClasses[variant]}`} />

      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold text-secondary">{value}</p>
            {trend && (
              <p
                className={`text-sm mt-2 ${
                  trend.isPositive ? "text-success" : "text-destructive"
                }`}
              >
                {trend.isPositive ? "↑" : "↓"} {trend.value}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${gradientClasses[variant]} shadow-lg`}>
            <div className="text-white">{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * KINGA Section Header Component
 * 
 * Consistent section headers with KINGA styling
 */
interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function KingaSectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-2xl font-bold text-secondary">{title}</h2>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
