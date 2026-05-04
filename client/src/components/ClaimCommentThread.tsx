import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  MessageSquare, Send, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Reply, CornerDownRight
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentRecord {
  id: number;
  claimId: number;
  authorUserId: number;
  authorRole: string;
  authorName?: string;
  toRoles: string[];
  toEmails: string[];
  commentType: string;
  requiresResponse: boolean;
  responseDeadlineAt?: string | null;
  body: string;
  isResolved: boolean;
  createdAt: string;
  isRead?: boolean;
  replies?: CommentRecord[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  claims_manager: "Claims Manager",
  claims_processor: "Claims Processor",
  internal_assessor: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  executive: "Executive",
  panel_beater: "Panel Beater",
  insurer: "Insurer",
  assessor: "Assessor",
};

const ROLE_COLORS: Record<string, string> = {
  claims_manager: "bg-blue-100 text-blue-800",
  claims_processor: "bg-cyan-100 text-cyan-800",
  internal_assessor: "bg-purple-100 text-purple-800",
  external_assessor: "bg-violet-100 text-violet-800",
  risk_manager: "bg-orange-100 text-orange-800",
  executive: "bg-gray-100 text-gray-800",
  panel_beater: "bg-green-100 text-green-800",
  insurer: "bg-blue-100 text-blue-800",
  assessor: "bg-purple-100 text-purple-800",
};

const TYPE_COLORS: Record<string, string> = {
  clarification: "bg-yellow-100 text-yellow-800",
  instruction: "bg-blue-100 text-blue-800",
  escalation: "bg-red-100 text-red-800",
  approval_note: "bg-green-100 text-green-800",
  rejection_note: "bg-red-100 text-red-800",
  inspection_request: "bg-orange-100 text-orange-800",
  general: "bg-gray-100 text-gray-700",
};

const ALL_ROLES = [
  { value: "claims_manager", label: "Claims Manager" },
  { value: "claims_processor", label: "Claims Processor" },
  { value: "internal_assessor", label: "Internal Assessor" },
  { value: "external_assessor", label: "External Assessor" },
  { value: "risk_manager", label: "Risk Manager" },
  { value: "executive", label: "Executive" },
  { value: "panel_beater", label: "Panel Beater" },
];

const COMMENT_TYPES = [
  { value: "general", label: "General" },
  { value: "clarification", label: "Clarification" },
  { value: "instruction", label: "Instruction" },
  { value: "escalation", label: "Escalation" },
  { value: "approval_note", label: "Approval Note" },
  { value: "rejection_note", label: "Rejection Note" },
  { value: "inspection_request", label: "Inspection Request" },
];

// ── ComposeBox ────────────────────────────────────────────────────────────────

interface ComposeBoxProps {
  claimId: number;
  parentCommentId?: number;
  onSent: () => void;
  onCancel: () => void;
  showClaimantOption?: boolean;
}

function ComposeBox({ claimId, parentCommentId, onSent, onCancel, showClaimantOption }: ComposeBoxProps) {
  const [body, setBody] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [extraEmail, setExtraEmail] = useState("");
  const [commentType, setCommentType] = useState("general");
  const [requiresResponse, setRequiresResponse] = useState(false);
  const [responseDeadline, setResponseDeadline] = useState("");
  const [notifyClaimant, setNotifyClaimant] = useState(false);
  const [statusTemplate, setStatusTemplate] = useState("");

  const { data: templates } = trpc.claimComms.statusTemplates.useQuery(undefined, {
    enabled: showClaimantOption === true,
  });

  const utils = trpc.useUtils();
  const send = trpc.claimComms.send.useMutation({
    onSuccess: () => {
      utils.claimComms.list.invalidate({ claimId });
      utils.claimComms.unreadCount.invalidate();
      onSent();
    },
  });

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toEmails = extraEmail.trim()
    ? extraEmail.split(",").map(e => e.trim()).filter(e => e.includes("@"))
    : [];

  const canSend = body.trim().length > 0 && (
    selectedRoles.length > 0 || toEmails.length > 0 || notifyClaimant || !!parentCommentId
  );

  return (
    <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
      {!parentCommentId && (
        <>
          {/* Role selector */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Send to roles</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleRole(r.value)}
                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                    selectedRoles.includes(r.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Extra email */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              External email addresses (comma-separated)
            </Label>
            <Input
              placeholder="e.g. adjuster@external.com, expert@firm.co.za"
              value={extraEmail}
              onChange={e => setExtraEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Type + requires response */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</Label>
              <Select value={commentType} onValueChange={setCommentType}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                id="requires-response"
                checked={requiresResponse}
                onCheckedChange={v => setRequiresResponse(!!v)}
              />
              <Label htmlFor="requires-response" className="text-xs cursor-pointer">Requires response</Label>
            </div>
            {requiresResponse && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">By date</Label>
                <Input
                  type="date"
                  value={responseDeadline}
                  onChange={e => setResponseDeadline(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>
            )}
          </div>

          {/* Claimant notification */}
          {showClaimantOption && (
            <div className="border border-amber-200 bg-amber-50 rounded p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="notify-claimant"
                  checked={notifyClaimant}
                  onCheckedChange={v => setNotifyClaimant(!!v)}
                />
                <Label htmlFor="notify-claimant" className="text-xs font-medium cursor-pointer text-amber-900">
                  Also notify claimant by email
                </Label>
              </div>
              {notifyClaimant && templates && (
                <div>
                  <Label className="text-xs text-amber-800 mb-1 block">Status template (optional)</Label>
                  <Select value={statusTemplate} onValueChange={setStatusTemplate}>
                    <SelectTrigger className="h-8 text-sm bg-white">
                      <SelectValue placeholder="Custom message (use body text)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Custom message</SelectItem>
                      {templates.map(t => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {statusTemplate && templates && (
                    <p className="text-xs text-amber-700 mt-1 italic">
                      {templates.find(t => t.key === statusTemplate)?.text}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Message body */}
      <Textarea
        placeholder={parentCommentId ? "Write a reply..." : "Write your message..."}
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        className="text-sm resize-none"
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          disabled={!canSend || send.isPending}
          onClick={() => send.mutate({
            claimId,
            toRoles: selectedRoles,
            toUserIds: [],
            toEmails,
            commentType: commentType as any,
            requiresResponse,
            responseDeadlineAt: responseDeadline || null,
            body: body.trim(),
            parentCommentId: parentCommentId ?? null,
            notifyClaimant,
            statusUpdateTemplate: statusTemplate || null,
          })}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {send.isPending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}

// ── CommentCard ───────────────────────────────────────────────────────────────

interface CommentCardProps {
  comment: CommentRecord;
  claimId: number;
  currentUserId: number;
  showClaimantOption?: boolean;
  depth?: number;
}

function CommentCard({ comment, claimId, currentUserId, showClaimantOption, depth = 0 }: CommentCardProps) {
  const [showReply, setShowReply] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const utils = trpc.useUtils();

  const resolve = trpc.claimComms.resolve.useMutation({
    onSuccess: () => {
      utils.claimComms.list.invalidate({ claimId });
      utils.claimComms.unreadCount.invalidate();
    },
  });

  const markRead = trpc.claimComms.markRead.useMutation({
    onSuccess: () => utils.claimComms.unreadCount.invalidate(),
  });

  const isOverdue = comment.requiresResponse &&
    comment.responseDeadlineAt &&
    new Date(comment.responseDeadlineAt) < new Date() &&
    !comment.isResolved;

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}>
      <div className={`rounded-lg p-3 space-y-2 ${
        comment.isResolved
          ? "bg-muted/30 opacity-70"
          : comment.isRead === false
          ? "bg-primary/5 border border-primary/20"
          : "bg-card border border-border"
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ROLE_COLORS[comment.authorRole] ?? "bg-gray-100 text-gray-700"}`}>
              {ROLE_LABELS[comment.authorRole] ?? comment.authorRole}
            </span>
            {comment.authorName && (
              <span className="text-xs text-muted-foreground">{comment.authorName}</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[comment.commentType] ?? "bg-gray-100 text-gray-700"}`}>
              {comment.commentType.replace(/_/g, " ")}
            </span>
            {comment.requiresResponse && !comment.isResolved && (
              <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
                {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {isOverdue ? "Overdue" : `By ${new Date(comment.responseDeadlineAt!).toLocaleDateString()}`}
              </span>
            )}
            {comment.isResolved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Resolved
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(comment.createdAt).toLocaleString()}
          </span>
        </div>

        {/* Body */}
        <p className="text-sm leading-relaxed">{comment.body}</p>

        {/* Recipients */}
        {comment.toRoles.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground">To:</span>
            {comment.toRoles.map(r => (
              <span key={r} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {ROLE_LABELS[r] ?? r}
              </span>
            ))}
            {comment.toEmails.map(e => (
              <span key={e} className="text-xs bg-muted px-1.5 py-0.5 rounded">{e}</span>
            ))}
          </div>
        )}

        {/* Actions */}
        {!comment.isResolved && (
          <div className="flex items-center gap-2 pt-1">
            {depth === 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  setShowReply(!showReply);
                  if (!comment.isRead) markRead.mutate({ commentId: comment.id });
                }}
              >
                <Reply className="h-3 w-3 mr-1" />
                Reply
              </Button>
            )}
            {comment.authorUserId === currentUserId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-green-600 hover:text-green-700"
                onClick={() => resolve.mutate({ commentId: comment.id })}
                disabled={resolve.isPending}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Resolve
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Reply compose */}
      {showReply && (
        <div className="mt-2 ml-6">
          <ComposeBox
            claimId={claimId}
            parentCommentId={comment.id}
            onSent={() => setShowReply(false)}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          <button
            className="text-xs text-muted-foreground flex items-center gap-1 ml-6"
            onClick={() => setShowReplies(!showReplies)}
          >
            <CornerDownRight className="h-3 w-3" />
            {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
            {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showReplies && comment.replies.map(reply => (
            <CommentCard
              key={reply.id}
              comment={reply}
              claimId={claimId}
              currentUserId={currentUserId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ClaimCommentThreadProps {
  claimId: number;
  /** Show the "Notify Claimant" option — only for Claims Processor role */
  showClaimantOption?: boolean;
  /** Compact mode for embedding in table rows */
  compact?: boolean;
}

export function ClaimCommentThread({ claimId, showClaimantOption, compact }: ClaimCommentThreadProps) {
  const { user } = useAuth();
  const [showCompose, setShowCompose] = useState(false);

  const { data: comments, isLoading } = trpc.claimComms.list.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  if (!user) return null;

  const rootComments = comments ?? [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Communications {rootComments.length > 0 && `(${rootComments.length})`}
          </span>
        </div>
        {!showCompose && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCompose(true)}
          >
            <Send className="h-3 w-3 mr-1.5" />
            New Message
          </Button>
        )}
      </div>

      {/* Compose box */}
      {showCompose && (
        <ComposeBox
          claimId={claimId}
          onSent={() => setShowCompose(false)}
          onCancel={() => setShowCompose(false)}
          showClaimantOption={showClaimantOption}
        />
      )}

      {/* Thread */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Loading messages...</div>
      ) : rootComments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
          No messages yet. Start a conversation by clicking "New Message".
        </div>
      ) : (
        <div className="space-y-3">
          {rootComments.map(comment => (
            <CommentCard
              key={comment.id}
              comment={comment}
              claimId={claimId}
              currentUserId={user.id}
              showClaimantOption={showClaimantOption}
            />
          ))}
        </div>
      )}
    </div>
  );
}
