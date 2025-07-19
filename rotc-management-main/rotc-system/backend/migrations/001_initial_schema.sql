-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE admin_role AS ENUM ('super_admin', 'scanner_admin');
CREATE TYPE attendance_status AS ENUM ('P', 'L', 'A');
CREATE TYPE update_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE request_type AS ENUM ('view', 'delete');
CREATE TYPE sync_status AS ENUM ('pending', 'synced', 'processing', 'completed', 'failed');

-- Create cadets table
CREATE TABLE cadets (
    id SERIAL PRIMARY KEY,
    student_number VARCHAR(50) UNIQUE NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    mi VARCHAR(10),
    course VARCHAR(100) NOT NULL,
    dob VARCHAR(20) NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    gender VARCHAR(10) NOT NULL,
    photo VARCHAR(500),
    emergency_contact VARCHAR(20),
    validity_date VARCHAR(20),
    qr_code TEXT,
    email VARCHAR(255),
    push_subscription JSON,
    google_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for cadets
CREATE INDEX idx_cadets_student_number ON cadets(student_number);
CREATE INDEX idx_cadets_google_id ON cadets(google_id);
CREATE INDEX idx_cadets_email ON cadets(email);

-- Create admin table
CREATE TABLE admin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role admin_role NOT NULL DEFAULT 'scanner_admin',
    two_fa_secret VARCHAR(255),
    two_fa_enabled BOOLEAN DEFAULT FALSE,
    webauthn_credentials JSON,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create attendance table with sharding support
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    cadet_id INTEGER NOT NULL REFERENCES cadets(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time_in TIMESTAMP,
    time_out TIMESTAMP,
    photo VARCHAR(500),
    event_name VARCHAR(255),
    status attendance_status NOT NULL,
    semester INTEGER CHECK (semester IN (1, 2)),
    week_number INTEGER CHECK (week_number >= 1 AND week_number <= 15),
    location JSON,
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of INTEGER REFERENCES attendance(id),
    sync_status sync_status DEFAULT 'synced',
    device_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY HASH (cadet_id);

-- Create attendance partitions (10 partitions for distributing load)
CREATE TABLE attendance_0 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 0);
CREATE TABLE attendance_1 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 1);
CREATE TABLE attendance_2 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 2);
CREATE TABLE attendance_3 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 3);
CREATE TABLE attendance_4 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 4);
CREATE TABLE attendance_5 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 5);
CREATE TABLE attendance_6 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 6);
CREATE TABLE attendance_7 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 7);
CREATE TABLE attendance_8 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 8);
CREATE TABLE attendance_9 PARTITION OF attendance FOR VALUES WITH (modulus 10, remainder 9);

-- Create indexes for attendance
CREATE INDEX idx_attendance_cadet_id ON attendance(cadet_id);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_semester ON attendance(semester);
CREATE INDEX idx_attendance_week_number ON attendance(week_number);
CREATE INDEX idx_attendance_sync_status ON attendance(sync_status);
CREATE INDEX idx_attendance_status ON attendance(status);

-- Create settings table
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES admin(id)
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
    ('scanner_state', 'off'),
    ('evening_enabled', 'false'),
    ('present_cutoff_time', '07:31'),
    ('attendance_cooldown_minutes', '15'),
    ('allowed_ips', '[]'),
    ('device_tokens', '[]'),
    ('duplicate_scan_window_seconds', '5'),
    ('offline_sync_interval_minutes', '10'),
    ('google_sheets_poll_interval_minutes', '10');

-- Create events table
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_date DATE NOT NULL,
    auto_enable_scanner BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES admin(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for events
CREATE INDEX idx_events_date ON events(event_date);

-- Create audit_logs table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin(id),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for audit logs
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Create pending_updates table
CREATE TABLE pending_updates (
    id SERIAL PRIMARY KEY,
    cadet_id INTEGER NOT NULL REFERENCES cadets(id) ON DELETE CASCADE,
    field VARCHAR(50) NOT NULL,
    new_value TEXT NOT NULL,
    status update_status DEFAULT 'pending',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES admin(id)
);

-- Create indexes for pending updates
CREATE INDEX idx_pending_updates_cadet_id ON pending_updates(cadet_id);
CREATE INDEX idx_pending_updates_status ON pending_updates(status);

-- Create data_requests table
CREATE TABLE data_requests (
    id SERIAL PRIMARY KEY,
    cadet_id INTEGER NOT NULL REFERENCES cadets(id) ON DELETE CASCADE,
    request_type request_type NOT NULL,
    status update_status DEFAULT 'pending',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES admin(id)
);

-- Create indexes for data requests
CREATE INDEX idx_data_requests_cadet_id ON data_requests(cadet_id);
CREATE INDEX idx_data_requests_status ON data_requests(status);

-- Create duplicate_scans table
CREATE TABLE duplicate_scans (
    id SERIAL PRIMARY KEY,
    original_scan_id INTEGER NOT NULL REFERENCES attendance(id),
    duplicate_scan_id INTEGER NOT NULL REFERENCES attendance(id),
    time_difference INTEGER NOT NULL,
    review_status update_status DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES admin(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for duplicate scans
CREATE INDEX idx_duplicate_scans_review_status ON duplicate_scans(review_status);
CREATE INDEX idx_duplicate_scans_created_at ON duplicate_scans(created_at);

-- Create offline_sync_queue table
CREATE TABLE offline_sync_queue (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    encrypted_data TEXT NOT NULL,
    sync_status sync_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP
);

-- Create indexes for offline sync queue
CREATE INDEX idx_offline_sync_queue_device_id ON offline_sync_queue(device_id);
CREATE INDEX idx_offline_sync_queue_sync_status ON offline_sync_queue(sync_status);

-- Create materialized view for attendance summary
CREATE MATERIALIZED VIEW attendance_summary AS
SELECT 
    date,
    COUNT(CASE WHEN status = 'P' THEN 1 END) as present_count,
    COUNT(CASE WHEN status = 'L' THEN 1 END) as late_count,
    COUNT(CASE WHEN status = 'A' THEN 1 END) as absent_count,
    COUNT(*) as total_count
FROM attendance
GROUP BY date;

-- Create index on materialized view
CREATE INDEX idx_attendance_summary_date ON attendance_summary(date);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_cadets_updated_at BEFORE UPDATE ON cadets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to auto-generate student numbers
CREATE OR REPLACE FUNCTION generate_student_number()
RETURNS TRIGGER AS $$
DECLARE
    gender_code VARCHAR(10);
    next_number INTEGER;
BEGIN
    -- Determine gender code
    IF NEW.gender = 'male' THEN
        gender_code := 'MALE';
    ELSE
        gender_code := 'FEMALE';
    END IF;
    
    -- Get the next number for this gender
    SELECT COALESCE(MAX(CAST(SUBSTRING(student_number FROM 'MS-32-[A-Z]+-([0-9]+)') AS INTEGER)), 0) + 1
    INTO next_number
    FROM cadets
    WHERE student_number LIKE 'MS-32-' || gender_code || '-%';
    
    -- Generate student number
    NEW.student_number := 'MS-32-' || gender_code || '-' || LPAD(next_number::TEXT, 4, '0');
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-generating student numbers
CREATE TRIGGER generate_student_number_trigger
    BEFORE INSERT ON cadets
    FOR EACH ROW
    WHEN (NEW.student_number IS NULL)
    EXECUTE FUNCTION generate_student_number();

-- Create default admin user (password: admin123)
INSERT INTO admin (username, password, email, role) VALUES
    ('admin', '$2a$10$YourHashedPasswordHere', 'admin@rotc-system.com', 'super_admin');
