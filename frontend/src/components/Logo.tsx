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
  // Offset added to center content within viewBox
  const circleConfigs = {
    sm: {
      offset: 4,
      leftCx: 40, rightCx: 53, cy: 19,
      outerR: 11, midR: 8, innerR: 5.5,
      textX: 59, textY: 25
    },
    md: {
      offset: 6,
      leftCx: 56, rightCx: 74, cy: 27,
      outerR: 16, midR: 12, innerR: 8,
      textX: 83, textY: 35
    },
    lg: {
      offset: 10,
      leftCx: 78, rightCx: 103, cy: 36,
      outerR: 22, midR: 16, innerR: 11,
      textX: 115, textY: 48
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

  // Full logo with text - filled circles design with hover animation
  return (
    <svg
      width={config.width}
      height={config.height}
      viewBox={config.viewBox}
      className={`block group/logo ${className}`}
    >
      <style>{`
        @keyframes pulse-left {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.85); opacity: 0.6; }
        }
        @keyframes pulse-right-3x {
          0%, 100% { transform: scale(1); }
          10%, 30%, 50% { transform: scale(1.12); }
          20%, 40%, 60% { transform: scale(1); }
        }
        @keyframes arrow-travel {
          0% { opacity: 0; transform: translateX(-8px); }
          20% { opacity: 1; transform: translateX(0); }
          80% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(8px); }
        }
        .logo-hover:hover .left-o {
          animation: pulse-left 0.4s ease-in-out;
        }
        .logo-hover:hover .right-o {
          animation: pulse-right-3x 1s ease-in-out 0.2s;
        }
        .logo-hover:hover .travel-arrow {
          animation: arrow-travel 0.5s ease-in-out;
        }
        .travel-arrow {
          opacity: 0;
        }
      `}</style>

      <g className="logo-hover">
        {/* "sm" text */}
        <text
          x={circles.offset}
          y={circles.textY}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize={config.fontSize}
          fontWeight="500"
          fill="currentColor"
        >
          sm
        </text>

        {/* First "o" - filled circles (slate) */}
        <g className="left-o" style={{ transformOrigin: `${circles.leftCx}px ${circles.cy}px` }}>
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
        </g>

        {/* Traveling arrow head */}
        <g className="travel-arrow" style={{ transformOrigin: `${(circles.leftCx + circles.rightCx) / 2}px ${circles.cy}px` }}>
          <path
            d={`M${(circles.leftCx + circles.rightCx) / 2 - 4} ${circles.cy - 5}
                L${(circles.leftCx + circles.rightCx) / 2 + 2} ${circles.cy}
                L${(circles.leftCx + circles.rightCx) / 2 - 4} ${circles.cy + 5}`}
            stroke={emeraldLight}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Second "o" - filled circles (emerald) */}
        <g className="right-o" style={{ transformOrigin: `${circles.rightCx}px ${circles.cy}px` }}>
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
        </g>

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
      </g>
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
