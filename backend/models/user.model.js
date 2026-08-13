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

UserSchema.methods.comparePassword = function (candidate) {
    // A Google-only account has nothing to compare against, and bcrypt would
    // throw on an undefined hash. Refusing outright is the correct answer.
    if (!this.password) return Promise.resolve(false);
    return bcrypt.compare(candidate, this.password);
};

UserSchema.set('toJSON', {
    transform: (_doc, ret) => {
        delete ret.password;
        return ret;
    }
});

module.exports = mongoose.model('User', UserSchema);