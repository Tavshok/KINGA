import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function RoleSwitcher() {
  const { user } = useAuth();
  const switchRole = trpc.auth.switchRole.useMutation();

  // Only show for admin users
  if (!user || user.role !== "admin") {
    return null;
  }

  const handleRoleChange = async (newRole: string) => {
    try {
      await switchRole.mutateAsync({ 
        role: newRole as "insurer" | "assessor" | "panel_beater" | "claimant" | "admin" 
      });
      
      toast.success(`Role switched to ${newRole}`, {
        description: "Refreshing page...",
      });
      
      // Reload page to reflect new role
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.error("Failed to switch role", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <RefreshCw className="h-4 w-4 text-muted-foreground" />
      <Select value={user.role} onValueChange={handleRoleChange}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Switch Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="insurer">Insurer</SelectItem>
          <SelectItem value="assessor">Assessor</SelectItem>
          <SelectItem value="panel_beater">Panel Beater</SelectItem>
          <SelectItem value="claimant">Claimant</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">(Testing)</span>
    </div>
  );
}
