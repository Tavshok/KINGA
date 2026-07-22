/**
 * DocumentList Component
 *
 * Displays ALL documents associated with a claim:
 *   1. The original uploaded PDF (from ingestion_documents via claims.sourceDocumentId)
 *   2. Any supplementary files manually uploaded via the app (from claim_documents)
 *
 * Uses documents.allByClaim which merges both tables so the original PDF is never invisible.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Download,
  Trash2,
  Eye,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

interface DocumentListProps {
  claimId: number;
}

export default function DocumentList({ claimId }: DocumentListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [selectedDocSource, setSelectedDocSource] = useState<string | null>(null);

  // Use allByClaim which merges ingestion_documents + claim_documents
  const { data: documents, isLoading, refetch } = trpc.documents.allByClaim.useQuery({ claimId });

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("Document deleted successfully");
      refetch();
      setDeleteDialogOpen(false);
      setSelectedDocId(null);
      setSelectedDocSource(null);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return <ImageIcon className="h-8 w-8 text-primary/80" />;
    }
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    }
    return <FileText className="h-8 w-8 text-gray-700 dark:text-gray-400" />;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      claim_form: "Claim Form",
      damage_image: "Damage Image",
      damage_photo: "Damage Photo",
      repair_quote: "Repair Quote",
      assessor_report: "Assessor Report",
      supporting_evidence: "Supporting Evidence",
      invoice: "Invoice",
      police_report: "Police Report",
      medical_report: "Medical Report",
      insurance_policy: "Insurance Policy",
      correspondence: "Correspondence",
      unknown: "Document",
      other: "Other",
    };
    return labels[category] || category;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleDownload = (fileUrl: string) => {
    window.open(fileUrl, "_blank");
  };

  const handleDelete = (documentId: number, source: string) => {
    if (source === "ingestion_document") {
      toast.error("The original uploaded document cannot be deleted from here.");
      return;
    }
    setSelectedDocId(documentId);
    setSelectedDocSource(source);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedDocId && selectedDocSource === "claim_document") {
      deleteMutation.mutate({ documentId: selectedDocId });
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Loading documents...</p>
      </Card>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">No documents uploaded yet</p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => (
          <Card key={`${doc.source}-${doc.id}`} className="p-4 hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-3 mb-3">
              {getFileIcon(doc.mimeType)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h4 className="font-medium truncate text-sm">
                    {doc.documentTitle || doc.fileName}
                  </h4>
                  {doc.source === "ingestion_document" && (
                    <Badge variant="secondary" className="text-xs shrink-0 gap-1">
                      <Upload className="h-3 w-3" />
                      Original
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {getCategoryLabel(doc.documentCategory)}
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mb-3 space-y-1">
              <p>Size: {formatFileSize(doc.fileSize)}</p>
              <p>
                Uploaded:{" "}
                {doc.createdAt
                  ? format(new Date(doc.createdAt), "MMM d, yyyy 'at' h:mm a")
                  : "—"}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleDownload(doc.fileUrl)}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>

              {(doc.mimeType.startsWith("image/") || doc.mimeType === "application/pdf") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(doc.fileUrl, "_blank")}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}

              {doc.source === "claim_document" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(doc.id, doc.source)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
