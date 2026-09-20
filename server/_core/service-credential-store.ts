import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import { serviceCredentials } from "../../drizzle/schema";
import type { ServiceCapability } from "./service-capabilities";

export type ServiceCredentialLifecycle =
  | "pending"
  | "active"
  | "suspended"
  | "revoked"
  | "expired";

export interface ServiceCredentialRecord {
  readonly credentialId: string;
  readonly safePrefix: string;
  readonly environment: string;
  readonly principalName: string;
  readonly capability: ServiceCapability;
  readonly verifierAlgorithm: "scrypt-v1";
  readonly saltBase64: string;
  readonly verifierBase64: string;
  readonly lifecycleState: ServiceCredentialLifecycle;
  readonly notBefore: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface ServiceCredentialStore {
  findByCredentialId(
    credentialId: string
  ): Promise<ServiceCredentialRecord | null>;
}

export function createDrizzleServiceCredentialStore(
  db: MySql2Database<typeof schema>
): ServiceCredentialStore {
  return {
    async findByCredentialId(credentialId) {
      const [record] = await db
        .select({
          credentialId: serviceCredentials.credentialId,
          safePrefix: serviceCredentials.safePrefix,
          environment: serviceCredentials.environment,
          principalName: serviceCredentials.principalName,
          capability: serviceCredentials.capability,
          verifierAlgorithm: serviceCredentials.verifierAlgorithm,
          saltBase64: serviceCredentials.saltBase64,
          verifierBase64: serviceCredentials.verifierBase64,
          lifecycleState: serviceCredentials.lifecycleState,
          notBefore: serviceCredentials.notBefore,
          expiresAt: serviceCredentials.expiresAt,
          revokedAt: serviceCredentials.revokedAt,
        })
        .from(serviceCredentials)
        .where(eq(serviceCredentials.credentialId, credentialId))
        .limit(1);

      return record ?? null;
    },
  };
}
