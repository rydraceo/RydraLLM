"use client";

import { useEffect, useRef, useState } from "react";

// One idea, done well: the page is a living network. A slow field of nodes drifts behind the
// dashboard and reaches toward the cursor. Everything else stays still.

export function FxStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
@keyframes rydra-blob-a { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(7vw,5vh,0) scale(1.18); } }
@keyframes rydra-blob-b { 0%,100% { transform: translate3d(0,0,0) scale(1.1); } 50% { transform: translate3d(-6vw,-6vh,0) scale(0.95); } }
@keyframes rydra-scan { 0% { transform: translateY(-10vh); opacity: 0; } 12% { opacity: .5; } 88% { opacity: .5; } 100% { transform: translateY(110vh); opacity: 0; } }
@keyframes rydra-flow { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }
@keyframes rydra-ring { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes rydra-panel-in { from { opacity: 0; transform: translateX(28px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes rydra-msg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes rydra-think { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
.rydra-glass { background: rgba(19,12,36,.78); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.rydra-glass:hover { border-color: #3A2268; box-shadow: 0 0 0 1px rgba(124,58,237,.25), 0 14px 44px -18px rgba(124,58,237,.45); }
.rydra-glass { transition: box-shadow .3s ease, border-color .3s ease; }
.rydra-think { background: linear-gradient(90deg,#6B5C8A 20%,#D4A017 50%,#6B5C8A 80%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: rydra-think 2.2s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .rydra-anim, .rydra-think { animation: none !important; }
  .rydra-glass { transition: none; }
}
`,
      }}
    />
  );
}

// ─── Neural field ────────────────────────────────────────────────────────────
function NeuralField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type P = { x: number; y: number; vx: number; vy: number; r: number; gold: boolean };
    let w = 0, h = 0, raf = 0;
    let pts: P[] = [];
    const mouse = { x: -9999, y: -9999 };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const LINK = 150;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(72, Math.floor((w * h) / 24000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
        r: 1 + Math.random() * 1.4, gold: Math.random() < 0.14,
      }));
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!reduce) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(167,139,250,${(1 - d / LINK) * 0.26})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (md < 190) {
          ctx.strokeStyle = `rgba(212,160,23,${(1 - md / 190) * 0.5})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
      for (const p of pts) {
        ctx.fillStyle = p.gold ? "rgba(212,160,23,.85)" : "rgba(167,139,250,.75)";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = () => {
      if (!document.hidden) frame();
      raf = requestAnimationFrame(loop);
    };
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };

    resize();
    if (reduce) frame(); else raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden style={{ position: "absolute", inset: 0 }} />;
}

// Place as the first child of a container that has `isolation: isolate`.
export function AuroraBackground() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      <FxStyles />
      <div className="rydra-anim" style={{ position: "absolute", top: "-18%", left: "-10%", width: "55vw", height: "55vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(91,33,182,.34), transparent 65%)", filter: "blur(40px)", animation: "rydra-blob-a 26s ease-in-out infinite" }} />
      <div className="rydra-anim" style={{ position: "absolute", bottom: "-22%", right: "-12%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(212,160,23,.14), transparent 65%)", filter: "blur(50px)", animation: "rydra-blob-b 32s ease-in-out infinite" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(124,58,237,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,.055) 1px, transparent 1px)", backgroundSize: "52px 52px", WebkitMaskImage: "radial-gradient(ellipse at 50% 25%, #000 15%, transparent 72%)", maskImage: "radial-gradient(ellipse at 50% 25%, #000 15%, transparent 72%)" }} />
      <NeuralField />
      <div className="rydra-anim" style={{ position: "absolute", left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(167,139,250,.55), transparent)", animation: "rydra-scan 14s linear infinite" }} />
    </div>
  );
}

// ─── Count-up for values like "$841k", "1.38×", "2,130", "3.9" ───────────────
export function CountUp({ text, duration = 1100 }: { text: string; duration?: number }) {
  const m = text.match(/^([^0-9-]*)(-?[\d,]*\.?\d+)(.*)$/);
  const target = m ? parseFloat(m[2].replace(/,/g, "")) : NaN;
  const decimals = m ? (m[2].split(".")[1] ?? "").length : 0;
  const grouped = m ? m[2].includes(",") : false;
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = a + (target - a) * eased;
      setShown(v); from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  if (!m || !Number.isFinite(target)) return <>{text}</>;
  const formatted = shown.toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  return <>{m[1]}{formatted}{m[3]}</>;
}
