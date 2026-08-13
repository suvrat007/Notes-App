const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LogSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    date: { type: Date, required: true }, // The day the log corresponds to (midnight UTC for grouping)
    completedCount: { type: Number, default: 0 },
    starsEarned: { type: Number, default: 0 }, // can be negative for penalties
    createdAt: { type: Date, default: Date.now }
});

// Ensure a user can only have one log per task per day
LogSchema.index({ userId: 1, taskId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Log', LogSchema);
