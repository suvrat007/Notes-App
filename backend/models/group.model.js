const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * A shared assignment, held once at the group.
 *
 * The actual work is a normal Task on each member's own list — see
 * `lib/crew.js` for the fan-out. This is the template it was stamped from,
 * kept so the group can show what it agreed to, and so removing a shared
 * task can find every copy.
 */
const SharedTaskSchema = new Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['daily', 'occasional', 'avoid'], default: 'daily' },
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
 * adds is a set of tasks everyone carries, and a ranking over those tasks
 * ONLY — scoring a member's personal work would mean whoever set themselves
 * the most generous rewards wins, which measures self-assessment rather than
 * effort.
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

    sharedTasks: [SharedTaskSchema],

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
