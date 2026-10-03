# CLAUDE.md

Standing rules for every session in this project.

## Start of session

- Run `git pull` before starting work so the local copy matches GitHub.

## Data safety

- Never delete, overwrite, or modify real prayer logs or Learn progress.
- When testing against Supabase, only use dates in the year 2000, and clean up only those rows.

## Secrets

- Never commit or print the Supabase `service_role` key.
- Only the anon key belongs in `config.js`.

## Git

- Never run `git push --force`, `git reset --hard`, or delete branches.
- Commit after each finished change with a descriptive message.
- Don't push unless asked.

## Files

- Don't delete files outside this project folder.
