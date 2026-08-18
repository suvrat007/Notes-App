const jwt= require('jsonwebtoken');

const COOKIE_NAME = 'token';

const SESSION_DAYS = 30;
const COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Re-issue once the session is more than half spent.
 *
 * Refreshing on EVERY request would write a cookie on every call for no gain;
 * waiting until the halfway mark means one write every couple of weeks per
 * active user, and still leaves a fortnight of slack before anything lapses.
 */
const REFRESH_AFTER = COOKIE_MAX_AGE / 2;

const signSession = (userId) =>
    jwt.sign({ _id: userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: `${SESSION_DAYS}d` });

/**
 * Authenticate, and keep an active session alive.
 *
 * The token was signed once at login and never renewed, so everyone was
 * logged out on a fixed schedule no matter how much they used the app - open
 * it every day for a week and you were still thrown back to the login screen
 * on the seventh day.
 *
 * The session now SLIDES: using the app pushes the expiry out, so an active
 * user is never signed out, while an abandoned session still lapses on its own.
 */
function authenticateToken (req,res,next){

    const token = req.cookies?.[COOKIE_NAME];

    if (!token) return res.status(401).json({ error: true, message: "Unauthorized" });

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, payload) => {
        if (err) return res.status(401).json({ error: true, message: "Token expired or invalid" });
        req.userId = payload._id;

        /*
         * `exp` is in SECONDS since the epoch, which is the classic place to
         * be off by a thousand and either refresh on every request or never.
         */
        const msLeft = (payload.exp * 1000) - Date.now();
        if (msLeft < REFRESH_AFTER) {
            try {
                res.cookie(COOKIE_NAME, signSession(payload._id), cookieOptionsFor(req));
            } catch {
                /* a failed refresh is not a failed request; the old token still works */
            }
        }
        next();
    });
}

/**
 * How to write the auth cookie, decided PER REQUEST.
 *
 * A browser only stores a cookie from a cross-site response when it is marked
 * SameSite=None, and only accepts SameSite=None when it is also Secure. But
 * Secure is refused over plain http — including http://localhost — so the two
 * settings are not a deployment-wide choice at all. They depend on the request
 * actually in hand.
 *
 * Two earlier attempts got this wrong in opposite directions. Keying off
 * NODE_ENV broke the deployment, because Render does not set it: the cookie
 * went out without SameSite=None, the browser dropped it, login answered 200
 * and the next call came back 401. Keying off CORS_ORIGIN then broke local
 * development the moment the deployed frontend was added to it, because the
 * local server started marking cookies Secure over http and the browser
 * discarded those instead.
 *
 * Asking the request removes the guess. It is cross-site only when an Origin
 * header is present and names a different host, and Secure only when the
 * connection really is https — which behind Render's proxy means trusting
 * x-forwarded-proto.
 */
function cookieOptionsFor(req) {
    const origin = req?.get?.('origin');
    let crossSite = false;

    if (origin) {
        try {
            crossSite = new URL(origin).host !== req.get('host');
        } catch {
            // An unparseable Origin is not something to widen the cookie for.
        }
    }

    // Express sets req.secure from x-forwarded-proto when trust proxy is on;
    // read the header directly so this holds either way.
    const proto = req?.get?.('x-forwarded-proto') || req?.protocol || 'http';
    const isHttps = proto.split(',')[0].trim() === 'https';

    return {
        httpOnly: true,
        // SameSite=None is meaningless without Secure, and Secure is refused
        // over http, so the pair only makes sense together.
        secure: isHttps,
        sameSite: crossSite && isHttps ? 'none' : 'lax',
        maxAge: COOKIE_MAX_AGE,
    };
}

/** Kept for anything still importing it; prefer cookieOptionsFor(req). */
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE,
};

module.exports = {
    signSession,
    SESSION_DAYS,
    authenticateToken,
    COOKIE_NAME,
    cookieOptions,
    cookieOptionsFor,
};
