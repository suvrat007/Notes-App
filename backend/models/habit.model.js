const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * A HABIT is something you repeat forever; a Task is something you finish.
 *
 * Kept in its own collection rather than as another `Task.type`, because the
 * two answer different questions. A task asks "is it done yet"; a habit asks
 * "how often, and is that enough" — which needs a per-day quota, a per-period
 * goal, and for bad habits an allowance before the penalty escalates. Bolting
 * those onto Task would leave most of its columns null most of the time.
 */
const HabitSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: 'dumbbell' },

    /** 'good' earns stars; 'bad' costs them. */
    polarity: { type: String, enum: ['good', 'bad'], default: 'good' },

    /** Good: stars per rep. Bad: the base penalty per slip. */
    starsPerRep: { type: Number, default: 10, min: 0 },

    /* ---- bad habits only ---- */
    /** Slips allowed per day before the extra penalty applies. */
    dailyAllowance: { type: Number, default: 0, min: 0 },
    /** Extra stars lost per slip beyond the allowance. */
    overagePenalty: { type: Number, default: 5, min: 0 },
    /** When true, slips within the allowance are free and only overage bites. */
    freeWithinAllowance: { type: Boolean, default: false },

    /* ---- good habits only ---- */
    /**
     * Reps wanted EVERY DAY; 0 means no daily quota.
     *
     * Deliberately separate from `targetReps`: "5 gym sessions a week" is one
     * tick on five different days, while "20 pushups a day" is a counter that
     * only reads as done at 20. The two cannot share a field.
     */
    dailyTarget: { type: Number, default: 0, min: 0 },
    /** Reps wanted across one goal period; 0 means no goal (and no roadmap). */
    targetReps: { type: Number, default: 0, min: 0 },
    /** Length of that period in weeks. 1 = weekly, 4 = monthly, 12 = quarterly. */
    targetPeriodWeeks: { type: Number, default: 1, min: 1 },
    /** Also surface it on the daily task list. */
    isRecurringTask: { type: Boolean, default: false },

    /** Manual sort position; ties fall back to createdAt. */
    order: { type: Number, default: 0 },
    /** Archived habits keep their history but leave the list. */
    archived: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

HabitSchema.index({ userId: 1, archived: 1, order: 1 });

module.exports = mongoose.model('Habit', HabitSchema);
