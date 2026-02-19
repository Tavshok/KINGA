// @ts-nocheck
/**
 * Graph Generation Service
 * 
 * Automatically generates professional visualizations for claim analysis:
 * - Damage breakdown pie chart
 * - Cost comparison bar chart
 * - Fraud risk gauge
 * - Physics validation diagram
 */

import { spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { storagePut } from "./storage";

export interface GraphGenerationData {
  claimId: number;
  claimNumber: string;
  vehicleInfo: {
    make: string;
    model: string;
    registration: string;
  };
  damageComponents: Record<string, number>; // component name -> cost
  costComparison: {
    aiAssessment: number;
    humanAssessor?: number;
    panelBeaterQuotes: number[];
  };
  fraudRiskScore: number; // 0-100
  physicsData: {
    impactForceKn: number;
    estimatedSpeedKmh: number;
    damageSeverity: string;
  };
}

export interface GeneratedGraphs {
  damageBreakdown: string; // S3 URL
  costComparison: string; // S3 URL
  fraudGauge: string; // S3 URL
  physicsValidation: string; // S3 URL
}

/**
 * Generate all visualization graphs for a claim analysis
 */
export async function generateClaimGraphs(
  data: GraphGenerationData
): Promise<GeneratedGraphs> {
  // Create Python script with data
  const scriptPath = `/tmp/generate-graphs-${data.claimId}.py`;
  const pythonScript = createPythonScript(data);
  
  writeFileSync(scriptPath, pythonScript);

  try {
    // Execute Python script
    await executePythonScript(scriptPath);

    // Upload generated images to S3
    const damageBreakdownUrl = await uploadGraph(
      `/tmp/damage-breakdown-${data.claimId}.png`,
      `${data.claimId}/graphs/damage-breakdown.png`
    );

    const costComparisonUrl = await uploadGraph(
      `/tmp/cost-comparison-${data.claimId}.png`,
      `${data.claimId}/graphs/cost-comparison.png`
    );

    const fraudGaugeUrl = await uploadGraph(
      `/tmp/fraud-gauge-${data.claimId}.png`,
      `${data.claimId}/graphs/fraud-gauge.png`
    );

    const physicsValidationUrl = await uploadGraph(
      `/tmp/physics-validation-${data.claimId}.png`,
      `${data.claimId}/graphs/physics-validation.png`
    );

    // Clean up temporary files
    unlinkSync(scriptPath);
    unlinkSync(`/tmp/damage-breakdown-${data.claimId}.png`);
    unlinkSync(`/tmp/cost-comparison-${data.claimId}.png`);
    unlinkSync(`/tmp/fraud-gauge-${data.claimId}.png`);
    unlinkSync(`/tmp/physics-validation-${data.claimId}.png`);

    return {
      damageBreakdown: damageBreakdownUrl,
      costComparison: costComparisonUrl,
      fraudGauge: fraudGaugeUrl,
      physicsValidation: physicsValidationUrl,
    };
  } catch (error) {
    // Clean up on error
    try {
      unlinkSync(scriptPath);
    } catch {}
    
    throw new Error(`Graph generation failed: ${error}`);
  }
}

/**
 * Create Python script for graph generation
 */
function createPythonScript(data: GraphGenerationData): string {
  const { claimId, vehicleInfo, damageComponents, costComparison, fraudRiskScore, physicsData } = data;
  
  const componentsJson = JSON.stringify(damageComponents).replace(/'/g, "\\'");
  
  // Build cost comparison entries safely
  const costEntries: string[] = [];
  costEntries.push(`'AI Assessment': ${costComparison.aiAssessment || 0}`);
  if (costComparison.humanAssessor) {
    costEntries.push(`'Human Assessor': ${costComparison.humanAssessor}`);
  }
  costComparison.panelBeaterQuotes.forEach((q, i) => {
    costEntries.push(`'Panel Beater ${i + 1}': ${q}`);
  });
  const costComparisonPython = costEntries.join(',\n    ');
  
  // Ensure damage_components has at least one entry for pie chart
  const safeComponentsJson = Object.keys(damageComponents).length === 0 
    ? JSON.stringify({"No damage detected": 1}).replace(/'/g, "\\\'")
    : componentsJson;
  
  return `#!/usr/bin/env python3
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Wedge, Circle
import numpy as np
import json

try:
    plt.style.use('seaborn-v0_8-darkgrid')
except:
    plt.style.use('ggplot')
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.size'] = 10

# Data
damage_components = json.loads('${safeComponentsJson}')
cost_comparison = {
    ${costComparisonPython}
}
fraud_risk_score = ${fraudRiskScore}
impact_force_kn = ${physicsData.impactForceKn}
estimated_speed_kmh = ${physicsData.estimatedSpeedKmh}

# 1. Damage Breakdown
fig1, ax1 = plt.subplots(figsize=(10, 7))
colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F']
wedges, texts, autotexts = ax1.pie(
    damage_components.values(),
    labels=damage_components.keys(),
    autopct='%1.1f%%',
    startangle=90,
    colors=colors[:len(damage_components)],
    explode=[0.05] * len(damage_components),
    shadow=True
)
for text in texts:
    text.set_fontsize(11)
    text.set_weight('bold')
for autotext in autotexts:
    autotext.set_color('white')
    autotext.set_fontsize(10)
    autotext.set_weight('bold')
ax1.set_title('Damage Cost Breakdown\\n${vehicleInfo.make} ${vehicleInfo.model} ${vehicleInfo.registration}', 
              fontsize=14, weight='bold', pad=20)
total_cost = sum(damage_components.values())
ax1.text(0, -1.4, f'Total: ZWL {total_cost:,}', ha='center', fontsize=12, weight='bold',
         bbox=dict(boxstyle='round,pad=0.5', facecolor='lightblue', alpha=0.7))
plt.tight_layout()
plt.savefig('/tmp/damage-breakdown-${claimId}.png', dpi=300, bbox_inches='tight')
plt.close()

# 2. Cost Comparison
fig2, ax2 = plt.subplots(figsize=(12, 7))
sources = list(cost_comparison.keys())
costs = list(cost_comparison.values())
colors_bar = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6']
bars = ax2.barh(sources, costs, color=colors_bar[:len(sources)], edgecolor='black', linewidth=1.2)
for bar, cost in zip(bars, costs):
    ax2.text(bar.get_width() + 50, bar.get_y() + bar.get_height()/2,
             f'ZWL {cost:,}', ha='left', va='center', fontsize=10, weight='bold')
ax2.set_xlabel('Cost (ZWL)', fontsize=12, weight='bold')
ax2.set_title('Cost Comparison\\n${vehicleInfo.make} ${vehicleInfo.model}', fontsize=14, weight='bold', pad=20)
ax2.set_xlim(0, max(costs) + 500)
ax2.grid(axis='x', alpha=0.3, linestyle='--')
plt.tight_layout()
plt.savefig('/tmp/cost-comparison-${claimId}.png', dpi=300, bbox_inches='tight')
plt.close()

# 3. Fraud Gauge
fig3, ax3 = plt.subplots(figsize=(10, 6), subplot_kw={'aspect': 'equal'})
low_zone = Wedge((0, 0), 1, 0, 60, width=0.3, facecolor='#2ecc71', alpha=0.7)
medium_zone = Wedge((0, 0), 1, 60, 120, width=0.3, facecolor='#f39c12', alpha=0.7)
high_zone = Wedge((0, 0), 1, 120, 180, width=0.3, facecolor='#e74c3c', alpha=0.7)
ax3.add_patch(low_zone)
ax3.add_patch(medium_zone)
ax3.add_patch(high_zone)
needle_angle = (fraud_risk_score / 100) * 180
needle_rad = np.radians(needle_angle)
ax3.plot([0, 0.85 * np.cos(needle_rad)], [0, 0.85 * np.sin(needle_rad)],
         'k-', linewidth=4, solid_capstyle='round')
ax3.add_patch(Circle((0, 0), 0.08, facecolor='black', zorder=10))
risk_color = '#2ecc71' if fraud_risk_score < 30 else ('#f39c12' if fraud_risk_score < 60 else '#e74c3c')
ax3.text(0, -0.4, f'{fraud_risk_score}', ha='center', va='center', fontsize=36, weight='bold', color=risk_color)
ax3.text(0, -0.6, 'Fraud Risk Score', ha='center', va='center', fontsize=14, style='italic')
ax3.set_xlim(-1.3, 1.3)
ax3.set_ylim(-0.8, 1.3)
ax3.axis('off')
ax3.set_title('Fraud Risk Assessment', fontsize=14, weight='bold', pad=20)
plt.tight_layout()
plt.savefig('/tmp/fraud-gauge-${claimId}.png', dpi=300, bbox_inches='tight')
plt.close()

# 4. Physics Validation
fig4, ax4 = plt.subplots(figsize=(10, 6))
impact_data = {'Impact Force': impact_force_kn, 'Minor Threshold': 30, 'Moderate Threshold': 50, 'Severe Threshold': 80}
bars = ax4.bar(range(len(impact_data)), impact_data.values(),
               color=['#e74c3c', '#95a5a6', '#f39c12', '#c0392b'], edgecolor='black', linewidth=1.2)
ax4.set_xticks(range(len(impact_data)))
ax4.set_xticklabels(impact_data.keys(), rotation=15, ha='right')
ax4.set_ylabel('Force (kN)', fontsize=11, weight='bold')
ax4.set_title('Impact Force Analysis', fontsize=13, weight='bold')
ax4.grid(axis='y', alpha=0.3, linestyle='--')
for bar in bars:
    height = bar.get_height()
    ax4.text(bar.get_x() + bar.get_width()/2., height + 2, f'{height:.1f} kN',
             ha='center', va='bottom', fontsize=9, weight='bold')
plt.tight_layout()
plt.savefig('/tmp/physics-validation-${claimId}.png', dpi=300, bbox_inches='tight')
plt.close()

print("Graphs generated successfully")
`;
}

/**
 * Execute Python script
 */
function executePythonScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const python = spawn("python3.11", [scriptPath]);

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python script failed: ${stderr}`));
      }
    });

    python.on("error", (error) => {
      reject(new Error(`Failed to spawn Python: ${error.message}`));
    });
  });
}

/**
 * Upload graph to S3
 */
async function uploadGraph(localPath: string, s3Key: string): Promise<string> {
  const { readFileSync } = await import("fs");
  const imageBuffer = readFileSync(localPath);
  
  const { url } = await storagePut(s3Key, imageBuffer, "image/png");
  return url;
}
