/* global use, db */
// MongoDB Playground for ROTC System
// Make sure you are connected to MongoDB in VS Code

// Select the ROTC database
use('rotc_system');

// Create collections with schemas

// Admins Collection
db.createCollection('admins', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username', 'email', 'role'],
      properties: {
        username: { bsonType: 'string' },
        name: { bsonType: 'string' },
        email: { bsonType: 'string' },
        phone: { bsonType: 'string' },
        role: { enum: ['super_admin', 'admin', 'instructor', 'quartermaster'] },
        biometricCredentials: { 
          bsonType: 'object',
          properties: {
            credentialId: { bsonType: 'string' },
            publicKey: { bsonType: 'string' },
            counter: { bsonType: 'number' }
          }
        },
        twoFactorSecret: { bsonType: 'string' },
        backupCodes: { 
          bsonType: 'array',
          items: { bsonType: 'string' }
        }
      }
    }
  }
});

// Physical Fitness Tests Collection
db.createCollection('physical_fitness_tests', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['cadetId', 'testDate', 'pushUps', 'sitUps', 'run'],
      properties: {
        cadetId: { bsonType: 'objectId' },
        testDate: { bsonType: 'date' },
        pushUps: {
          bsonType: 'object',
          required: ['count', 'score'],
          properties: {
            count: { bsonType: 'number' },
            score: { bsonType: 'number' },
            passingStandard: { bsonType: 'number' }
          }
        },
        sitUps: {
          bsonType: 'object',
          required: ['count', 'score'],
          properties: {
            count: { bsonType: 'number' },
            score: { bsonType: 'number' },
            passingStandard: { bsonType: 'number' }
          }
        },
        run: {
          bsonType: 'object',
          required: ['timeMinutes', 'timeSeconds', 'score'],
          properties: {
            timeMinutes: { bsonType: 'number' },
            timeSeconds: { bsonType: 'number' },
            score: { bsonType: 'number' },
            passingStandard: { bsonType: 'number' }
          }
        },
        totalScore: { bsonType: 'number' },
        passed: { bsonType: 'bool' },
        evaluator: { bsonType: 'objectId' }
      }
    }
  }
});

// Training Events Collection
db.createCollection('training_events', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['title', 'type', 'startDate', 'endDate'],
      properties: {
        title: { bsonType: 'string' },
        type: { enum: ['classroom', 'field', 'pt', 'lab', 'ftx'] },
        startDate: { bsonType: 'date' },
        endDate: { bsonType: 'date' },
        location: { bsonType: 'string' },
        description: { bsonType: 'string' },
        objectives: { 
          bsonType: 'array',
          items: { bsonType: 'string' }
        },
        requiredEquipment: {
          bsonType: 'array',
          items: { bsonType: 'string' }
        },
        maxParticipants: { bsonType: 'number' },
        enrolled: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['cadet', 'status'],
            properties: {
              cadet: { bsonType: 'objectId' },
              status: { enum: ['enrolled', 'waitlisted', 'completed', 'dropped'] },
              completionDate: { bsonType: 'date' }
            }
          }
        }
      }
    }
  }
});

// Leadership Evaluations Collection
db.createCollection('leadership_evaluations', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['cadetId', 'evaluationDate', 'eventType', 'metrics'],
      properties: {
        cadetId: { bsonType: 'objectId' },
        evaluationDate: { bsonType: 'date' },
        eventType: { enum: ['fieldTraining', 'leadershipLab', 'ftx', 'other'] },
        metrics: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['category', 'score'],
            properties: {
              category: { bsonType: 'string' },
              score: { bsonType: 'number' },
              maxScore: { bsonType: 'number' },
              comments: { bsonType: 'string' }
            }
          }
        },
        overallScore: { bsonType: 'number' },
        strengths: { 
          bsonType: 'array',
          items: { bsonType: 'string' }
        },
        areasForImprovement: {
          bsonType: 'array',
          items: { bsonType: 'string' }
        },
        evaluator: { bsonType: 'objectId' },
        reviewedBy: { bsonType: 'objectId' }
      }
    }
  }
});

db.createCollection('cadets', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'studentId'],
      properties: {
        name: { bsonType: 'string' },
        email: { bsonType: 'string' },
        studentId: { bsonType: 'string' },
        rank: { bsonType: 'string' },
        year: { enum: ['Freshman', 'Sophomore', 'Junior', 'Senior'] }
      }
    }
  }
});

// Inventory Items Collection
db.createCollection('inventory_items', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'category', 'quantity'],
      properties: {
        name: { bsonType: 'string' },
        category: { enum: ['uniform', 'equipment', 'supplies', 'weapons', 'other'] },
        stockNumber: { bsonType: 'string' },
        quantity: {
          bsonType: 'object',
          required: ['total', 'available'],
          properties: {
            total: { bsonType: 'number' },
            available: { bsonType: 'number' },
            reserved: { bsonType: 'number' },
            damaged: { bsonType: 'number' }
          }
        },
        sizes: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['size', 'quantity'],
            properties: {
              size: { bsonType: 'string' },
              quantity: { bsonType: 'number' }
            }
          }
        },
        location: {
          bsonType: 'object',
          properties: {
            building: { bsonType: 'string' },
            room: { bsonType: 'string' },
            shelf: { bsonType: 'string' }
          }
        },
        maintenanceSchedule: {
          bsonType: 'object',
          properties: {
            frequency: { bsonType: 'number' },
            lastMaintenance: { bsonType: 'date' },
            nextMaintenance: { bsonType: 'date' },
            procedure: { bsonType: 'string' }
          }
        }
      }
    }
  }
});

// Equipment Checkouts Collection
db.createCollection('equipment_checkouts', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['itemId', 'cadetId', 'quantity', 'checkedOutBy', 'dueDate'],
      properties: {
        itemId: { bsonType: 'objectId' },
        cadetId: { bsonType: 'objectId' },
        quantity: { bsonType: 'number' },
        size: { bsonType: 'string' },
        checkedOutBy: { bsonType: 'objectId' },
        checkedOutAt: { bsonType: 'date' },
        dueDate: { bsonType: 'date' },
        returnedAt: { bsonType: 'date' },
        returnedTo: { bsonType: 'objectId' },
        condition: {
          bsonType: 'object',
          properties: {
            checkedOut: { enum: ['new', 'good', 'fair', 'poor'] },
            returned: { enum: ['good', 'fair', 'poor', 'damaged', 'lost'] }
          }
        }
      }
    }
  }
});

// Communications Collection
db.createCollection('communications', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['type', 'sender', 'content'],
      properties: {
        type: { enum: ['announcement', 'message', 'alert'] },
        sender: { bsonType: 'objectId' },
        recipients: {
          bsonType: 'array',
          items: { bsonType: 'objectId' }
        },
        content: { bsonType: 'string' },
        priority: { enum: ['low', 'medium', 'high', 'urgent'] },
        status: { enum: ['sent', 'delivered', 'read'] },
        attachments: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            properties: {
              filename: { bsonType: 'string' },
              url: { bsonType: 'string' },
              type: { bsonType: 'string' }
            }
          }
        }
      }
    }
  }
});

// Insert initial admin user
db.getCollection('admins').insertOne({
  username: 'admin',
  name: 'System Administrator',
  email: 'admin@rotc.edu',
  role: 'super_admin',
  created_at: new Date(),
  updated_at: new Date()
});

// Insert sample cadets
db.getCollection('cadets').insertMany([
  {
    name: 'John Smith',
    email: 'john.smith@rotc.edu',
    rank: 'Cadet First Class',
    studentId: 'C2025001',
    year: 'Senior',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    name: 'Sarah Johnson',
    email: 'sarah.johnson@rotc.edu',
    rank: 'Cadet Second Class',
    studentId: 'C2026001',
    year: 'Junior',
    created_at: new Date(),
    updated_at: new Date()
  }
]);

// Insert sample training event
db.getCollection('training_events').insertOne({
  title: 'Field Training Exercise Alpha',
  type: 'ftx',
  startDate: new Date('2025-08-01'),
  endDate: new Date('2025-08-03'),
  location: 'Camp Bravo',
  description: 'Three-day field training exercise focusing on tactical operations',
  objectives: [
    'Land navigation proficiency',
    'Small unit tactics',
    'Leadership in field conditions'
  ],
  requiredEquipment: [
    'Combat uniform',
    'Field pack',
    'Navigation equipment'
  ],
  maxParticipants: 40,
  enrolled: [],
  created_at: new Date(),
  updated_at: new Date()
});

// Insert sample inventory items
db.getCollection('inventory_items').insertMany([
  {
    name: 'Combat Uniform',
    category: 'uniform',
    stockNumber: 'U-001',
    quantity: {
      total: 100,
      available: 75,
      reserved: 20,
      damaged: 5
    },
    sizes: [
      { size: 'S', quantity: 20 },
      { size: 'M', quantity: 30 },
      { size: 'L', quantity: 25 }
    ],
    location: {
      building: 'Supply Building A',
      room: '101',
      shelf: 'U1-A'
    },
    maintenanceSchedule: {
      frequency: 180, // days
      lastMaintenance: new Date('2025-06-01'),
      nextMaintenance: new Date('2025-12-01'),
      procedure: 'Inspect for damage, clean, repair if needed'
    },
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    name: 'Field Pack',
    category: 'equipment',
    stockNumber: 'E-001',
    quantity: {
      total: 50,
      available: 40,
      reserved: 8,
      damaged: 2
    },
    location: {
      building: 'Supply Building A',
      room: '102',
      shelf: 'E1-B'
    },
    created_at: new Date(),
    updated_at: new Date()
  }
]);

// Create indexes
db.cadets.createIndex({ 'studentId': 1 }, { unique: true });
db.cadets.createIndex({ 'email': 1 }, { unique: true });
db.admins.createIndex({ 'username': 1 }, { unique: true });
db.admins.createIndex({ 'email': 1 }, { unique: true });
db.inventory_items.createIndex({ 'stockNumber': 1 }, { unique: true });
db.training_events.createIndex({ 'startDate': 1 });
db.physical_fitness_tests.createIndex({ 'cadetId': 1, 'testDate': -1 });
db.equipment_checkouts.createIndex({ 'cadetId': 1, 'returnedAt': 1 });

// Verify data
print('Admin count:', db.admins.count());
print('Cadet count:', db.cadets.count());

// Query example: Find all senior cadets
const seniorCadets = db.cadets.find({ year: 'Senior' }).toArray();
print('Senior cadets:', JSON.stringify(seniorCadets, null, 2));
