const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TaskSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['daily', 'occasional', 'avoid', 'break_day'], 
        required: true 
    },
    targetCount: { type: Number, default: 1 }, // e.g., 5 hours, or 1 time
    baseReward: { type: Number, default: 10 }, // stars earned for full completion
    penaltyIntensity: { type: Number, default: 0 }, // stars deducted if done (for 'avoid' tasks)
    targetDate: { type: Date }, // For occasional or break_day tasks
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Task', TaskSchema);
