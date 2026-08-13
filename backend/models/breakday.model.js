const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BreakDaySchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true }, // calendar day, midnight UTC
    createdAt: { type: Date, default: Date.now }
});

BreakDaySchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('BreakDay', BreakDaySchema);
