import { Button } from "@/components/ui/button";
import { LayoutGrid } from "lucide-react";
import { useLocation } from "wouter";

export default function RoleSwitcher() {
  const [, setLocation] = useLocation();

  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={() => setLocation("/portal-hub")}
      className="gap-2"
    >
      <LayoutGrid className="h-4 w-4" />
      Switch Portal
    </Button>
  );
}
