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
            style={{ background: 'var(--fp-success-bg)', border: '1px solid var(--fp-success-border)' }}
          >
            <Icon className="h-5 w-5" style={{ color: 'var(--success)' }} />
          </div>
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: 'var(--foreground)' }}
          >
            {title}
          </h2>
        </div>
        <div
          className="h-px flex-1 mx-4"
          style={{ background: 'linear-gradient(to right, var(--border), transparent)' }}
        />
      </div>

      {/* Insight Banner */}
      {insight && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'var(--fp-success-bg)',
            border: '1px solid var(--fp-success-border)',
            color: 'var(--success)',
          }}
        >
          <span className="font-semibold" style={{ color: 'var(--success)' }}>
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
