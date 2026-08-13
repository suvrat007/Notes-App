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

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

module.exports = {
    authenticateToken,
    COOKIE_NAME,
    cookieOptions,
};
