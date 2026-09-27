<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Stats AI chat ("Fråga statistiken") streams from `src/routes/api/stats-chat.ts` (Responses API, tools read `fetchAllLeaguePlayers`) and stores one conversation per user in `stats_chat_messages` — keeps model calls server-side and history per account.
- Vite aliases `entities/lib/*` to `entities-v4` while root `entities` is v6 — htmlparser2 needs v4 paths, parse5 (chat markdown) needs v6.
