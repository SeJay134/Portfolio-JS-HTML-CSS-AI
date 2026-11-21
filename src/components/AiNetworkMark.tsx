import React, { useEffect, useRef } from "react";

type Point = { x: number; y: number; vx: number; vy: number; phase: number };

const initialPositions = [
  [19, 20], [31, 15], [44, 24], [47, 40],
  [34, 48], [20, 43], [13, 32], [33, 31],
] as const;

const links: [number, number][] = [];
for (let first = 0; first < initialPositions.length; first++) {
  for (let second = first + 1; second < initialPositions.length; second++) {
    links.push([first, second]);
  }
}

const MAX_LINK_DISTANCE = 30;
const MIN_COORD = 12;
const MAX_COORD = 52;

/**
 * The original chatbot's p5.js behavior, recreated with a small SVG.
 * Eight independent dots drift and bounce; nearby pairs connect dynamically.
 * SVG attributes update directly so animation never triggers React rerenders.
 */
export function AiNetworkMark({ large = false }: { large?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const nodes = Array.from(svg.querySelectorAll<SVGCircleElement>(".ai-network-node"));
    const segments = Array.from(svg.querySelectorAll<SVGLineElement>(".ai-network-link"));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const points: Point[] = initialPositions.map(([x, y], index) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 7 + Math.random() * 6;
      return {
        x: x + (Math.random() - 0.5) * 5,
        y: y + (Math.random() - 0.5) * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        phase: index * 1.13,
      };
    });

    let frame = 0;
    let previousTime = 0;
    let elapsed = 0;

    const draw = () => {
      segments.forEach((line, index) => {
        const [first, second] = links[index];
        const a = points[first];
        const b = points[second];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const visibility = Math.max(0, 1 - distance / MAX_LINK_DISTANCE);
        line.setAttribute("x1", String(a.x));
        line.setAttribute("y1", String(a.y));
        line.setAttribute("x2", String(b.x));
        line.setAttribute("y2", String(b.y));
        line.setAttribute("stroke-opacity", String(visibility * 0.95));
      });
      nodes.forEach((dot, index) => {
        const point = points[index];
        dot.setAttribute("cx", String(point.x));
        dot.setAttribute("cy", String(point.y));
        dot.setAttribute("r", String(2.35 + Math.sin(elapsed * 3 + point.phase) * 0.65));
      });
    };

    const tick = (timestamp: number) => {
      if (document.hidden || reducedMotion?.matches) return;
      if (!previousTime) previousTime = timestamp;
      const seconds = Math.min((timestamp - previousTime) / 1000, 0.05);
      previousTime = timestamp;
      elapsed += seconds;
      for (const point of points) {
        point.x += point.vx * seconds;
        point.y += point.vy * seconds;
        if (point.x < MIN_COORD || point.x > MAX_COORD) {
          point.x = Math.max(MIN_COORD, Math.min(MAX_COORD, point.x));
          point.vx *= -1;
        }
        if (point.y < MIN_COORD || point.y > MAX_COORD) {
          point.y = Math.max(MIN_COORD, Math.min(MAX_COORD, point.y));
          point.vy *= -1;
        }
      }
      draw();
      frame = requestAnimationFrame(tick);
    };

    const resume = () => {
      cancelAnimationFrame(frame);
      previousTime = 0;
      draw();
      if (!document.hidden && !reducedMotion?.matches) {
        frame = requestAnimationFrame(tick);
      }
    };

    // Always show a static network if motion is reduced, even on first paint.
    draw();
    resume();
    document.addEventListener("visibilitychange", resume);
    reducedMotion?.addEventListener("change", resume);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
      reducedMotion?.removeEventListener("change", resume);
    };
  }, []);

  return (
    <span
      className={large ? "ai-network-mark ai-network-mark-large" : "ai-network-mark"}
      aria-hidden="true"
    >
      <svg ref={svgRef} viewBox="0 0 64 64" focusable="false">
        <g className="ai-network-lines" fill="none" stroke="currentColor" strokeWidth="1.25">
          {links.map(([first, second]) => (
            <line
              key={`${first}-${second}`}
              className="ai-network-link"
              x1={initialPositions[first][0]}
              y1={initialPositions[first][1]}
              x2={initialPositions[second][0]}
              y2={initialPositions[second][1]}
              strokeOpacity=".6"
            />
          ))}
        </g>
        <g className="ai-network-nodes" fill="currentColor">
          {initialPositions.map(([x, y], index) => (
            <circle
              key={index}
              className="ai-network-node"
              cx={x}
              cy={y}
              r="2.6"
            />
          ))}
        </g>
      </svg>
    </span>
  );
}
