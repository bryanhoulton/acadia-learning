/**
 * Custom mathematical/visual components for Wrapped
 * 
 * These replace generic icons with unique, animated visualizations
 * inspired by mathematics, physics, and data visualization.
 * 
 * Includes both small icon-sized and large background versions.
 * 
 * OPTIMIZED: Uses CSS animations instead of JS state updates to reduce
 * React re-renders and improve performance.
 */

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

// CSS keyframes injected once
const styleId = "math-visuals-styles";
if (typeof document !== "undefined" && !document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    @keyframes orbit1 { from { transform: rotate(0deg) translateX(180px) rotate(0deg); } to { transform: rotate(360deg) translateX(180px) rotate(-360deg); } }
    @keyframes orbit2 { from { transform: rotate(45deg) translateX(140px) rotate(-45deg); } to { transform: rotate(405deg) translateX(140px) rotate(-405deg); } }
    @keyframes orbit3 { from { transform: rotate(90deg) translateX(220px) rotate(-90deg); } to { transform: rotate(450deg) translateX(220px) rotate(-450deg); } }
    @keyframes orbit4 { from { transform: rotate(135deg) translateX(100px) rotate(-135deg); } to { transform: rotate(495deg) translateX(100px) rotate(-495deg); } }
    @keyframes orbit5 { from { transform: rotate(180deg) translateX(260px) rotate(-180deg); } to { transform: rotate(540deg) translateX(260px) rotate(-540deg); } }
    @keyframes sineWaveScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes fractalDraw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
  `;
  document.head.appendChild(style);
}

// ===========================================
// LARGE BACKGROUND VISUALS
// ===========================================

export function OrbitingParticlesBackground({ color = "white" }: { color?: string }) {
  const particles = [
    { radius: 180, duration: 18, size: 12 },
    { radius: 140, duration: 14, size: 8 },
    { radius: 220, duration: 24, size: 16 },
    { radius: 100, duration: 12, size: 6 },
    { radius: 260, duration: 30, size: 10 },
  ];

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      {particles.map((p, i) => (
        <circle key={`orbit-${i}`} cx="200" cy="200" r={p.radius} fill="none" stroke={color} strokeWidth="1" opacity={0.1} />
      ))}
      {particles.map((p, i) => (
        <circle
          key={`particle-${i}`}
          cx="200"
          cy="200"
          r={p.size}
          fill={color}
          opacity={0.4}
          style={{
            transformOrigin: "200px 200px",
            animation: `orbit${i + 1} ${p.duration}s linear infinite`,
          }}
        />
      ))}
      <circle cx="200" cy="200" r="20" fill={color} opacity={0.2} />
    </svg>
  );
}

export function SineWaveBackground({ color = "white" }: { color?: string }) {
  // Pre-compute static wave paths (doubled for seamless loop)
  const waves = useMemo(() => {
    const createWave = (yOff: number, amp: number, freq: number) => {
      const points = Array.from({ length: 200 }, (_, i) => {
        const x = (i / 99) * 400;
        const y = yOff + Math.sin((i / 99) * Math.PI * freq) * amp;
        return `${x},${y}`;
      }).join(" ");
      return points;
    };
    return [
      { points: createWave(120, 40, 2), width: 2, opacity: 0.15, duration: 8 },
      { points: createWave(200, 50, 3), width: 3, opacity: 0.25, duration: 6 },
      { points: createWave(280, 35, 2.5), width: 2, opacity: 0.15, duration: 10 },
    ];
  }, []);

  return (
    <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      {waves.map((wave, i) => (
        <g key={i} style={{ animation: `sineWaveScroll ${wave.duration}s linear infinite` }}>
          <polyline points={wave.points} fill="none" stroke={color} strokeWidth={wave.width} opacity={wave.opacity} />
        </g>
      ))}
    </svg>
  );
}

export function FractalTreeBackground({ color = "white" }: { color?: string }) {
  // Generate tree path once, statically
  const treePath = useMemo(() => {
    const segments: string[] = [];
    const gen = (x: number, y: number, angle: number, length: number, depth: number) => {
      if (depth > 7 || length < 8) return;
      const x2 = x + Math.cos(angle) * length;
      const y2 = y + Math.sin(angle) * length;
      segments.push(`M${x},${y}L${x2},${y2}`);
      gen(x2, y2, angle - 0.4, length * 0.75, depth + 1);
      gen(x2, y2, angle + 0.5, length * 0.72, depth + 1);
    };
    gen(200, 380, -Math.PI / 2, 80, 0);
    return segments.join(" ");
  }, []);

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <path
        d={treePath}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity={0.25}
        style={{
          strokeDasharray: 1000,
          strokeDashoffset: 1000,
          animation: "fractalDraw 2s ease-out forwards",
        }}
      />
    </svg>
  );
}

export function RadialBurstBackground({ color = "white" }: { color?: string }) {
  const lines = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      return {
        x1: 200 + Math.cos(angle) * 30,
        y1: 200 + Math.sin(angle) * 30,
        x2: 200 + Math.cos(angle) * 250,
        y2: 200 + Math.sin(angle) * 250,
        strokeWidth: i % 3 === 0 ? 3 : 1,
        opacity: i % 3 === 0 ? 0.2 : 0.08,
        delay: i * 0.03,
      };
    });
  }, []);

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      {lines.map((line, i) => (
        <motion.line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={color}
          strokeWidth={line.strokeWidth}
          strokeLinecap="round"
          opacity={line.opacity}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: line.delay, duration: 0.5 }}
        />
      ))}
      <motion.circle
        cx="200"
        cy="200"
        r="25"
        fill={color}
        opacity={0.15}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: "spring" }}
      />
    </svg>
  );
}

export function ConstellationBackground({ color = "white" }: { color?: string }) {
  const nodes = [
    { x: 80, y: 100 }, { x: 150, y: 60 }, { x: 250, y: 80 }, { x: 320, y: 120 },
    { x: 60, y: 200 }, { x: 140, y: 180 }, { x: 200, y: 200 }, { x: 280, y: 160 }, { x: 350, y: 200 },
    { x: 100, y: 280 }, { x: 180, y: 300 }, { x: 260, y: 280 }, { x: 340, y: 320 },
    { x: 120, y: 350 }, { x: 220, y: 360 }, { x: 300, y: 340 },
  ];
  const connections = [[0,1],[1,2],[2,3],[0,4],[1,5],[2,7],[3,8],[4,5],[5,6],[6,7],[7,8],[4,9],[5,10],[6,11],[7,12],[9,10],[10,11],[11,12],[9,13],[10,14],[11,15]];

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      {connections.map(([f, t], i) => (
        <motion.line
          key={`l-${i}`}
          x1={nodes[f].x}
          y1={nodes[f].y}
          x2={nodes[t].x}
          y2={nodes[t].y}
          stroke={color}
          strokeWidth="1.5"
          opacity={0.15}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
        />
      ))}
      {nodes.map((n, i) => (
        <motion.circle
          key={`n-${i}`}
          cx={n.x}
          cy={n.y}
          r={4 + (i % 3) * 2}
          fill={color}
          opacity={0.25}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.8 + i * 0.03, type: "spring" }}
        />
      ))}
    </svg>
  );
}

export function PendulumWaveBackground({ color = "white" }: { color?: string }) {
  const pendulums = useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => {
      const x = 50 + (i / 14) * 300;
      const period = 2.5 + i * 0.15; // Different periods create the wave effect
      return { x, period };
    });
  }, []);

  const topY = 50;
  const minY = 150;
  const maxY = 320;

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      {pendulums.map((p, i) => (
        <g key={i}>
          {/* Rope - fixed at top, stretches to ball */}
          <line x1={p.x} y1={topY} x2={p.x} y2={minY} stroke={color} strokeWidth="1" opacity={0.15}>
            <animate
              attributeName="y2"
              values={`${minY};${maxY};${minY}`}
              dur={`${p.period}s`}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
            />
          </line>
          {/* Ball */}
          <circle cx={p.x} cy={minY} r={8} fill={color} opacity={0.3}>
            <animate
              attributeName="cy"
              values={`${minY};${maxY};${minY}`}
              dur={`${p.period}s`}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}

// ===========================================
// SMALL ICON-SIZED VISUALS
// ===========================================

interface VisualProps {
  className?: string;
  color?: string;
  size?: number;
}

/**
 * Animated sine wave - represents rhythm, time, consistency
 * Good for: favorite time, sessions over time
 */
export function SineWave({ className, color = "white", size = 120 }: VisualProps) {
  const [offset, setOffset] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setOffset(prev => (prev + 2) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const points = Array.from({ length: 50 }, (_, i) => {
    const x = (i / 49) * size;
    const y = (size / 4) + Math.sin((i / 49) * Math.PI * 3 + (offset * Math.PI / 180)) * (size / 5);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={size} height={size / 2} className={className} viewBox={`0 0 ${size} ${size / 2}`}>
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5 }}
      />
    </svg>
  );
}

/**
 * Orbiting particles - represents activity, energy, sessions
 * Good for: total sessions, engagement
 */
export function OrbitingParticles({ className, color = "white", size = 120 }: VisualProps) {
  const particles = [
    { radius: size * 0.35, speed: 3, delay: 0, particleSize: 8 },
    { radius: size * 0.25, speed: 4, delay: 0.5, particleSize: 6 },
    { radius: size * 0.45, speed: 2.5, delay: 1, particleSize: 10 },
    { radius: size * 0.3, speed: 3.5, delay: 1.5, particleSize: 5 },
  ];

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      {/* Center dot */}
      <circle cx={size / 2} cy={size / 2} r={4} fill={color} opacity={0.5} />
      
      {/* Orbit paths */}
      {particles.map((p, i) => (
        <circle
          key={`orbit-${i}`}
          cx={size / 2}
          cy={size / 2}
          r={p.radius}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity={0.15}
        />
      ))}
      
      {/* Orbiting particles */}
      {particles.map((p, i) => (
        <motion.circle
          key={`particle-${i}`}
          r={p.particleSize}
          fill={color}
          initial={{ opacity: 0 }}
          animate={{
            cx: [
              size / 2 + p.radius,
              size / 2,
              size / 2 - p.radius,
              size / 2,
              size / 2 + p.radius,
            ],
            cy: [
              size / 2,
              size / 2 - p.radius,
              size / 2,
              size / 2 + p.radius,
              size / 2,
            ],
            opacity: [0.6, 1, 0.6, 1, 0.6],
          }}
          transition={{
            duration: p.speed,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </svg>
  );
}

/**
 * Fibonacci spiral - represents growth, natural progression
 * Good for: breakthroughs, skill development
 */
export function FibonacciSpiral({ className, color = "white", size = 120 }: VisualProps) {
  // Generate Fibonacci spiral path
  const generateSpiralPath = () => {
    const points: string[] = [];
    const centerX = size / 2;
    const centerY = size / 2;
    const turns = 4;
    const pointsPerTurn = 50;
    
    for (let i = 0; i <= turns * pointsPerTurn; i++) {
      const angle = (i / pointsPerTurn) * Math.PI * 2;
      const radius = Math.pow(1.618, angle / (Math.PI * 2)) * 3;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      points.push(`${x},${y}`);
    }
    
    return points.join(" ");
  };

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      <motion.polyline
        points={generateSpiralPath()}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />
      {/* Golden center dot */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={4}
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.5, type: "spring" }}
      />
    </svg>
  );
}

/**
 * Radial burst / starburst - represents achievement, breakthrough moment
 * Good for: breakthrough, celebration
 */
export function RadialBurst({ className, color = "white", size = 120 }: VisualProps) {
  const rays = 12;
  const innerRadius = size * 0.15;
  const outerRadius = size * 0.45;

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      {Array.from({ length: rays }).map((_, i) => {
        const angle = (i / rays) * Math.PI * 2 - Math.PI / 2;
        const x1 = size / 2 + Math.cos(angle) * innerRadius;
        const y1 = size / 2 + Math.sin(angle) * innerRadius;
        const x2 = size / 2 + Math.cos(angle) * outerRadius;
        const y2 = size / 2 + Math.sin(angle) * outerRadius;

        return (
          <motion.line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={i % 2 === 0 ? 3 : 2}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: i % 2 === 0 ? 1 : 0.5 }}
            transition={{ delay: i * 0.05, duration: 0.5 }}
          />
        );
      })}
      {/* Center circle */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={innerRadius * 0.6}
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
      />
    </svg>
  );
}

/**
 * Growing tree / fractal branches - represents streak, consistent growth
 * Good for: streaks, persistence
 */
export function FractalTree({ className, color = "white", size = 120 }: VisualProps) {
  const branches: { x1: number; y1: number; x2: number; y2: number; depth: number }[] = [];
  
  const generateBranches = (
    x: number, y: number, 
    angle: number, 
    length: number, 
    depth: number
  ) => {
    if (depth > 5 || length < 3) return;
    
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    
    branches.push({ x1: x, y1: y, x2, y2, depth });
    
    // Left branch
    generateBranches(x2, y2, angle - 0.5, length * 0.7, depth + 1);
    // Right branch
    generateBranches(x2, y2, angle + 0.5, length * 0.7, depth + 1);
  };
  
  generateBranches(size / 2, size * 0.9, -Math.PI / 2, size * 0.25, 0);

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      {branches.map((branch, i) => (
        <motion.line
          key={i}
          x1={branch.x1}
          y1={branch.y1}
          x2={branch.x2}
          y2={branch.y2}
          stroke={color}
          strokeWidth={Math.max(1, 4 - branch.depth * 0.6)}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: branch.depth * 0.15, duration: 0.3 }}
        />
      ))}
    </svg>
  );
}

/**
 * Connected nodes / constellation - represents connections, learning network
 * Good for: tutor observations, skills learned
 */
export function ConstellationNodes({ className, color = "white", size = 120 }: VisualProps) {
  const nodes = [
    { x: size * 0.5, y: size * 0.3 },
    { x: size * 0.25, y: size * 0.5 },
    { x: size * 0.75, y: size * 0.45 },
    { x: size * 0.4, y: size * 0.7 },
    { x: size * 0.65, y: size * 0.75 },
    { x: size * 0.5, y: size * 0.5 },
  ];
  
  const connections = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [5, 0], [5, 1], [5, 2], [5, 3], [5, 4]
  ];

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      {/* Connections */}
      {connections.map(([from, to], i) => (
        <motion.line
          key={`line-${i}`}
          x1={nodes[from].x}
          y1={nodes[from].y}
          x2={nodes[to].x}
          y2={nodes[to].y}
          stroke={color}
          strokeWidth="1.5"
          opacity={0.4}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: i * 0.1, duration: 0.4 }}
        />
      ))}
      
      {/* Nodes */}
      {nodes.map((node, i) => (
        <motion.circle
          key={`node-${i}`}
          cx={node.x}
          cy={node.y}
          r={i === 5 ? 8 : 5}
          fill={color}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
        />
      ))}
    </svg>
  );
}

/**
 * Pulsing circles / ripple effect - represents impact, energy
 * Good for: hours invested, impact
 */
export function PulsingRipples({ className, color = "white", size = 120 }: VisualProps) {
  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      {[0.2, 0.35, 0.5].map((scale, i) => (
        <motion.circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={size * scale}
          fill="none"
          stroke={color}
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ 
            opacity: [0, 0.6, 0],
            scale: [0.8, 1.2, 1.4],
          }}
          transition={{
            duration: 2,
            delay: i * 0.4,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
      {/* Center solid circle */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.08}
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </svg>
  );
}

/**
 * Animated bar chart - represents progress, data
 * Good for: sessions, hours
 */
export function AnimatedBars({ className, color = "white", size = 120, values = [0.4, 0.7, 0.5, 0.9, 0.6] }: VisualProps & { values?: number[] }) {
  const barWidth = size / (values.length * 2);
  const gap = barWidth;
  const maxHeight = size * 0.7;

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      {values.map((value, i) => {
        const barHeight = maxHeight * value;
        const x = gap + i * (barWidth + gap);
        const y = size - barHeight - size * 0.1;

        return (
          <motion.rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={color}
            rx={barWidth / 2}
            initial={{ scaleY: 0, originY: 1 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.1, duration: 0.5, type: "spring" }}
            style={{ transformOrigin: `${x + barWidth / 2}px ${size - size * 0.1}px` }}
          />
        );
      })}
    </svg>
  );
}

/**
 * Infinity loop - represents continuous learning, infinite potential
 * Good for: intro, outro
 */
export function InfinityLoop({ className, color = "white", size = 120 }: VisualProps) {
  return (
    <svg width={size} height={size * 0.5} className={className} viewBox="0 0 120 60">
      <motion.path
        d="M30,30 C30,15 45,15 60,30 C75,45 90,45 90,30 C90,15 75,15 60,30 C45,45 30,45 30,30"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />
      <motion.circle
        r="4"
        fill={color}
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          offsetDistance: ["0%", "100%"],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "linear",
        }}
        style={{
          offsetPath: "path('M30,30 C30,15 45,15 60,30 C75,45 90,45 90,30 C90,15 75,15 60,30 C45,45 30,45 30,30')",
        }}
      />
    </svg>
  );
}

/**
 * Geometric morph - abstract shape that transforms
 * Good for: transitions, breakthrough
 */
export function GeometricMorph({ className, color = "white", size = 120 }: VisualProps) {
  const shapes = [
    // Triangle
    `M${size/2},${size*0.2} L${size*0.8},${size*0.8} L${size*0.2},${size*0.8} Z`,
    // Square
    `M${size*0.25},${size*0.25} L${size*0.75},${size*0.25} L${size*0.75},${size*0.75} L${size*0.25},${size*0.75} Z`,
    // Pentagon
    `M${size*0.5},${size*0.15} L${size*0.85},${size*0.4} L${size*0.73},${size*0.85} L${size*0.27},${size*0.85} L${size*0.15},${size*0.4} Z`,
    // Circle approximation
    `M${size*0.5},${size*0.2} C${size*0.8},${size*0.2} ${size*0.8},${size*0.8} ${size*0.5},${size*0.8} C${size*0.2},${size*0.8} ${size*0.2},${size*0.2} ${size*0.5},${size*0.2} Z`,
  ];

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      <motion.path
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinejoin="round"
        initial={{ d: shapes[0] }}
        animate={{ d: shapes }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </svg>
  );
}

