import React from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Constellation({
  onFailure,
}: {
  onFailure: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      onFailure();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;
    const group = new THREE.Group();
    scene.add(group);
    const geometry = new THREE.IcosahedronGeometry(1.65, 1);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0x6ab2d5,
      transparent: true,
      opacity: 0.3,
    });
    group.add(new THREE.LineSegments(edges, material));
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0xa9dff4,
      size: 0.045,
    });
    group.add(new THREE.Points(geometry, pointsMaterial));
    let frame = 0,
      visible = false,
      disposed = false,
      last = 0,
      slowFrames = 0;
    const target = { x: 0, y: 0 };
    function render(time: number) {
      if (disposed || !visible || document.hidden) {
        frame = 0;
        return;
      }
      if (last && time - last > 80) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      last = time;
      if (slowFrames > 40) {
        onFailure();
        return;
      }
      group.rotation.y = time * 0.00008 + target.x;
      group.rotation.x = 0.2 + target.y;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    }
    function resume() {
      last = 0;
      if (!frame && visible && !document.hidden && !disposed)
        frame = requestAnimationFrame(render);
    }
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else resume();
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) resume();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    observer.observe(element);
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    const pointer = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 0.2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 0.1;
    };
    const lost = (e: Event) => {
      e.preventDefault();
      onFailure();
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    window.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("pointermove", pointer);
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      geometry.dispose();
      edges.dispose();
      material.dispose();
      pointsMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [onFailure]);
  return <div ref={host} className="constellation" aria-hidden="true" />;
}
