import React, { useEffect, useRef, useState } from 'react';

/**
 * The waiting room for a sleeping server.
 *
 * The backend sleeps when idle, and waking it can take the better part of a
 * minute. Forty-five seconds of a spinner is indistinguishable from a broken
 * app, and the person leaves — so the wait has to be worth sitting through
 * rather than merely decorated.
 *
 * Two phases, because most waits are not the long one:
 *
 *   0-4s   a title card. When the server is already awake this is the whole
 *          experience, and a game nobody asked to play would be in the way.
 *   4s+    a runner you can actually play, revealed only once the wait is
 *          real. One button, no instructions worth reading, forgiving on
 *          death — this is a waiting room, not a challenge.
 *
 * The progress bar is honest: it tracks elapsed time against the worst case
 * and stops short of full, because a bar that sits at 100% while nothing
 * happens is worse than no bar. Whatever happens here, the fetch it is
 * covering runs untouched in the background.
 */

/** What we tell people the worst case is, and pace the bar against. */
const COLD_START_MS = 45_000;
/** Before this, a title card is enough. */
const GAME_AT_MS = 4_000;

const LINES = [
  'You are what you repeatedly do.',
  'Not what you meant to do.',
  'Not what you said you would.',
  'The ledger only counts what happened.',
];

/* ------------------------------------------------------------------ *
 * The game. Canvas, one button, no dependencies.
 * ------------------------------------------------------------------ */
function useRunner(canvasRef, active) {
  const best = useRef(Number(localStorage.getItem('runner-best') || 0));
  const [score, setScore] = useState(0);
  const [high, setHigh] = useState(best.current);
  const jump = useRef(() => {});

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    // Draw at device resolution so the shapes are not soft on a phone.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const GROUND = cssH - 26;
    const GRAVITY = 0.58;
    /*
     * Tuned to the box, not by feel. Apex is v²/2g, so -11.2 threw the runner
     * 108px up inside a 120px canvas and straight out of the top. -7.8 peaks
     * around 52px: over the tallest obstacle (30px) with room to spare, and
     * still on screen.
     */
    const JUMP_V = -7.8;
    const CEILING = 6;

    let raf = 0;
    let last = performance.now();
    let running = true;

    const runner = { x: 34, y: GROUND, vy: 0, size: 16, onGround: true };
    let obstacles = [];
    let speed = 3.4;
    let spawnIn = 900;
    let points = 0;
    let sinceScore = 0;
    let flash = 0;

    jump.current = () => {
      if (runner.onGround) {
        runner.vy = JUMP_V;
        runner.onGround = false;
      }
    };

    const reset = () => {
      // Forgiving: keep the best, drop the run, carry straight on. Nobody
      // waiting on a server should be made to sit through a game-over screen.
      if (points > best.current) {
        best.current = points;
        localStorage.setItem('runner-best', String(points));
        setHigh(points);
      }
      obstacles = [];
      speed = 3.4;
      points = 0;
      setScore(0);
      flash = 12;
      runner.y = GROUND;
      runner.vy = 0;
      runner.onGround = true;
    };

    const frame = (now) => {
      if (!running) return;
      // Delta-timed so the game runs the same on a 60Hz and a 120Hz screen.
      const dt = Math.min(32, now - last) / 16.67;
      last = now;

      ctx.clearRect(0, 0, cssW, cssH);

      /* ground */
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, GROUND + 0.5);
      ctx.lineTo(cssW, GROUND + 0.5);
      ctx.stroke();

      /* runner */
      runner.vy += GRAVITY * dt;
      runner.y += runner.vy * dt;
      // Belt and braces: whatever the tuning, it never leaves the box.
      if (runner.y - runner.size < CEILING) {
        runner.y = CEILING + runner.size;
        runner.vy = Math.max(0, runner.vy);
      }
      if (runner.y >= GROUND) {
        runner.y = GROUND;
        runner.vy = 0;
        runner.onGround = true;
      }
      ctx.fillStyle = flash > 0 ? '#e5484d' : '#c0b3a5';
      ctx.fillRect(runner.x, runner.y - runner.size, runner.size * 0.72, runner.size);
      if (flash > 0) flash -= 1;

      /* obstacles */
      spawnIn -= dt * 16.67;
      if (spawnIn <= 0) {
        const tall = Math.random() > 0.72;
        obstacles.push({ x: cssW + 12, w: tall ? 9 : 12, h: tall ? 30 : 18 });
        // Never so soon that the gap is unjumpable at the current speed.
        spawnIn = Math.max(560, 1250 - speed * 70) + Math.random() * 420;
      }
      ctx.fillStyle = 'rgba(224,176,98,0.85)';
      obstacles = obstacles.filter((o) => {
        o.x -= speed * dt;
        ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
        return o.x + o.w > -20;
      });

      /* collision, with a slightly generous box */
      const rx = runner.x + 2;
      const rw = runner.size * 0.72 - 4;
      const ry = runner.y - runner.size + 2;
      for (const o of obstacles) {
        if (rx < o.x + o.w && rx + rw > o.x && ry + runner.size - 2 > GROUND - o.h) {
          reset();
          break;
        }
      }

      /* score and pace */
      sinceScore += dt * 16.67;
      if (sinceScore > 100) {
        sinceScore = 0;
        points += 1;
        setScore(points);
        speed = Math.min(8.5, 3.4 + points * 0.014);
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [active, canvasRef]);

  return { score, high, jump };
}

const ColdStart = () => {
  const [elapsed, setElapsed] = useState(0);
  const canvasRef = useRef(null);
  const playing = elapsed >= GAME_AT_MS;
  const { score, high, jump } = useRunner(canvasRef, playing);

  useEffect(() => {
    const started = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - started), 120);
    return () => clearInterval(id);
  }, []);

  // One button means every button: tap anywhere, space, or up.
  useEffect(() => {
    if (!playing) return undefined;
    const onKey = (ev) => {
      if (ev.code === 'Space' || ev.code === 'ArrowUp') { ev.preventDefault(); jump.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, jump]);

  const lineIndex = Math.min(LINES.length - 1, Math.floor(elapsed / 1100));
  // Eases towards the worst case and deliberately never arrives.
  const pct = Math.min(94, (elapsed / COLD_START_MS) * 100);
  const slow = elapsed > COLD_START_MS;

  return (
    <div
      className="fixed inset-0 bg-[#0d0f12] flex flex-col items-center justify-center px-6 select-none"
      onPointerDown={() => playing && jump.current()}
      data-testid="cold-start"
    >
      <h1 className="font-heading font-black tracking-[0.3em] text-white text-xl mb-8">FORGE</h1>

      {/* The title card. Most waits end here. */}
      <div className="h-16 flex items-center justify-center max-w-sm text-center" data-testid="cold-line">
        <p
          key={lineIndex}
          className="text-sm text-white/70 leading-relaxed"
          style={{ animation: 'coldFade 700ms ease-out both' }}
        >
          {LINES[lineIndex]}
        </p>
      </div>

      {/* The game, once the wait is real. */}
      <div
        className="w-full max-w-[420px] transition-opacity duration-700"
        style={{ opacity: playing ? 1 : 0, pointerEvents: playing ? 'auto' : 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-[120px] rounded-xl bg-black/30 border border-white/5"
          data-testid="runner-canvas"
        />
        <div className="flex items-center justify-between mt-2 text-[10px] text-white/35 tabular-nums">
          <span>{playing ? 'TAP OR SPACE TO JUMP' : ''}</span>
          <span data-testid="runner-score">{score}{high > 0 && ` · BEST ${high}`}</span>
        </div>
      </div>

      {/* Honest about what is happening and how long it can take. */}
      <div className="w-full max-w-[420px] mt-7">
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#c0b3a5] transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
            data-testid="cold-progress"
          />
        </div>
        <p className="text-[10px] text-white/30 mt-2 text-center">
          {slow
            ? 'Still waking the server. It has been longer than usual — hold on.'
            : elapsed > GAME_AT_MS
              ? 'Waking the server. This can take up to a minute on the first visit.'
              : 'Waking the server…'}
        </p>
      </div>

      <style>{`
        @keyframes coldFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
};

export default ColdStart;
