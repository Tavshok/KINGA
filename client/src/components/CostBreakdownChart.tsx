import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Wrench, Package, Users, PaintBucket, Truck, MoreHorizontal } from "lucide-react";

interface ItemizedCost {
  description: string;
  amount: number;
  category?: string;
}

interface CostBreakdown {
  labor: number;
  parts: number;
  materials: number;
  paint?: number;
  sublet?: number;
  other: number;
  total: number;
}

interface CostBreakdownChartProps {
  breakdown: CostBreakdown;
  itemizedCosts?: ItemizedCost[];
  currency?: string;
  isEstimated?: boolean;
}

const categoryIcons: Record<string, any> = {
  labor: Users,
  parts: Package,
  materials: Wrench,
  paint: PaintBucket,
  sublet: Truck,
  other: MoreHorizontal,
};

const categoryColors: Record<string, string> = {
  labor: '#3b82f6',
  parts: '#8b5cf6',
  materials: '#10b981',
  paint: '#f97316',
  sublet: '#06b6d4',
  other: '#f59e0b',
};

export function CostBreakdownChart({ breakdown, itemizedCosts, currency = "$", isEstimated = false }: CostBreakdownChartProps) {
  // Build categories from breakdown, filtering out zero values
  const allCategories = [
    { key: 'labor', label: 'Labor', value: breakdown.labor },
    { key: 'parts', label: 'Parts', value: breakdown.parts },
    { key: 'materials', label: 'Materials', value: breakdown.materials },
    { key: 'paint', label: 'Paint', value: breakdown.paint || 0 },
    { key: 'sublet', label: 'Sublet', value: breakdown.sublet || 0 },
    { key: 'other', label: 'Other', value: breakdown.other },
  ].filter(c => c.value > 0);

  const maxValue = Math.max(...allCategories.map(c => c.value));

  // Group itemized costs by category
  const groupedItems: Record<string, ItemizedCost[]> = {};
  if (itemizedCosts && itemizedCosts.length > 0) {
    for (const item of itemizedCosts) {
      const cat = item.category || 'other';
      if (!groupedItems[cat]) groupedItems[cat] = [];
      groupedItems[cat].push(item);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
          <DollarSign className="w-5 h-5 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Cost Breakdown</h2>
        {isEstimated && (
          <Badge variant="outline" className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">Estimated from industry averages</Badge>
        )}
        {itemizedCosts && itemizedCosts.length > 0 && (
          <Badge variant="secondary">{itemizedCosts.length} line items</Badge>
        )}
      </div>

      {/* Total Cost */}
      <div className="mb-6 p-4 bg-gradient-to-r from-primary/5 to-accent/5 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-muted-foreground mb-1">Total Estimated Cost</p>
        <p className="text-4xl font-bold text-green-600">
          {currency}{breakdown.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      {/* Pie Chart */}
      <div className="mb-6">
        <svg viewBox="0 0 200 200" className="w-full max-w-xs mx-auto">
          {(() => {
            let currentAngle = 0;
            const centerX = 100;
            const centerY = 100;
            const radius = 80;

            return allCategories.map((category, index) => {
              const percentage = (category.value / breakdown.total) * 100;
              const angle = (percentage / 100) * 2 * Math.PI;
              
              const startX = centerX + radius * Math.cos(currentAngle - Math.PI / 2);
              const startY = centerY + radius * Math.sin(currentAngle - Math.PI / 2);
              const endX = centerX + radius * Math.cos(currentAngle + angle - Math.PI / 2);
              const endY = centerY + radius * Math.sin(currentAngle + angle - Math.PI / 2);
              const largeArcFlag = angle > Math.PI ? 1 : 0;
              
              const pathData = [
                `M ${centerX} ${centerY}`,
                `L ${startX} ${startY}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                'Z'
              ].join(' ');

              const labelAngle = currentAngle + angle / 2;
              const labelRadius = radius * 0.65;
              const labelX = centerX + labelRadius * Math.cos(labelAngle - Math.PI / 2);
              const labelY = centerY + labelRadius * Math.sin(labelAngle - Math.PI / 2);

              currentAngle += angle;
              const color = categoryColors[category.key] || '#6b7280';

              return (
                <g key={index}>
                  <path d={pathData} fill={color} stroke="white" strokeWidth="2" opacity="0.9" />
                  {percentage > 5 && (
                    <text x={labelX} y={labelY} textAnchor="middle" fill="white" fontSize="12" fontWeight="600">
                      {percentage.toFixed(0)}%
                    </text>
                  )}
                </g>
              );
            });
          })()}
          <circle cx="100" cy="100" r="40" fill="white" />
          <text x="100" y="100" textAnchor="middle" fontSize="14" fontWeight="600" fill="#374151">Cost</text>
          <text x="100" y="115" textAnchor="middle" fontSize="10" fill="#6b7280">Breakdown</text>
        </svg>
      </div>

      {/* Category Bar Chart */}
      <div className="space-y-4 mb-6">
        {allCategories.map((category, index) => {
          const Icon = categoryIcons[category.key] || DollarSign;
          const color = categoryColors[category.key] || '#6b7280';
          const percentage = (category.value / breakdown.total) * 100;
          
          return (
            <div key={index}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-sm font-medium text-gray-700 dark:text-foreground/80">{category.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-muted-foreground">{percentage.toFixed(1)}%</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-foreground">
                    {currency}{category.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full"
                  style={{ width: `${(category.value / maxValue) * 100}%`, backgroundColor: color }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Itemized Line Items Table */}
      {itemizedCosts && itemizedCosts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-foreground/80 mb-3">Itemized Line Items</h3>
          <div className="border border-gray-200 dark:border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-700 dark:text-foreground/80">#</th>
                  <th className="text-left p-3 font-semibold text-gray-700 dark:text-foreground/80">Description</th>
                  <th className="text-left p-3 font-semibold text-gray-700 dark:text-foreground/80">Category</th>
                  <th className="text-right p-3 font-semibold text-gray-700 dark:text-foreground/80">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemizedCosts.map((item, index) => {
                  const catColor = categoryColors[item.category || 'other'] || '#6b7280';
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:bg-muted/50">
                      <td className="p-3 text-gray-500 dark:text-muted-foreground">{index + 1}</td>
                      <td className="p-3 font-medium text-gray-900 dark:text-foreground">{item.description}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs" style={{ borderColor: catColor, color: catColor }}>
                          {item.category || 'other'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-semibold text-gray-900 dark:text-foreground">
                        {currency}{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-green-50 dark:bg-green-950/30 font-bold">
                  <td className="p-3" colSpan={3}>Total</td>
                  <td className="p-3 text-right text-green-600">
                    {currency}{breakdown.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Category Summary Table */}
      <div className="border border-gray-200 dark:border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-muted/50">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-foreground/80">Category</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-foreground/80">Amount</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-foreground/80">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {allCategories.map((category, index) => {
              const percentage = (category.value / breakdown.total) * 100;
              const color = categoryColors[category.key] || '#6b7280';
              return (
                <tr key={index} className="hover:bg-gray-50 dark:bg-muted/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                      <span className="font-medium text-gray-900 dark:text-foreground">{category.label}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold text-gray-900 dark:text-foreground">
                    {currency}{category.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-3 text-right text-gray-600 dark:text-muted-foreground">{percentage.toFixed(1)}%</td>
                </tr>
              );
            })}
            <tr className="bg-green-50 dark:bg-green-950/30 font-bold">
              <td className="p-3 text-gray-900 dark:text-foreground">Total</td>
              <td className="p-3 text-right text-green-600">
                {currency}{breakdown.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="p-3 text-right text-gray-900 dark:text-foreground">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cost Analysis Notes */}
      <div className="mt-4 p-3 bg-primary/5 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-foreground/80">
          <strong>Cost Analysis:</strong> Labor represents {((breakdown.labor / breakdown.total) * 100).toFixed(0)}% of total cost. 
          {breakdown.labor > breakdown.parts && " Labor-intensive repair expected."}
          {breakdown.parts > breakdown.labor && " Parts replacement is the primary cost driver."}
          {(breakdown.paint || 0) > breakdown.total * 0.15 && " Significant paint/refinishing work required."}
        </p>
      </div>
    </Card>
  );
}
