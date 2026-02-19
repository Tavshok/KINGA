/**
 * Route Audit Script
 * 
 * Enumerates all frontend routes from App.tsx, identifies role requirements,
 * and generates a comprehensive audit report.
 * 
 * Usage: pnpm tsx scripts/route-audit.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RouteAudit {
  path: string;
  component: string;
  allowedRoles: string[];
  allowedInsurerRoles: string[];
  isProtected: boolean;
  hasRoleGuard: boolean;
  notes: string[];
}

interface AuditReport {
  totalRoutes: number;
  protectedRoutes: number;
  publicRoutes: number;
  routesByRole: Record<string, number>;
  routes: RouteAudit[];
  generatedAt: string;
}

/**
 * Parse App.tsx to extract route definitions
 */
function parseRoutes(appTsxContent: string): RouteAudit[] {
  const routes: RouteAudit[] = [];
  const lines = appTsxContent.split('\n');
  
  let currentRoute: Partial<RouteAudit> | null = null;
  let inProtectedRoute = false;
  let inRoleGuard = false;
  let protectedRoles: string[] = [];
  let protectedInsurerRoles: string[] = [];
  let roleGuardRoles: string[] = [];
  let braceDepth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect <Route path="...">
    const routeMatch = line.match(/<Route\s+path="([^"]+)"\s*(?:component=\{(\w+)\})?/);
    if (routeMatch) {
      // Save previous route if exists
      if (currentRoute && currentRoute.path) {
        routes.push({
          path: currentRoute.path,
          component: currentRoute.component || 'Unknown',
          allowedRoles: currentRoute.allowedRoles || [],
          allowedInsurerRoles: currentRoute.allowedInsurerRoles || [],
          isProtected: currentRoute.isProtected || false,
          hasRoleGuard: currentRoute.hasRoleGuard || false,
          notes: currentRoute.notes || [],
        });
      }
      
      // Start new route
      currentRoute = {
        path: routeMatch[1],
        component: routeMatch[2] || 'Unknown',
        allowedRoles: [],
        allowedInsurerRoles: [],
        isProtected: false,
        hasRoleGuard: false,
        notes: [],
      };
      
      // Reset state
      inProtectedRoute = false;
      inRoleGuard = false;
      protectedRoles = [];
      protectedInsurerRoles = [];
      roleGuardRoles = [];
      braceDepth = 0;
    }
    
    // Detect <ProtectedRoute allowedRoles={[...]}>
    const protectedRouteMatch = line.match(/<ProtectedRoute\s+allowedRoles=\{(\[[^\]]+\])\}/);
    if (protectedRouteMatch && currentRoute) {
      inProtectedRoute = true;
      currentRoute.isProtected = true;
      
      try {
        // Parse allowedRoles array
        const rolesStr = protectedRouteMatch[1].replace(/"/g, '"').replace(/'/g, '"');
        protectedRoles = JSON.parse(rolesStr);
        currentRoute.allowedRoles = protectedRoles;
      } catch (e) {
        currentRoute.notes?.push(`Failed to parse allowedRoles: ${protectedRouteMatch[1]}`);
      }
    }
    
    // Detect allowedInsurerRoles (may be on same line or next line)
    const insurerRolesMatch = line.match(/allowedInsurerRoles=\{(\[[^\]]+\])\}/);
    if (insurerRolesMatch && currentRoute) {
      try {
        const rolesStr = insurerRolesMatch[1].replace(/"/g, '"').replace(/'/g, '"');
        protectedInsurerRoles = JSON.parse(rolesStr);
        currentRoute.allowedInsurerRoles = protectedInsurerRoles;
      } catch (e) {
        currentRoute.notes?.push(`Failed to parse allowedInsurerRoles: ${insurerRolesMatch[1]}`);
      }
    }
    
    // Detect <RoleGuard allowedRoles={[...]}>
    const roleGuardMatch = line.match(/<RoleGuard\s+allowedRoles=\{(\[[^\]]+\])\}/);
    if (roleGuardMatch && currentRoute) {
      inRoleGuard = true;
      currentRoute.hasRoleGuard = true;
      
      try {
        const rolesStr = roleGuardMatch[1].replace(/"/g, '"').replace(/'/g, '"');
        roleGuardRoles = JSON.parse(rolesStr);
        currentRoute.notes?.push(`RoleGuard: ${roleGuardRoles.join(', ')}`);
      } catch (e) {
        currentRoute.notes?.push(`Failed to parse RoleGuard roles: ${roleGuardMatch[1]}`);
      }
    }
    
    // Detect component inside route (e.g., <InsurerDashboard />)
    if (currentRoute && currentRoute.component === 'Unknown') {
      const componentMatch = line.match(/<(\w+)\s*\/>/);
      if (componentMatch) {
        currentRoute.component = componentMatch[1];
      }
    }
    
    // Track comment annotations
    if (line.startsWith('//') || line.startsWith('/*')) {
      if (currentRoute) {
        const comment = line.replace(/^\/\/\s*/, '').replace(/^\/\*\s*/, '').replace(/\*\/$/, '').trim();
        if (comment && !comment.includes('TODO') && !comment.includes('FIXME')) {
          currentRoute.notes?.push(comment);
        }
      }
    }
  }
  
  // Save last route
  if (currentRoute && currentRoute.path) {
    routes.push({
      path: currentRoute.path,
      component: currentRoute.component || 'Unknown',
      allowedRoles: currentRoute.allowedRoles || [],
      allowedInsurerRoles: currentRoute.allowedInsurerRoles || [],
      isProtected: currentRoute.isProtected || false,
      hasRoleGuard: currentRoute.hasRoleGuard || false,
      notes: currentRoute.notes || [],
    });
  }
  
  return routes;
}

/**
 * Generate audit report
 */
function generateAuditReport(routes: RouteAudit[]): AuditReport {
  const routesByRole: Record<string, number> = {};
  
  routes.forEach(route => {
    route.allowedRoles.forEach(role => {
      routesByRole[role] = (routesByRole[role] || 0) + 1;
    });
  });
  
  return {
    totalRoutes: routes.length,
    protectedRoutes: routes.filter(r => r.isProtected).length,
    publicRoutes: routes.filter(r => !r.isProtected).length,
    routesByRole,
    routes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Format report as markdown table
 */
function formatMarkdownReport(report: AuditReport): string {
  let md = '# Route Audit Report\n\n';
  md += `**Generated:** ${new Date(report.generatedAt).toLocaleString()}\n\n`;
  
  md += '## Summary\n\n';
  md += `- **Total Routes:** ${report.totalRoutes}\n`;
  md += `- **Protected Routes:** ${report.protectedRoutes}\n`;
  md += `- **Public Routes:** ${report.publicRoutes}\n\n`;
  
  md += '### Routes by Role\n\n';
  Object.entries(report.routesByRole)
    .sort((a, b) => b[1] - a[1])
    .forEach(([role, count]) => {
      md += `- **${role}**: ${count} routes\n`;
    });
  
  md += '\n## Route Details\n\n';
  md += '| Route | Component | Protected | Allowed Roles | Insurer Roles | Notes |\n';
  md += '|-------|-----------|-----------|---------------|---------------|-------|\n';
  
  report.routes
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach(route => {
      const roles = route.allowedRoles.length > 0 
        ? route.allowedRoles.join(', ') 
        : '-';
      const insurerRoles = route.allowedInsurerRoles.length > 0 
        ? route.allowedInsurerRoles.join(', ') 
        : '-';
      const notes = route.notes.length > 0 
        ? route.notes.join('; ') 
        : '-';
      const protected_icon = route.isProtected ? '🔒' : '🔓';
      
      md += `| \`${route.path}\` | ${route.component} | ${protected_icon} | ${roles} | ${insurerRoles} | ${notes} |\n`;
    });
  
  md += '\n## Role Access Matrix\n\n';
  md += 'Routes accessible by each role:\n\n';
  
  const roleMatrix: Record<string, string[]> = {};
  report.routes.forEach(route => {
    route.allowedRoles.forEach(role => {
      if (!roleMatrix[role]) roleMatrix[role] = [];
      roleMatrix[role].push(route.path);
    });
  });
  
  Object.entries(roleMatrix)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([role, paths]) => {
      md += `### ${role} (${paths.length} routes)\n\n`;
      paths.sort().forEach(path => {
        md += `- \`${path}\`\n`;
      });
      md += '\n';
    });
  
  md += '## Protected Route Patterns\n\n';
  md += '### Public Routes (No Authentication Required)\n\n';
  report.routes
    .filter(r => !r.isProtected)
    .forEach(route => {
      md += `- \`${route.path}\` - ${route.component}\n`;
    });
  
  md += '\n### Admin-Only Routes\n\n';
  report.routes
    .filter(r => r.allowedRoles.includes('admin') && r.allowedRoles.length === 1)
    .forEach(route => {
      md += `- \`${route.path}\` - ${route.component}\n`;
    });
  
  md += '\n### Multi-Role Routes\n\n';
  report.routes
    .filter(r => r.allowedRoles.length > 1)
    .forEach(route => {
      md += `- \`${route.path}\` - ${route.allowedRoles.join(', ')}\n`;
    });
  
  return md;
}

/**
 * Main execution
 */
function main() {
  const projectRoot = path.join(__dirname, '..');
  const appTsxPath = path.join(projectRoot, 'client/src/App.tsx');
  
  console.log('🔍 Route Audit Script');
  console.log('=====================\n');
  
  // Read App.tsx
  console.log(`📖 Reading: ${appTsxPath}`);
  const appTsxContent = fs.readFileSync(appTsxPath, 'utf-8');
  
  // Parse routes
  console.log('🔎 Parsing routes...');
  const routes = parseRoutes(appTsxContent);
  console.log(`✅ Found ${routes.length} routes\n`);
  
  // Generate report
  console.log('📊 Generating audit report...');
  const report = generateAuditReport(routes);
  
  // Output JSON
  const jsonPath = path.join(__dirname, '../ROUTE_AUDIT_REPORT.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`✅ JSON report saved: ${jsonPath}`);
  
  // Output Markdown
  const mdPath = path.join(__dirname, '../ROUTE_AUDIT_REPORT.md');
  const markdown = formatMarkdownReport(report);
  fs.writeFileSync(mdPath, markdown);
  console.log(`✅ Markdown report saved: ${mdPath}`);
  
  // Print summary
  console.log('\n📈 Summary:');
  console.log(`   Total Routes: ${report.totalRoutes}`);
  console.log(`   Protected: ${report.protectedRoutes}`);
  console.log(`   Public: ${report.publicRoutes}`);
  console.log('\n✅ Route audit complete!');
}

main();
