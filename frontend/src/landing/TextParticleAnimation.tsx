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

    let animationId: number;
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

      const step = width < 768 ? 4 : 5;

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const index = (y * width + x) * 4;
          const alpha = data[index + 3];

          if (alpha > 128) {
            particles.push({
              x: x + (Math.random() - 0.5) * 100,
              y: y + (Math.random() - 0.5) * 100,
              baseX: x,
              baseY: y,
              vx: 0,
              vy: 0,
              radius: width < 768 ? 1.5 : 2,
            });
          }
        }
      }

      const ambientCount = width < 768 ? 200 : 600;
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
          radius: Math.random() * 3 + 1,
          isAmbient: true,
        });
      }
    };

    const animate = () => {
      if (!ctx || !canvasRef.current) return;
      const parent = canvasRef.current.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouse.radius && mouse.active) {
          const force = (mouse.radius - distance) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * mouse.force;
          p.vy -= Math.sin(angle) * force * mouse.force;
        } else {
          if (p.isAmbient) {
            p.baseX += (Math.random() - 0.5) * 2;
            p.baseY += (Math.random() - 0.5) * 2;
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

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#9b51e0';
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    const resize = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      ctx = canvas.getContext('2d');
      if (!ctx) return;

      const parent = canvas.parentElement;
      if (!parent) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(width, height);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
      mouse.x = -2000;
      mouse.y = -2000;
    };

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="text-particle-canvas" />;
}
