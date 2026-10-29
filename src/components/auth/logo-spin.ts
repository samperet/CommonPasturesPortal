/**
 * The sign-in spin for the CVC logo: a slight clockwise wind-up, a fast
 * counter-clockwise release (the way the logo's click easter egg turns),
 * then a gradual wind-down. It keeps turning gently for as long as signing
 * in takes, and only settles — upright, on a whole turn — once `finish()`
 * is called. The motion is worked out as if turning clockwise and drawn
 * mirrored (`DIRECTION`).
 */

const WIND_UP_MS = 320;
const WIND_UP_DEG = -32; // against the spin
/** Which way it's drawn: -1 mirrors the clockwise motion worked out below into counter-clockwise. */
const DIRECTION = -1;
const HOLD_MS = 70; // a beat at full wind-up before the release
const RELEASE_DEG_PER_S = 1800; // five turns a second
const FRICTION_S = 0.75; // time constant of the slow-down
const LOADING_FLOOR_DEG_PER_S = 360; // keeps turning while still loading
const SETTLE_FROM_DEG_PER_S = 700; // start settling below this speed
const MIN_SETTLE_MS = 900;
const MAX_SETTLE_MS = 2400;

export interface LogoSpin {
  /** Loading is over: wind down to rest. Resolves once the logo is still. */
  finish(): Promise<void>;
  /** Stop immediately and reset (e.g. on unmount). */
  cancel(): void;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function startLogoSpin(node: HTMLElement): LogoSpin {
  if (prefersReducedMotion()) {
    return { finish: () => Promise.resolve(), cancel: () => undefined };
  }

  let angle = 0;
  let velocity = 0;
  let phase: "windup" | "spin" | "settle" | "done" = "windup";
  let loading = true;
  let settle: { from: number; to: number; start: number; duration: number } | null = null;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => (resolveDone = resolve));

  const start = performance.now();
  let last = start;
  let frame = 0;

  const render = () => {
    node.style.transform = `rotate(${angle * DIRECTION}deg)`;
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    phase = "done";
    angle = 0;
    node.style.transform = "";
    resolveDone();
  };

  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05); // don't jump after a stalled frame
    last = now;

    if (phase === "windup") {
      const t = (now - start) / WIND_UP_MS;
      angle = WIND_UP_DEG * easeOutCubic(Math.min(t, 1));
      if (now - start >= WIND_UP_MS + HOLD_MS) {
        phase = "spin";
        velocity = RELEASE_DEG_PER_S;
      }
    } else if (phase === "spin") {
      velocity *= Math.exp(-dt / FRICTION_S);
      if (loading) velocity = Math.max(velocity, LOADING_FLOOR_DEG_PER_S);
      angle += velocity * dt;
      if (!loading && velocity <= SETTLE_FROM_DEG_PER_S) {
        // Glide to the next whole turn at least half a turn ahead, starting
        // at the current speed (an ease-out cubic starts at 3 × distance / time).
        const to = Math.ceil((angle + 180) / 360) * 360;
        const duration = Math.min(
          Math.max((3 * (to - angle)) / velocity, MIN_SETTLE_MS / 1000),
          MAX_SETTLE_MS / 1000
        );
        settle = { from: angle, to, start: now, duration: duration * 1000 };
        phase = "settle";
      }
    } else if (phase === "settle" && settle) {
      const t = Math.min((now - settle.start) / settle.duration, 1);
      angle = settle.from + (settle.to - settle.from) * easeOutCubic(t);
      if (t >= 1) {
        stop();
        return;
      }
    }

    render();
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  return {
    finish() {
      loading = false;
      return done;
    },
    cancel: stop,
  };
}
