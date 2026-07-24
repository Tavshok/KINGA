/**
 * evidencePluginRegistry.ts — Wave 4B: Architecture Extensibility
 *
 * Defines the typed plugin interface for additional evidence sources that can
 * augment the Physics Truth Layer without restructuring the pipeline.
 *
 * Supported plugin categories:
 *   - TELEMATICS   : OBD/GPS speed, acceleration, braking data
 *   - EDR          : Event Data Recorder (airbag module) delta-V, pre-crash speed
 *   - LIDAR        : 3D point-cloud crush depth measurement
 *   - THREE_D_SCAN : Photogrammetric 3D reconstruction
 *   - WITNESS      : Witness statement speed estimates
 *   - POLICE       : Police report speed / impact assessment
 *   - WEATHER      : Road condition / visibility context
 *
 * Each plugin:
 *   1. Declares its category and data availability for a given claim
 *   2. Returns a standardised EvidenceContribution when data is available
 *   3. The PhysicsTruth builder merges contributions into the canonical object
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PluginCategory =
  | 'TELEMATICS'
  | 'EDR'
  | 'LIDAR'
  | 'THREE_D_SCAN'
  | 'WITNESS'
  | 'POLICE'
  | 'WEATHER'
  | 'CUSTOM';

export type PluginDataStatus =
  | 'AVAILABLE'      // Data present and usable
  | 'PARTIAL'        // Some data present, reduced confidence
  | 'UNAVAILABLE'    // No data for this claim
  | 'ERROR';         // Plugin encountered an error

/**
 * A standardised evidence contribution from a plugin.
 * All numeric measurements carry uncertainty bounds and confidence.
 */
export interface EvidenceContribution {
  /** Plugin identifier */
  pluginId: string;
  pluginCategory: PluginCategory;

  /** UTC timestamp when this contribution was produced */
  producedAt: string;

  /** Data quality status */
  status: PluginDataStatus;

  /** Human-readable status note */
  statusNote: string;

  /** Overall confidence in this contribution (0–1) */
  confidence: number;

  /**
   * Speed evidence (km/h) — if the plugin can contribute a speed estimate.
   * This will be added as an additional method in the speed ensemble.
   */
  speedContribution?: {
    speedKmh: number;
    speedMinKmh: number;
    speedMaxKmh: number;
    basis: string;
    methodLabel: string;
  };

  /**
   * Crush depth evidence (metres) — if the plugin provides geometric measurement.
   * LiDAR and 3D scan plugins use this.
   */
  crushDepthContribution?: {
    depthM: number;
    depthMinM: number;
    depthMaxM: number;
    measurementMethod: string;
    pointCloudDensity?: number;  // points/cm² for LiDAR
  };

  /**
   * Delta-V evidence (km/h) — if the plugin provides direct delta-V measurement.
   * EDR plugins use this.
   */
  deltaVContribution?: {
    deltaVKmh: number;
    deltaVMinKmh: number;
    deltaVMaxKmh: number;
    sensorType: string;
    sampleRateHz?: number;
  };

  /**
   * Context evidence — non-numeric supplementary data.
   */
  contextContribution?: {
    roadCondition?: string;
    visibility?: string;
    weatherCondition?: string;
    speedLimitKmh?: number;
    trafficDensity?: string;
    additionalNotes?: string;
  };

  /** Raw plugin data for audit trail */
  rawData?: Record<string, unknown>;
}

/**
 * Plugin interface — every evidence plugin must implement this.
 */
export interface EvidencePlugin {
  /** Unique plugin identifier */
  readonly pluginId: string;

  /** Human-readable plugin name */
  readonly pluginName: string;

  /** Plugin category */
  readonly category: PluginCategory;

  /** Plugin version for audit trail */
  readonly version: string;

  /**
   * Check if data is available for a given claim.
   * Should be fast — no heavy computation.
   */
  checkAvailability(claimId: string, assessmentId: number): Promise<PluginDataStatus>;

  /**
   * Extract and return the evidence contribution for a given claim.
   * Called only when checkAvailability returns AVAILABLE or PARTIAL.
   */
  extractContribution(claimId: string, assessmentId: number): Promise<EvidenceContribution>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

class EvidencePluginRegistryImpl {
  private plugins: Map<string, EvidencePlugin> = new Map();

  /**
   * Register a plugin. Throws if a plugin with the same ID is already registered.
   */
  register(plugin: EvidencePlugin): void {
    if (this.plugins.has(plugin.pluginId)) {
      throw new Error(`Evidence plugin '${plugin.pluginId}' is already registered`);
    }
    this.plugins.set(plugin.pluginId, plugin);
    console.log(`[EvidencePluginRegistry] Registered plugin: ${plugin.pluginName} (${plugin.pluginId} v${plugin.version})`);
  }

  /**
   * Unregister a plugin (useful for testing).
   */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  /**
   * Get all registered plugins.
   */
  getAll(): EvidencePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugins by category.
   */
  getByCategory(category: PluginCategory): EvidencePlugin[] {
    return this.getAll().filter(p => p.category === category);
  }

  /**
   * Run all registered plugins for a claim and return their contributions.
   * Non-fatal — plugin errors are caught and returned as ERROR status contributions.
   */
  async runAll(claimId: string, assessmentId: number): Promise<EvidenceContribution[]> {
    const contributions: EvidenceContribution[] = [];

    for (const plugin of this.plugins.values()) {
      try {
        const status = await plugin.checkAvailability(claimId, assessmentId);
        if (status === 'UNAVAILABLE') continue;

        const contribution = await plugin.extractContribution(claimId, assessmentId);
        contributions.push(contribution);
      } catch (err) {
        contributions.push({
          pluginId: plugin.pluginId,
          pluginCategory: plugin.category,
          producedAt: new Date().toISOString(),
          status: 'ERROR',
          statusNote: `Plugin error: ${err instanceof Error ? err.message : String(err)}`,
          confidence: 0,
        });
      }
    }

    return contributions;
  }

  /**
   * Get a status summary of all registered plugins for a claim.
   * Used by the admin Evidence Plugin Status panel.
   */
  async getStatusSummary(claimId: string, assessmentId: number): Promise<PluginStatusSummary[]> {
    const summaries: PluginStatusSummary[] = [];

    for (const plugin of this.plugins.values()) {
      try {
        const status = await plugin.checkAvailability(claimId, assessmentId);
        summaries.push({
          pluginId: plugin.pluginId,
          pluginName: plugin.pluginName,
          category: plugin.category,
          version: plugin.version,
          status,
        });
      } catch {
        summaries.push({
          pluginId: plugin.pluginId,
          pluginName: plugin.pluginName,
          category: plugin.category,
          version: plugin.version,
          status: 'ERROR',
        });
      }
    }

    return summaries;
  }
}

export interface PluginStatusSummary {
  pluginId: string;
  pluginName: string;
  category: PluginCategory;
  version: string;
  status: PluginDataStatus;
}

/**
 * Singleton registry instance.
 * Import this to register plugins or run them in the pipeline.
 */
export const evidencePluginRegistry = new EvidencePluginRegistryImpl();

// ─── Built-in stub plugins ────────────────────────────────────────────────────
// These stubs are registered by default. They return UNAVAILABLE until
// the corresponding integration is connected by the operator.

class TelematicsStubPlugin implements EvidencePlugin {
  readonly pluginId = 'telematics-stub';
  readonly pluginName = 'Telematics (OBD/GPS)';
  readonly category: PluginCategory = 'TELEMATICS';
  readonly version = '1.0.0';

  async checkAvailability(_claimId: string, _assessmentId: number): Promise<PluginDataStatus> {
    // Returns UNAVAILABLE until a real telematics integration is connected
    return 'UNAVAILABLE';
  }

  async extractContribution(claimId: string, _assessmentId: number): Promise<EvidenceContribution> {
    return {
      pluginId: this.pluginId,
      pluginCategory: this.category,
      producedAt: new Date().toISOString(),
      status: 'UNAVAILABLE',
      statusNote: 'Telematics integration not connected. Register a real telematics plugin to enable OBD/GPS speed data.',
      confidence: 0,
    };
  }
}

class EDRStubPlugin implements EvidencePlugin {
  readonly pluginId = 'edr-stub';
  readonly pluginName = 'Event Data Recorder (EDR)';
  readonly category: PluginCategory = 'EDR';
  readonly version = '1.0.0';

  async checkAvailability(_claimId: string, _assessmentId: number): Promise<PluginDataStatus> {
    return 'UNAVAILABLE';
  }

  async extractContribution(claimId: string, _assessmentId: number): Promise<EvidenceContribution> {
    return {
      pluginId: this.pluginId,
      pluginCategory: this.category,
      producedAt: new Date().toISOString(),
      status: 'UNAVAILABLE',
      statusNote: 'EDR integration not connected. Register a real EDR plugin to enable airbag-module delta-V data.',
      confidence: 0,
    };
  }
}

class LiDARStubPlugin implements EvidencePlugin {
  readonly pluginId = 'lidar-stub';
  readonly pluginName = 'LiDAR 3D Scan';
  readonly category: PluginCategory = 'LIDAR';
  readonly version = '1.0.0';

  async checkAvailability(_claimId: string, _assessmentId: number): Promise<PluginDataStatus> {
    return 'UNAVAILABLE';
  }

  async extractContribution(claimId: string, _assessmentId: number): Promise<EvidenceContribution> {
    return {
      pluginId: this.pluginId,
      pluginCategory: this.category,
      producedAt: new Date().toISOString(),
      status: 'UNAVAILABLE',
      statusNote: 'LiDAR integration not connected. Register a real LiDAR plugin to enable 3D point-cloud crush depth measurement.',
      confidence: 0,
    };
  }
}

// Register stub plugins on module load
evidencePluginRegistry.register(new TelematicsStubPlugin());
evidencePluginRegistry.register(new EDRStubPlugin());
evidencePluginRegistry.register(new LiDARStubPlugin());
