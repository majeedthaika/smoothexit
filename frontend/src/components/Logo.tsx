interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  // Size configurations - viewBox width matches actual content width for proper centering
  const sizes = {
    sm: { width: 138, height: 36, fontSize: 23, viewBox: '0 0 138 36' },
    md: { width: 193, height: 50, fontSize: 32, viewBox: '0 0 193 50' },
    lg: { width: 270, height: 70, fontSize: 44, viewBox: '0 0 270 70' },
  };

  const config = sizes[size];

  // Circle positions and sizes for each logo size - filled circles design
  const circleConfigs = {
    sm: {
      leftCx: 36, rightCx: 49, cy: 19,
      outerR: 11, midR: 8, innerR: 5.5,
      textX: 55, textY: 25
    },
    md: {
      leftCx: 50, rightCx: 68, cy: 27,
      outerR: 16, midR: 12, innerR: 8,
      textX: 77, textY: 35
    },
    lg: {
      leftCx: 68, rightCx: 93, cy: 36,
      outerR: 22, midR: 16, innerR: 11,
      textX: 105, textY: 48
    },
  };

  const circles = circleConfigs[size];

  // Colors
  const slateColor = '#64748b';
  const emeraldColor = '#10b981';
  const emeraldLight = '#6ee7b7';

  if (!showText) {
    // Icon only version - 48x48 with filled circles
    return (
      <svg
        width={config.height}
        height={config.height}
        viewBox="0 0 48 48"
        className={className}
      >
        {/* First O - slate filled circles */}
        <circle cx="16" cy="24" r="14" fill={slateColor} opacity="0.15" />
        <circle cx="16" cy="24" r="10" fill={slateColor} opacity="0.25" />
        <circle cx="16" cy="24" r="7" fill={slateColor} opacity="0.9" />
        {/* Second O - emerald filled circles */}
        <circle cx="32" cy="24" r="14" fill={emeraldLight} opacity="0.15" />
        <circle cx="32" cy="24" r="10" fill={emeraldLight} opacity="0.25" />
        <circle cx="32" cy="24" r="7" fill={emeraldLight} opacity="0.9" />
      </svg>
    );
  }

  // Full logo with text - filled circles design
  return (
    <svg
      width={config.width}
      height={config.height}
      viewBox={config.viewBox}
      className={className}
    >
      {/* "sm" text */}
      <text
        x="0"
        y={circles.textY}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize={config.fontSize}
        fontWeight="500"
        fill="currentColor"
      >
        sm
      </text>

      {/* First "o" - filled circles (slate) */}
      <circle
        cx={circles.leftCx}
        cy={circles.cy}
        r={circles.outerR}
        fill={slateColor}
        opacity="0.15"
      />
      <circle
        cx={circles.leftCx}
        cy={circles.cy}
        r={circles.midR}
        fill={slateColor}
        opacity="0.25"
      />
      <circle
        cx={circles.leftCx}
        cy={circles.cy}
        r={circles.innerR}
        fill={slateColor}
        opacity="0.9"
      />

      {/* Second "o" - filled circles (emerald) */}
      <circle
        cx={circles.rightCx}
        cy={circles.cy}
        r={circles.outerR}
        fill={emeraldLight}
        opacity="0.15"
      />
      <circle
        cx={circles.rightCx}
        cy={circles.cy}
        r={circles.midR}
        fill={emeraldLight}
        opacity="0.25"
      />
      <circle
        cx={circles.rightCx}
        cy={circles.cy}
        r={circles.innerR}
        fill={emeraldLight}
        opacity="0.9"
      />

      {/* "thexit" text */}
      <text
        x={circles.textX}
        y={circles.textY}
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
