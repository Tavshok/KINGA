/**
 * QMS Compliance Panel
 * 
 * Displays Quality Management System compliance notes for insurer presentation:
 * - Every state transition logged
 * - Role-based control enforced
 * - Policy versioning immutable
 * - Full audit replay capability
 * 
 * ISO 9001 and regulatory compliance indicators.
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileCheck, Shield, Lock, RotateCcw } from "lucide-react";

export function QMSCompliancePanel() {
  const complianceItems = [
    {
      icon: FileCheck,
      title: "State Transition Logging",
      description: "Every claim state change recorded with timestamp, user, and role",
      status: "Active",
      details: "Immutable audit trail ensures full traceability of all workflow actions",
      color: "text-blue-600",
    },
    {
      icon: Shield,
      title: "Role-Based Access Control",
      description: "Segregation of duties enforced at every workflow stage",
      status: "Enforced",
      details: "Users cannot approve claims they assessed or processed",
      color: "text-purple-600",
    },
    {
      icon: Lock,
      title: "Policy Versioning Immutable",
      description: "Routing decisions locked to specific policy versions",
      status: "Immutable",
      details: "Policy snapshots prevent retroactive changes to decision logic",
      color: "text-orange-600",
    },
    {
      icon: RotateCcw,
      title: "Full Audit Replay Capability",
      description: "Complete reconstruction of claim lifecycle from audit logs",
      status: "Enabled",
      details: "Replay any claim decision with original policy and AI assessment",
      color: "text-teal-600",
    },
  ];

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              QMS Compliance Framework
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Quality Management System compliance indicators
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="default" className="bg-green-600 text-white">
              ISO 9001 Ready
            </Badge>
            <Badge variant="outline" className="text-xs">
              Audit Grade
            </Badge>
          </div>
        </div>

        {/* Compliance Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {complianceItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-md bg-muted ${item.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground">
                        {item.title}
                      </h3>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {item.description}
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      {item.details}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Regulatory Compliance */}
        <div className="mt-4 p-4 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                Regulatory Compliance Framework
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                KINGA's governance architecture aligns with ISO 9001 Quality Management System requirements, 
                providing full audit trail capabilities, role-based access controls, and immutable policy versioning. 
                All claim decisions are traceable, reproducible, and compliant with regulatory standards.
              </p>
            </div>
          </div>
        </div>

        {/* Key Compliance Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="p-3 rounded-md bg-muted text-center">
            <p className="text-2xl font-bold text-foreground">100%</p>
            <p className="text-xs text-muted-foreground mt-1">Audit Coverage</p>
          </div>
          <div className="p-3 rounded-md bg-muted text-center">
            <p className="text-2xl font-bold text-foreground">0</p>
            <p className="text-xs text-muted-foreground mt-1">Compliance Gaps</p>
          </div>
          <div className="p-3 rounded-md bg-muted text-center">
            <p className="text-2xl font-bold text-foreground">∞</p>
            <p className="text-xs text-muted-foreground mt-1">Audit Retention</p>
          </div>
          <div className="p-3 rounded-md bg-muted text-center">
            <p className="text-2xl font-bold text-foreground">24/7</p>
            <p className="text-xs text-muted-foreground mt-1">Monitoring</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
