import React, { useEffect, useRef } from 'react';

interface SingleVortexAnimationProps {
  color?: string;
  scale?: number;
}

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
}

export default function SingleVortexAnimation({
  color = '#FFD400',
  scale = 0.9,
}: SingleVortexAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let isVisible = true;
    let particles: Particle[] = [];

    const mouse = {
      x: -2000,
      y: -2000,
      active: false,
      radius: 160,
      force: 6,
    };

    const initParticles = (width: number, height: number, baseWidth: number, baseHeight: number) => {
      // 700 particles on desktop, 220 on mobile (reduced from 6,000 / 3,000)
      const isMobile = baseWidth < 768;
      const count = isMobile ? 220 : 700;
      particles = [];

      for (let i = 0; i < count; i++) {
        const theta = i * 2.39996323; // Golden angle
        const maxSpread = Math.min(baseWidth, baseHeight) * 0.38 * scale;
        const rRatio = Math.sqrt((i + 1) / count);
        const orbitRadius = rRatio * maxSpread * (0.85 + Math.random() * 0.3);

        const x = width * 0.5 + Math.cos(theta) * orbitRadius + (Math.random() - 0.5) * 4;
        const y = height * 0.5 + Math.sin(theta) * orbitRadius + (Math.random() - 0.5) * 4;

        particles.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          radius: isMobile ? 1.0 + Math.random() * 1.6 : 0.8 + Math.random() * 2,
        });
      }
    };

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const baseWidth = window.innerWidth;
      const baseHeight = window.innerHeight;
      const width = canvas.clientWidth || baseWidth;
      const height = canvas.clientHeight || baseHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(width, height, baseWidth, baseHeight);
    };

    const animate = () => {
      if (!isVisible) return;

      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      // Batched drawing: 1 single beginPath & fill call for all particles
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();

      const pLen = particles.length;
      const mouseRadiusSq = mouse.radius * mouse.radius;

      for (let i = 0; i < pLen; i++) {
        const p = particles[i];

        p.baseX += (Math.random() - 0.5) * 0.35;
        p.baseY += (Math.random() - 0.5) * 0.35;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < mouseRadiusSq && mouse.active) {
          const distance = Math.sqrt(distSq);
          p.vx += (Math.random() - 0.5) * 6;
          p.vy += (Math.random() - 0.5) * 6;
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

        ctx.moveTo(p.x + p.radius, p.y);
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      }

      ctx.fill();
      ctx.globalAlpha = 1;

      animationId = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!animationId && isVisible) {
        animationId = requestAnimationFrame(animate);
      }
    };

    const stopAnimation = () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isVisible) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isVisible || !e.touches[0]) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.x = -2000;
      mouse.y = -2000;
      mouse.active = false;
    };

    resize();

    // IntersectionObserver: pauses rAF loop when Pricing section is not visible
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible = entry.isIntersecting;
        if (isVisible) {
          startAnimation();
        } else {
          stopAnimation();
        }
      },
      { threshold: 0.02 }
    );
    observer.observe(canvas);

    const handleVisibility = () => {
      if (document.hidden) {
        stopAnimation();
      } else if (isVisible) {
        startAnimation();
      }
    };

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleMouseLeave, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    startAnimation();

    return () => {
      stopAnimation();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [color, scale]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '120%',
        height: '140%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}
