const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * THE STAR LEDGER. Append-only: every star ever earned or lost is one row.
 *
 * This used to be one row per task per day, enforced by a unique index. That
 * shape cannot say "three gym reps today" — and once habits exist, multiple
 * entries a day is the normal case, not an anomaly. So the uniqueness is gone
 * and each entry now carries its own signed delta.
 *
 * Nothing here is ever edited. Undo deletes the most recent matching row, which
 * is the only sanctioned delete; totals are always a sum over this collection,
 * never a counter someone incremented and hoped stayed right.
 *
 * NOTE: the old unique index (userId+taskId+date) must be dropped on an
 * existing database — `syncIndexes()` on boot does that, see index.js.
 */
const LogSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** What kind of thing this entry is about, and therefore what refId means. */
    kind: {
        type: String,
        enum: ['habit', 'task', 'redeem', 'missed-task', 'crew-podium'],
        required: true,
    },
    /** The habit / task / reward this refers to. */
    refId: { type: Schema.Types.ObjectId, required: true },

    /** The DAY this counts towards — midnight UTC, so days group cleanly. */
    date: { type: Date, required: true },

    /** Reps this entry represents. Usually 1. */
    count: { type: Number, default: 1 },
    /** Signed, and already computed by the engine. Negative for penalties. */
    starsDelta: { type: Number, required: true },

    /**
     * Kept so the old dashboard's task queries still read: a task log carries
     * both its taskId and its refId, which are the same value.
     */
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    completedCount: { type: Number, default: 0 },

    createdAt: { type: Date, default: Date.now },
});

/** The two reads that matter: a user's day, and one thing's history. */
LogSchema.index({ userId: 1, date: 1 });
LogSchema.index({ userId: 1, refId: 1, date: 1 });

module.exports = mongoose.model('Log', LogSchema);
