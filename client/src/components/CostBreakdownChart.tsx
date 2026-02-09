import { Card } from "@/components/ui/card";
import { DollarSign, Wrench, Package, Users } from "lucide-react";

interface CostBreakdown {
  labor: number;
  parts: number;
  materials: number;
  other: number;
  total: number;
}

interface CostBreakdownChartProps {
  breakdown: CostBreakdown;
  currency?: string;
}

export function CostBreakdownChart({ breakdown, currency = "$" }: CostBreakdownChartProps) {
  const categories = [
    { label: 'Labor', value: breakdown.labor, color: '#3b82f6', icon: Users },
    { label: 'Parts', value: breakdown.parts, color: '#8b5cf6', icon: Package },
    { label: 'Materials', value: breakdown.materials, color: '#10b981', icon: Wrench },
    { label: 'Other', value: breakdown.other, color: '#f59e0b', icon: DollarSign },
  ];

  const maxValue = Math.max(...categories.map(c => c.value));

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 rounded-lg">
          <DollarSign className="w-5 h-5 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Cost Breakdown</h2>
      </div>

      {/* Total Cost */}
      <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg">
        <p className="text-sm text-gray-600 mb-1">Total Estimated Cost</p>
        <p className="text-4xl font-bold text-green-600">
          {currency}{breakdown.total.toLocaleString()}
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

            return categories.map((category, index) => {
              const percentage = (category.value / breakdown.total) * 100;
              const angle = (percentage / 100) * 2 * Math.PI;
              
              // Calculate arc path
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

              // Calculate label position (middle of the arc)
              const labelAngle = currentAngle + angle / 2;
              const labelRadius = radius * 0.65;
              const labelX = centerX + labelRadius * Math.cos(labelAngle - Math.PI / 2);
              const labelY = centerY + labelRadius * Math.sin(labelAngle - Math.PI / 2);

              currentAngle += angle;

              return (
                <g key={index}>
                  <path
                    d={pathData}
                    fill={category.color}
                    stroke="white"
                    strokeWidth="2"
                    opacity="0.9"
                  />
                  {percentage > 5 && (
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      fill="white"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {percentage.toFixed(0)}%
                    </text>
                  )}
                </g>
              );
            });
          })()}
          
          {/* Center circle for donut effect */}
          <circle cx="100" cy="100" r="40" fill="white" />
          <text x="100" y="100" textAnchor="middle" fontSize="14" fontWeight="600" fill="#374151">
            Cost
          </text>
          <text x="100" y="115" textAnchor="middle" fontSize="10" fill="#6b7280">
            Breakdown
          </text>
        </svg>
      </div>

      {/* Bar Chart */}
      <div className="space-y-4 mb-6">
        {categories.map((category, index) => {
          const Icon = category.icon;
          const percentage = (category.value / breakdown.total) * 100;
          
          return (
            <div key={index}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: category.color }} />
                  <span className="text-sm font-medium text-gray-700">{category.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{percentage.toFixed(1)}%</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {currency}{category.value.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${(category.value / maxValue) * 100}%`,
                    backgroundColor: category.color
                  }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cost Summary Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700">Category</th>
              <th className="text-right p-3 font-semibold text-gray-700">Amount</th>
              <th className="text-right p-3 font-semibold text-gray-700">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {categories.map((category, index) => {
              const percentage = (category.value / breakdown.total) * 100;
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: category.color }}
                      ></div>
                      <span className="font-medium text-gray-900">{category.label}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold text-gray-900">
                    {currency}{category.value.toLocaleString()}
                  </td>
                  <td className="p-3 text-right text-gray-600">
                    {percentage.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
            <tr className="bg-green-50 font-bold">
              <td className="p-3 text-gray-900">Total</td>
              <td className="p-3 text-right text-green-600">
                {currency}{breakdown.total.toLocaleString()}
              </td>
              <td className="p-3 text-right text-gray-900">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cost Analysis Notes */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-gray-700">
          <strong>Cost Analysis:</strong> Labor represents {((breakdown.labor / breakdown.total) * 100).toFixed(0)}% of total cost. 
          {breakdown.labor > breakdown.parts && " Labor-intensive repair expected."}
          {breakdown.parts > breakdown.labor && " Parts replacement is the primary cost driver."}
        </p>
      </div>
    </Card>
  );
}
