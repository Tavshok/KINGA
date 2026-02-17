import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";

/**
 * User Diagnostic Page
 * 
 * Shows complete user data from the database to diagnose role persistence issues.
 */
export default function UserDiagnostic() {
  const { data: user, isLoading, error, refetch } = trpc.auth.me.useQuery();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
            <CardTitle className="text-2xl">User Diagnostic</CardTitle>
            <CardDescription className="text-blue-100">
              Complete user data from database and JWT context
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-6 space-y-6">
            {isLoading && (
              <p className="text-center text-slate-500">Loading user data...</p>
            )}
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900">Error Loading User</h3>
                  <p className="text-sm text-red-700 mt-1">{error.message}</p>
                </div>
              </div>
            )}
            
            {user && (
              <>
                {/* Authentication Status */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-900">Authenticated</h3>
                    <p className="text-sm text-green-700 mt-1">User session is valid</p>
                  </div>
                </div>
                
                {/* User Data Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Field</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="p-3 font-medium text-slate-600">ID</td>
                        <td className="p-3 font-mono text-sm">{user.id}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-slate-600">Open ID</td>
                        <td className="p-3 font-mono text-sm break-all">{user.openId}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-slate-600">Name</td>
                        <td className="p-3">{user.name || <span className="text-slate-400">Not set</span>}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-slate-600">Email</td>
                        <td className="p-3">{user.email || <span className="text-slate-400">Not set</span>}</td>
                      </tr>
                      <tr className="bg-yellow-50">
                        <td className="p-3 font-medium text-slate-600">Role</td>
                        <td className="p-3">
                          {user.role ? (
                            <span className="font-semibold text-blue-700">{user.role}</span>
                          ) : (
                            <span className="text-red-600 font-semibold">❌ Not set</span>
                          )}
                        </td>
                      </tr>
                      <tr className="bg-yellow-50">
                        <td className="p-3 font-medium text-slate-600">Insurer Role</td>
                        <td className="p-3">
                          {user.insurerRole ? (
                            <span className="font-semibold text-blue-700">{user.insurerRole}</span>
                          ) : (
                            <span className="text-red-600 font-semibold">❌ Not set</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-slate-600">Tenant ID</td>
                        <td className="p-3">{user.tenantId || <span className="text-slate-400">Not set</span>}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-slate-600">Login Method</td>
                        <td className="p-3">{user.loginMethod || <span className="text-slate-400">Not set</span>}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-slate-600">Last Signed In</td>
                        <td className="p-3">{user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleString() : <span className="text-slate-400">Never</span>}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-slate-600">Created At</td>
                        <td className="p-3">{user.createdAt ? new Date(user.createdAt).toLocaleString() : <span className="text-slate-400">Unknown</span>}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Role Status Alert */}
                {(!user.role || user.role !== "insurer" || !user.insurerRole) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-amber-900">Role Configuration Required</h3>
                      <p className="text-sm text-amber-700 mt-1">
                        Your role is not properly configured. You need both <code className="bg-amber-100 px-1 rounded">role="insurer"</code> and a valid <code className="bg-amber-100 px-1 rounded">insurerRole</code> to access Claims Processor and Executive dashboards.
                      </p>
                      <Button
                        className="mt-3"
                        size="sm"
                        onClick={() => window.location.href = '/role-setup'}
                      >
                        Go to Role Setup
                      </Button>
                    </div>
                  </div>
                )}
                
                {user.role === "insurer" && user.insurerRole && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-green-900">Role Configured Correctly</h3>
                      <p className="text-sm text-green-700 mt-1">
                        You have <code className="bg-green-100 px-1 rounded">role="insurer"</code> and <code className="bg-green-100 px-1 rounded">insurerRole="{user.insurerRole}"</code>. You should be able to access all dashboards.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button onClick={() => refetch()} variant="outline">
                    Refresh Data
                  </Button>
                  <Button onClick={() => window.location.href = '/portal-hub'} variant="outline">
                    Portal Hub
                  </Button>
                  <Button onClick={() => window.location.href = '/role-setup'} variant="outline">
                    Role Setup
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
