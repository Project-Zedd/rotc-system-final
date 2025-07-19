const mongoose = require('mongoose');

const physicalFitnessSchema = new mongoose.Schema({
  cadetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cadet', required: true },
  testDate: { type: Date, required: true },
  pushUps: { 
    count: Number,
    score: Number,
    passingStandard: Number
  },
  sitUps: {
    count: Number,
    score: Number,
    passingStandard: Number
  },
  run: {
    timeMinutes: Number,
    timeSeconds: Number,
    score: Number,
    passingStandard: Number
  },
  totalScore: Number,
  passed: Boolean,
  notes: String,
  evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

const leadershipEvalSchema = new mongoose.Schema({
  cadetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cadet', required: true },
  evaluationDate: { type: Date, required: true },
  eventType: {
    type: String,
    enum: ['fieldTraining', 'leadershipLab', 'ftx', 'other'],
    required: true
  },
  metrics: [{
    category: String,
    score: Number,
    maxScore: Number,
    comments: String
  }],
  overallScore: Number,
  strengths: [String],
  areasForImprovement: [String],
  evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

const skillProgressionSchema = new mongoose.Schema({
  cadetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cadet', required: true },
  skillCategory: {
    type: String,
    enum: ['tactical', 'technical', 'physical', 'leadership'],
    required: true
  },
  skill: { type: String, required: true },
  proficiencyLevel: {
    type: String,
    enum: ['untrained', 'basic', 'proficient', 'advanced', 'expert'],
    default: 'untrained'
  },
  certificationDate: Date,
  certifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  trainingHours: Number,
  assessments: [{
    date: Date,
    score: Number,
    notes: String,
    evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  }]
}, { timestamps: true });

const trainingEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['classroom', 'field', 'pt', 'lab', 'ftx'],
    required: true
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  location: String,
  description: String,
  objectives: [String],
  requiredEquipment: [String],
  prerequisites: [{
    skill: String,
    minimumLevel: String
  }],
  maxParticipants: Number,
  enrolled: [{
    cadet: { type: mongoose.Schema.Types.ObjectId, ref: 'Cadet' },
    status: {
      type: String,
      enum: ['enrolled', 'waitlisted', 'completed', 'dropped'],
      default: 'enrolled'
    },
    completionDate: Date
  }],
  instructors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }]
}, { timestamps: true });

// Export models
module.exports = {
  PhysicalFitness: mongoose.model('PhysicalFitness', physicalFitnessSchema),
  LeadershipEval: mongoose.model('LeadershipEval', leadershipEvalSchema),
  SkillProgression: mongoose.model('SkillProgression', skillProgressionSchema),
  TrainingEvent: mongoose.model('TrainingEvent', trainingEventSchema)
};
