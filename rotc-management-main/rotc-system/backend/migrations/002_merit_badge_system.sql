-- Create merit_demerits table
CREATE TABLE merit_demerits (
    id SERIAL PRIMARY KEY,
    cadet_id INTEGER NOT NULL REFERENCES cadets(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('merit', 'demerit')),
    points INTEGER NOT NULL CHECK (points > 0),
    reason TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    semester INTEGER CHECK (semester IN (1, 2)),
    week_number INTEGER CHECK (week_number >= 1 AND week_number <= 15),
    awarded_by INTEGER NOT NULL REFERENCES admin(id),
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for merit_demerits
CREATE INDEX idx_merit_demerits_cadet_id ON merit_demerits(cadet_id);
CREATE INDEX idx_merit_demerits_semester ON merit_demerits(semester);
CREATE INDEX idx_merit_demerits_date ON merit_demerits(date);
CREATE INDEX idx_merit_demerits_type ON merit_demerits(type);

-- Create badges table
CREATE TABLE badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    criteria TEXT NOT NULL,
    points_required INTEGER DEFAULT 0,
    category VARCHAR(50) NOT NULL,
    icon_url VARCHAR(500),
    color VARCHAR(7) DEFAULT '#4CAF50',
    created_by INTEGER NOT NULL REFERENCES admin(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create cadet_badges table
CREATE TABLE cadet_badges (
    id SERIAL PRIMARY KEY,
    cadet_id INTEGER NOT NULL REFERENCES cadets(id) ON DELETE CASCADE,
    badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    awarded_date DATE NOT NULL,
    awarded_by INTEGER NOT NULL REFERENCES admin(id),
    semester INTEGER CHECK (semester IN (1, 2)),
    week_number INTEGER CHECK (week_number >= 1 AND week_number <= 15),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cadet_id, badge_id, semester)
);

-- Create indexes for cadet_badges
CREATE INDEX idx_cadet_badges_cadet_id ON cadet_badges(cadet_id);
CREATE INDEX idx_cadet_badges_badge_id ON cadet_badges(badge_id);
CREATE INDEX idx_cadet_badges_semester ON cadet_badges(semester);

-- Insert default badges
INSERT INTO badges (name, description, criteria, category, points_required, color, created_by) VALUES
    ('Perfect Attendance', '100% attendance for the semester', 'No absences or tardiness for entire semester', 'Top Attendance', 0, '#4CAF50', 1),
    ('Academic Excellence', 'Top 10% in academic performance', 'Grade of 90% or higher in all subjects', 'Academic Excellence', 0, '#2196F3', 1),
    ('Leadership Award', 'Demonstrated exceptional leadership', 'Led team activities and mentored other cadets', 'Leadership', 0, '#FF9800', 1),
    ('Community Champion', 'Outstanding community service', 'Completed 20+ hours of community service', 'Community Service', 0, '#9C27B0', 1),
    ('Discipline Master', 'Exemplary discipline record', 'No demerits for entire semester', 'Discipline', 0, '#607D8B', 1),
    ('Physical Fitness Champion', 'Top physical fitness score', 'Scored 90% or higher in physical fitness tests', 'Physical Fitness', 0, '#FF5722', 1),
    ('Examiner of the Month', 'Outstanding performance as examiner', 'Consistently high scores in examination duties', 'Examiner Award', 0, '#795548', 1),
    ('Rising Star', 'Most improved cadet', 'Significant improvement in all areas', 'Special Recognition', 0, '#E91E63', 1);

-- Create trigger for updated_at
CREATE TRIGGER update_merit_demerits_updated_at BEFORE UPDATE ON merit_demerits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_badges_updated_at BEFORE UPDATE ON badges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create materialized view for cadet rankings
CREATE MATERIALIZED VIEW cadet_rankings AS
SELECT 
    c.id,
    c.student_number,
    c.first_name,
    c.last_name,
    c.course,
    COALESCE(SUM(CASE WHEN md.type = 'merit' THEN md.points ELSE -md.points END), 0) as total_points,
    COALESCE(SUM(CASE WHEN md.type = 'merit' THEN md.points ELSE 0 END), 0) as total_merits,
    COALESCE(SUM(CASE WHEN md.type = 'demerit' THEN md.points ELSE 0 END), 0) as total_demerits,
    COUNT(DISTINCT cb.badge_id) as total_badges,
    RANK() OVER (ORDER BY COALESCE(SUM(CASE WHEN md.type = 'merit' THEN md.points ELSE -md.points END), 0) DESC) as rank
FROM cadets c
LEFT JOIN merit_demerits md ON c.id = md.cadet_id
LEFT JOIN cadet_badges cb ON c.id = cb.cadet_id
GROUP BY c.id, c.student_number, c.first_name, c.last_name, c.course;

-- Create index on cadet_rankings
CREATE INDEX idx_cadet_rankings_rank ON cadet_rankings(rank);

-- Create function to refresh cadet rankings
CREATE OR REPLACE FUNCTION refresh_cadet_rankings()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW cadet_rankings;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-award badges based on criteria
CREATE OR REPLACE FUNCTION auto_award_badges()
RETURNS void AS $$
DECLARE
    cadet RECORD;
    badge RECORD;
    attendance_count INTEGER;
    demerit_count INTEGER;
    badge_exists INTEGER;
BEGIN
    -- Award Perfect Attendance badges
    FOR cadet IN SELECT * FROM cadets LOOP
        SELECT COUNT(*) INTO attendance_count
        FROM attendance
        WHERE cadet_id = cadet.id
        AND semester = EXTRACT(MONTH FROM CURRENT_DATE) < 6 ? 1 : 2
        AND status = 'P';
        
        SELECT COUNT(*) INTO demerit_count
        FROM merit_demerits
        WHERE cadet_id = cadet.id
        AND type = 'demerit'
        AND semester = EXTRACT(MONTH FROM CURRENT_DATE) < 6 ? 1 : 2;
        
        -- Check if already has Perfect Attendance badge
        SELECT COUNT(*) INTO badge_exists
        FROM cadet_badges
        WHERE cadet_id = cadet.id
        AND badge_id = (SELECT id FROM badges WHERE name = 'Perfect Attendance')
        AND semester = EXTRACT(MONTH FROM CURRENT_DATE) < 6 ? 1 : 2;
        
        IF attendance_count >= 15 AND demerit_count = 0 AND badge_exists = 0 THEN
            INSERT INTO cadet_badges (cadet_id, badge_id, awarded_date, awarded_by, semester, week_number)
            VALUES (cadet.id, (SELECT id FROM badges WHERE name = 'Perfect Attendance'), CURRENT_DATE, 1, EXTRACT(MONTH FROM CURRENT_DATE) < 6 ? 1 : 2, 15);
        END IF;
    END LOOP;
    
    -- Refresh rankings
    PERFORM refresh_cadet_rankings();
END;
$$ LANGUAGE plpgsql;
