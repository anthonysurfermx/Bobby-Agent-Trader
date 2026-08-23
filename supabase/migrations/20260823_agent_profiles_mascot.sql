-- Mascot companion chosen in the onboarding wizard (Gen Z redesign).
-- Shape: { "body": "matrix", "eyes": "round", "accessory": "none", "avatar": "kora" }
-- avatar is one of the 10 premade companions in src/lib/mascot.ts;
-- api/agent-setup.ts validates against the same allowlists server-side.
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS mascot jsonb;
