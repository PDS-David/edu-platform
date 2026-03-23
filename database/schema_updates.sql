-- ============================================
-- EAC LEARNING PLATFORM - DATABASE SCHEMA UPDATES
-- Version: 2.0
-- Date: 2026-03-13
-- Purpose: Add exam boards, analytics, video system, test builder
-- ============================================

-- ============================================
-- 1. EXAM BOARDS SYSTEM
-- ============================================

CREATE TABLE exam_boards (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200),
    description TEXT,
    country VARCHAR(100) DEFAULT 'Nigeria',
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    icon_emoji VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert the 7 exam boards
INSERT INTO exam_boards (code, name, full_name, description, country, display_order, icon_emoji) VALUES
('JAMB', 'JAMB/UTME', 'Joint Admissions and Matriculation Board', 'Unified Tertiary Matriculation Examination for Nigerian university admission', 'Nigeria', 1, '🎓'),
('WAEC', 'WAEC', 'West African Examinations Council', 'West African Senior School Certificate Examination', 'West Africa', 2, '📘'),
('OLEVEL', 'O-Levels', 'Ordinary Level Examinations', 'General Certificate of Education Ordinary Level', 'International', 3, '📗'),
('NECO', 'NECO', 'National Examinations Council', 'Senior School Certificate Examination', 'Nigeria', 4, '📙'),
('IELTS', 'IELTS', 'International English Language Testing System', 'English language proficiency test', 'International', 5, '🌍'),
('TOEFL', 'TOEFL', 'Test of English as a Foreign Language', 'English language proficiency test', 'International', 6, '🇺🇸'),
('SAT', 'SAT', 'Scholastic Assessment Test', 'Standardized test for US college admission', 'United States', 7, '🎯');

-- Add exam board to existing tables
ALTER TABLE subjects ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id);
ALTER TABLE courses ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id);
ALTER TABLE quizzes ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id);

-- Create index for faster filtering
CREATE INDEX idx_subjects_exam_board ON subjects(exam_board_id);
CREATE INDEX idx_courses_exam_board ON courses(exam_board_id);
CREATE INDEX idx_quizzes_exam_board ON quizzes(exam_board_id);

-- ============================================
-- 2. ENHANCED SUBJECTS WITH METRICS
-- ============================================

ALTER TABLE subjects ADD COLUMN question_count INTEGER DEFAULT 0;
ALTER TABLE subjects ADD COLUMN video_count INTEGER DEFAULT 0;
ALTER TABLE subjects ADD COLUMN notes_count INTEGER DEFAULT 0;
ALTER TABLE subjects ADD COLUMN past_papers_count INTEGER DEFAULT 0;
ALTER TABLE subjects ADD COLUMN icon_emoji VARCHAR(10);
ALTER TABLE subjects ADD COLUMN subject_code VARCHAR(20);

-- Update existing subjects with icons
UPDATE subjects SET icon_emoji = '🧮' WHERE name LIKE '%Math%';
UPDATE subjects SET icon_emoji = '⚡' WHERE name LIKE '%Physics%';
UPDATE subjects SET icon_emoji = '🧪' WHERE name LIKE '%Chemistry%';
UPDATE subjects SET icon_emoji = '🧬' WHERE name LIKE '%Biology%';
UPDATE subjects SET icon_emoji = '📝' WHERE name LIKE '%English%';
UPDATE subjects SET icon_emoji = '📊' WHERE name LIKE '%Economics%';
UPDATE subjects SET icon_emoji = '🏛️' WHERE name LIKE '%Government%';
UPDATE subjects SET icon_emoji = '💼' WHERE name LIKE '%Commerce%';

-- ============================================
-- 3. STUDENT ANALYTICS SYSTEM
-- ============================================

CREATE TABLE student_analytics (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    exam_board_id INTEGER REFERENCES exam_boards(id),
    
    -- Question Performance
    total_questions_attempted INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    wrong_answers INTEGER DEFAULT 0,
    accuracy_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Time Metrics
    total_study_time_seconds INTEGER DEFAULT 0,
    average_time_per_question INTEGER DEFAULT 0,
    fastest_question_time INTEGER,
    slowest_question_time INTEGER,
    
    -- Progress Metrics
    topics_started INTEGER DEFAULT 0,
    topics_completed INTEGER DEFAULT 0,
    topics_mastered INTEGER DEFAULT 0,
    completion_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Comparative Metrics
    class_average_score DECIMAL(5,2),
    percentile_rank INTEGER,
    rank_in_class INTEGER,
    
    -- Streaks and Engagement
    current_streak_days INTEGER DEFAULT 0,
    longest_streak_days INTEGER DEFAULT 0,
    last_activity_date DATE,
    total_login_days INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(student_id, course_id, subject_id)
);

CREATE INDEX idx_analytics_student ON student_analytics(student_id);
CREATE INDEX idx_analytics_subject ON student_analytics(subject_id);
CREATE INDEX idx_analytics_exam_board ON student_analytics(exam_board_id);

-- ============================================
-- 4. LEARNING GAPS DETECTION
-- ============================================

CREATE TABLE learning_gaps (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    topic_id INTEGER,
    topic_name VARCHAR(200) NOT NULL,
    
    -- Gap Analysis
    gap_severity VARCHAR(20) NOT NULL CHECK (gap_severity IN ('low', 'medium', 'high', 'critical')),
    accuracy_in_topic DECIMAL(5,2),
    questions_attempted INTEGER DEFAULT 0,
    questions_failed INTEGER DEFAULT 0,
    
    -- Recommendations
    recommended_actions TEXT,
    recommended_resources TEXT[],
    estimated_study_hours INTEGER,
    
    -- Status
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    
    identified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learning_gaps_student ON learning_gaps(student_id);
CREATE INDEX idx_learning_gaps_severity ON learning_gaps(gap_severity);
CREATE INDEX idx_learning_gaps_unresolved ON learning_gaps(is_resolved) WHERE is_resolved = false;

-- ============================================
-- 5. VIDEO SYSTEM WITH ENCRYPTION
-- ============================================

CREATE TABLE videos (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    topic_id INTEGER,
    
    title VARCHAR(200) NOT NULL,
    description TEXT,
    duration_seconds INTEGER,
    
    -- Video Files (Encrypted HLS)
    original_filename VARCHAR(255),
    encrypted_playlist_url TEXT NOT NULL, -- .m3u8 file
    encryption_key_id VARCHAR(100),
    thumbnail_url TEXT,
    
    -- Metadata
    video_quality VARCHAR(20) DEFAULT '720p',
    file_size_mb DECIMAL(10,2),
    upload_status VARCHAR(20) DEFAULT 'pending' CHECK (upload_status IN ('pending', 'processing', 'ready', 'failed')),
    
    -- Access Control
    is_free BOOLEAN DEFAULT false,
    required_tier VARCHAR(20) DEFAULT 'student',
    
    -- Engagement
    view_count INTEGER DEFAULT 0,
    average_watch_percentage DECIMAL(5,2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_videos_course ON videos(course_id);
CREATE INDEX idx_videos_topic ON videos(topic_id);

-- Video Progress Tracking
CREATE TABLE video_progress (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    
    current_position_seconds INTEGER DEFAULT 0,
    total_watched_seconds INTEGER DEFAULT 0,
    watch_percentage DECIMAL(5,2) DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    
    last_watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(student_id, video_id)
);

CREATE INDEX idx_video_progress_student ON video_progress(student_id);
CREATE INDEX idx_video_progress_video ON video_progress(video_id);

-- ============================================
-- 6. TEST BUILDER SYSTEM (For Teachers)
-- ============================================

CREATE TABLE custom_tests (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exam_board_id INTEGER REFERENCES exam_boards(id),
    subject_id INTEGER REFERENCES subjects(id),
    
    title VARCHAR(200) NOT NULL,
    description TEXT,
    instructions TEXT,
    
    -- Test Configuration
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    total_marks INTEGER NOT NULL DEFAULT 100,
    passing_marks INTEGER DEFAULT 40,
    
    -- Scheduling
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    
    -- Settings
    shuffle_questions BOOLEAN DEFAULT true,
    show_answers_after_submission BOOLEAN DEFAULT true,
    allow_review BOOLEAN DEFAULT true,
    max_attempts INTEGER DEFAULT 1,
    
    -- Status
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custom_tests_teacher ON custom_tests(teacher_id);
CREATE INDEX idx_custom_tests_exam_board ON custom_tests(exam_board_id);

-- Test Questions (Selected from Question Bank)
CREATE TABLE test_questions (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL REFERENCES custom_tests(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    
    question_order INTEGER NOT NULL,
    marks_allocated INTEGER NOT NULL DEFAULT 1,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(test_id, question_id)
);

CREATE INDEX idx_test_questions_test ON test_questions(test_id);

-- Test Assignments
CREATE TABLE test_assignments (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL REFERENCES custom_tests(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP,
    
    -- Submission
    started_at TIMESTAMP,
    submitted_at TIMESTAMP,
    is_submitted BOOLEAN DEFAULT false,
    
    -- Grading
    score_obtained DECIMAL(5,2),
    percentage DECIMAL(5,2),
    grade VARCHAR(5),
    is_passed BOOLEAN,
    
    -- Auto-grading
    auto_graded BOOLEAN DEFAULT false,
    teacher_reviewed BOOLEAN DEFAULT false,
    
    UNIQUE(test_id, student_id)
);

CREATE INDEX idx_test_assignments_test ON test_assignments(test_id);
CREATE INDEX idx_test_assignments_student ON test_assignments(student_id);

-- ============================================
-- 7. PAYMENT & SUBSCRIPTION SYSTEM
-- ============================================

CREATE TABLE subscription_plans (
    id SERIAL PRIMARY KEY,
    plan_code VARCHAR(50) NOT NULL UNIQUE,
    plan_name VARCHAR(100) NOT NULL,
    
    -- Pricing
    price_monthly INTEGER NOT NULL,
    price_yearly INTEGER,
    currency VARCHAR(3) DEFAULT 'NGN',
    
    -- Features
    features JSONB,
    max_exam_boards INTEGER,
    max_subjects INTEGER,
    has_analytics BOOLEAN DEFAULT false,
    has_video_access BOOLEAN DEFAULT false,
    has_test_builder BOOLEAN DEFAULT false,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO subscription_plans (plan_code, plan_name, price_monthly, price_yearly, features, max_exam_boards, max_subjects, has_analytics, has_video_access) VALUES
('FREE_TRIAL', 'Free Trial', 0, 0, '{"duration_days": 14, "questions_limit": 50, "videos_limit": 5}'::jsonb, 1, 3, false, false),
('STUDENT_MONTHLY', 'Student Monthly', 2000, NULL, '{"unlimited_questions": true, "unlimited_videos": true, "ai_feedback": true}'::jsonb, 7, 999, true, true),
('STUDENT_YEARLY', 'Student Yearly', NULL, 20000, '{"unlimited_questions": true, "unlimited_videos": true, "ai_feedback": true, "offline_access": true}'::jsonb, 7, 999, true, true),
('TEACHER_YEARLY', 'Teacher Plan', NULL, 25000, '{"test_builder": true, "class_analytics": true, "max_students": 100}'::jsonb, 7, 999, true, true);

CREATE TABLE user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
    
    -- Subscription Details
    start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
    
    -- Payment
    payment_reference VARCHAR(100),
    amount_paid INTEGER,
    
    -- Auto-renewal
    auto_renew BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);

CREATE TABLE payment_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES user_subscriptions(id),
    
    -- Transaction Details
    transaction_reference VARCHAR(100) NOT NULL UNIQUE,
    payment_gateway VARCHAR(50) DEFAULT 'paystack',
    amount INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'NGN',
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'cancelled')),
    payment_method VARCHAR(50),
    
    -- Metadata
    paystack_reference VARCHAR(100),
    metadata JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_reference ON payment_transactions(transaction_reference);

-- ============================================
-- 8. ENHANCED QUESTIONS WITH EXAM BOARD
-- ============================================

ALTER TABLE questions ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id);
ALTER TABLE questions ADD COLUMN year INTEGER;
ALTER TABLE questions ADD COLUMN paper_number VARCHAR(10);
ALTER TABLE questions ADD COLUMN is_past_paper_question BOOLEAN DEFAULT false;
ALTER TABLE questions ADD COLUMN explanation_video_id INTEGER REFERENCES videos(id);

CREATE INDEX idx_questions_exam_board ON questions(exam_board_id);
CREATE INDEX idx_questions_year ON questions(year);

-- ============================================
-- 9. TOPIC PROGRESS TRACKING
-- ============================================

CREATE TABLE topic_progress (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    topic_name VARCHAR(200) NOT NULL,
    
    -- Progress
    status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'mastered')),
    completion_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Performance
    questions_attempted INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    last_studied TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(student_id, course_id, topic_name)
);

CREATE INDEX idx_topic_progress_student ON topic_progress(student_id);
CREATE INDEX idx_topic_progress_status ON topic_progress(status);

-- ============================================
-- 10. NOTIFICATION SYSTEM
-- ============================================

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'alert', 'achievement')),
    
    -- Context
    reference_type VARCHAR(50), -- 'quiz', 'test', 'course', 'payment', etc.
    reference_id INTEGER,
    
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- ============================================
-- 11. ACHIEVEMENTS & GAMIFICATION
-- ============================================

CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_emoji VARCHAR(10),
    points INTEGER DEFAULT 0,
    
    -- Unlock Criteria
    criteria_type VARCHAR(50), -- 'questions_answered', 'perfect_quiz', 'streak_days', etc.
    criteria_value INTEGER,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO achievements (code, name, description, icon_emoji, points, criteria_type, criteria_value) VALUES
('FIRST_QUIZ', 'First Steps', 'Complete your first quiz', '🎯', 10, 'quizzes_completed', 1),
('PERFECT_QUIZ', 'Perfect Score', 'Score 100% on any quiz', '⭐', 50, 'perfect_score', 1),
('WEEK_STREAK', '7-Day Streak', 'Study for 7 consecutive days', '🔥', 100, 'streak_days', 7),
('HUNDRED_QUESTIONS', 'Century', 'Answer 100 questions correctly', '💯', 200, 'correct_answers', 100),
('SUBJECT_MASTER', 'Subject Master', 'Complete all topics in a subject', '🏆', 500, 'topics_mastered', 1);

CREATE TABLE user_achievements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);

-- ============================================
-- 12. TRIGGERS FOR AUTO-UPDATE
-- ============================================

-- Trigger to update analytics when quiz is submitted
CREATE OR REPLACE FUNCTION update_student_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert analytics record
    INSERT INTO student_analytics (student_id, subject_id, total_questions_attempted, correct_answers, accuracy_percentage)
    VALUES (
        NEW.student_id,
        (SELECT subject_id FROM quizzes WHERE id = NEW.quiz_id),
        1,
        CASE WHEN NEW.score >= (SELECT passing_score FROM quizzes WHERE id = NEW.quiz_id) THEN 1 ELSE 0 END,
        NEW.score
    )
    ON CONFLICT (student_id, subject_id) 
    DO UPDATE SET
        total_questions_attempted = student_analytics.total_questions_attempted + 1,
        correct_answers = student_analytics.correct_answers + CASE WHEN NEW.score >= (SELECT passing_score FROM quizzes WHERE id = NEW.quiz_id) THEN 1 ELSE 0 END,
        accuracy_percentage = (student_analytics.correct_answers::DECIMAL / student_analytics.total_questions_attempted) * 100,
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_analytics
AFTER INSERT ON quiz_attempts
FOR EACH ROW
EXECUTE FUNCTION update_student_analytics();

-- ============================================
-- 13. VIEWS FOR COMMON QUERIES
-- ============================================

-- Student Dashboard Summary
CREATE OR REPLACE VIEW student_dashboard_summary AS
SELECT 
    u.id AS student_id,
    u.first_name,
    u.last_name,
    u.email,
    COUNT(DISTINCT e.course_id) AS enrolled_courses,
    COUNT(DISTINCT qa.quiz_id) AS quizzes_taken,
    AVG(qa.score) AS average_score,
    SUM(CASE WHEN qa.is_passed THEN 1 ELSE 0 END) AS quizzes_passed,
    sa.current_streak_days,
    sa.total_study_time_seconds / 3600 AS total_hours_studied
FROM users u
LEFT JOIN enrollments e ON u.id = e.student_id
LEFT JOIN quiz_attempts qa ON u.id = qa.student_id
LEFT JOIN student_analytics sa ON u.id = sa.student_id
WHERE u.role = 'student'
GROUP BY u.id, u.first_name, u.last_name, u.email, sa.current_streak_days, sa.total_study_time_seconds;

-- Subject Performance by Exam Board
CREATE OR REPLACE VIEW subject_performance_by_exam_board AS
SELECT 
    eb.code AS exam_board,
    eb.name AS exam_board_name,
    s.name AS subject_name,
    COUNT(DISTINCT sa.student_id) AS total_students,
    AVG(sa.accuracy_percentage) AS average_accuracy,
    AVG(sa.completion_percentage) AS average_completion
FROM exam_boards eb
JOIN subjects s ON eb.id = s.exam_board_id
LEFT JOIN student_analytics sa ON s.id = sa.subject_id
GROUP BY eb.code, eb.name, s.name;

-- ============================================
-- END OF SCHEMA UPDATES
-- ============================================
