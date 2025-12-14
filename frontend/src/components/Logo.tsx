interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  // Size configurations based on v4 design
  const sizes = {
    sm: { width: 150, height: 36, fontSize: 23, viewBox: '0 0 150 36' },
    md: { width: 210, height: 50, fontSize: 32, viewBox: '0 0 210 50' },
    lg: { width: 320, height: 70, fontSize: 44, viewBox: '0 0 320 70' },
  };

  const config = sizes[size];

  // Circle positions and sizes for each logo size
  const circleConfigs = {
    sm: {
      leftCx: 36, rightCx: 49, cy: 19,
      outerR: 11, midR: 8, innerR: 5.5,
      outerStroke: 1, midStroke: 1, innerStroke: 2,
      lineX1: 42, lineX2: 43, lineStroke: 2,
      textX: 55
    },
    md: {
      leftCx: 50, rightCx: 68, cy: 27,
      outerR: 16, midR: 12, innerR: 8,
      outerStroke: 1.5, midStroke: 1.5, innerStroke: 2.5,
      lineX1: 59, lineX2: 60, lineStroke: 2.5,
      textX: 77
    },
    lg: {
      leftCx: 68, rightCx: 93, cy: 36,
      outerR: 22, midR: 16, innerR: 11,
      outerStroke: 1.5, midStroke: 1.5, innerStroke: 2.5,
      lineX1: 80, lineX2: 82, lineStroke: 2.5,
      textX: 105
    },
  };

  const circles = circleConfigs[size];

  // Colors - use currentColor for text, explicit colors for circles
  const slateColor = '#64748b';
  const emeraldColor = '#10b981';
  const emeraldLight = '#6ee7b7';

  if (!showText) {
    // Icon only version - 48x48
    return (
      <svg
        width={config.height}
        height={config.height}
        viewBox="0 0 48 48"
        className={className}
      >
        <defs>
          <linearGradient id="logo-gradient-icon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={slateColor} />
            <stop offset="100%" stopColor={emeraldLight} />
          </linearGradient>
        </defs>
        <circle cx="16" cy="24" r="14" fill="none" stroke={slateColor} strokeWidth="1" opacity="0.25" />
        <circle cx="16" cy="24" r="10" fill="none" stroke={slateColor} strokeWidth="1" opacity="0.5" />
        <circle cx="16" cy="24" r="7" fill="none" stroke={slateColor} strokeWidth="2" opacity="0.9" />
        <circle cx="32" cy="24" r="7" fill="none" stroke={emeraldLight} strokeWidth="2" opacity="0.9" />
        <circle cx="32" cy="24" r="10" fill="none" stroke={emeraldLight} strokeWidth="1" opacity="0.5" />
        <circle cx="32" cy="24" r="14" fill="none" stroke={emeraldLight} strokeWidth="1" opacity="0.25" />
        <path d="M23 24 L25 24" stroke="url(#logo-gradient-icon)" strokeWidth="2" strokeLinecap="round" />
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
        y={size === 'lg' ? 48 : size === 'md' ? 35 : 25}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize={config.fontSize}
        fontWeight="500"
        fill="currentColor"
      >
        sm
      </text>

      {/* First "o" - concentric circles (slate) */}
      <circle
        cx={circles.leftCx}
        cy={circles.cy}
        r={circles.outerR}
        fill="none"
        stroke={slateColor}
        strokeWidth={circles.outerStroke}
        opacity="0.2"
      />
      <circle
        cx={circles.leftCx}
        cy={circles.cy}
        r={circles.midR}
        fill="none"
        stroke={slateColor}
        strokeWidth={circles.midStroke}
        opacity="0.4"
      />
      <circle
        cx={circles.leftCx}
        cy={circles.cy}
        r={circles.innerR}
        fill="none"
        stroke={slateColor}
        strokeWidth={circles.innerStroke}
        opacity="0.9"
      />

      {/* Second "o" - concentric circles (emerald) */}
      <circle
        cx={circles.rightCx}
        cy={circles.cy}
        r={circles.innerR}
        fill="none"
        stroke={emeraldLight}
        strokeWidth={circles.innerStroke}
        opacity="0.9"
      />
      <circle
        cx={circles.rightCx}
        cy={circles.cy}
        r={circles.midR}
        fill="none"
        stroke={emeraldLight}
        strokeWidth={circles.midStroke}
        opacity="0.4"
      />
      <circle
        cx={circles.rightCx}
        cy={circles.cy}
        r={circles.outerR}
        fill="none"
        stroke={emeraldLight}
        strokeWidth={circles.outerStroke}
        opacity="0.2"
      />

      {/* Connection line between circles */}
      <path
        d={`M${circles.lineX1} ${circles.cy} L${circles.lineX2} ${circles.cy}`}
        stroke="url(#logo-gradient)"
        strokeWidth={circles.lineStroke}
        strokeLinecap="round"
      />

      {/* "thexit" text */}
      <text
        x={circles.textX}
        y={size === 'lg' ? 48 : size === 'md' ? 35 : 25}
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
