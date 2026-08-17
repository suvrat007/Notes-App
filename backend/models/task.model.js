const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TaskSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ['daily', 'occasional', 'avoid', 'break_day'],
        required: true
    },
    /**
     * How many units finish it ("read 2 PDFs" -> 2). `done` only becomes true
     * once doneCount reaches this, so a half-finished job never reads as done.
     */
    targetCount: { type: Number, default: 1, min: 1 },
    /** Units completed so far. Survives the day, which is what lets it carry. */
    doneCount: { type: Number, default: 0, min: 0 },

    baseReward: { type: Number, default: 10 }, // stars earned for full completion
    penaltyIntensity: { type: Number, default: 0 }, // stars deducted if done (for 'avoid' tasks)
    targetDate: { type: Date }, // For occasional or break_day tasks
    /**
     * The deadline, when there is one.
     *
     * A task with a due date is not a task for ONE day, it is a task for every
     * day between now and then. Without this a job entered on Monday and due
     * Friday vanished from Tuesday morning onward and was only rediscovered
     * once it was already late. Null means the task belongs to targetDate alone.
     */
    dueDate: { type: Date, default: null },

    /**
     * Whether the reps can be stacked.
     *
     * "Read 5 PDFs by Friday" can be five in one sitting; "walk once a day for
     * five days" cannot, and treating them the same makes one of the two a lie.
     * `anytime` lets a day take as many as you like; `daily` caps each day at
     * one, so the target genuinely spreads across the days it was meant to.
     */
    repCadence: {
        type: String,
        enum: ['anytime', 'daily'],
        default: 'anytime',
    },

    /** Local "HH:MM" when a clock time was given, else null. Display + sync only. */
    dueTime: { type: String, default: null },

    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    /**
     * Set once the overdue sweep has charged for this task, so a second pass
     * can never bill the user twice for the same miss.
     */
    missedHandled: { type: Boolean, default: false },

    /**
     * How often it comes back. `once` is a plain one-off; the others generate
     * real future rows rather than being computed from a rule, because the
     * overdue sweep, per-day completion and the ledger are all day-keyed
     * already and a rule-based model would mean rewriting all three.
     */
    horizon: {
        type: String,
        enum: ['once', 'daily', 'weekly', 'monthly'],
        default: 'once'
    },
    /** Groups the occurrences of one repeating task. Null for a one-off. */
    seriesId: { type: String, default: null, index: true },

    /**
     * Show this on the Roadmap.
     *
     * A repeating task IS a weekly commitment — "go to the gym, once a week"
     * is the same promise as a habit with a goal of 1, just expressed as a
     * task. Rather than make people model it twice, a task can join the
     * roadmap and be counted there.
     */
    onRoadmap: { type: Boolean, default: false },

    /** Where this task has been pushed outside the app, so it is pushed once. */
    googleTaskId: { type: String, default: null },
    googleEventId: { type: String, default: null },

    /** Manual sort position within its day. */
    /*
     * Set when this task was stamped out of a crew's shared assignment. The
     * task behaves exactly like any other; the tag is what lets the weekly
     * crew board find the work and score it.
     */
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
    /** Which shared task it is a copy of, so all copies can be found together. */
    groupTaskId: { type: Schema.Types.ObjectId, default: null },

    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

TaskSchema.index({ userId: 1, targetDate: 1 });
TaskSchema.index({ userId: 1, seriesId: 1, targetDate: 1 });
// A spanning task is found by the window it covers, not by a single day.
TaskSchema.index({ userId: 1, dueDate: 1, done: 1 });

module.exports = mongoose.model('Task', TaskSchema);
