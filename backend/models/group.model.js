const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One line of a crew's assignment.
 *
 * A crew agrees to things of BOTH shapes, and the difference matters:
 *
 *   "gym 5 times a week, once a day"      a habit with a weekly goal
 *   "2 leetcode questions every day"      a habit with a daily quota
 *   "no smoking, 2 max this week"         a bad habit with an allowance
 *   "8 hours of work, every day"          a habit measured in hours
 *   "ship the deck by Friday"             a task with a deadline
 *
 * Only the last is a task. Modelling the assignment as tasks alone would
 * force every recurring promise into a checkbox and lose the goal, the
 * period, the unit and the penalty — which is most of what makes them mean
 * anything.
 *
 * This is the TEMPLATE. The real thing lives on each member's own list as an
 * ordinary Habit or Task (see `lib/crew.js`), which is why crew work shows up
 * on Home, the Roadmap, the Calendar and the stats with no extra plumbing.
 */
const SharedItemSchema = new Schema({
    kind: { type: String, enum: ['habit', 'task'], default: 'habit' },
    title: { type: String, required: true },

    /* ---- habit ---- */
    polarity: { type: String, enum: ['good', 'bad'], default: 'good' },
    starsPerRep: { type: Number, default: 10, min: 0 },
    /** Reps expected in a single day. 0 means "just tick it off". */
    dailyTarget: { type: Number, default: 0, min: 0 },
    /** Reps expected across the period. 0 means no goal to fall short of. */
    targetReps: { type: Number, default: 0, min: 0 },
    targetPeriodWeeks: { type: Number, default: 1, min: 1 },
    /** What one rep counts as: "km", "hours", "questions". */
    unit: { type: String, default: '', maxlength: 16 },
    /** Bad habits: how many are tolerated before the extra penalty bites. */
    dailyAllowance: { type: Number, default: 0, min: 0 },
    overagePenalty: { type: Number, default: 5, min: 0 },
    freeWithinAllowance: { type: Boolean, default: false },
    shortfallPenalty: { type: Number, default: 0, min: 0 },

    /* ---- task ---- */
    type: { type: String, enum: ['daily', 'occasional', 'avoid'], default: 'occasional' },
    baseReward: { type: Number, default: 10 },
    targetCount: { type: Number, default: 1, min: 1 },
    repCadence: { type: String, enum: ['anytime', 'daily'], default: 'anytime' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
});

/**
 * A crew: a roster, a shared assignment, and a weekly scoreboard.
 *
 * Members keep their own tasks and habits exactly as before. What the group
 * adds is a set of promises everyone carries, and a ranking over those ONLY —
 * scoring a member's personal work would mean whoever set themselves the most
 * generous rewards wins, which measures self-assessment rather than effort.
 */
const GroupSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 40 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** What you give someone so they can join. Short enough to read aloud. */
    inviteCode: { type: String, required: true, unique: true, uppercase: true },

    members: [{
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        joinedAt: { type: Date, default: Date.now },
    }],

    sharedItems: [SharedItemSchema],

    /**
     * The last week already paid out, as a yyyy-MM-dd Monday.
     * Settlement runs on read, so this is what stops a second reader in the
     * same week from awarding the podium twice.
     */
    lastPodiumWeek: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
});

/** "Which crews am I in" is the query every social read starts with. */
GroupSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('Group', GroupSchema);
