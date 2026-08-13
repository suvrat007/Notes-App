require('dotenv').config();

const mongoose = require('mongoose');
mongoose.connect(process.env.VITE_MONGO_URI, { family: 4 });

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

app.use(express.json());
app.use(cookieParser());
// Cookie-based auth requires an explicit origin (not "*") plus credentials: true.
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ["http://localhost:5173", "http://localhost:5174"];

app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }, 
  credentials: true 
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

app.post("/login", async(req, res) => {
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

app.post("/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.json({ error: false, message: "Logged out" });
});

app.get("/get-user", authenticateToken, async(req, res) => {
    const isUser = await User.findById(req.userId);
    if(!isUser) return res.status(404).json({error:true, message:"User not found"});
    return res.json({
        user: { fullName: isUser.fullName, email: isUser.email, _id: isUser._id, totalStars: isUser.totalStars },
        message: ""
    });
});

// --- Tasks Routes ---
app.post('/tasks', authenticateToken, async (req, res) => {
    const { title, type, targetCount, baseReward, penaltyIntensity, targetDate } = req.body;
    try {
        const task = new Task({
            userId: req.userId,
            title, type, targetCount, baseReward, penaltyIntensity, targetDate
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
    const { title, targetCount, baseReward, penaltyIntensity, targetDate } = req.body;
    try {
        const task = await Task.findOneAndUpdate(
            { _id: req.params.taskId, userId: req.userId },
            { $set: { title, targetCount, baseReward, penaltyIntensity, targetDate } },
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

app.post('/logs', authenticateToken, async (req, res) => {
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

        let log = await Log.findOne({ userId: req.userId, taskId: task._id, date: logDate });

        let previousStars = 0;
        let newCompletedCount = completedCount;
        if (log) {
            previousStars = log.starsEarned;
            // 'avoid' slip-ups accumulate per day; other task types are set to the latest value.
            newCompletedCount = task.type === 'avoid' ? log.completedCount + completedCount : completedCount;
            log.completedCount = newCompletedCount;
        } else {
            log = new Log({ userId: req.userId, taskId: task._id, date: logDate, completedCount: newCompletedCount });
        }

        let newStars = calculateStars(task, newCompletedCount);
        if (newStars > 0) {
            const isBreakDay = await BreakDay.exists({ userId: req.userId, date: logDate });
            if (isBreakDay) newStars = Math.round(newStars * BREAK_DAY_BONUS);
        }
        log.starsEarned = newStars;
        await log.save();

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
app.listen(port, () => console.log(`Server running on port ${port}`));

module.exports = app;