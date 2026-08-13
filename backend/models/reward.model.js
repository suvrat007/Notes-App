const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Something worth earning, priced as a SHARE of everything earned so far.
 *
 * A flat price ages badly: 200 stars is a fortune at level 2 and pocket change
 * at level 20, so the same cheesecake quietly stops meaning anything. A
 * percentage keeps the sting proportional for the whole climb — and the damage
 * lands on the lifetime total, so a week off really does cost you rank.
 */
const RewardSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    /**
     * Share of lifetime stars this costs. The ladder is fixed rather than free
     * text so the choice stays a judgement about size, not arithmetic.
     */
    damagePct: { type: Number, enum: [20, 40, 60, 80, 100], default: 20 },
    archived: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

RewardSchema.index({ userId: 1, archived: 1 });

module.exports = mongoose.model('Reward', RewardSchema);
