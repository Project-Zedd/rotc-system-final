# ROTC Attendance System

A comprehensive military-themed attendance and cadet tracking system for Reserve Officers' Training Corps (ROTC) programs.

## 🎯 Overview

This system provides a complete solution for managing ROTC cadet attendance, ID cards, merit/demerit tracking, and study resources. Built with modern technologies and designed to support up to 3000 cadets.

## ✨ Features

### Core Features
- **QR Code Attendance**: Scan-based attendance tracking with geolocation
- **ID Card Generation**: Military-themed QR-coded ID cards
- **Multi-format Import**: Excel/Docx/PDF roster import
- **Google Forms Integration**: Automated cadet registration
- **Enhanced Authentication**: 
  - Biometric authentication support
  - Device fingerprinting
  - Multi-organization support
  - Advanced security policies
  - 2FA with backup codes

### Training Management
- **Physical Fitness**: 
  - Comprehensive PFT tracking
  - Score calculations and analytics
  - Historical performance trends
  - Passing standards monitoring
- **Leadership Development**:
  - Evaluation tracking
  - Performance metrics
  - Competency assessments
  - Progress reporting
- **Skills Progression**:
  - Skill certification system
  - Training hours logging
  - Proficiency level tracking
  - Assessment history
- **Training Events**:
  - Event scheduling and management
  - Enrollment tracking
  - Prerequisites verification
  - Completion tracking

### Equipment & Resources
- **Inventory Management**:
  - Equipment and uniform tracking
  - Size-based inventory
  - Maintenance scheduling
  - Low stock alerts
- **Checkout System**:
  - Digital checkout/return process
  - Due date tracking
  - Condition assessment
  - Usage history
- **Maintenance Tracking**:
  - Scheduled maintenance
  - Repair history
  - Cost tracking
  - Service records

### Communication & Notifications
- **Real-time Messaging**:
  - Thread-based conversations
  - File attachments
  - Read receipts
  - Message history
- **Announcement System**:
  - Priority-based communications
  - Target audience selection
  - Acknowledgment tracking
  - Expiration management
- **Multi-channel Notifications**:
  - In-app notifications
  - Email integration
  - SMS alerts
  - Push notifications
- **Emergency Alerts**:
  - Urgent communication system
  - Mass notification capability
  - Delivery confirmation
  - Response tracking

### Admin Features
- **Advanced Dashboard**: Real-time statistics across all modules
- **Batch Operations**: Bulk processing for all system functions
- **Comprehensive Audit Logging**: Detailed activity tracking
- **Role-based Access Control**: Granular permission management
- **Analytics & Reporting**: Cross-module data analysis

### Cadet Features
- **Unified Dashboard**: Complete performance overview
- **Training Portfolio**: Comprehensive skill and certification tracking
- **Equipment Management**: Personal inventory and checkout history
- **Communication Center**: Integrated messaging and notification hub
- **Profile & Progress**: Detailed personal development tracking

## 🛠 Technology Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** for primary database
- **Redis** for caching and real-time features
- **AWS Services**:
  - S3 for file storage
  - SES for email delivery
  - SNS for SMS notifications
- **Authentication & Security**:
  - JWT with refresh tokens
  - WebAuthn for biometric auth
  - OAuth 2.0 integration
  - Rate limiting and CORS
  - IP whitelisting

### Frontend
- **Progressive Web App (PWA)**:
  - Offline functionality
  - Push notifications
  - Mobile responsiveness
- **Real-time Features**:
  - WebSocket communications
  - Live updates
  - Presence tracking
- **Advanced UI Components**:
  - Interactive dashboards
  - Data visualizations
  - QR code scanning
  - File upload/preview

### Infrastructure
- **Docker** containerization
- **Docker Compose** for orchestration
- **Environment-based configuration**
- **Scalability Features**:
  - Horizontal scaling support
  - Load balancing
  - Service redundancy
- **Monitoring & Logging**:
  - Performance metrics
  - Error tracking
  - Audit logging
  - Health checks

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- MongoDB 5.0+
- Redis 6.0+
- AWS Account with following services:
  - S3 for file storage
  - SES for email delivery
  - SNS for SMS notifications
- SSL Certificate (for WebAuthn)

### Installation

1. **Clone the repository**
```bash
git clone [repository-url]
cd rotc-system
```

2. **Install dependencies**
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. **Environment setup**
```bash
# Backend configuration
cd backend
cp .env.example .env

# Frontend configuration
cd ../frontend
cp .env.example .env

# Edit both .env files with your configuration
```

4. **Database setup**
```bash
# Initialize MongoDB
cd ../backend
npm run db:init

# Run migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

5. **Security setup**
```bash
# Generate security keys for WebAuthn
npm run generate-keys

# Configure SSL (required for WebAuthn)
# Place your SSL certificates in the config/ssl directory
```

6. **Start the application**
```bash
# Development mode
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev

# Production mode
docker-compose up -d
```

### Additional Configuration

1. **AWS Services Setup**
- Configure S3 bucket with proper CORS settings
- Set up SES for email delivery
- Configure SNS for SMS notifications
- Add AWS credentials to environment variables

2. **Security Configuration**
- Set up SSL certificates
- Configure WebAuthn parameters
- Set up IP whitelist
- Configure rate limiting

3. **Monitoring Setup**
- Configure logging settings
- Set up health checks
- Configure performance monitoring
- Set up error tracking

### Docker Deployment
```bash
docker-compose up -d
```

## 📊 Database Schema

### Core Tables
- `cadets` - Cadet information and profiles
- `attendance` - Attendance records and scans
- `merit_demerits` - Merit and demerit tracking
- `badges` - Badge definitions and criteria
- `resources` - Study materials and files
- `events` - Training events and schedules

### Key Relationships
- Cadets ↔ Attendance (one-to-many)
- Cadets ↔ Merit/Demerits (one-to-many)
- Cadets ↔ Badges (many-to-many)
- Events ↔ Attendance (one-to-many)

## 🔧 Configuration

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/rotc_db

# Redis
REDIS_URL=redis://localhost:6379

# AWS
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket

# JWT
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
```

## 📱 Usage

### Admin Access
- **URL**: `http://localhost:5000/admin.html`
- **Default Login**: Configure in admin settings

### Cadet Access
- **URL**: `http://localhost:5000/cadet.html`
- **Login**: Student number + default password (last name + birth year)

### QR Code Scanning
- **Admin Scanner**: `http://localhost:5000/admin-scan.html`
- **Mobile Compatible**: Works on all devices

## 🎨 Military Theme

The system features a professional military design with:
- **Color Palette**: Military green, camouflage, and earth tones
- **Typography**: Bold, military-style fonts
- **Responsive Design**: Mobile-first approach
- **Accessibility**: WCAG 2.1 compliant

## 🔐 Security Features

- **JWT Authentication**: Secure token-based auth
- **2FA Support**: Two-factor authentication for admins
- **IP Whitelisting**: Restrict access by IP
- **Rate Limiting**: Prevent abuse
- **Input Validation**: SQL injection prevention
- **HTTPS Enforcement**: SSL/TLS encryption

## 📈 Performance

- **Scalability**: Supports 3000+ cadets
- **Caching**: Redis for improved performance
- **CDN**: AWS CloudFront for static assets
- **Database Indexing**: Optimized queries
- **Background Jobs**: Async processing

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Load testing
npm run test:load
```

## 📚 API Documentation

Access the API documentation at:
- **Development**: `http://localhost:5000/api-docs`
- **Swagger UI**: Interactive API testing

## 🔄 Deployment

### Manual Deployment
1. Set up production environment variables
2. Run database migrations
3. Start with PM2: `pm2 start server.js`

### Docker Deployment
```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f
```

### Cloud Deployment
- **AWS ECS**: Container service
- **Heroku**: One-click deployment
- **DigitalOcean**: Droplet setup

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support, please contact:
- **Email**: support@rotc-system.com
- **Issues**: GitHub Issues
- **Documentation**: Wiki pages

## 🏆 Acknowledgments

- ROTC Command for requirements
- Development team for implementation
- Community for testing and feedback

---

**Built with ❤️ for ROTC programs worldwide**
