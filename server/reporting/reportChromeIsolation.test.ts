/**
 * reportChromeIsolation.test.ts
 *
 * Tests that KINGA report HTML output is free of application chrome.
 *
 * "Application chrome" means any of the following:
 *   - Navigation bars (<nav>, role="navigation")
 *   - Sidebar components (class names containing "sidebar", "side-nav", "DashboardLayout")
 *   - React application root markers (#root, #app, data-reactroot)
 *   - Development banners (text containing "development", "debug", "NODE_ENV")
 *   - Webpack/Vite runtime markers (__webpack_require__, __vite__)
 *   - Script tags pointing to the live application bundle (/src/main.tsx, /assets/)
 *
 * These tests operate on the pure HTML-generating functions in the design system
 * and the report template functions, without requiring a DB connection.
 *
 * INV-08: "Report output must never include application chrome."
 *
 * Author: Tavonga Shoko (Lead Engineer)
 */

import { describe, it, expect } from "vitest";
import {
  buildKingaHtml,
  buildKingaFdrHtml,
  KINGA_REPORT_CSS,
} from "./templates/kingaDesignSystem";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the HTML contains any application chrome marker */
function containsAppChrome(html: string): { found: boolean; marker: string } {
  const chromeMarkers: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /<nav[\s>]/i, label: "<nav> element" },
    { pattern: /role=["']navigation["']/i, label: 'role="navigation"' },
    { pattern: /class=["'][^"']*sidebar[^"']*["']/i, label: "sidebar class" },
    { pattern: /class=["'][^"']*side-nav[^"']*["']/i, label: "side-nav class" },
    { pattern: /DashboardLayout/i, label: "DashboardLayout component reference" },
    { pattern: /id=["']root["']/i, label: 'id="root" (React app root)' },
    { pattern: /id=["']app["']/i, label: 'id="app" (app root)' },
    { pattern: /data-reactroot/i, label: "data-reactroot attribute" },
    { pattern: /__webpack_require__/i, label: "__webpack_require__ (webpack runtime)" },
    { pattern: /__vite__/i, label: "__vite__ (Vite runtime)" },
    { pattern: /\/src\/main\.tsx/i, label: "/src/main.tsx (live app bundle reference)" },
    { pattern: /\/assets\/index\.[a-f0-9]+\.js/i, label: "Vite asset bundle reference" },
    { pattern: /NODE_ENV.*development/i, label: "NODE_ENV development marker" },
    { pattern: /data-debug=["']true["']/i, label: "data-debug attribute" },
  ];
  for (const { pattern, label } of chromeMarkers) {
    if (pattern.test(html)) {
      return { found: true, marker: label };
    }
  }
  return { found: false, marker: "" };
}

// ─── 1. buildKingaHtml — base wrapper ────────────────────────────────────────

describe("buildKingaHtml — no application chrome", () => {
  it("produces valid HTML with a DOCTYPE declaration", () => {
    const html = buildKingaHtml("Test Report", "<p>Body content</p>");
    expect(html).toMatch(/^<!DOCTYPE html>/i);
  });

  it("wraps body content in a .report div, not a React root", () => {
    const html = buildKingaHtml("Test Report", "<p>Body content</p>");
    expect(html).toContain('<div class="report">');
    expect(html).not.toContain('id="root"');
    expect(html).not.toContain('id="app"');
  });

  it("contains no navigation elements", () => {
    const html = buildKingaHtml("Test Report", "<p>Body content</p>");
    const check = containsAppChrome(html);
    expect(check.found).toBe(false);
  });

  it("includes the KINGA report CSS, not the application CSS bundle", () => {
    const html = buildKingaHtml("Test Report", "<p>Body content</p>");
    // Must contain the design system CSS
    expect(html).toContain(KINGA_REPORT_CSS.slice(0, 50));
    // Must not reference the live app CSS bundle
    expect(html).not.toMatch(/\/assets\/index\.[a-f0-9]+\.css/i);
  });

  it("does not contain webpack or Vite runtime markers", () => {
    const html = buildKingaHtml("Test Report", "<p>Body content</p>");
    expect(html).not.toContain("__webpack_require__");
    expect(html).not.toContain("__vite__");
  });

  it("does not reference the live application bundle", () => {
    const html = buildKingaHtml("Test Report", "<p>Body content</p>");
    expect(html).not.toContain("/src/main.tsx");
    expect(html).not.toMatch(/\/assets\/index\.[a-f0-9]+\.js/i);
  });

  it("body content is rendered inside the report wrapper", () => {
    const bodyContent = "<section><h1>Claim Intelligence Report</h1></section>";
    const html = buildKingaHtml("Test Report", bodyContent);
    expect(html).toContain(bodyContent);
  });
});

// ─── 2. buildKingaFdrHtml — Forensic Decision Report wrapper ─────────────────

describe("buildKingaFdrHtml — no application chrome", () => {
  it("produces valid HTML with a DOCTYPE declaration", () => {
    const html = buildKingaFdrHtml("FDR Test", "<p>FDR content</p>");
    expect(html).toMatch(/^<!DOCTYPE html>/i);
  });

  it("contains no navigation elements", () => {
    const html = buildKingaFdrHtml("FDR Test", "<p>FDR content</p>");
    const check = containsAppChrome(html);
    expect(check.found).toBe(false);
  });

  it("does not contain React root markers", () => {
    const html = buildKingaFdrHtml("FDR Test", "<p>FDR content</p>");
    expect(html).not.toContain('id="root"');
    expect(html).not.toContain("data-reactroot");
  });
});

// ─── 3. Report body content injection ────────────────────────────────────────

describe("Report body content — chrome-free injection", () => {
  it("injecting a table does not introduce chrome markers", () => {
    const tableBody = `
      <table>
        <thead><tr><th>Component</th><th>Cost</th></tr></thead>
        <tbody><tr><td>Front Bumper</td><td>USD 1,200</td></tr></tbody>
      </table>
    `;
    const html = buildKingaHtml("Cost Report", tableBody);
    const check = containsAppChrome(html);
    expect(check.found).toBe(false);
  });

  it("injecting a fraud score section does not introduce chrome markers", () => {
    const fraudSection = `
      <section class="fraud-summary">
        <h2>Fraud Risk Assessment</h2>
        <p>Risk Level: <strong>Minimal</strong></p>
        <p>Score: <strong>10 / 100</strong></p>
      </section>
    `;
    const html = buildKingaHtml("Fraud Report", fraudSection);
    const check = containsAppChrome(html);
    expect(check.found).toBe(false);
  });

  it("injecting a physics summary does not introduce chrome markers", () => {
    const physicsSection = `
      <section class="physics-summary">
        <h2>Physics Analysis</h2>
        <p>Consensus Speed: <strong>68 km/h</strong></p>
        <p>Impact Direction: Frontal</p>
        <p>Structural Damage: No</p>
      </section>
    `;
    const html = buildKingaHtml("Physics Report", physicsSection);
    const check = containsAppChrome(html);
    expect(check.found).toBe(false);
  });
});

// ─── 4. extraScripts injection ───────────────────────────────────────────────

describe("extraScripts — must not inject app chrome via scripts", () => {
  it("Chart.js CDN script does not constitute app chrome", () => {
    const html = buildKingaHtml(
      "Chart Report",
      "<canvas id='myChart'></canvas>",
      "<script>/* chart init */</script>"
    );
    // Chart.js CDN is already included in the wrapper — this is expected
    expect(html).toContain("chart.js");
    // But no app chrome
    const check = containsAppChrome(html);
    expect(check.found).toBe(false);
  });

  it("empty extraScripts does not affect chrome isolation", () => {
    const html = buildKingaHtml("Report", "<p>Content</p>", "");
    const check = containsAppChrome(html);
    expect(check.found).toBe(false);
  });
});

// ─── 5. KINGA_REPORT_CSS — no application-specific selectors ─────────────────

describe("KINGA_REPORT_CSS — no application-specific selectors", () => {
  it("does not reference #root or #app selectors", () => {
    expect(KINGA_REPORT_CSS).not.toMatch(/#root\b/);
    expect(KINGA_REPORT_CSS).not.toMatch(/#app\b/);
  });

  it("does not reference .sidebar or .nav selectors", () => {
    expect(KINGA_REPORT_CSS).not.toMatch(/\.sidebar\b/i);
    expect(KINGA_REPORT_CSS).not.toMatch(/\.side-nav\b/i);
  });

  it("does not reference Tailwind utility classes (report uses custom CSS only)", () => {
    // Tailwind classes in the CSS file would indicate the report is using the
    // application's CSS bundle rather than the isolated design system
    expect(KINGA_REPORT_CSS).not.toContain("@tailwind");
    expect(KINGA_REPORT_CSS).not.toContain("@apply");
  });
});
