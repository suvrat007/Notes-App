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

    /**
     * What one unit IS, when it is not simply "a rep".
     *
     * "Run 10 kilometres this week" is not ten runs — it is one goal measured
     * in kilometres, and a run of 4 has to count as 4. With a unit set, every
     * log carries an AMOUNT and stars are paid per unit, so going past the
     * target keeps earning and stopping short is visible as a shortfall.
     * Empty means the old behaviour: one log, one rep.
     */
    unit: { type: String, default: '', trim: true, maxlength: 16 },

    /**
     * Charged once, when a period ends short of its target.
     *
     * A goal with no consequence for missing it is a wish. The sweep needs to
     * know which periods it has already settled or a second pass would bill
     * the same shortfall again, so the last settled period start is kept here.
     */
    lastShortfallPeriod: { type: String, default: null },
    /**
     * A target renegotiated for ONE period.
     *
     * "I could not run 8 so I ran 5 and did 1000 skips instead" is not a
     * failure, it is a swap — the week genuinely changed. Lowering targetReps
     * would rewrite the standing goal and quietly make every future week
     * easier, so the new number is pinned to the period it belongs to and
     * every other period keeps the original promise.
     *
     * Kept as history: what the goal was, what it became, and why.
     */
    periodOverrides: [{
        _id: false,
        periodStart: { type: String, required: true },
        target: { type: Number, required: true, min: 0 },
        was: { type: Number, default: 0 },
        reason: { type: String, default: '', maxlength: 140 },
        at: { type: Date, default: Date.now },
    }],
    /** Stars lost per missing unit when a period closes short. 0 disables it. */
    shortfallPenalty: { type: Number, default: 0, min: 0 },
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
