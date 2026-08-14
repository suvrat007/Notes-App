const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    fullName: {type: String, required: true},
    email: {type: String, required: true, unique: true, lowercase: true, trim: true},
    /**
     * Absent for accounts that only ever signed in with Google — there is no
     * password to store, and a placeholder would be a password someone could
     * guess. `required` is a function so the two ways in can coexist.
     */
    password: {type: String, required: function () { return !this.googleId; }},
    /**
     * Google's stable subject id. `sparse` so the unique index ignores the
     * many rows that will never have one.
     */
    googleId: {type: String, unique: true, sparse: true},
    avatarUrl: {type: String, default: ''},
    totalStars: {type: Number, default: 0},
    createdAt: {type: Date, default: Date.now},
})

UserSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

/** What bcrypt output looks like: $2a/$2b/$2y, a cost, then 53 chars. */
const BCRYPT_SHAPE = /^\$2[aby]\$\d{2}\$.{53}$/;

/**
 * Check a password, and quietly upgrade it if it predates hashing.
 *
 * An early version of this app stored passwords as plain text. Those rows are
 * still in the database, and bcrypt.compare() against one always returns
 * false — so those accounts could never log in again, and the only clue was
 * "Invalid Credentials" on credentials that were perfectly correct.
 *
 * When the stored value is not a hash, it is compared directly and then
 * replaced with a real one. The user signs in as normal and their password
 * stops being readable by anyone with database access, without a reset email
 * or any idea it happened. A wrong password still fails, and nothing is
 * upgraded.
 */
UserSchema.methods.comparePassword = async function (candidate) {
    // A Google-only account has nothing to compare against, and bcrypt would
    // throw on an undefined hash. Refusing outright is the correct answer.
    if (!this.password) return false;

    if (BCRYPT_SHAPE.test(this.password)) {
        return bcrypt.compare(candidate, this.password);
    }

    // Legacy plaintext. Constant-time-ish comparison is pointless here — the
    // value is already exposed to anyone who can read it — so the only thing
    // that matters is replacing it the moment we know it is right.
    if (candidate !== this.password) return false;

    /*
     * Hash it here rather than reassigning and calling save(). Assigning the
     * same string does not mark the path modified, so the pre('save') hook
     * skips it and the row stays plaintext — silently, while still answering
     * "yes, correct password".
     */
    const hashed = await bcrypt.hash(candidate, 10);
    await this.constructor.updateOne({ _id: this._id }, { password: hashed });
    this.password = hashed;
    return true;
};

UserSchema.set('toJSON', {
    transform: (_doc, ret) => {
        delete ret.password;
        return ret;
    }
});

module.exports = mongoose.model('User', UserSchema);