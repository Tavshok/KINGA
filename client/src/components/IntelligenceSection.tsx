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
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ background: 'oklch(0.55 0.18 145 / 0.15)', border: '1px solid oklch(0.55 0.18 145 / 0.3)' }}
          >
            <Icon className="h-5 w-5" style={{ color: 'oklch(0.65 0.18 145)' }} />
          </div>
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: 'oklch(0.88 0.008 250)' }}
          >
            {title}
          </h2>
        </div>
        <div
          className="h-px flex-1 mx-4"
          style={{ background: 'linear-gradient(to right, oklch(0.28 0.02 250), transparent)' }}
        />
      </div>

      {/* Insight Banner */}
      {insight && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'oklch(0.55 0.18 145 / 0.08)',
            border: '1px solid oklch(0.55 0.18 145 / 0.25)',
            color: 'oklch(0.75 0.12 145)',
          }}
        >
          <span className="font-semibold" style={{ color: 'oklch(0.65 0.18 145)' }}>
            ↗ Insight:{' '}
          </span>
          {insight}
        </div>
      )}

      <div className="space-y-6">
        {children}
      </div>
    </section>
  );
}
