CREATE TABLE public.stats_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.stats_chat_messages TO authenticated;
GRANT ALL ON public.stats_chat_messages TO service_role;
ALTER TABLE public.stats_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chat select" ON public.stats_chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own chat insert" ON public.stats_chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own chat delete" ON public.stats_chat_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX stats_chat_messages_user_created_idx ON public.stats_chat_messages (user_id, created_at);