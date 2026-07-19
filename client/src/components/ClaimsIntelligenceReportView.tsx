/**
 * ClaimsIntelligenceReportView.tsx
 *
 * Renders the KINGA Claims Intelligence Report (claim.intelligence) inline
 * by fetching the server-generated HTML via the reportingEngine.previewHtml
 * tRPC query and displaying it in a sandboxed iframe.
 *
 * This approach keeps the server-side generator as the single source of truth
 * and avoids duplicating the report layout in React.
 */

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertTriangle } from "lucide-react";

interface ClaimsIntelligenceReportViewProps {
  claimId: number;
}

export function ClaimsIntelligenceReportView({ claimId }: ClaimsIntelligenceReportViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data, isLoading, error } = trpc.reportingEngine.previewHtml.useQuery(
    { reportKey: "claim.intelligence", claimId },
    { enabled: claimId > 0, staleTime: 5 * 60 * 1000 }
  );

  // Write the HTML into the iframe once loaded
  useEffect(() => {
    if (!data?.html || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(data.html);
    doc.close();
  }, [data?.html]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 320,
        gap: 12,
        color: '#6b7280',
      }}>
        <Loader2 style={{ width: 28, height: 28, animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 13, margin: 0 }}>Generating Claims Intelligence Report…</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        gap: 8,
        color: '#dc2626',
        padding: '24px',
        border: '1px solid #fecaca',
        borderRadius: 8,
        background: '#fef2f2',
      }}>
        <AlertTriangle style={{ width: 24, height: 24 }} />
        <p style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>Failed to load Claims Intelligence Report</p>
        <p style={{ fontSize: 12, margin: 0, color: '#6b7280' }}>{error.message}</p>
      </div>
    );
  }

  if (!data?.html) return null;

  return (
    <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <iframe
        ref={iframeRef}
        title="KINGA Claims Intelligence Report"
        style={{
          width: '100%',
          minHeight: '1200px',
          border: 'none',
          display: 'block',
        }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
