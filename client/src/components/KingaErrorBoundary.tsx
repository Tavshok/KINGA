import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Global error boundary — wraps the entire app.
 * When an unexpected error occurs, KINGA catches it and shows a branded
 * recovery screen instead of a blank crash page.
 */
export class KingaErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console for debugging; in production this could go to an error
    // reporting service
    console.error("[KINGA Error Boundary]", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-6">
          {/* KINGA wordmark */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl font-black tracking-tight text-emerald-500">KINGA</span>
          </div>

          {/* Icon */}
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-5">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              KINGA encountered an unexpected problem on this page.
              Don't worry — your claims data is safe. Our system has
              logged the issue and will investigate.
            </p>
          </div>

          {/* Subtle error detail for debugging */}
          {this.state.errorMessage && (
            <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-left">
              <p className="text-xs font-mono text-muted-foreground break-all">
                {this.state.errorMessage}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={this.handleReload}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Reload page
            </Button>
            <Button
              variant="outline"
              onClick={this.handleHome}
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              Back to dashboard
            </Button>
          </div>

          {/* Footer note */}
          <p className="text-xs text-muted-foreground">
            If this keeps happening, contact your KINGA system administrator.
          </p>
        </div>
      </div>
    );
  }
}
