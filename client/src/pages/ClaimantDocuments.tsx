/**
 * ClaimantDocuments.tsx — SR-M01
 * ─────────────────────────────────────────────────────────────────────────────
 * Claimant portal documents page at /claimant/documents.
 * Shows all documents uploaded across all of the claimant's claims.
 * Reuses the existing trpc.claims.myClaims query and DocumentList component.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { FileText, ExternalLink, ChevronRight, Loader2, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PortalHeroBand } from "@/components/PortalHeroBand";

export default function ClaimantDocuments() {
  const [, setLocation] = useLocation();

  // Fetch all claimant's claims — documents are stored as JSON on each claim
  const { data: claims = [], isLoading } = trpc.claims.myClaims.useQuery();

  // Flatten all documents from all claims into a single list
  const allDocuments = claims.flatMap((claim: any) => {
    const docs: any[] = [];
    // supportingDocuments field — JSON array of uploaded document URLs
    if (claim.supportingDocuments) {
      try {
        const parsed = JSON.parse(claim.supportingDocuments);
        if (Array.isArray(parsed)) {
          parsed.forEach((doc: any) => {
            docs.push({
              claimId: claim.id,
              claimNumber: claim.claimNumber,
              type: doc.type || "document",
              url: doc.url || doc,
              name: doc.name || doc.filename || `Document`,
              uploadedAt: doc.uploadedAt || claim.createdAt,
            });
          });
        }
      } catch {
        // ignore parse errors
      }
    }
    // damagePhotos field
    if (claim.damagePhotos) {
      try {
        const photos = JSON.parse(claim.damagePhotos);
        if (Array.isArray(photos)) {
          photos.forEach((photo: any) => {
            docs.push({
              claimId: claim.id,
              claimNumber: claim.claimNumber,
              type: "photo",
              url: photo.url || photo,
              name: photo.name || photo.filename || `Photo`,
              uploadedAt: photo.uploadedAt || claim.createdAt,
            });
          });
        }
      } catch {
        // ignore
      }
    }
    return docs;
  });

  const typeLabel: Record<string, string> = {
    photo: "Photo",
    document: "Document",
    pdf: "PDF",
    id: "ID Document",
    police_report: "Police Report",
    other: "Other",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F8F6", fontFamily: "Inter, sans-serif" }}>
      <PortalHeroBand
        portalName="Claimant Portal"
        title="My Documents"
        subtitle="All files and photos uploaded across your claims"
        kpis={[
          { label: "Total Documents", value: allDocuments.length, delta: "Across all claims", up: null, headline: true },
          { label: "Claims with Docs", value: claims.filter((c: any) => c.supportingDocuments || c.damagePhotos).length, delta: "of your claims", up: null },
        ]}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <Loader2 style={{ width: 32, height: 32, margin: "0 auto 8px", color: "#9CA3AF" }} className="animate-spin" />
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Loading documents…</p>
          </div>
        ) : allDocuments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 8, border: "1px solid #E5E7EB" }}>
            <FolderOpen style={{ width: 48, height: 48, margin: "0 auto 12px", color: "#D1D5DB" }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: "#111", marginBottom: 6 }}>No documents yet</p>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>
              Documents uploaded during claim submission will appear here.
            </p>
            <Button variant="outline" onClick={() => setLocation("/claimant/submit-claim")}>
              Submit a Claim
            </Button>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Document</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claim</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {allDocuments.map((doc: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #F9FAFB" }}>
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FileText style={{ width: 14, height: 14, color: "#9CA3AF" }} />
                        <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{doc.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <button
                        onClick={() => setLocation(`/claims/${doc.claimId}`)}
                        style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "#059669", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {doc.claimNumber || `#${doc.claimId}`}
                        <ChevronRight style={{ width: 10, height: 10 }} />
                      </button>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <Badge variant="outline" style={{ fontSize: 11 }}>
                        {typeLabel[doc.type] || doc.type}
                      </Badge>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#9CA3AF" }}>
                      {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {doc.url && typeof doc.url === "string" && doc.url.startsWith("http") ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#059669", textDecoration: "none" }}
                        >
                          <ExternalLink style={{ width: 12, height: 12 }} />
                          View
                        </a>
                      ) : (
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
