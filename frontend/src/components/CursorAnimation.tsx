import { useEffect, useRef } from 'react';

export default function CursorAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    type Particle = {
      x: number;
      y: number;
      life: number;
      vx: number;
      vy: number;
      type: 'plus' | 'heart';
      scale: number;
      rotation: number;
      rotSpeed: number;
    };
    
    const particles: Particle[] = [];
    let mouse = { x: -100, y: -100 };
    let lastMouse = { x: -100, y: -100 };

    const onMouseMove = (e: MouseEvent) => {
      lastMouse.x = mouse.x;
      lastMouse.y = mouse.y;
      mouse.x = e.clientX;
      mouse.y = e.clientY;

      const dist = Math.hypot(mouse.x - lastMouse.x, mouse.y - lastMouse.y);
      if (dist > 5) {
        // Spawn particles when mouse moves fast enough
        if (Math.random() > 0.6) {
           particles.push({
             x: mouse.x,
             y: mouse.y,
             life: 1,
             vx: (Math.random() - 0.5) * 2,
             vy: Math.random() * -1.5 - 0.5,
             type: Math.random() > 0.4 ? 'plus' : 'heart', // More medical crosses
             scale: Math.random() * 0.5 + 0.5,
             rotation: Math.random() * Math.PI * 2,
             rotSpeed: (Math.random() - 0.5) * 0.2
           });
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);

    const drawHeart = (ctx: CanvasRenderingContext2D, size: number) => {
      ctx.beginPath();
      const topCurveHeight = size * 0.3;
      ctx.moveTo(0, topCurveHeight);
      ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, topCurveHeight);
      ctx.bezierCurveTo(-size / 2, size / 2, 0, size * 0.8, 0, size);
      ctx.bezierCurveTo(0, size * 0.8, size / 2, size / 2, size / 2, topCurveHeight);
      ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, topCurveHeight);
      ctx.fill();
    };

    const drawPlus = (ctx: CanvasRenderingContext2D, size: number) => {
      ctx.beginPath();
      ctx.moveTo(-size/2, 0);
      ctx.lineTo(size/2, 0);
      ctx.moveTo(0, -size/2);
      ctx.lineTo(0, size/2);
      ctx.stroke();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 0.015; // Fade out speed
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.scale(p.scale * p.life, p.scale * p.life); // Shrink as they die
        
        ctx.globalAlpha = p.life;
        
        if (p.type === 'heart') {
          ctx.fillStyle = '#ef4444'; // Red-500
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ef4444';
          drawHeart(ctx, 16);
        } else {
          ctx.strokeStyle = '#3b82f6'; // Blue-500
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#3b82f6';
          drawPlus(ctx, 16);
        }
        
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full pointer-events-none z-[9999]" />;
}
