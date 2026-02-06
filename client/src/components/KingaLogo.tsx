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
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-14 w-14",
  };

  const textSizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Vibrant Shield SVG */}
      <svg 
        className={sizeClasses[size]} 
        viewBox="0 0 100 120" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Shield gradient background */}
        <defs>
          <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "oklch(0.60 0.18 195)", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "oklch(0.50 0.20 210)", stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="checkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "oklch(0.70 0.15 150)", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "oklch(0.65 0.18 145)", stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        
        {/* Shield shape */}
        <path 
          d="M50 5 L90 20 L90 50 Q90 85 50 115 Q10 85 10 50 L10 20 Z" 
          fill="url(#shieldGradient)"
          stroke="oklch(0.45 0.20 210)"
          strokeWidth="2"
        />
        
        {/* Checkmark */}
        <path 
          d="M30 55 L45 70 L70 35" 
          stroke="url(#checkGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        
        {/* Inner shield highlight */}
        <path 
          d="M50 10 L85 23 L85 50 Q85 82 50 108 Q15 82 15 50 L15 23 Z" 
          fill="none"
          stroke="oklch(0.70 0.15 195 / 0.3)"
          strokeWidth="1.5"
        />
      </svg>
      
      {showText && (
        <div>
          <h1 className={`${textSizeClasses[size]} font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent`}>
            KINGA
          </h1>
          <p className="text-xs text-muted-foreground -mt-1">AutoVerify AI</p>
        </div>
      )}
    </div>
  );
}
