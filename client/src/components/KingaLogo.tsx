/**
 * KINGA Logo Component
 * 
 * Displays the KINGA shield logo with text branding
 * Used consistently across all dashboard headers
 */

interface KingaLogoProps {
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function KingaLogo({ showText = true, size = "md", className = "" }: KingaLogoProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-3xl",
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img 
        src="/kinga-logo.png" 
        alt="KINGA Logo" 
        className={sizeClasses[size]}
      />
      {showText && (
        <div>
          <h1 className={`${textSizeClasses[size]} font-bold`}>KINGA</h1>
        </div>
      )}
    </div>
  );
}
