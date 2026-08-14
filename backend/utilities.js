const jwt= require('jsonwebtoken');

const COOKIE_NAME = 'token';

function authenticateToken (req,res,next){

    const token = req.cookies?.[COOKIE_NAME];

    if (!token) return res.status(401).json({ error: true, message: "Unauthorized" });

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, payload) => {
        if (err) return res.status(401).json({ error: true, message: "Token expired or invalid" });
        req.userId = payload._id;
        next();
    });
}

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    authenticateToken,
    COOKIE_NAME,
    cookieOptions,
    cookieOptionsFor,
};
