require('dotenv').config();

/*
 * A `mongodb+srv://` URI needs a DNS SRV lookup, and some resolvers — corporate
 * networks, a few VPNs, the odd container — refuse that query type while
 * answering ordinary lookups happily. The failure reads as "querySrv
 * ECONNREFUSED", which looks nothing like a DNS policy problem.
 *
 * Setting DNS_SERVERS routes Node's lookups somewhere that answers. Unset,
 * which is the normal case, nothing changes.
 */
if (process.env.DNS_SERVERS) {
    require('dns').setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
}

const mongoose = require('mongoose');
mongoose.connect(process.env.VITE_MONGO_URI, { family: 4 })
    .catch((err) => console.error('[mongo] initial connect failed:', err.message));

/*
 * A dropped Atlas socket must not take the server with it.
 *
 * The driver's TLS connections get reset by the usual network weather: an idle
 * pool, a failover, a laptop lid. The driver reconnects on its own, but the
 * reset surfaces as an unhandled rejection first, and Node 20 treats that as
 * fatal — so a blip that the pool would have healed in a second instead killed
 * the process mid-request and logged every user out.
 *
 * These handlers keep the box alive and let the driver do its job. Anything
 * that is NOT a transient connection error still crashes loudly, because a
 * process quietly running in an unknown state is worse than one that restarts.
 */
const TRANSIENT = /ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|MongoNetworkError|connection .* closed/i;

mongoose.connection.on('error', (err) => {
    console.error('[mongo] connection error:', err.message);
});
mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected; the driver will retry');
});

process.on('unhandledRejection', (reason) => {
    const message = reason?.message ?? String(reason);
    if (TRANSIENT.test(message)) {
        console.error('[transient] recovered from:', message);
        return;
    }
    throw reason;
});

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();
const jwt = require('jsonwebtoken');

const User = require('./models/user.model.js');
const Task = require('./models/task.model.js');
const Log = require('./models/log.model.js');
const BreakDay = require('./models/breakday.model.js');
const { authenticateToken, COOKIE_NAME, cookieOptions } = require('./utilities.js');
const stars = require('./engine/stars.js');
const { rateLimit } = require('./lib/ratelimit.js');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(express.json());
app.use(cookieParser());
/*
 * Cookie-based auth requires an explicit origin (not "*") plus credentials.
 *
 * Both sides are NORMALISED before comparing. An Origin header is scheme +
 * host + port and never has a path, so a value pasted out of a browser bar
 * ("https://app.vercel.app/") can never match one, and "a.com, b.com" typed
 * with the natural space after the comma yields " b.com" which matches
 * nothing either. Both are silent, and both look identical to a missing
 * variable from the browser's side.
 */
const normaliseOrigin = (value) => String(value).trim().replace(/\/+$/, '');

const allowedOrigins = (process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:5174']
).map(normaliseOrigin).filter(Boolean);

console.log('[cors] allowing:', allowedOrigins.join(', '));

app.use(cors({
  origin(origin, callback) {
    // No Origin at all is a same-origin or non-browser caller (curl, a health
    // check); there is nothing to police.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(normaliseOrigin(origin))) return callback(null, true);

    /*
     * Say WHICH origin was turned away and what was on the list.
     *
     * Rejecting with an Error made this a generic 500 with no clue in it,
     * while the browser only ever reports "blocked by CORS policy" — so the
     * one machine that knows the answer was the one keeping it quiet.
     * `false` omits the CORS headers instead, which is the honest rejection.
     */
    console.warn(
      `[cors] refused ${origin}\n`
      + `       allowed: ${allowedOrigins.join(', ') || '(none)'}\n`
      + '       set CORS_ORIGIN to the exact scheme+host, comma separated.',
    );
    return callback(null, false);
  },
  credentials: true,
}));

const issueToken = (userId) =>
    jwt.sign({ _id: userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' });

// --- Auth Routes ---
app.post("/create-account", async(req, res) => {
    const { fullName, email, password } = req.body;

    if(!fullName) return res.status(400).json({error:true, message: "Full Name Required"});
    if(!email) return res.status(400).json({error:true, message: "Email Required"});
    if(!password) return res.status(400).json({error:true, message: "Password Required"});
    if(password.length < 8) return res.status(400).json({error:true, message: "Password must be at least 8 characters"});

    try {
        const isUser = await User.findOne({ email: email.toLowerCase() });
        if (isUser) return res.status(400).json({ error: true, message: "User already exists" });

        const user = new User({ fullName, email, password, totalStars: 0 });
        await user.save();

        res.cookie(COOKIE_NAME, issueToken(user._id), cookieOptions);
        return res.json({ error: false, user, message: "Registration Successful" });
    } catch (e) {
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

const loginLimit = rateLimit({
  name: 'login',
  limit: 12,
  windowMs: 300_000,
  message: 'Too many sign-in attempts. Wait a few minutes and try again.',
});

app.post("/login", loginLimit, async(req, res) => {
    const { email, password } = req.body;
    if(!email) return res.status(400).json({error:true, message: "Email Required"});
    if(!password) return res.status(400).json({error:true, message: "Password Required"});

    try {
        const userInfo = await User.findOne({ email: email.toLowerCase() });
        if(!userInfo) return res.status(400).json({error:true, message:"Invalid Credentials"});

        const isMatch = await userInfo.comparePassword(password);
        if (!isMatch) return res.status(400).json({ error: true, message: "Invalid Credentials" });

        res.cookie(COOKIE_NAME, issueToken(userInfo._id), cookieOptions);
        return res.json({ error:false, message:"Login Successful", email });
    } catch (e) {
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

/**
 * An ID token is a signed JWT — verified offline against Google's public keys.
 * This is the strongest check available and needs no network round trip.
 */
async function verifyIdToken(idToken) {
    const ticket = await googleClient.verifyIdToken({
        idToken,
        // Rejects a token minted for some OTHER application, which is how a
        // token stolen from an unrelated site would otherwise be replayed.
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
}

/**
 * An ACCESS token is opaque, so it has to be taken to Google to be identified.
 *
 * The audience check is the part that matters and the part that is easy to
 * forget: userinfo will happily describe a token issued to any application at
 * all, so without confirming `aud` is OUR client id, a token lifted from an
 * unrelated site would sign its bearer straight in as that person.
 */
async function verifyAccessToken(accessToken) {
    const infoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!infoRes.ok) throw new Error('Google did not recognise that token');
    const info = await infoRes.json();

    if (info.aud !== process.env.GOOGLE_CLIENT_ID) {
        throw new Error('That token was issued to a different application');
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) throw new Error('Could not read the Google profile');
    const p = await profileRes.json();

    return {
        sub: p.sub,
        email: p.email,
        // tokeninfo is authoritative on verification; userinfo may omit it.
        email_verified: p.email_verified === true || info.email_verified === 'true',
        name: p.name,
        picture: p.picture,
    };
}

/**
 * Sign in with Google.
 *
 * Whichever kind of token the browser managed to get, the server verifies it
 * with Google before trusting a word of it, and checks it was issued to THIS
 * application. That is the whole point of doing this server-side — a client
 * can claim to be anyone, so an unverified token is worth nothing.
 *
 * The outcome is the same httpOnly cookie the password flow issues, so every
 * route downstream is identical and neither way in is privileged.
 */
app.post("/auth/google", async (req, res) => {
    const { credential, accessToken } = req.body;
    if (!credential && !accessToken) {
        return res.status(400).json({ error: true, message: "No Google credential" });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(500).json({ error: true, message: "Google sign-in is not configured on the server" });
    }

    try {
        const payload = credential
            ? await verifyIdToken(credential)
            : await verifyAccessToken(accessToken);

        if (!payload || !payload.email_verified) {
            return res.status(401).json({ error: true, message: "That Google account has no verified email" });
        }

        const email = payload.email.toLowerCase();
        let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

        if (!user) {
            user = new User({
                fullName: payload.name || email.split('@')[0],
                email,
                googleId: payload.sub,
                avatarUrl: payload.picture || '',
            });
            await user.save();
        } else if (!user.googleId) {
            /*
             * An account already exists for this email under a password. Google
             * has verified the address belongs to whoever is signing in, so
             * linking is safe and beats telling someone their own email is
             * taken. The password is untouched — both ways in keep working.
             */
            user.googleId = payload.sub;
            if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture;
            await user.save();
        }

        res.cookie(COOKIE_NAME, issueToken(user._id), cookieOptions);
        return res.json({ error: false, message: "Login Successful", email: user.email });
    } catch (e) {
        return res.status(401).json({ error: true, message: "Google rejected that sign-in. Try again." });
    }
});

app.post("/logout", (req, res) => {
    /*
     * The clearing cookie has to match how it was SET — same path, domain,
     * sameSite and secure — or the browser treats it as a different cookie and
     * quietly keeps the original, leaving the user still logged in. maxAge is
     * dropped because Express 5 ignores it here and warns about it.
     */
    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie(COOKIE_NAME, clearOptions);
    return res.json({ error: false, message: "Logged out" });
});

app.get("/get-user", authenticateToken, async(req, res) => {
    const isUser = await User.findById(req.userId);
    if(!isUser) return res.status(404).json({error:true, message:"User not found"});
    return res.json({
        user: {
            fullName: isUser.fullName, email: isUser.email, _id: isUser._id,
            totalStars: isUser.totalStars, avatarUrl: isUser.avatarUrl,
            // Lets the UI offer "set a password" to a Google-only account.
            hasPassword: !!isUser.password,
        },
        message: ""
    });
});

/*
 * Habits, rewards and the day's state live in their own routers. They are a
 * few hundred lines between them, and folding that into this file would bury
 * the auth and task routes that were already here.
 */
app.use('/habits', require('./routes/habits.js'));
app.use('/rewards', require('./routes/rewards.js'));
app.use('/state', require('./routes/state.js'));
app.use('/stats', require('./routes/stats.js'));
app.use('/ledger', require('./routes/ledger.js'));
app.use('/manage', require('./routes/manage.js'));
app.use('/roadmap', require('./routes/roadmap.js'));
app.use('/rank', require('./routes/rank.js'));

/*
 * A day is stored as midnight UTC, and the whole app looks tasks up by exact
 * equality on that instant. A value carrying a time of day would be saved as
 * a moment no query ever asks for: the task exists and is invisible.
 */
const dayOnly = (v) => {
    if (!v) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : stars.dayStart(stars.dayKey(d));
};

// --- Tasks Routes ---
const createLimit = rateLimit({
  name: 'create',
  limit: 60,
  windowMs: 60_000,
  message: 'Too many things created at once. Try again shortly.',
});

app.post('/tasks', authenticateToken, createLimit, async (req, res) => {
    const { title, type, targetCount, baseReward, penaltyIntensity, targetDate,
            dueDate, repCadence } = req.body;
    try {
        const task = new Task({
            userId: req.userId,
            title, type, targetCount, baseReward, penaltyIntensity,
            targetDate: dayOnly(targetDate),
            dueDate: dayOnly(dueDate) || null,
            repCadence: repCadence === 'daily' ? 'daily' : 'anytime',
        });
        await task.save();
        return res.json({ error: false, task, message: "Task created successfully" });
    } catch(err) {
        return res.status(400).json({ error: true, message: err.message || "Could not create task" });
    }
});

app.get('/tasks', authenticateToken, async (req, res) => {
    try {
        const tasks = await Task.find({ userId: req.userId }).sort({ createdAt: -1 });
        return res.json({ error: false, tasks });
    } catch (e) {
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

app.patch('/tasks/:taskId', authenticateToken, async (req, res) => {
    const { title, targetCount, baseReward, penaltyIntensity, targetDate,
            dueDate, repCadence } = req.body;
    try {
        const task = await Task.findOneAndUpdate(
            { _id: req.params.taskId, userId: req.userId },
            /*
             * Only what was actually sent. A $set built from every field would
             * write undefined over a due date the caller never mentioned, and
             * a task would silently stop spanning because something else was
             * edited.
             */
            { $set: {
                title, targetCount, baseReward, penaltyIntensity,
                targetDate: dayOnly(targetDate),
                ...(dueDate !== undefined ? { dueDate: dayOnly(dueDate) || null } : {}),
                ...(req.body.googleEventId !== undefined ? { googleEventId: req.body.googleEventId } : {}),
                ...(req.body.googleTaskId !== undefined ? { googleTaskId: req.body.googleTaskId } : {}),
                ...(repCadence !== undefined
                    ? { repCadence: repCadence === 'daily' ? 'daily' : 'anytime' }
                    : {}),
            } },
            { new: true, runValidators: true }
        );
        if (!task) return res.status(404).json({ error: true, message: "Task not found" });
        return res.json({ error: false, task, message: "Task updated" });
    } catch (e) {
        return res.status(400).json({ error: true, message: e.message || "Could not update task" });
    }
});

app.delete('/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const result = await Task.deleteOne({ _id: req.params.taskId, userId: req.userId });
        if (result.deletedCount === 0) return res.status(404).json({ error: true, message: "Task not found" });
        return res.json({ error: false, message: "Task deleted" });
    } catch(e) {
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

// --- Break Days ---
// A break day is a calendar-level marking (independent of any task) the user
// can toggle directly from the calendar. Any positive stars earned on a break
// day count as a bonus, since the user wasn't expected to do anything that day.
app.post('/break-days', authenticateToken, async (req, res) => {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: true, message: "date is required" });
    try {
        const day = new Date(`${date}T00:00:00.000Z`);
        const existing = await BreakDay.findOne({ userId: req.userId, date: day });
        if (existing) {
            await BreakDay.deleteOne({ _id: existing._id });
            return res.json({ error: false, isBreakDay: false });
        }
        await BreakDay.create({ userId: req.userId, date: day });
        return res.json({ error: false, isBreakDay: true });
    } catch (e) {
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

app.get('/break-days', authenticateToken, async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const query = { userId: req.userId };
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        const breakDays = await BreakDay.find(query).sort({ date: 1 });
        return res.json({ error: false, breakDays });
    } catch (e) {
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

// --- Logs & Gamification ---
// Stars are computed here: partial completion for daily/occasional tasks (capped at
// 100% — overachieving earns no extra stars), penalties for 'avoid' tasks, nothing
// for break-day tasks. Positive stars earned on a calendar day marked as a break
// day get a bonus (the break-day bonus is a calendar-level concept, separate from
// the per-task overachievement cap).
const BREAK_DAY_BONUS = 1.5; // work done on a break day earns 150% of normal stars

const calculateStars = (task, completedCount) => {
    if (task.type === 'avoid') {
        return completedCount > 0 ? -Math.abs(task.penaltyIntensity * completedCount) : 0;
    }
    if (task.type === 'daily' || task.type === 'occasional') {
        const ratio = completedCount / task.targetCount;
        return Math.round(Math.min(ratio, 1) * task.baseReward);
    }
    return 0; // break_day task type
};

/*
 * The same ceiling for tasks. A debounced counter sends one request per
 * settled number, so even a fast worker sends a handful a minute.
 */
const taskLogLimit = rateLimit({
  name: 'task-log',
  limit: 40,
  windowMs: 60_000,
  message: 'That is a lot of updates in one minute. Take a breath and carry on.',
});

app.post('/logs', authenticateToken, taskLogLimit, async (req, res) => {
    const { taskId, date, completedCount } = req.body;
    if (!date || typeof completedCount !== 'number') {
        return res.status(400).json({ error: true, message: "date and completedCount are required" });
    }
    try {
        const task = await Task.findOne({ _id: taskId, userId: req.userId });
        if(!task) return res.status(404).json({ error: true, message: "Task not found" });

        // `date` is expected as a "yyyy-MM-dd" calendar day string (no time/timezone
        // component), so parsing it directly always lands on UTC midnight for that day.
        const logDate = new Date(`${date}T00:00:00.000Z`);

        /*
         * Tasks still log "the state of this task today" rather than appending
         * one row per unit, so this route rewrites its own entry instead of
         * stacking. It must write the LEDGER shape — kind, refId, starsDelta —
         * or the row fails validation and every task log 500s.
         */
        /*
         * Every row this task has ever written. A task with a deadline is
         * worked across several days, so what it has already been paid, and
         * how much of it was finished before today, both live in other rows.
         */
        const allRows = await Log.find({
            userId: req.userId, kind: 'task', refId: task._id,
        }).lean();

        const priorRows = allRows.filter((r) => r.date.getTime() !== logDate.getTime());
        const priorStars = priorRows.reduce((sum, r) => sum + (r.starsDelta || 0), 0);
        const progressBefore = priorRows
            .filter((r) => r.date < logDate)
            .reduce((max, r) => Math.max(max, r.completedCount || 0), 0);

        let log = await Log.findOne({
            userId: req.userId, kind: 'task', refId: task._id, date: logDate,
        });

        let previousStars = 0;
        let newCompletedCount = completedCount;

        /*
         * A `daily` task takes one unit a day however much is still owed.
         * Enforced HERE, not just in the UI: the cap is what makes "once a day
         * for five days" different from "five whenever", and a rule only the
         * browser knows is a rule anyone can skip.
         */
        if (task.repCadence === 'daily' && task.type !== 'avoid') {
            newCompletedCount = Math.min(newCompletedCount, progressBefore + 1);
        }

        if (log) {
            previousStars = log.starsDelta;
            // 'avoid' slip-ups accumulate per day; other types take the latest value.
            newCompletedCount = task.type === 'avoid' ? log.completedCount + completedCount : newCompletedCount;
            log.completedCount = newCompletedCount;
        } else {
            log = new Log({
                userId: req.userId,
                kind: 'task',
                refId: task._id,
                taskId: task._id,
                date: logDate,
                count: 1,
                starsDelta: 0,
                completedCount: newCompletedCount,
            });
        }

        let newStars = calculateStars(task, newCompletedCount);
        if (newStars > 0) {
            const isBreakDay = await BreakDay.exists({ userId: req.userId, date: logDate });
            if (isBreakDay) newStars = Math.round(newStars * BREAK_DAY_BONUS);
        }

        /*
         * calculateStars prices the task's TOTAL progress, so on a task worked
         * across several days every day would be paid the full running value
         * again — three days of a five-part job paying for eleven parts. Today
         * is credited only with what the task is worth now, less everything it
         * has already been paid. 'avoid' is excluded: each slip is its own
         * penalty, not a running total.
         */
        if (task.type !== 'avoid') newStars -= priorStars;

        log.starsDelta = newStars;
        await log.save();

        // Reflect completion on the task itself, so the dashboard and the
        // carry-over query agree with the ledger about what is finished.
        const target = Math.max(1, task.targetCount || 1);
        task.doneCount = Math.min(target, newCompletedCount);
        task.done = task.type !== 'avoid' && task.doneCount >= target;
        task.doneAt = task.done ? new Date() : null;
        await task.save();

        const userRec = await User.findByIdAndUpdate(
            req.userId,
            { $inc: { totalStars: newStars - previousStars } },
            { new: true }
        );

        return res.json({ error: false, log, totalStars: userRec.totalStars, message: "Log updated" });
    } catch(e) {
        console.error(e);
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

app.get('/logs', authenticateToken, async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const query = { userId: req.userId };
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else {
            // Avoid unbounded scans: default to the last 90 days when no range is given.
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            query.date = { $gte: ninetyDaysAgo };
        }
        const logs = await Log.find(query).populate('taskId').sort({ date: 1 });
        return res.json({ error: false, logs });
    } catch (e) {
        return res.status(500).json({ error: true, message: "Internal Server Error" });
    }
});

const port = process.env.PORT || 8000;
/**
 * Bring the collections' indexes in line with the schemas on boot.
 *
 * Specifically this DROPS the old unique index on (userId, taskId, date) that
 * the ledger used to carry. It made "one row per task per day" a database-level
 * rule, which is exactly what a habit logged three times in a morning breaks.
 * Mongoose will not remove a stale index on its own, so without this an
 * existing database rejects the second rep of the day with a duplicate key
 * error that looks like a bug in the app.
 */
async function syncIndexes() {
    try {
        await Promise.all([
            Log.syncIndexes(), Task.syncIndexes(), User.syncIndexes(),
            require('./models/habit.model.js').syncIndexes(),
            require('./models/reward.model.js').syncIndexes(),
        ]);
        console.log('Indexes in sync');
    } catch (e) {
        console.error('Index sync failed:', e.message);
    }
}

mongoose.connection.once('open', syncIndexes);

app.listen(port, () => console.log(`Server running on port ${port}`));

module.exports = app;