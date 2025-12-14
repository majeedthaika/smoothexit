interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  // Size configurations
  const sizes = {
    sm: { width: 140, height: 32, fontSize: 20, viewBox: '0 0 185 40' },
    md: { width: 185, height: 40, fontSize: 26, viewBox: '0 0 185 40' },
    lg: { width: 220, height: 50, fontSize: 32, viewBox: '0 0 220 50' },
  };

  const config = sizes[size];

  // Slate (#64748b) to Emerald (#6ee7b7) color scheme
  const slateColor = '#64748b';
  const emeraldColor = '#10b981';
  const emeraldLight = '#6ee7b7';

  if (!showText) {
    // Icon only version
    return (
      <svg
        width={config.height}
        height={config.height}
        viewBox="0 0 52 52"
        className={className}
      >
        <defs>
          <linearGradient id="logo-gradient-icon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={slateColor} />
            <stop offset="100%" stopColor={emeraldLight} />
          </linearGradient>
        </defs>
        <circle cx="18" cy="26" r="14" fill="none" stroke={slateColor} strokeWidth="1.5" opacity="0.2" />
        <circle cx="18" cy="26" r="10" fill="none" stroke={slateColor} strokeWidth="1.5" opacity="0.4" />
        <circle cx="18" cy="26" r="7" fill="none" stroke={slateColor} strokeWidth="2" opacity="0.9" />
        <circle cx="34" cy="26" r="7" fill="none" stroke={emeraldLight} strokeWidth="2" opacity="0.9" />
        <circle cx="34" cy="26" r="10" fill="none" stroke={emeraldLight} strokeWidth="1.5" opacity="0.4" />
        <circle cx="34" cy="26" r="14" fill="none" stroke={emeraldLight} strokeWidth="1.5" opacity="0.2" />
        <path d="M25 26 L27 26" stroke="url(#logo-gradient-icon)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // Full logo with text
  return (
    <svg
      width={config.width}
      height={config.height}
      viewBox={config.viewBox}
      className={className}
    >
      <defs>
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={slateColor} />
          <stop offset="100%" stopColor={emeraldLight} />
        </linearGradient>
      </defs>
      {/* "sm" text */}
      <text
        x="0"
        y={size === 'lg' ? 35 : 28}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize={config.fontSize}
        fontWeight="500"
        fill="currentColor"
      >
        sm
      </text>

      {/* First "o" - concentric circles */}
      <circle
        cx={size === 'lg' ? 50 : 41}
        cy={size === 'lg' ? 27 : 21}
        r={size === 'lg' ? 16 : 13}
        fill="none"
        stroke={slateColor}
        strokeWidth="1.5"
        opacity="0.15"
      />
      <circle
        cx={size === 'lg' ? 50 : 41}
        cy={size === 'lg' ? 27 : 21}
        r={size === 'lg' ? 12 : 10}
        fill="none"
        stroke={slateColor}
        strokeWidth="1.5"
        opacity="0.35"
      />
      <circle
        cx={size === 'lg' ? 50 : 41}
        cy={size === 'lg' ? 27 : 21}
        r={size === 'lg' ? 8 : 6.5}
        fill="none"
        stroke={slateColor}
        strokeWidth="1.5"
        opacity="0.9"
      />

      {/* Second "o" - concentric circles */}
      <circle
        cx={size === 'lg' ? 68 : 56}
        cy={size === 'lg' ? 27 : 21}
        r={size === 'lg' ? 8 : 6.5}
        fill="none"
        stroke={emeraldLight}
        strokeWidth="1.5"
        opacity="0.9"
      />
      <circle
        cx={size === 'lg' ? 68 : 56}
        cy={size === 'lg' ? 27 : 21}
        r={size === 'lg' ? 12 : 10}
        fill="none"
        stroke={emeraldLight}
        strokeWidth="1.5"
        opacity="0.35"
      />
      <circle
        cx={size === 'lg' ? 68 : 56}
        cy={size === 'lg' ? 27 : 21}
        r={size === 'lg' ? 16 : 13}
        fill="none"
        stroke={emeraldLight}
        strokeWidth="1.5"
        opacity="0.15"
      />

      {/* Connection line between circles */}
      <path
        d={size === 'lg' ? 'M59 27 L60 27' : 'M48 21 L50 21'}
        stroke="url(#logo-gradient)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* "thexit" - combined to eliminate gap */}
      <text
        x={size === 'lg' ? 81 : 66}
        y={size === 'lg' ? 35 : 28}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize={config.fontSize}
        fontWeight="500"
        fill="currentColor"
      >
        th<tspan fontWeight="600" fill={emeraldColor}>exit</tspan>
      </text>
    </svg>
  );
}

// Simple text logo for places where SVG doesn't work well
export function LogoText({ className = '' }: { className?: string }) {
  return (
    <span className={`font-semibold ${className}`}>
      smooth<span className="text-emerald-500">exit</span>
    </span>
  );
}
