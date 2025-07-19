const express = require('express');
const router = express.Router();
const { PhysicalFitness, LeadershipEval, SkillProgression, TrainingEvent } = require('../models/training');
const { roleCheck } = require('../middleware/roleCheck');
const { validateObjectId } = require('../middleware/validation');

// Physical Fitness Test Routes
router.post('/pt-test', roleCheck(['admin', 'instructor']), async (req, res) => {
  try {
    const ptTest = new PhysicalFitness(req.body);
    await ptTest.save();
    res.status(201).json(ptTest);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/pt-test/cadet/:cadetId', validateObjectId('cadetId'), async (req, res) => {
  try {
    const tests = await PhysicalFitness.find({ cadetId: req.params.cadetId })
      .sort('-testDate')
      .populate('evaluator', 'name');
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Leadership Evaluation Routes
router.post('/leadership-eval', roleCheck(['admin', 'instructor']), async (req, res) => {
  try {
    const eval = new LeadershipEval({
      ...req.body,
      evaluator: req.user.id
    });
    await eval.save();
    res.status(201).json(eval);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/leadership-eval/cadet/:cadetId', validateObjectId('cadetId'), async (req, res) => {
  try {
    const evals = await LeadershipEval.find({ cadetId: req.params.cadetId })
      .sort('-evaluationDate')
      .populate('evaluator', 'name')
      .populate('reviewedBy', 'name');
    res.json(evals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Skill Progression Routes
router.post('/skill', roleCheck(['admin', 'instructor']), async (req, res) => {
  try {
    const skill = new SkillProgression({
      ...req.body,
      certifiedBy: req.user.id
    });
    await skill.save();
    res.status(201).json(skill);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/skills/cadet/:cadetId', validateObjectId('cadetId'), async (req, res) => {
  try {
    const skills = await SkillProgression.find({ cadetId: req.params.cadetId })
      .sort('skillCategory skill');
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Training Event Routes
router.post('/event', roleCheck(['admin']), async (req, res) => {
  try {
    const event = new TrainingEvent({
      ...req.body,
      instructors: [...(req.body.instructors || []), req.user.id]
    });
    await event.save();
    res.status(201).json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/events', async (req, res) => {
  try {
    const { start, end, type } = req.query;
    const query = {};
    
    if (start || end) {
      query.startDate = {};
      if (start) query.startDate.$gte = new Date(start);
      if (end) query.startDate.$lte = new Date(end);
    }
    
    if (type) query.type = type;
    
    const events = await TrainingEvent.find(query)
      .sort('startDate')
      .populate('instructors', 'name')
      .populate('enrolled.cadet', 'name');
      
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/event/:eventId/enroll', validateObjectId('eventId'), async (req, res) => {
  try {
    const event = await TrainingEvent.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    
    const enrollment = {
      cadet: req.user.id,
      status: event.enrolled.length >= event.maxParticipants ? 'waitlisted' : 'enrolled'
    };
    
    event.enrolled.push(enrollment);
    await event.save();
    
    res.json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
