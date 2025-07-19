const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['uniform', 'equipment', 'supplies', 'weapons', 'other'],
    required: true
  },
  description: String,
  stockNumber: { type: String, unique: true },
  quantity: {
    total: { type: Number, required: true },
    available: { type: Number, required: true },
    reserved: { type: Number, default: 0 },
    damaged: { type: Number, default: 0 }
  },
  sizes: [{
    size: String,
    quantity: Number
  }],
  location: {
    building: String,
    room: String,
    shelf: String
  },
  minimumStock: { type: Number, default: 0 },
  reorderPoint: { type: Number },
  reorderQuantity: { type: Number },
  supplier: {
    name: String,
    contact: String,
    leadTime: Number // in days
  },
  cost: {
    unit: Number,
    total: Number
  },
  lastInventoryDate: Date,
  nextInventoryDate: Date,
  maintenanceSchedule: {
    frequency: Number, // in days
    lastMaintenance: Date,
    nextMaintenance: Date,
    procedure: String
  }
}, { timestamps: true });

const checkoutSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  cadet: { type: mongoose.Schema.Types.ObjectId, ref: 'Cadet', required: true },
  quantity: { type: Number, required: true },
  size: String,
  checkedOutBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  checkedOutAt: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  returnedAt: Date,
  returnedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  condition: {
    checkedOut: { type: String, enum: ['new', 'good', 'fair', 'poor'], required: true },
    returned: { type: String, enum: ['good', 'fair', 'poor', 'damaged', 'lost'] }
  },
  notes: String
}, { timestamps: true });

const maintenanceLogSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  type: {
    type: String,
    enum: ['inspection', 'repair', 'cleaning', 'calibration', 'other'],
    required: true
  },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  date: { type: Date, default: Date.now },
  description: String,
  cost: Number,
  nextMaintenanceDue: Date,
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed'],
    required: true
  },
  notes: String
}, { timestamps: true });

// Add indexes
inventoryItemSchema.index({ stockNumber: 1 });
inventoryItemSchema.index({ category: 1 });
checkoutSchema.index({ cadet: 1 });
checkoutSchema.index({ item: 1 });
maintenanceLogSchema.index({ item: 1 });

// Export models
module.exports = {
  InventoryItem: mongoose.model('InventoryItem', inventoryItemSchema),
  Checkout: mongoose.model('Checkout', checkoutSchema),
  MaintenanceLog: mongoose.model('MaintenanceLog', maintenanceLogSchema)
};
