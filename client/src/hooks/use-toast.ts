/**
 * use-toast compatibility shim
 * Wraps sonner's toast for components that use the shadcn/ui useToast API.
 */
import { toast as sonnerToast } from "sonner";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const toast = ({ title, description, variant }: ToastOptions) => {
    const message = title || description || "";
    const detail = title && description ? description : undefined;
    if (variant === "destructive") {
      sonnerToast.error(message, detail ? { description: detail } : undefined);
    } else {
      sonnerToast.success(message, detail ? { description: detail } : undefined);
    }
  };
  return { toast };
}
