/**
 * Audit Logger Module
 * Provides comprehensive audit logging for CI/CD pipeline events
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  event_type: 'pipeline_stage' | 'approval' | 'deployment' | 'rollback' | 'gate_validation' | 'alert';
  actor: {
    user_id: string;
    email: string;
    role: string;
    ip_address: string;
  };
  resource: {
    type: 'code' | 'database' | 'configuration' | 'infrastructure';
    identifier: string;
    version: string;
  };
  action: string;
  status: 'success' | 'failure' | 'pending';
  metadata: Record<string, any>;
  correlation_id: string;
}

const AUDIT_LOG_DIR = process.env.AUDIT_LOG_DIR || '/var/log/kinga/audit';

function getAuditLogFile(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(AUDIT_LOG_DIR, `audit-${date}.log`);
}

export function logAuditEvent(event: AuditEvent): void {
  try {
    // Ensure directory exists
    if (!fs.existsSync(AUDIT_LOG_DIR)) {
      fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true, mode: 0o750 });
    }
    
    // Append event to log file
    const logLine = JSON.stringify(event) + '\n';
    const logFile = getAuditLogFile();
    fs.appendFileSync(logFile, logLine, { mode: 0o640 });
    
    // Also log to console for centralized aggregation (Loki/Promtail)
    console.log(`[AUDIT] ${logLine.trim()}`);
  } catch (error) {
    console.error('[AUDIT] Failed to write audit event:', error);
    // Don't throw - audit logging should never break the application
  }
}

export function createAuditEvent(
  eventType: AuditEvent['event_type'],
  actor: AuditEvent['actor'],
  resource: AuditEvent['resource'],
  action: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {},
  correlationId?: string
): AuditEvent {
  return {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: eventType,
    actor,
    resource,
    action,
    status,
    metadata,
    correlation_id: correlationId || crypto.randomUUID()
  };
}

// Convenience functions for common audit events

export function logPipelineStage(
  stage: string,
  actor: AuditEvent['actor'],
  version: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {}
): void {
  const event = createAuditEvent(
    'pipeline_stage',
    actor,
    { type: 'code', identifier: stage, version },
    `pipeline_stage_${stage}`,
    status,
    metadata
  );
  logAuditEvent(event);
}

export function logApproval(
  approvalType: string,
  actor: AuditEvent['actor'],
  resourceId: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {}
): void {
  const event = createAuditEvent(
    'approval',
    actor,
    { type: 'code', identifier: approvalType, version: resourceId },
    `approval_${approvalType}`,
    status,
    metadata
  );
  logAuditEvent(event);
}

export function logDeployment(
  environment: string,
  actor: AuditEvent['actor'],
  version: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {}
): void {
  const event = createAuditEvent(
    'deployment',
    actor,
    { type: 'infrastructure', identifier: environment, version },
    `deploy_to_${environment}`,
    status,
    metadata
  );
  logAuditEvent(event);
}

export function logRollback(
  environment: string,
  actor: AuditEvent['actor'],
  fromVersion: string,
  toVersion: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {}
): void {
  const event = createAuditEvent(
    'rollback',
    actor,
    { type: 'infrastructure', identifier: environment, version: toVersion },
    `rollback_${environment}`,
    status,
    { ...metadata, from_version: fromVersion, to_version: toVersion }
  );
  logAuditEvent(event);
}

export function logGateValidation(
  gate: string,
  actor: AuditEvent['actor'],
  version: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {}
): void {
  const event = createAuditEvent(
    'gate_validation',
    actor,
    { type: 'code', identifier: gate, version },
    `validate_${gate}`,
    status,
    metadata
  );
  logAuditEvent(event);
}

export function logAlert(
  alertType: string,
  actor: AuditEvent['actor'],
  resourceId: string,
  status: AuditEvent['status'],
  metadata: Record<string, any> = {}
): void {
  const event = createAuditEvent(
    'alert',
    actor,
    { type: 'infrastructure', identifier: alertType, version: resourceId },
    `alert_${alertType}`,
    status,
    metadata
  );
  logAuditEvent(event);
}
