-- Migration: Add debate_quality column to forum_threads for Judge Mode verdicts
-- Purpose: Persist structured judge verdict (scores, biases, recommendation, red flags)
-- Consumed by: api/judge-mode.ts

ALTER TABLE forum_threads
  ADD COLUMN IF NOT EXISTS debate_quality jsonb;

COMMENT ON COLUMN forum_threads.debate_quality IS 'Judge Mode verdict: { judge_version, overall_score, dimensions, biases, conviction_assessment, recommendation, red_flags, judged_at }';

CREATE INDEX IF NOT EXISTS idx_forum_threads_debate_quality
  ON forum_threads USING gin (debate_quality)
  WHERE debate_quality IS NOT NULL;
