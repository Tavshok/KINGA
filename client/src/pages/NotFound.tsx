import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Home, Search, FileQuestion, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to claims overview with search query
      setLocation(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const quickLinks = [
    { label: "Home Dashboard", path: "/", icon: Home },
    { label: "Claims Overview", path: "/insurer/claims", icon: FileQuestion },
    { label: "Submit New Claim", path: "/claimant/submit", icon: FileQuestion },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      <Card className="max-w-2xl w-full shadow-2xl border-emerald-100">
        <CardContent className="p-12">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/lhcjVPkokmXiyQUo.png"
              alt="KINGA"
              className="h-20 w-auto object-contain"
            />
          </div>

          {/* 404 Message */}
          <div className="text-center mb-8">
            <h1 className="text-8xl font-bold text-emerald-600 mb-4">404</h1>
            <h2 className="text-3xl font-semibold text-gray-800 mb-3">
              Page Not Found
            </h2>
            <p className="text-lg text-gray-600 max-w-md mx-auto">
              The page you're looking for doesn't exist or has been moved. Let's
              get you back on track.
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search for claims, assessments, or reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 px-8"
              >
                Search
              </Button>
            </div>
          </form>

          {/* Quick Links */}
          <div className="space-y-3 mb-8">
            <p className="text-sm font-medium text-gray-700 text-center mb-4">
              Quick Navigation
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {quickLinks.map((link) => (
                <Button
                  key={link.path}
                  variant="outline"
                  onClick={() => setLocation(link.path)}
                  className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                >
                  <link.icon className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-medium">{link.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Back Button */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              onClick={() => window.history.back()}
              className="text-gray-600 hover:text-emerald-600"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>

          {/* Help Text */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              Need help? Contact your system administrator or visit our support
              documentation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
