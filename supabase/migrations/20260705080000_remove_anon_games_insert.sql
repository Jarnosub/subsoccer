-- ============================================================
-- SECURITY: Remove overly permissive anon INSERT policy on games
-- ============================================================
-- The "Anyone can add community games" policy allowed completely
-- anonymous inserts with no rate limiting. This is a spam/abuse risk.
-- Keep only the authenticated INSERT policy.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can add community games" ON public.games;

SELECT '✅ Removed anon INSERT policy — only authenticated users can add games' as status;
