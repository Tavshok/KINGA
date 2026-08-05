/**
 * InspectionProjectsTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * M-05: Engineering project management — group inspections under named projects.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderOpen, Plus, CheckCircle2, Clock, PauseCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  active: { label: "Active", icon: Clock, color: "text-blue-600" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600" },
  on_hold: { label: "On Hold", icon: PauseCircle, color: "text-amber-600" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-600" },
};

// ─── Create Project Dialog ────────────────────────────────────────────────────

function CreateProjectDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    projectName: "",
    clientName: "",
    description: "",
    startDate: "",
    targetEndDate: "",
  });

  const utils = trpc.useUtils();
  const createProject = trpc.inspections.createProject.useMutation({
    onSuccess: (data) => {
      toast.success(`Project ${data.projectRef} created`);
      utils.inspections.listProjects.invalidate();
      setOpen(false);
      setForm({ projectName: "", clientName: "", description: "", startDate: "", targetEndDate: "" });
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectName.trim()) { toast.error("Project name is required"); return; }
    createProject.mutate({
      projectName: form.projectName,
      clientName: form.clientName || undefined,
      description: form.description || undefined,
      startDate: form.startDate || undefined,
      targetEndDate: form.targetEndDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Inspection Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Project Name *</Label>
            <Input value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} placeholder="e.g. Fleet Risk Survey Q3 2026" className="h-8 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Client Name</Label>
            <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="e.g. ABC Logistics Ltd" className="h-8 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="text-sm mt-1 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Target End Date</Label>
              <Input type="date" value={form.targetEndDate} onChange={e => setForm(f => ({ ...f, targetEndDate: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onStatusChange }: { project: any; onStatusChange: () => void }) {
  const utils = trpc.useUtils();
  const updateProject = trpc.inspections.updateProject.useMutation({
    onSuccess: () => {
      toast.success("Project updated");
      utils.inspections.listProjects.invalidate();
      onStatusChange();
    },
    onError: (e) => toast.error(e.message),
  });

  const config = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.active;
  const Icon = config.icon;
  const progress = project.totalInspections > 0
    ? Math.round((project.completedInspections / project.totalInspections) * 100)
    : 0;

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-muted-foreground">{project.projectRef}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.color}`}>
                <Icon className="h-3 w-3" />
                {config.label}
              </span>
            </div>
            <h3 className="text-sm font-semibold truncate">{project.projectName}</h3>
            {project.clientName && (
              <p className="text-xs text-muted-foreground mt-0.5">{project.clientName}</p>
            )}
            {project.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
            )}
          </div>
          <div className="flex-shrink-0">
            <Select
              value={project.status}
              onValueChange={(v: any) => updateProject.mutate({ id: project.id, status: v })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Inspections</span>
            <span>{project.completedInspections}/{project.totalInspections}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="flex gap-4 mt-2">
          {project.startDate && (
            <p className="text-xs text-muted-foreground">
              Start: {new Date(project.startDate).toLocaleDateString()}
            </p>
          )}
          {project.targetEndDate && (
            <p className="text-xs text-muted-foreground">
              Target: {new Date(project.targetEndDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InspectionProjectsTab() {
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "on_hold" | "cancelled" | "all">("all");

  const { data, isLoading, refetch } = trpc.inspections.listProjects.useQuery({
    status: statusFilter,
    limit: 20,
  });

  const projects = data?.projects ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            Inspection Projects
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Group and track multiple inspections under named projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All</SelectItem>
              <SelectItem value="active" className="text-xs">Active</SelectItem>
              <SelectItem value="completed" className="text-xs">Completed</SelectItem>
              <SelectItem value="on_hold" className="text-xs">On Hold</SelectItem>
              <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <CreateProjectDialog onSuccess={() => refetch()} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-muted/40 rounded-lg animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="py-16 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No projects yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a project to group related inspections together.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.map((p: any) => (
              <ProjectCard key={p.id} project={p} onStatusChange={() => refetch()} />
            ))}
          </div>
          {total > 20 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing 20 of {total} projects
            </p>
          )}
        </>
      )}
    </div>
  );
}
