const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One row per friendship, not two.
 *
 * Storing a row on each side means two writes to stay in step and a bug the
 * first time one of them fails, so a single row carries both people and the
 * pair is normalised: `a` is always the lower id. That makes "are these two
 * friends" one indexed lookup regardless of who is asking.
 *
 * `requestedBy` survives the normalisation because it is the one thing the
 * ordering destroys, and the recipient needs it to know whose invitation
 * they are looking at.
 */
const FriendshipSchema = new Schema({
    a: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    b: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
        type: String,
        enum: ['pending', 'accepted'],
        default: 'pending',
    },

    createdAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
});

/** One friendship per pair, in either direction. */
FriendshipSchema.index({ a: 1, b: 1 }, { unique: true });

/** Both ids in a stable order, so the pair has one canonical form. */
FriendshipSchema.statics.pair = function (x, y) {
    const [a, b] = [String(x), String(y)].sort();
    return { a, b };
};

module.exports = mongoose.model('Friendship', FriendshipSchema);
