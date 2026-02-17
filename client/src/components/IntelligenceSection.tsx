import React from "react";
import { LucideIcon } from "lucide-react";

interface IntelligenceSectionProps {
  title: string;
  icon: LucideIcon;
  insight?: string;
  children: React.ReactNode;
}

export function IntelligenceSection({ 
  title, 
  icon: Icon, 
  insight, 
  children 
}: IntelligenceSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        </div>
      </div>
      
      {insight && (
        <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">💡 Insight:</span> {insight}
          </p>
        </div>
      )}
      
      <div className="space-y-6">
        {children}
      </div>
    </section>
  );
}
