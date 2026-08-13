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

    /** Manual sort position within its day. */
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

TaskSchema.index({ userId: 1, targetDate: 1 });
TaskSchema.index({ userId: 1, seriesId: 1, targetDate: 1 });

module.exports = mongoose.model('Task', TaskSchema);
