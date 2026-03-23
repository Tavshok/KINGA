/**
 * Workflow Templates Admin Page
 *
 * Allows insurer admins (claims_manager / executive / admin) to configure
 * the multi-layer approval chain for their tenant.
 *
 * Features:
 * - List all workflow templates for the tenant
 * - Create a new template with ordered stages
 * - Edit existing templates (add/remove/reorder stages)
 * - Set a template as the default
 * - Activate / deactivate templates
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  Star,
  Layers,
  AlertCircle,
  Loader2,
  GripVertical,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

const ROLE_KEYS = [
  "claims_processor",
  "internal_assessor",
  "external_assessor",
  "risk_manager",
  "claims_manager",
  "executive",
  "underwriter",
] as const;

type RoleKey = (typeof ROLE_KEYS)[number];

const ROLE_LABELS: Record<RoleKey, string> = {
  claims_processor: "Claims Processor",
  internal_assessor: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  claims_manager: "Claims Manager",
  executive: "Executive / GM",
  underwriter: "Underwriter",
};

const ROLE_COLORS: Record<RoleKey, string> = {
  claims_processor: "bg-blue-100 text-blue-800",
  internal_assessor: "bg-purple-100 text-purple-800",
  external_assessor: "bg-orange-100 text-orange-800",
  risk_manager: "bg-yellow-100 text-yellow-800",
  claims_manager: "bg-green-100 text-green-800",
  executive: "bg-red-100 text-red-800",
  underwriter: "bg-indigo-100 text-indigo-800",
};

interface WorkflowStage {
  stage_order: number;
  stage_name: string;
  role_key: RoleKey;
  required: boolean;
  can_reject: boolean;
  can_request_info: boolean;
  notes_required: boolean;
  description?: string;
}

const EMPTY_STAGE: WorkflowStage = {
  stage_order: 1,
  stage_name: "",
  role_key: "claims_processor",
  required: true,
  can_reject: true,
  can_request_info: true,
  notes_required: false,
  description: "",
};

// ─── Stage Editor ─────────────────────────────────────────────────────────────

function StageEditor({
  stage,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  stage: WorkflowStage;
  index: number;
  total: number;
  onChange: (updated: WorkflowStage) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold text-muted-foreground w-6">
          #{index + 1}
        </span>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Stage Name</Label>
            <Input
              value={stage.stage_name}
              onChange={(e) => onChange({ ...stage, stage_name: e.target.value })}
              placeholder="e.g. Claims Processor Review"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Role Required</Label>
            <Select
              value={stage.role_key}
              onValueChange={(v) => onChange({ ...stage, role_key: v as RoleKey })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_KEYS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveUp}
            disabled={index === 0}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onMoveDown}
            disabled={index === total - 1}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-xs">Description (optional)</Label>
        <Input
          value={stage.description ?? ""}
          onChange={(e) => onChange({ ...stage, description: e.target.value })}
          placeholder="Brief description of what this stage reviews"
          className="h-8 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={stage.required}
            onCheckedChange={(v) => onChange({ ...stage, required: v })}
            className="scale-75"
          />
          <span>Required</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={stage.can_reject}
            onCheckedChange={(v) => onChange({ ...stage, can_reject: v })}
            className="scale-75"
          />
          <span>Can Reject</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={stage.can_request_info}
            onCheckedChange={(v) => onChange({ ...stage, can_request_info: v })}
            className="scale-75"
          />
          <span>Can Request Info</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={stage.notes_required}
            onCheckedChange={(v) => onChange({ ...stage, notes_required: v })}
            className="scale-75"
          />
          <span>Notes Required</span>
        </label>
      </div>
    </div>
  );
}

// ─── Template Form Dialog ─────────────────────────────────────────────────────

function TemplateFormDialog({
  trigger,
  initialName = "",
  initialDescription = "",
  initialStages,
  initialIsDefault = false,
  onSubmit,
  isLoading,
  title,
}: {
  trigger: React.ReactNode;
  initialName?: string;
  initialDescription?: string;
  initialStages?: WorkflowStage[];
  initialIsDefault?: boolean;
  onSubmit: (data: {
    name: string;
    description: string;
    stages: WorkflowStage[];
    is_default: boolean;
  }) => void;
  isLoading: boolean;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [stages, setStages] = useState<WorkflowStage[]>(
    initialStages ?? [
      { ...EMPTY_STAGE, stage_order: 1, stage_name: "Claims Processor Review", role_key: "claims_processor" },
      { ...EMPTY_STAGE, stage_order: 2, stage_name: "Internal Assessor Assessment", role_key: "internal_assessor", can_reject: true },
      { ...EMPTY_STAGE, stage_order: 3, stage_name: "Claims Manager Approval", role_key: "claims_manager", can_reject: true },
    ]
  );

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      { ...EMPTY_STAGE, stage_order: prev.length + 1 },
    ]);
  };

  const updateStage = (index: number, updated: WorkflowStage) => {
    setStages((prev) => prev.map((s, i) => (i === index ? updated : s)));
  };

  const removeStage = (index: number) => {
    setStages((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, stage_order: i + 1 }))
    );
  };

  const moveStage = (index: number, direction: "up" | "down") => {
    setStages((prev) => {
      const arr = [...prev];
      const swapIdx = direction === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return arr;
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      return arr.map((s, i) => ({ ...s, stage_order: i + 1 }));
    });
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (stages.length === 0) return;
    onSubmit({ name, description, stages, is_default: isDefault });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Define the ordered approval stages for this workflow template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Template Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Claims Workflow"
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
            <Label>Set as default template for this tenant</Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Approval Stages ({stages.length})</Label>
              <Button variant="outline" size="sm" onClick={addStage}>
                <Plus className="h-3 w-3 mr-1" /> Add Stage
              </Button>
            </div>
            {stages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No stages defined. Add at least one stage.
              </p>
            )}
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <StageEditor
                  key={i}
                  stage={stage}
                  index={i}
                  total={stages.length}
                  onChange={(updated) => updateStage(i, updated)}
                  onRemove={() => removeStage(i)}
                  onMoveUp={() => moveStage(i, "up")}
                  onMoveDown={() => moveStage(i, "down")}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !name.trim() || stages.length === 0}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onSetDefault,
  onToggleActive,
}: {
  template: {
    id: number;
    name: string;
    description: string | null;
    isDefault: number;
    isActive: number;
    stages: WorkflowStage[];
    createdAt: string;
  };
  onSetDefault: (id: number) => void;
  onToggleActive: (id: number, active: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const updateTemplate = trpc.approval.updateTemplate.useMutation({
    onSuccess: () => utils.approval.getTemplates.invalidate(),
  });

  const requiredCount = template.stages.filter((s) => s.required).length;

  return (
    <Card className={`transition-all ${template.isActive ? "" : "opacity-60"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{template.name}</CardTitle>
              {template.isDefault === 1 && (
                <Badge className="bg-amber-100 text-amber-800 text-xs">
                  <Star className="h-3 w-3 mr-1" /> Default
                </Badge>
              )}
              {template.isActive === 0 && (
                <Badge variant="secondary" className="text-xs">Inactive</Badge>
              )}
            </div>
            {template.description && (
              <CardDescription className="text-xs">{template.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {template.isDefault !== 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => onSetDefault(template.id)}
              >
                <Star className="h-3 w-3 mr-1" /> Set Default
              </Button>
            )}
            <Switch
              checked={template.isActive === 1}
              onCheckedChange={(v) => onToggleActive(template.id, v)}
              className="scale-75"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {template.stages.length} stages
          </span>
          <span>{requiredCount} required</span>
          <span>{template.stages.length - requiredCount} optional</span>
        </div>

        {/* Stage pipeline visualization */}
        <div className="flex flex-wrap gap-1">
          {template.stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-1">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ROLE_COLORS[stage.role_key] ?? "bg-gray-100 text-gray-800"
                } ${!stage.required ? "opacity-60 border border-dashed border-current" : ""}`}
                title={stage.description ?? stage.stage_name}
              >
                {stage.stage_name || ROLE_LABELS[stage.role_key]}
              </span>
              {i < template.stages.length - 1 && (
                <span className="text-muted-foreground text-xs">→</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkflowTemplates() {
  const utils = trpc.useUtils();

  const { data: templates, isLoading, error } = trpc.approval.getTemplates.useQuery();

  const createTemplate = trpc.approval.createTemplate.useMutation({
    onSuccess: () => {
      utils.approval.getTemplates.invalidate();
    },
    onError: (err) => alert(`Failed to create template: ${err.message}`),
  });

  const updateTemplate = trpc.approval.updateTemplate.useMutation({
    onSuccess: () => {
      utils.approval.getTemplates.invalidate();
    },
    onError: (err) => alert(`Failed to update template: ${err.message}`),
  });

  const handleCreate = (data: {
    name: string;
    description: string;
    stages: WorkflowStage[];
    is_default: boolean;
  }) => {
    createTemplate.mutate(data);
  };

  const handleSetDefault = (id: number) => {
    updateTemplate.mutate({ template_id: id, is_default: true });
  };

  const handleToggleActive = (id: number, active: boolean) => {
    updateTemplate.mutate({ template_id: id, is_active: active });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Workflow Templates</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure the multi-layer approval chain for your organisation. Each template
              defines an ordered sequence of roles that must sign off on a claim before it
              can be exported or settled.
            </p>
          </div>
          <TemplateFormDialog
            title="Create Workflow Template"
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" /> New Template
              </Button>
            }
            onSubmit={handleCreate}
            isLoading={createTemplate.isPending}
          />
        </div>

        {/* Info banner */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 space-y-1">
                <p className="font-medium">How workflow templates work</p>
                <p>
                  The <strong>default</strong> template is applied to all new claims for this
                  tenant. Each stage requires a user with the matching insurer role to approve,
                  reject, or return the claim before it advances. Claims cannot be exported
                  until all required stages are complete.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates list */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-destructive text-sm">
                Failed to load templates: {error.message}
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && templates && templates.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No workflow templates configured</p>
              <p className="text-muted-foreground text-sm mt-1">
                Create your first template to define the approval chain for claims.
              </p>
              <TemplateFormDialog
                title="Create Workflow Template"
                trigger={
                  <Button className="mt-4">
                    <Plus className="h-4 w-4 mr-2" /> Create First Template
                  </Button>
                }
                onSubmit={handleCreate}
                isLoading={createTemplate.isPending}
              />
            </CardContent>
          </Card>
        )}

        {templates && templates.length > 0 && (
          <div className="space-y-4">
            {/* Default template first */}
            {templates
              .slice()
              .sort((a, b) => b.isDefault - a.isDefault)
              .map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onSetDefault={handleSetDefault}
                  onToggleActive={handleToggleActive}
                />
              ))}
          </div>
        )}

        {/* Role legend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Role Key Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {ROLE_KEYS.map((r) => (
                <span
                  key={r}
                  className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[r]}`}
                >
                  {ROLE_LABELS[r]}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Users must have their <strong>Insurer Role</strong> set to the matching key to
              act on that stage. Admins can act on any stage.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
