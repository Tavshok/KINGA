export const SERVICE_CAPABILITY_REGISTRY = Object.freeze({
  "scheduled:intake-escalation:run": Object.freeze({
    capability: "scheduled:intake-escalation:run" as const,
    jobKey: "intake-escalation" as const,
    canonicalPath: "/api/service/scheduled/intake-escalation" as const,
  }),
  "scheduled:stuck-recovery:run": Object.freeze({
    capability: "scheduled:stuck-recovery:run" as const,
    jobKey: "stuck-recovery" as const,
    canonicalPath: "/api/service/scheduled/stuck-recovery" as const,
  }),
});

export type ServiceCapability = keyof typeof SERVICE_CAPABILITY_REGISTRY;
export type ScheduledJobKey =
  (typeof SERVICE_CAPABILITY_REGISTRY)[ServiceCapability]["jobKey"];

export function isServiceCapability(value: string): value is ServiceCapability {
  return Object.prototype.hasOwnProperty.call(
    SERVICE_CAPABILITY_REGISTRY,
    value
  );
}

export function getServiceCapabilityDefinition(capability: ServiceCapability) {
  return SERVICE_CAPABILITY_REGISTRY[capability];
}
