/**
 * DocumentList Component
 * 
 * Displays all documents associated with a claim in a grid layout.
 * Supports document preview, download, and deletion with role-based access control.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  const { data: documents, isLoading, refetch } = trpc.documents.byClaim.useQuery({ claimId });
  
  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("Document deleted successfully");
      refetch();
      setDeleteDialogOpen(false);
      setSelectedDocId(null);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="h-8 w-8 text-primary/80" />;
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    }
    return <FileText className="h-8 w-8 text-gray-500" />;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      damage_photo: "Damage Photo",
      repair_quote: "Repair Quote",
      invoice: "Invoice",
      police_report: "Police Report",
      medical_report: "Medical Report",
      insurance_policy: "Insurance Policy",
      correspondence: "Correspondence",
      other: "Other",
    };
    return labels[category] || category;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleDownload = (fileUrl: string, fileName: string) => {
    // Open in new tab for download
    window.open(fileUrl, '_blank');
  };

  const handleDelete = (documentId: number) => {
    setSelectedDocId(documentId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedDocId) {
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
        <p className="text-center text-muted-foreground">
          No documents uploaded yet
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => (
          <Card key={doc.id} className="p-4 hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-3 mb-3">
              {getFileIcon(doc.mimeType)}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">
                  {doc.documentTitle || doc.fileName}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {getCategoryLabel(doc.documentCategory)}
                </p>
              </div>
            </div>

            {doc.documentDescription && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {doc.documentDescription}
              </p>
            )}

            <div className="text-xs text-muted-foreground mb-3 space-y-1">
              <p>Size: {formatFileSize(doc.fileSize)}</p>
              <p>
                Uploaded: {format(new Date(doc.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleDownload(doc.fileUrl, doc.fileName)}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              
              {doc.mimeType.startsWith('image/') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(doc.fileUrl, '_blank')}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(doc.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
