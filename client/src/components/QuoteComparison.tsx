import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface QuoteItem {
  description: string;
  partNumber?: string | null;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
  category?: string;
}

interface PanelBeater {
  id: number;
  name: string;
}

interface Quote {
  id: number;
  panelBeaterId: number;
  panelBeater?: PanelBeater;
  quotedAmount: number;
  lineItems?: QuoteItem[];
}

interface QuoteComparisonProps {
  quotes: Quote[];
}


export function QuoteComparison({ quotes }: QuoteComparisonProps) {
  const { fmt } = useTenantCurrency();
  if (quotes.length < 2) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">
          Quote comparison requires at least 2 quotes. Currently {quotes.length} quote(s) available.
        </p>
      </Card>
    );
  }

  // Build a comprehensive list of all items across all quotes
  const allItemDescriptions = new Set<string>();
  quotes.forEach(quote => {
    quote.lineItems?.forEach(item => {
      allItemDescriptions.add(item.description.toLowerCase().trim());
    });
  });

  // Calculate price statistics for each item
  const itemStats = Array.from(allItemDescriptions).map(desc => {
    const prices: number[] = [];
    const quoteData: { [quoteId: number]: QuoteItem | null } = {};

    quotes.forEach(quote => {
      const item = quote.lineItems?.find(
        i => i.description.toLowerCase().trim() === desc
      );
      if (item) {
        const lineTotal = typeof item.lineTotal === 'string' ? parseFloat(item.lineTotal) : item.lineTotal;
        prices.push(lineTotal);
        quoteData[quote.id] = item;
      } else {
        quoteData[quote.id] = null;
      }
    });

    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const priceRange = maxPrice - minPrice;
    const percentDiff = avgPrice > 0 ? (priceRange / avgPrice) * 100 : 0;

    return {
      description: desc,
      quoteData,
      avgPrice,
      minPrice,
      maxPrice,
      priceRange,
      percentDiff,
      missingInSomeQuotes: prices.length < quotes.length,
      hasPriceDiscrepancy: percentDiff > 15, // More than 15% difference
    };
  });

  // Sort by suspicion level (missing items first, then price discrepancies)
  const sortedItems = itemStats.sort((a, b) => {
    if (a.missingInSomeQuotes && !b.missingInSomeQuotes) return -1;
    if (!a.missingInSomeQuotes && b.missingInSomeQuotes) return 1;
    if (a.hasPriceDiscrepancy && !b.hasPriceDiscrepancy) return -1;
    if (!a.hasPriceDiscrepancy && b.hasPriceDiscrepancy) return 1;
    return b.percentDiff - a.percentDiff;
  });

  // Calculate total discrepancy score
  const totalDiscrepancies = sortedItems.filter(
    item => item.missingInSomeQuotes || item.hasPriceDiscrepancy
  ).length;

  // Get panel beater names
  const getPanelBeaterName = (quote: Quote) => {
    return quote.panelBeater?.name || `Panel Beater #${quote.panelBeaterId}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Quote Comparison Analysis</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Comparing {quotes.length} panel beater quotes • {allItemDescriptions.size} unique items
            </p>
          </div>
          <div className="text-right">
            {totalDiscrepancies > 0 ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div>
                  <div className="text-2xl font-bold text-amber-600">{totalDiscrepancies}</div>
                  <div className="text-xs text-muted-foreground">Discrepancies Found</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-sm font-medium text-green-600">No Major Discrepancies</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quote Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {quotes.map(quote => {
            const avgTotal = quotes.reduce((sum, q) => sum + q.quotedAmount, 0) / quotes.length;
            const diffPercent = ((quote.quotedAmount - avgTotal) / avgTotal) * 100;
            const isHigher = diffPercent > 10;
            const isLower = diffPercent < -10;

            return (
              <div key={quote.id} className="border rounded-lg p-4">
                <div className="text-sm font-medium text-muted-foreground">{getPanelBeaterName(quote)}</div>
                <div className="text-2xl font-bold mt-1">{fmt(quote.quotedAmount)}</div>
                {(isHigher || isLower) && (
                  <Badge
                    variant={isHigher ? "destructive" : "default"}
                    className="mt-2"
                  >
                    {diffPercent > 0 ? "+" : ""}{diffPercent.toFixed(1)}% vs avg
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Detailed Item Comparison */}
      {allItemDescriptions.size > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Line-Item Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Item Description</th>
                  {quotes.map(quote => (
                    <th key={quote.id} className="text-right py-3 px-4 font-medium">
                      {getPanelBeaterName(quote)}
                    </th>
                  ))}
                  <th className="text-right py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item, idx) => {
                  const bgColor = item.missingInSomeQuotes
                    ? "bg-amber-50"
                    : item.hasPriceDiscrepancy
                    ? "bg-orange-50"
                    : idx % 2 === 0
                    ? "bg-gray-50"
                    : "bg-white";

                  return (
                    <tr key={item.description} className={bgColor}>
                      <td className="py-3 px-4 capitalize">
                        {item.description}
                        {item.missingInSomeQuotes && (
                          <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 border-amber-300">
                            Missing in some quotes
                          </Badge>
                        )}
                      </td>
                      {quotes.map(quote => {
                        const quoteItem = item.quoteData[quote.id];
                        if (!quoteItem) {
                          return (
                            <td key={quote.id} className="text-right py-3 px-4 text-muted-foreground">
                              <div className="flex items-center justify-end gap-2">
                                <XCircle className="h-4 w-4 text-amber-500" />
                                <span>Not quoted</span>
                              </div>
                            </td>
                          );
                        }

                        const lineTotal = typeof quoteItem.lineTotal === 'string' ? parseFloat(quoteItem.lineTotal) : quoteItem.lineTotal;
                        const isPriceOutlier =
                          item.avgPrice > 0 &&
                          Math.abs(lineTotal - item.avgPrice) / item.avgPrice > 0.15;

                        return (
                          <td key={quote.id} className="text-right py-3 px-4">
                            <div>
                              <div className={`font-medium ${isPriceOutlier ? "text-orange-600" : ""}`}>
                                ${(typeof quoteItem.lineTotal === 'string' ? parseFloat(quoteItem.lineTotal) : quoteItem.lineTotal).toFixed(2)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {quoteItem.quantity} × ${(typeof quoteItem.unitPrice === 'string' ? parseFloat(quoteItem.unitPrice) : quoteItem.unitPrice).toFixed(2)}
                              </div>
                              {isPriceOutlier && (
                                <Badge variant="outline" className="mt-1 bg-orange-100 text-orange-800 border-orange-300 text-xs">
                                  {(typeof quoteItem.lineTotal === 'string' ? parseFloat(quoteItem.lineTotal) : quoteItem.lineTotal) > item.avgPrice ? "+" : ""}
                                  {((((typeof quoteItem.lineTotal === 'string' ? parseFloat(quoteItem.lineTotal) : quoteItem.lineTotal) - item.avgPrice) / item.avgPrice) * 100).toFixed(0)}%
                                </Badge>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-right py-3 px-4">
                        {item.missingInSomeQuotes ? (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Incomplete
                          </Badge>
                        ) : item.hasPriceDiscrepancy ? (
                          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {item.percentDiff.toFixed(0)}% diff
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recommendations */}
      {totalDiscrepancies > 0 && (
        <Card className="p-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-900">Recommended Actions</h4>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {sortedItems.some(item => item.missingInSomeQuotes) && (
                  <li>• Request clarification from panel beaters on missing items</li>
                )}
                {sortedItems.some(item => item.hasPriceDiscrepancy) && (
                  <li>• Investigate significant price differences (&gt;15% variance)</li>
                )}
                {quotes.some(q => {
                  const avg = quotes.reduce((sum, qt) => sum + qt.quotedAmount, 0) / quotes.length;
                  return Math.abs(q.quotedAmount - avg) / avg > 0.1;
                }) && (
                  <li>• Review quotes with total amounts significantly above/below average</li>
                )}
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
