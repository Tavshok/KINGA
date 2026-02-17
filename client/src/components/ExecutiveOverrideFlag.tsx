/**
 * Executive Override Flag Component
 * Displays visible badge when claim was overridden by executive
 * Shows who overrode and justification (read-only)
 */

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShieldAlert, User, FileText, Calendar } from "lucide-react";

interface ExecutiveOverrideInfo {
  overriddenBy: string; // Executive name
  overriddenByRole: string; // Executive role
  justification: string; // Override justification
  overriddenAt: Date | string; // Override timestamp
  originalDecision: string; // Original AI decision
  newDecision: string; // New decision after override
}

interface ExecutiveOverrideFlagProps {
  overrideInfo: ExecutiveOverrideInfo;
  showDetails?: boolean;
}

export function ExecutiveOverrideFlag({ 
  overrideInfo, 
  showDetails = true 
}: ExecutiveOverrideFlagProps) {
  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const badgeContent = (
    <Badge className="bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1.5 px-3 py-1">
      <ShieldAlert className="h-3.5 w-3.5" />
      Executive Override
    </Badge>
  );

  if (!showDetails) {
    return badgeContent;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-pointer inline-block">
          {badgeContent}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-purple-600" />
              Executive Override Details
            </h4>
            <p className="text-xs text-slate-600">
              This claim's routing decision was manually overridden by an executive
            </p>
          </div>

          <div className="space-y-3">
            {/* Override By */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-slate-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-slate-600 mb-1">Overridden By</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {overrideInfo.overriddenBy}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {overrideInfo.overriddenByRole}
                  </p>
                </div>
              </div>
            </div>

            {/* Override Date */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-slate-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-slate-600 mb-1">Override Date</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatDate(overrideInfo.overriddenAt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Decision Change */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600 mb-2">Decision Change</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {overrideInfo.originalDecision}
                </Badge>
                <span className="text-slate-400">→</span>
                <Badge variant="default" className="text-xs bg-purple-600">
                  {overrideInfo.newDecision}
                </Badge>
              </div>
            </div>

            {/* Justification */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-slate-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-slate-600 mb-2">Justification</p>
                  <p className="text-sm text-slate-900 leading-relaxed">
                    {overrideInfo.justification}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-500 italic">
              This override information is read-only and maintained for audit compliance.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
