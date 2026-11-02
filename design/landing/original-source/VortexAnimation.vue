<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  color: string;
}

const canvasRef = ref<HTMLCanvasElement | null>(null);

let animationId: number;
let time = 0;
let particles: Particle[] = [];
let ctx: CanvasRenderingContext2D | null = null;

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
    { cx: width * 0.5, cy: height * 0.5, scale: 1.2, fraction: 0.75, color: '#9b51e0' },    // Center (Huge)
    { cx: width * 0.2, cy: height * 0.35, scale: 0.25, fraction: 0.1, color: '#F96E2A' },    // Middle-Left (Small)
    { cx: width * 0.85, cy: height * 0.15, scale: 0.3, fraction: 0.15, color: '#80ced6' }    // Top-Right (Small)
  ];

  for (const cluster of clusters) {
    const localCount = Math.floor(count * cluster.fraction);
    
    for (let i = 0; i < localCount; i++) {
      const theta = i * 2.39996323; // Golden angle
      const maxSpread = Math.min(width, height) * 0.38 * cluster.scale;
      const rRatio = Math.sqrt((i + 1) / localCount);
      
      // Add a bit of noise to the radius so the spiral isn't perfectly rigid
      const orbitRadius = rRatio * maxSpread * (0.85 + Math.random() * 0.3);

      const x = cluster.cx + Math.cos(theta) * orbitRadius + (Math.random() - 0.5) * 4;
      const y = cluster.cy + Math.sin(theta) * orbitRadius + (Math.random() - 0.5) * 4;

    particles.push({
      x: x,
      y: y,
      baseX: x,
      baseY: y,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      radius: 0.8 + Math.random() * 2,
      alpha: 0.2 + Math.random() * 0.5,
      angle: 0,
      orbitRadius: 0,
      orbitSpeed: 0,
      color: cluster.color,
    });
  }
}
};

const animate = () => {
  if (!ctx || !canvasRef.value) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerX = width / 2;
  const centerY = height / 2;

  time += 0.016;

  // Clear background transparently to overlay nicely
  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    
    // Slow random drift to keep the circles alive
    p.baseX += (Math.random() - 0.5) * 0.5;
    p.baseY += (Math.random() - 0.5) * 0.5;

    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < mouse.radius && mouse.active) {
      // Start moving "here and there" randomly
      p.vx += (Math.random() - 0.5) * 10;
      p.vy += (Math.random() - 0.5) * 10;
      
      // Also repel from mouse
      const force = (1 - distance / mouse.radius) * mouse.force * 2;
      const angleToMouse = Math.atan2(dy, dx);
      p.vx += Math.cos(angleToMouse) * force;
      p.vy += Math.sin(angleToMouse) * force;
    } else {
      // Snap back tightly closed together
      const returnDx = p.baseX - p.x;
      const returnDy = p.baseY - p.y;
      p.vx += returnDx * 0.15;
      p.vy += returnDy * 0.15;
    }

    // Apply friction and velocity
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

const resize = () => {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  ctx = canvas.getContext("2d");
  if (!ctx) return;

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

onMounted(() => {
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseleave", handleMouseLeave);
  animationId = requestAnimationFrame(animate);
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener("resize", resize);
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseleave", handleMouseLeave);
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="vortex-canvas"
  ></canvas>
</template>

<style scoped>
.vortex-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Allows interactions with elements underneath */
  z-index: 0;
}
</style>
