-- Migration: Enable pgvector and add embedding columns for semantic memory

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- 2. Add embedding and metadata columns to memories if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memories' AND column_name = 'embedding') THEN
    ALTER TABLE public.memories ADD COLUMN embedding vector(1536);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memories' AND column_name = 'metadata') THEN
    ALTER TABLE public.memories ADD COLUMN metadata jsonb;
  END IF;
END
$$;

-- 3. Add embedding column to conversations if it doesn't exist (for future-proofing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'embedding') THEN
    ALTER TABLE public.conversations ADD COLUMN embedding vector(1536);
  END IF;
END
$$;

-- 4. Create match_memories function for semantic search
DROP FUNCTION IF EXISTS match_memories(vector, float, int, uuid);

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  memory_type text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    memories.id,
    memories.content,
    memories.memory_type,
    COALESCE(
        (SELECT jsonb_object_agg(key, value) FROM json_each(memories.metadata::json)), 
        '{}'::jsonb
    ) as metadata,
    memories.created_at,
    1 - (memories.embedding <=> query_embedding) AS similarity
  FROM memories
  WHERE memories.user_id = p_user_id
    AND memories.embedding IS NOT NULL
    AND 1 - (memories.embedding <=> query_embedding) > match_threshold
  ORDER BY memories.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
