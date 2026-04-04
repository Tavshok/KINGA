/**
 * DocumentUpload Component
 * 
 * Provides drag-and-drop file upload functionality for claim documents.
 * Supports multiple file types (PDF, images, Word, Excel) with file size validation.
 * Includes document metadata input (title, description, category).
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Upload, X, FileText, Image as ImageIcon, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface DocumentUploadProps {
  claimId: number;
  onUploadComplete?: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPTED_FILE_TYPES = {
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

const DOCUMENT_CATEGORIES = [
  { value: "damage_photo", label: "Damage Photo" },
  { value: "repair_quote", label: "Repair Quote" },
  { value: "invoice", label: "Invoice" },
  { value: "police_report", label: "Police Report" },
  { value: "medical_report", label: "Medical Report" },
  { value: "insurance_policy", label: "Insurance Policy" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

export default function DocumentUpload({ claimId, onUploadComplete }: DocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [documentCategory, setDocumentCategory] = useState("other");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      // Reset form
      setSelectedFile(null);
      setDocumentTitle("");
      setDocumentDescription("");
      setDocumentCategory("other");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onUploadComplete?.();
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const handleFileSelect = (file: File) => {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be less than 10MB");
      return;
    }

    // Validate file type
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const isValidType = Object.values(ACCEPTED_FILE_TYPES)
      .flat()
      .some(ext => ext === fileExtension);

    if (!isValidType) {
      toast.error("Invalid file type. Please upload PDF, images, Word, or Excel files.");
      return;
    }

    setSelectedFile(file);
    // Auto-fill title if empty
    if (!documentTitle) {
      setDocumentTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;

      await uploadMutation.mutateAsync({
        claimId,
        fileName: selectedFile.name,
        fileData: base64Data,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
        documentTitle: documentTitle || selectedFile.name,
        documentDescription,
        documentCategory: documentCategory as any,
      });
    };

    reader.onerror = () => {
      toast.error("Failed to read file");
    };

    reader.readAsDataURL(selectedFile);
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
      return <ImageIcon className="h-8 w-8 text-primary/80" />;
    }
    if (['xls', 'xlsx'].includes(ext || '')) {
      return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    }
    return <FileText className="h-8 w-8 text-gray-700 dark:text-gray-400 dark:text-muted-foreground" />;
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Upload Document</h3>

      {/* Drag and drop area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-gray-300 dark:border-border hover:border-primary/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {selectedFile ? (
          <div className="flex items-center justify-center gap-4">
            {getFileIcon(selectedFile.name)}
            <div className="flex-1 text-left">
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div>
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              Drag and drop your file here
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse (PDF, images, Word, Excel - max 10MB)
            </p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Select File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={Object.keys(ACCEPTED_FILE_TYPES).join(",")}
              onChange={handleFileInputChange}
            />
          </div>
        )}
      </div>

      {/* Document metadata */}
      {selectedFile && (
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="documentTitle">Document Title</Label>
            <Input
              id="documentTitle"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder="Enter document title"
            />
          </div>

          <div>
            <Label htmlFor="documentCategory">Category</Label>
            <Select value={documentCategory} onValueChange={setDocumentCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="documentDescription">Description (Optional)</Label>
            <Textarea
              id="documentDescription"
              value={documentDescription}
              onChange={(e) => setDocumentDescription(e.target.value)}
              placeholder="Add any notes about this document"
              rows={3}
            />
          </div>

          <Button
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            className="w-full"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </div>
      )}
    </Card>
  );
}
