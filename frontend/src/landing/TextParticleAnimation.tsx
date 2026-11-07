import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  isAmbient?: boolean;
}

export default function TextParticleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let isVisible = true;
    let particles: Particle[] = [];

    const mouse = {
      x: -2000,
      y: -2000,
      active: false,
      radius: 120,
      force: 10,
    };

    const initParticles = (width: number, height: number) => {
      particles = [];

      const offCanvas = document.createElement('canvas');
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      if (!offCtx) return;

      offCanvas.width = width;
      offCanvas.height = height;

      const fontSize = width < 768 ? 55 : 110;
      offCtx.font = `900 ${fontSize}px "Inter", sans-serif`;
      offCtx.fillStyle = 'white';
      offCtx.textAlign = 'center';
      offCtx.textBaseline = 'middle';
      offCtx.fillText('OPTIMUS', width / 2, height / 2 - fontSize * 0.55);
      offCtx.fillText('ORIEN', width / 2, height / 2 + fontSize * 0.55);

      const imageData = offCtx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // Step 6 provides crisp typography rendering while keeping particle count lightweight
      const step = width < 768 ? 6 : 6;

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const index = (y * width + x) * 4;
          const alpha = data[index + 3];

          if (alpha > 128) {
            particles.push({
              x: x + (Math.random() - 0.5) * 80,
              y: y + (Math.random() - 0.5) * 80,
              baseX: x,
              baseY: y,
              vx: 0,
              vy: 0,
              radius: width < 768 ? 1.6 : 2.2,
            });
          }
        }
      }

      // Ambient floating particles
      const ambientCount = width < 768 ? 25 : 70;
      for (let i = 0; i < ambientCount; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        particles.push({
          x: rx,
          y: ry,
          baseX: rx,
          baseY: ry,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          radius: Math.random() * 2.5 + 1,
          isAmbient: true,
        });
      }
    };

    const animate = () => {
      if (!isVisible || !ctx || !canvasRef.current) return;
      const parent = canvasRef.current.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;

      ctx.clearRect(0, 0, width, height);

      // Batched drawing: 1 single beginPath & fill call for all particles
      ctx.fillStyle = '#9b51e0';
      ctx.beginPath();

      const pLen = particles.length;
      const mouseRadiusSq = mouse.radius * mouse.radius;

      for (let i = 0; i < pLen; i++) {
        const p = particles[i];

        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < mouseRadiusSq && mouse.active) {
          const distance = Math.sqrt(distSq);
          const force = (mouse.radius - distance) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * mouse.force;
          p.vy -= Math.sin(angle) * force * mouse.force;
        } else {
          if (p.isAmbient) {
            p.baseX += (Math.random() - 0.5) * 1.5;
            p.baseY += (Math.random() - 0.5) * 1.5;
          }
          const returnDx = p.baseX - p.x;
          const returnDy = p.baseY - p.y;
          p.vx += returnDx * 0.15;
          p.vy += returnDy * 0.15;
        }

        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;

        ctx.moveTo(p.x + p.radius, p.y);
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      }

      ctx.fill();

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

    const resize = () => {
      if (!canvasRef.current) return;
      const c = canvasRef.current;
      ctx = c.getContext('2d');
      if (!ctx) return;

      const parent = c.parentElement;
      if (!parent) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;

      c.width = width * dpr;
      c.height = height * dpr;
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(width, height);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isVisible || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isVisible || !canvasRef.current || !e.touches[0]) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
      mouse.x = -2000;
      mouse.y = -2000;
    };

    resize();

    // IntersectionObserver: automatically pauses rAF when Steps section is off-screen
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
    canvas.addEventListener('mousemove', handleMouseMove, { passive: true });
    canvas.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleMouseLeave, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    startAnimation();

    return () => {
      stopAnimation();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="text-particle-canvas" />;
}
