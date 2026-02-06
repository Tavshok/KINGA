/**
 * KINGA Logo Component
 * 
 * Displays the KINGA shield logo with traditional African design
 * Features: Blue/green chevron shield pattern with crossed spear and knobkerry
 */

interface KingaLogoProps {
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function KingaLogo({ showText = true, size = "md", className = "" }: KingaLogoProps) {
  const sizeClasses = {
    sm: "h-10 w-10",
    md: "h-12 w-12",
    lg: "h-16 w-16",
  };

  const textSizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Traditional KINGA Shield with Spear and Knobkerry */}
      <svg 
        className={sizeClasses[size]} 
        viewBox="0 0 200 200" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left Spear */}
        <g>
          {/* Spear shaft */}
          <line x1="40" y1="40" x2="100" y2="100" stroke="#4A5568" strokeWidth="6" strokeLinecap="round"/>
          {/* Spear blade */}
          <path d="M 30 30 L 40 40 L 35 45 Z" fill="#4A5568"/>
          <path d="M 25 25 L 35 35 L 30 40 Z" fill="#4A5568"/>
        </g>

        {/* Right Knobkerry (traditional club) */}
        <g>
          {/* Knobkerry shaft */}
          <line x1="160" y1="40" x2="100" y2="100" stroke="#4A5568" strokeWidth="6" strokeLinecap="round"/>
          {/* Knobkerry head (round knob) */}
          <circle cx="170" cy="30" r="12" fill="#4A5568"/>
        </g>

        {/* Shield with chevron pattern */}
        <g>
          {/* Shield outline */}
          <ellipse cx="100" cy="100" rx="45" ry="60" fill="#2563EB" stroke="#1E40AF" strokeWidth="2"/>
          
          {/* Green chevron stripes */}
          <path d="M 100 50 L 120 70 L 100 90 L 80 70 Z" fill="#10B981"/>
          <path d="M 100 90 L 120 110 L 100 130 L 80 110 Z" fill="#10B981"/>
          <path d="M 100 130 L 120 150 L 100 160 L 80 150 Z" fill="#10B981"/>
          
          {/* Blue chevron stripes (darker) */}
          <path d="M 80 70 L 100 90 L 100 50 Z" fill="#1E40AF"/>
          <path d="M 120 70 L 100 90 L 100 50 Z" fill="#3B82F6"/>
          
          <path d="M 80 110 L 100 130 L 100 90 Z" fill="#1E40AF"/>
          <path d="M 120 110 L 100 130 L 100 90 Z" fill="#3B82F6"/>
          
          <path d="M 80 150 L 100 160 L 100 130 Z" fill="#1E40AF"/>
          <path d="M 120 150 L 100 160 L 100 130 Z" fill="#3B82F6"/>
          
          {/* White center line */}
          <line x1="100" y1="50" x2="100" y2="160" stroke="white" strokeWidth="3"/>
        </g>
      </svg>
      
      {showText && (
        <div>
          <h1 className={`${textSizeClasses[size]} font-bold text-gray-800`}>
            KINGA
          </h1>
        </div>
      )}
    </div>
  );
}
