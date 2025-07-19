const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const speakeasy = require('speakeasy');
const { 
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// WebAuthn configuration
const webAuthnConfig = {
  rpName: 'ROTC Attendance System',
  rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  expectedOrigin: process.env.FRONTEND_URL || 'http://localhost:3000',
  // Enhanced security options
  authenticatorSelection: {
    authenticatorAttachment: 'platform',
    requireResidentKey: true,
    userVerification: 'required'
  },
  // Support for multiple organizations
  extensions: {
    largeBlob: {
      support: 'required'
    },
    credProps: true
  }
};

// JWT options
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  issuer: 'rotc-system',
  audience: 'rotc-users'
};

// Configure passport strategies
const configurePassport = (adminModel, cadetModel) => {
  // JWT Strategy for authenticated requests
  passport.use('jwt', new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      if (payload.type === 'admin') {
        const admin = await adminModel.findById(payload.id);
        if (admin) {
          return done(null, { ...admin, userType: 'admin' });
        }
      } else if (payload.type === 'cadet') {
        const cadet = await cadetModel.findById(payload.id);
        if (cadet) {
          return done(null, { ...cadet, userType: 'cadet' });
        }
      }
      return done(null, false);
    } catch (error) {
      logger.error('JWT Strategy error:', error);
      return done(error, false);
    }
  }));

  // Google OAuth Strategy for cadets
  passport.use('google-cadet', new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if cadet exists with this Google ID
      let cadet = await cadetModel.findByGoogleId(profile.id);
      
      if (!cadet) {
        // Check if cadet exists with this email
        const email = profile.emails[0].value;
        cadet = await cadetModel.findByEmail(email);
        
        if (cadet) {
          // Link Google account to existing cadet
          await cadetModel.updateGoogleId(cadet.id, profile.id);
          cadet.google_id = profile.id;
        } else {
          // Cadet must be registered through the form first
          return done(null, false, { message: 'Please register through the ROTC registration form first.' });
        }
      }
      
      return done(null, { ...cadet, userType: 'cadet' });
    } catch (error) {
      logger.error('Google Strategy error:', error);
      return done(error, false);
    }
  }));

  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, {
      id: user.id,
      type: user.userType
    });
  });

  // Deserialize user from session
  passport.deserializeUser(async (data, done) => {
    try {
      if (data.type === 'admin') {
        const admin = await adminModel.findById(data.id);
        done(null, { ...admin, userType: 'admin' });
      } else if (data.type === 'cadet') {
        const cadet = await cadetModel.findById(data.id);
        done(null, { ...cadet, userType: 'cadet' });
      } else {
        done(null, false);
      }
    } catch (error) {
      done(error, false);
    }
  });
};

// Two-Factor Authentication helpers
const twoFactorAuth = {
  // Generate 2FA secret
  generateSecret: (username) => {
    const secret = speakeasy.generateSecret({
      name: `ROTC System (${username})`,
      issuer: 'ROTC Attendance System',
      length: 32
    });
    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url
    };
  },

  // Verify 2FA token
  verifyToken: (secret, token) => {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps for clock skew
    });
  },

  // Generate backup codes
  generateBackupCodes: (count = 10) => {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(speakeasy.generateSecret({ length: 8 }).base32);
    }
    return codes;
  }
};

// WebAuthn helpers
const webAuthn = {
  // Generate registration options
  generateRegistrationOptions: async (user) => {
    const options = await generateRegistrationOptions({
      rpName: webAuthnConfig.rpName,
      rpID: webAuthnConfig.rpID,
      userID: user.id.toString(),
      userName: user.username || user.email,
      userDisplayName: user.name || user.username,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred'
      },
      timeout: 60000
    });

    return options;
  },

  // Verify registration response
  verifyRegistrationResponse: async (credential, expectedChallenge) => {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: expectedChallenge,
      expectedOrigin: webAuthnConfig.expectedOrigin,
      expectedRPID: webAuthnConfig.rpID
    });

    return verification;
  },

  // Generate authentication options
  generateAuthenticationOptions: async (allowCredentials = []) => {
    const options = await generateAuthenticationOptions({
      rpID: webAuthnConfig.rpID,
      allowCredentials: allowCredentials,
      userVerification: 'preferred',
      timeout: 60000
    });

    return options;
  },

  // Verify authentication response
  verifyAuthenticationResponse: async (credential, expectedChallenge, authenticator) => {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: expectedChallenge,
      expectedOrigin: webAuthnConfig.expectedOrigin,
      expectedRPID: webAuthnConfig.rpID,
      authenticator: authenticator
    });

    return verification;
  }
};

// IP Whitelist checker
const checkIPWhitelist = (ip, whitelist) => {
  if (!whitelist || whitelist.length === 0) {
    return true; // No whitelist configured, allow all
  }

  // Normalize IP (remove IPv6 prefix if present)
  const normalizedIP = ip.replace(/^::ffff:/, '');

  return whitelist.some(allowedIP => {
    // Support CIDR notation in the future
    return allowedIP === normalizedIP || allowedIP === ip;
  });
};

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  },
  name: 'rotc.sid'
};

// CORS configuration
const corsConfig = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:5173' // Vite dev server
    ];

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

// Security Policies
const securityPolicies = {
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventReuse: 5, // Remember last 5 passwords
    expiryDays: 90 // Password expiry in days
  },
  sessionPolicy: {
    maxConcurrentSessions: 2,
    inactivityTimeout: 15 * 60 * 1000, // 15 minutes
    absoluteTimeout: 12 * 60 * 60 * 1000 // 12 hours
  },
  devicePolicy: {
    requireTrustedDevice: true,
    maxDevicesPerUser: 3,
    requireDeviceVerification: true
  }
};

// Device Fingerprinting Configuration
const deviceFingerprinting = {
  factors: ['userAgent', 'screen', 'language', 'timezone', 'platform', 'cpu', 'memory'],
  threshold: 0.8, // Similarity threshold for device recognition
  verificationMethods: ['email', 'sms', 'authenticator'],
  trustDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
};

// Rate limiting configurations
const rateLimitConfigs = {
  // General API rate limit
  general: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  },

  // Strict rate limit for auth endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true
  },

  // Rate limit for import endpoint
  import: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many import requests, please try again later.'
  },

  // Rate limit for scanning
  scanning: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 scans per minute
    message: 'Scanning rate limit exceeded, please slow down.'
  }
};

module.exports = {
  configurePassport,
  twoFactorAuth,
  webAuthn,
  webAuthnConfig,
  checkIPWhitelist,
  sessionConfig,
  corsConfig,
  rateLimitConfigs,
  jwtOptions
};
