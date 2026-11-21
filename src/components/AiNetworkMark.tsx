import React, { useEffect, useRef } from "react";

type Node = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  phase: number;
};

// The original p5.js chatbot used eight independently drifting nodes.
// Connections appear only when two nodes pass close enough to each other.
const INITIAL_POINTS = [
  [18, 22], [31, 15], [45, 25], [24, 35],
  [44, 43], [17, 47], [35, 30], [51, 35],
] as const;
const CONNECTION_DISTANCE = 30;
const EDGES: [number, number][] = [];
for (let i = 0; i < INITIAL_POINTS.length; i++) {
  for (let j = i + 1; j < INITIAL_POINTS.length; j++) {
    EDGES.push([i, j]);
  }
}

function connectionOpacity(distance: number) {
  return distance < CONNECTION_DISTANCE
    ? (0.72 * (1 - distance / CONNECTION_DISTANCE)).toFixed(3)
    : "0";
}

/** Animated, proximity-linked dots adapted from Sergei's original p5.js mark. */
export function AiNetworkMark({ large = false }: { large?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const lines = svg.querySelectorAll<SVGLineElement>(".ai-network-links line");
    const halos = svg.querySelectorAll<SVGCircleElement>(".ai-network-halos circle");
    const dots = svg.querySelectorAll<SVGCircleElement>(".ai-network-dots circle");

    const nodes: Node[] = INITIAL_POINTS.map(() => {
      const angle = Math.random() * Math.PI * 2;
      // Move subtly, as in the original, but enough to change links over time.
      const speed = 0.05 + Math.random() * 0.06;
      return {
        x: 16 + Math.random() * 32,
        y: 16 + Math.random() * 32,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        phase: Math.random() * Math.PI * 2,
      };
    });

    const draw = (time: number, pulsing: boolean) => {
      EDGES.forEach(([a, b], index) => {
        const first = nodes[a];
        const second = nodes[b];
        const line = lines[index];
        if (!line) return;
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        line.setAttribute("x1", first.x.toFixed(2));
        line.setAttribute("y1", first.y.toFixed(2));
        line.setAttribute("x2", second.x.toFixed(2));
        line.setAttribute("y2", second.y.toFixed(2));
        line.setAttribute("stroke-opacity", connectionOpacity(distance));
      });

      nodes.forEach((node, index) => {
        const pulse = pulsing
          ? Math.sin(time * 0.0025 + node.phase) * 0.55
          : 0;
        const halo = halos[index];
        const dot = dots[index];
        for (const circle of [halo, dot]) {
          circle?.setAttribute("cx", node.x.toFixed(2));
          circle?.setAttribute("cy", node.y.toFixed(2));
        }
        halo?.setAttribute("r", (3.5 + pulse).toFixed(2));
        dot?.setAttribute("r", (2.2 + pulse * 0.6).toFixed(2));
      });
    };

    const motion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let frame = 0;
    let previousTime = 0;

    const step = (time: number) => {
      if (!previousTime || time - previousTime >= 32) {
        const delta = previousTime
          ? Math.min((time - previousTime) / 16.67, 3)
          : 1;
        previousTime = time;
        for (const node of nodes) {
          node.x += node.dx * delta;
          node.y += node.dy * delta;
          if (node.x < 12 || node.x > 52) {
            node.x = Math.max(12, Math.min(52, node.x));
            node.dx *= -1;
          }
          if (node.y < 12 || node.y > 52) {
            node.y = Math.max(12, Math.min(52, node.y));
            node.dy *= -1;
          }
        }
        draw(time, true);
      }
      frame = window.requestAnimationFrame(step);
    };

    const syncAnimation = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      if (!document.hidden && !motion?.matches &&
          typeof window.requestAnimationFrame === "function") {
        frame = window.requestAnimationFrame(step);
      } else {
        draw(0, false);
      }
    };

    // Draw once immediately; the icon also has a meaningful static appearance.
    draw(0, false);
    syncAnimation();
    document.addEventListener("visibilitychange", syncAnimation);
    motion?.addEventListener?.("change", syncAnimation);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", syncAnimation);
      motion?.removeEventListener?.("change", syncAnimation);
    };
  }, []);

  return (
    <span
      className={large ? "ai-network-mark ai-network-mark-large" : "ai-network-mark"}
      aria-hidden="true"
    >
      <svg ref={svgRef} viewBox="0 0 64 64" focusable="false">
        <g className="ai-network-links" fill="none" stroke="currentColor" strokeWidth="1">
          {EDGES.map(([a, b]) => {
            const [x1, y1] = INITIAL_POINTS[a];
            const [x2, y2] = INITIAL_POINTS[b];
            return (
              <line
                key={`${a}-${b}`}
                className="ai-network-link"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeOpacity={connectionOpacity(Math.hypot(x2 - x1, y2 - y1))}
              />
            );
          })}
        </g>
        <g className="ai-network-halos" fill="#00dcff" opacity=".8">
          {INITIAL_POINTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" />)}
        </g>
        <g className="ai-network-dots" fill="#008bff">
          {INITIAL_POINTS.map(([x, y], i) => <circle key={i} className="ai-network-node" cx={x} cy={y} r="2.2" />)}
        </g>
      </svg>
    </span>
  );
}
