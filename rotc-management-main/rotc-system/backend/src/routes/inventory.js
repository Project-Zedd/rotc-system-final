const express = require('express');
const router = express.Router();
const { InventoryItem, Checkout, MaintenanceLog } = require('../models/inventory');
const { roleCheck } = require('../middleware/roleCheck');
const { validateObjectId } = require('../middleware/validation');

// Inventory Item Routes
router.post('/items', roleCheck(['admin', 'quartermaster']), async (req, res) => {
  try {
    const item = new InventoryItem(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    const { category, lowStock, maintenance } = req.query;
    const query = {};
    
    if (category) query.category = category;
    if (lowStock === 'true') {
      query.$or = [
        { 'quantity.available': { $lte: '$minimumStock' } },
        { 'quantity.available': { $lte: '$reorderPoint' } }
      ];
    }
    if (maintenance === 'due') {
      query['maintenanceSchedule.nextMaintenance'] = { $lte: new Date() };
    }
    
    const items = await InventoryItem.find(query).sort('name');
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Checkout Routes
router.post('/checkout', roleCheck(['admin', 'quartermaster']), async (req, res) => {
  try {
    const { itemId, cadetId, quantity, size } = req.body;
    
    // Check item availability
    const item = await InventoryItem.findById(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    if (size) {
      const sizeInfo = item.sizes.find(s => s.size === size);
      if (!sizeInfo || sizeInfo.quantity < quantity) {
        return res.status(400).json({ error: 'Insufficient quantity available for selected size' });
      }
    } else if (item.quantity.available < quantity) {
      return res.status(400).json({ error: 'Insufficient quantity available' });
    }
    
    // Create checkout record
    const checkout = new Checkout({
      ...req.body,
      checkedOutBy: req.user.id
    });
    await checkout.save();
    
    // Update inventory quantities
    if (size) {
      const sizeIndex = item.sizes.findIndex(s => s.size === size);
      item.sizes[sizeIndex].quantity -= quantity;
    }
    item.quantity.available -= quantity;
    item.quantity.reserved += quantity;
    await item.save();
    
    res.status(201).json(checkout);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/return/:checkoutId', roleCheck(['admin', 'quartermaster']), validateObjectId('checkoutId'), async (req, res) => {
  try {
    const checkout = await Checkout.findById(req.params.checkoutId);
    if (!checkout) return res.status(404).json({ error: 'Checkout record not found' });
    if (checkout.returnedAt) return res.status(400).json({ error: 'Item already returned' });
    
    // Update checkout record
    checkout.returnedAt = new Date();
    checkout.returnedTo = req.user.id;
    checkout.condition.returned = req.body.condition;
    checkout.notes = req.body.notes;
    await checkout.save();
    
    // Update inventory quantities
    const item = await InventoryItem.findById(checkout.item);
    item.quantity.reserved -= checkout.quantity;
    
    if (req.body.condition === 'damaged') {
      item.quantity.damaged += checkout.quantity;
    } else if (req.body.condition !== 'lost') {
      item.quantity.available += checkout.quantity;
    }
    
    if (checkout.size) {
      const sizeIndex = item.sizes.findIndex(s => s.size === checkout.size);
      if (req.body.condition !== 'lost' && req.body.condition !== 'damaged') {
        item.sizes[sizeIndex].quantity += checkout.quantity;
      }
    }
    
    await item.save();
    
    res.json(checkout);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Maintenance Routes
router.post('/maintenance', roleCheck(['admin', 'quartermaster']), async (req, res) => {
  try {
    const maintenance = new MaintenanceLog({
      ...req.body,
      performedBy: req.user.id
    });
    await maintenance.save();
    
    // Update item maintenance schedule
    const item = await InventoryItem.findById(req.body.item);
    item.maintenanceSchedule.lastMaintenance = maintenance.date;
    item.maintenanceSchedule.nextMaintenance = maintenance.nextMaintenanceDue;
    await item.save();
    
    res.status(201).json(maintenance);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reports Routes
router.get('/reports/low-stock', roleCheck(['admin', 'quartermaster']), async (req, res) => {
  try {
    const items = await InventoryItem.find({
      $or: [
        { 'quantity.available': { $lte: '$minimumStock' } },
        { 'quantity.available': { $lte: '$reorderPoint' } }
      ]
    }).sort('name');
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/overdue', roleCheck(['admin', 'quartermaster']), async (req, res) => {
  try {
    const overdueCheckouts = await Checkout.find({
      returnedAt: null,
      dueDate: { $lt: new Date() }
    })
    .populate('item', 'name stockNumber')
    .populate('cadet', 'name email')
    .sort('dueDate');
    res.json(overdueCheckouts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
