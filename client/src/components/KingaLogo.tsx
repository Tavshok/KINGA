/**
 * KINGA Logo Component
 * 
 * Displays the KINGA shield logo with traditional African design
 * Uses the original logo image file
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
      <img 
        src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/XlSqWNhiGxKiigDt.png" 
        alt="KINGA Logo" 
        className={`${sizeClasses[size]} object-contain`}
      />
      {showText && (
        <div>
          <h1 className={`${textSizeClasses[size]} font-bold text-emerald-600`}>
            KINGA
          </h1>
        </div>
      )}
    </div>
  );
}
