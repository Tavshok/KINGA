/**
 * KINGA Logo Component
 * 
 * Displays the KINGA shield logo with traditional African design
 * Now using inline SVG for better performance and scalability
 */

interface KingaLogoProps {
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function KingaLogo({ showText = true, size = "md", className = "" }: KingaLogoProps) {
  const sizeClasses = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-20 w-20",
  };

  const textSizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Inline SVG Logo - African Shield with Spear and Crown */}
      <svg 
        className={`${sizeClasses[size]}`}
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Shield Background */}
        <path
          d="M50 5 L80 20 L80 50 Q80 75 50 95 Q20 75 20 50 L20 20 Z"
          fill="url(#shieldGradient)"
          stroke="#2D8B7C"
          strokeWidth="2"
        />
        
        {/* African Pattern - Geometric Design */}
        <path
          d="M40 30 L50 25 L60 30 L60 45 L50 50 L40 45 Z"
          fill="#2B4C7E"
          opacity="0.3"
        />
        <path
          d="M35 50 L50 45 L65 50 L65 65 L50 70 L35 65 Z"
          fill="#6DD4C4"
          opacity="0.4"
        />
        
        {/* Crown Symbol at Top */}
        <path
          d="M45 15 L47 20 L50 18 L53 20 L55 15 L53 22 L50 20 L47 22 Z"
          fill="#3F3F3F"
        />
        
        {/* Spear Elements */}
        <line x1="30" y1="25" x2="35" y2="35" stroke="#3F3F3F" strokeWidth="1.5" />
        <line x1="70" y1="25" x2="65" y2="35" stroke="#3F3F3F" strokeWidth="1.5" />
        
        {/* Gradient Definitions */}
        <defs>
          <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4DB8A8" />
            <stop offset="50%" stopColor="#2D8B7C" />
            <stop offset="100%" stopColor="#2B4C7E" />
          </linearGradient>
        </defs>
      </svg>
      
      {showText && (
        <div>
          <h1 className={`${textSizeClasses[size]} font-bold bg-gradient-to-r from-[#4DB8A8] to-[#4A7C59] bg-clip-text text-transparent`}>
            KINGA
          </h1>
        </div>
      )}
    </div>
  );
}
