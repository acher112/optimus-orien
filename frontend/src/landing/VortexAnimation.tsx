import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

export default function VortexAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];

    const mouse = {
      x: -2000,
      y: -2000,
      active: false,
      radius: 160,
      force: 6,
    };

    const initParticles = (width: number, height: number) => {
      const count = width < 768 ? 3500 : 7000;
      particles = [];
      const clusters = [
        { cx: width * 0.5, cy: height * 0.5, scale: 1.2, fraction: 0.75, color: '#9b51e0' }, // Center (Purple)
        { cx: width * 0.2, cy: height * 0.35, scale: 0.25, fraction: 0.1, color: '#F96E2A' },  // Middle-Left (Orange)
        { cx: width * 0.85, cy: height * 0.15, scale: 0.3, fraction: 0.15, color: '#80ced6' }, // Top-Right (Cyan)
      ];

      for (const cluster of clusters) {
        const localCount = Math.floor(count * cluster.fraction);
        for (let i = 0; i < localCount; i++) {
          const theta = i * 2.39996323; // Golden angle
          const maxSpread = Math.min(width, height) * 0.38 * cluster.scale;
          const rRatio = Math.sqrt((i + 1) / localCount);
          const orbitRadius = rRatio * maxSpread * (0.85 + Math.random() * 0.3);

          const x = cluster.cx + Math.cos(theta) * orbitRadius + (Math.random() - 0.5) * 4;
          const y = cluster.cy + Math.sin(theta) * orbitRadius + (Math.random() - 0.5) * 4;

          particles.push({
            x,
            y,
            baseX: x,
            baseY: y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            radius: 0.8 + Math.random() * 1.8,
            alpha: 0.2 + Math.random() * 0.5,
            color: cluster.color,
          });
        }
      }
    };

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(width, height);
    };

    const animate = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Slow random drift
        p.baseX += (Math.random() - 0.5) * 0.4;
        p.baseY += (Math.random() - 0.5) * 0.4;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouse.radius && mouse.active) {
          p.vx += (Math.random() - 0.5) * 8;
          p.vy += (Math.random() - 0.5) * 8;
          const force = (1 - distance / mouse.radius) * mouse.force * 2;
          const angleToMouse = Math.atan2(dy, dx);
          p.vx += Math.cos(angleToMouse) * force;
          p.vy += Math.sin(angleToMouse) * force;
        } else {
          const returnDx = p.baseX - p.x;
          const returnDy = p.baseY - p.y;
          p.vx += returnDx * 0.15;
          p.vy += returnDy * 0.15;
        }

        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x += p.vx;
        p.y += p.vy;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animationId = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.x = -2000;
      mouse.y = -2000;
      mouse.active = false;
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}
