---
globs: supabase/**/*.sql
---

# Supabase Migration Rules

- Use mcp__supabase__apply_migration for DDL changes (CREATE TABLE, ALTER TABLE, etc.)
- Use mcp__supabase__execute_sql for queries (SELECT, INSERT, UPDATE)
- Always add IF NOT EXISTS for CREATE TABLE / ADD COLUMN to be idempotent
- Include RLS policies when creating tables that need user-level access
- Name migrations with date prefix: YYYYMMDD_description.sql
- Agent tables: agent_cycles, agent_trades, agent_signals, agent_config, agent_profiles, agent_messages, agent_positions
- Forum tables: forum_threads, forum_posts
