-- ================================================================
-- MindfulAI Database Schema
-- Run this in Supabase SQL Editor
-- ================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ================================================================
-- PROFILES
-- ================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'therapist', 'admin')),
  timezone TEXT DEFAULT 'UTC',
  language TEXT DEFAULT 'en',
  therapy_goals TEXT[],
  notification_preferences JSONB DEFAULT '{"push": true, "email": true, "reminders": true}'::jsonb,
  onboarding_completed BOOLEAN DEFAULT false,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'enterprise')),
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- CONVERSATIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  summary TEXT,
  emotional_state TEXT,
  is_active BOOLEAN DEFAULT true,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id, created_at DESC);

-- ================================================================
-- MESSAGES
-- ================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  emotion_data JSONB,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);

-- ================================================================
-- MOOD ENTRIES
-- ================================================================
CREATE TABLE IF NOT EXISTS mood_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mood_score INTEGER NOT NULL CHECK (mood_score >= 1 AND mood_score <= 10),
  mood_label TEXT NOT NULL,
  emotions TEXT[] DEFAULT '{}',
  note TEXT,
  activities TEXT[] DEFAULT '{}',
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 5),
  sleep_hours NUMERIC(3,1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mood_user ON mood_entries(user_id, created_at DESC);

-- ================================================================
-- JOURNAL ENTRIES
-- ================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  ai_insight TEXT,
  sentiment_score NUMERIC(3,2),
  emotions TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_private BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journal_user ON journal_entries(user_id, created_at DESC);

-- ================================================================
-- CBT EXERCISES
-- ================================================================
CREATE TABLE IF NOT EXISTS cbt_exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  duration_minutes INTEGER DEFAULT 10,
  instructions JSONB NOT NULL,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- USER EXERCISE COMPLETIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS exercise_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES cbt_exercises(id) ON DELETE CASCADE NOT NULL,
  responses JSONB,
  mood_before INTEGER CHECK (mood_before >= 1 AND mood_before <= 10),
  mood_after INTEGER CHECK (mood_after >= 1 AND mood_after <= 10),
  notes TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- MEDITATION SESSIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS meditation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  audio_url TEXT,
  guide_text TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- USER MEDITATION LOGS
-- ================================================================
CREATE TABLE IF NOT EXISTS meditation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES meditation_sessions(id),
  duration_seconds INTEGER NOT NULL,
  session_type TEXT DEFAULT 'guided',
  mood_before INTEGER CHECK (mood_before >= 1 AND mood_before <= 10),
  mood_after INTEGER CHECK (mood_after >= 1 AND mood_after <= 10),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- CRISIS EVENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS crisis_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  crisis_level TEXT NOT NULL,
  categories TEXT[] DEFAULT '{}',
  matched_patterns TEXT[] DEFAULT '{}',
  confidence NUMERIC(3,2),
  escalated BOOLEAN DEFAULT false,
  resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_crisis_user ON crisis_events(user_id, created_at DESC);
CREATE INDEX idx_crisis_unresolved ON crisis_events(resolved, created_at DESC);

-- ================================================================
-- AI MEMORIES (Vector Store)
-- ================================================================
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('conversation', 'insight', 'preference', 'mood', 'journal')),
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_user ON memories(user_id, memory_type);

-- ================================================================
-- SUBSCRIPTIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT DEFAULT 'active',
  plan TEXT DEFAULT 'free',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- HABIT TRACKING
-- ================================================================
CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'custom')),
  target_count INTEGER DEFAULT 1,
  icon TEXT DEFAULT '✨',
  color TEXT DEFAULT '#7c5cfc',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  completed BOOLEAN DEFAULT true,
  notes TEXT,
  logged_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- RPC FUNCTIONS
-- ================================================================

-- Semantic search for memories
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  memory_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.content,
    m.memory_type,
    m.metadata,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE m.user_id = p_user_id
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Get mood statistics for a user
CREATE OR REPLACE FUNCTION get_mood_stats(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  avg_mood NUMERIC,
  min_mood INTEGER,
  max_mood INTEGER,
  entry_count BIGINT,
  most_common_label TEXT,
  avg_energy NUMERIC,
  avg_sleep NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(AVG(mood_score)::numeric, 1) AS avg_mood,
    MIN(mood_score) AS min_mood,
    MAX(mood_score) AS max_mood,
    COUNT(*) AS entry_count,
    (SELECT me.mood_label FROM mood_entries me WHERE me.user_id = p_user_id AND me.created_at > NOW() - (p_days || ' days')::interval GROUP BY me.mood_label ORDER BY COUNT(*) DESC LIMIT 1) AS most_common_label,
    ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
    ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep
  FROM mood_entries
  WHERE user_id = p_user_id
    AND created_at > NOW() - (p_days || ' days')::interval;
END;
$$;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role full access profiles" ON profiles FOR ALL USING (auth.role() = 'service_role');

-- Conversations: users can CRUD their own
CREATE POLICY "Users can manage own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);

-- Messages: users can manage their own
CREATE POLICY "Users can manage own messages" ON messages FOR ALL USING (auth.uid() = user_id);

-- Mood entries: users can manage their own
CREATE POLICY "Users can manage own mood" ON mood_entries FOR ALL USING (auth.uid() = user_id);

-- Journal entries: users can manage their own
CREATE POLICY "Users can manage own journal" ON journal_entries FOR ALL USING (auth.uid() = user_id);

-- Exercise completions
CREATE POLICY "Users can manage own exercises" ON exercise_completions FOR ALL USING (auth.uid() = user_id);

-- Meditation logs
CREATE POLICY "Users can manage own meditation" ON meditation_logs FOR ALL USING (auth.uid() = user_id);

-- Crisis events: service role only for writes
CREATE POLICY "Users can view own crisis events" ON crisis_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages crisis" ON crisis_events FOR ALL USING (auth.role() = 'service_role');

-- Memories: users can view, service role manages
CREATE POLICY "Users can view own memories" ON memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages memories" ON memories FOR ALL USING (auth.role() = 'service_role');

-- Subscriptions
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages subscriptions" ON subscriptions FOR ALL USING (auth.role() = 'service_role');

-- Habits
CREATE POLICY "Users can manage own habits" ON habits FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habit logs" ON habit_logs FOR ALL USING (auth.uid() = user_id);

-- CBT exercises and meditation sessions are readable by all authenticated users
ALTER TABLE cbt_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read exercises" ON cbt_exercises FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read meditations" ON meditation_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role manages exercises" ON cbt_exercises FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages meditations" ON meditation_sessions FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- TRIGGERS
-- ================================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_journal_updated_at BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- SEED DATA: CBT Exercises
-- ================================================================
INSERT INTO cbt_exercises (title, description, category, difficulty, duration_minutes, instructions, tags) VALUES
(
  'Thought Record',
  'Identify and challenge negative thoughts by examining the evidence for and against them.',
  'Cognitive Restructuring',
  'beginner',
  15,
  '{"steps": ["Describe the situation that triggered the negative thought", "Write down the automatic negative thought", "Rate how strongly you believe this thought (0-100%)", "List evidence that supports this thought", "List evidence that contradicts this thought", "Create a more balanced thought", "Rate your belief in the new thought (0-100%)"]}',
  ARRAY['anxiety', 'depression', 'negative-thinking']
),
(
  'Gratitude Journal',
  'Write down three things you are grateful for to shift focus from negative to positive aspects of life.',
  'Positive Psychology',
  'beginner',
  5,
  '{"steps": ["Take a few deep breaths to center yourself", "Think about your day or recent experiences", "Write down 3 specific things you are grateful for", "For each item, explain WHY you are grateful for it", "Notice how you feel after completing this exercise"]}',
  ARRAY['gratitude', 'positivity', 'wellbeing']
),
(
  'Progressive Muscle Relaxation',
  'Systematically tense and release muscle groups to reduce physical tension and anxiety.',
  'Relaxation',
  'beginner',
  20,
  '{"steps": ["Find a comfortable position, either sitting or lying down", "Close your eyes and take 3 deep breaths", "Start with your feet — tense the muscles for 5 seconds", "Release and notice the difference for 10 seconds", "Move to calves, thighs, abdomen, chest, arms, hands, shoulders, neck, and face", "After completing all groups, take 3 deep breaths", "Notice the overall feeling of relaxation in your body"]}',
  ARRAY['anxiety', 'stress', 'relaxation', 'sleep']
),
(
  'Behavioral Activation',
  'Plan and engage in enjoyable or meaningful activities to counter depression and withdrawal.',
  'Behavioral',
  'intermediate',
  10,
  '{"steps": ["List 5 activities you used to enjoy or that give you a sense of accomplishment", "Rate each activity on pleasure (1-10) and mastery (1-10)", "Choose one activity to schedule this week", "Plan the specific day, time, and duration", "After completing, rate your actual mood (1-10)", "Reflect: Was it better or worse than you expected?"]}',
  ARRAY['depression', 'motivation', 'activities']
),
(
  '5-4-3-2-1 Grounding',
  'Use your five senses to ground yourself in the present moment during anxiety or dissociation.',
  'Mindfulness',
  'beginner',
  5,
  '{"steps": ["Pause and take a slow deep breath", "Name 5 things you can SEE around you", "Name 4 things you can TOUCH or feel", "Name 3 things you can HEAR", "Name 2 things you can SMELL", "Name 1 thing you can TASTE", "Take another deep breath and notice how you feel"]}',
  ARRAY['anxiety', 'grounding', 'mindfulness', 'panic']
);

-- ================================================================
-- SEED DATA: Meditation Sessions
-- ================================================================
INSERT INTO meditation_sessions (title, description, category, duration_seconds, guide_text) VALUES
(
  'Morning Calm',
  'Start your day with a peaceful 5-minute meditation to set a positive tone.',
  'Morning',
  300,
  'Find a comfortable seated position. Close your eyes gently. Take a deep breath in through your nose... and slowly exhale through your mouth. Feel your body settling into stillness. With each breath, imagine warm golden light filling your chest. This is your moment of peace before the day begins. You are enough. You are ready. Breathe in calm... breathe out tension. Continue breathing naturally, knowing that this moment of peace will carry with you throughout the day.'
),
(
  'Anxiety Relief',
  'A calming guided meditation specifically designed to ease anxious feelings.',
  'Anxiety',
  420,
  'Welcome. You have chosen to take care of yourself, and that takes courage. Begin by noticing your feet on the ground. Feel their weight. You are grounded. You are safe. Now bring attention to your breath — not to change it, just to notice it. In... and out. Anxiety is just energy in your body. It cannot hurt you. Imagine each anxious thought as a leaf floating down a gentle stream. You notice it... and let it float away. You dont need to hold onto it. Continue breathing. With each exhale, release a little more tension. You are safe in this moment. Right here, right now, everything is okay.'
),
(
  'Sleep Meditation',
  'Drift into restful sleep with this calming body scan meditation.',
  'Sleep',
  600,
  'Lie down comfortably. Let your body sink into the surface beneath you. Close your eyes. Begin to slow your breathing... inhale for 4 counts... hold for 4... exhale for 6. Feel your toes relaxing... your feet... your ankles. A warm wave of relaxation moves up through your calves... your knees... your thighs. Your whole lower body is heavy and relaxed. The wave continues through your hips... your stomach... your chest. Your arms feel heavy... your hands... your fingers. Your shoulders drop. Your neck relaxes. Your jaw unclenches. Your forehead smooths. You are floating in peaceful darkness. Let sleep come naturally...'
),
(
  'Self-Compassion',
  'Practice being kind to yourself with this loving-kindness meditation.',
  'Self-Care',
  360,
  'Sit comfortably and place your hand over your heart. Feel its steady rhythm. Begin by saying to yourself: "May I be safe. May I be healthy. May I be happy. May I live with ease." Repeat these words slowly, letting each one land in your heart. Now think of someone you love. Send them the same wishes: "May you be safe. May you be healthy. May you be happy. May you live with ease." Finally, extend these wishes to all beings everywhere. You deserve the same compassion you give others. Remember: you are worthy of love, especially your own.'
),
(
  'Breathing Exercise: Box Breathing',
  'A simple but powerful breathing technique used by Navy SEALs to calm the nervous system.',
  'Breathing',
  240,
  'Sit upright with your feet flat on the floor. We will breathe in a square pattern. Inhale slowly through your nose for 4 seconds... 1... 2... 3... 4. Hold your breath for 4 seconds... 1... 2... 3... 4. Exhale slowly through your mouth for 4 seconds... 1... 2... 3... 4. Hold empty for 4 seconds... 1... 2... 3... 4. Repeat this cycle. With each round, feel your heart rate slow. Your mind becomes clearer. Your body becomes calmer. You are in control of your breath, and through it, your calm.'
);
