/**
 * A ceiling on how fast one account can write.
 *
 * Someone holding down the + is not logging a workout, they are minting stars,
 * and rank is only worth something if it cannot be manufactured. This stops the
 * mechanical case — dozens of writes a second — while leaving deliberate use
 * completely untouched: the limits below are far above what a person tapping a
 * button on purpose will ever reach.
 *
 * Deliberately NOT a cap on how much someone may achieve. Beating a goal is the
 * point of having one. What is limited here is the RATE of requests; the value
 * of work past a target is handled separately, by tapering what it earns.
 *
 * In memory, per process. This deployment runs a single instance, so that is
 * enough; behind more than one it would need shared storage, and the failure
 * mode is a limit that is n times looser rather than anything breaking.
 */

const BUCKETS = new Map();

/** Old entries are swept on write, so an idle process does not grow forever. */
const SWEEP_EVERY = 5000;
let writes = 0;

function sweep(now) {
  for (const [key, hits] of BUCKETS) {
    const live = hits.filter((t) => t > now - 3_600_000);
    if (live.length === 0) BUCKETS.delete(key);
    else BUCKETS.set(key, live);
  }
}

/**
 * @param {object} opts
 * @param {number} opts.limit   how many requests are allowed in the window
 * @param {number} opts.windowMs the window, in milliseconds
 * @param {string} opts.name    which bucket, so separate routes do not share one
 * @param {string} opts.message what the user is told when they hit it
 */
function rateLimit({ limit, windowMs, name, message }) {
  return (req, res, next) => {
    // Unauthenticated requests are limited by IP; everything else by account,
    // so one person on a shared network cannot lock out another.
    const who = req.userId ? String(req.userId) : (req.ip || 'anon');
    const key = `${name}:${who}`;
    const now = Date.now();

    if (++writes % SWEEP_EVERY === 0) sweep(now);

    const hits = (BUCKETS.get(key) || []).filter((t) => t > now - windowMs);

    if (hits.length >= limit) {
      const retryMs = windowMs - (now - hits[0]);
      res.set('Retry-After', String(Math.ceil(retryMs / 1000)));
      return res.status(429).json({
        error: true,
        rateLimited: true,
        retryAfter: Math.ceil(retryMs / 1000),
        message: message || 'That is faster than we can count. Give it a moment.',
      });
    }

    hits.push(now);
    BUCKETS.set(key, hits);
    return next();
  };
}

/** Only for tests: forget every bucket. */
function reset() {
  BUCKETS.clear();
  writes = 0;
}

module.exports = { rateLimit, reset };
