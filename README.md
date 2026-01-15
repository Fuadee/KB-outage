# Krabi Outage Tracker

Next.js (App Router) + Tailwind + TypeScript dashboard for tracking planned outage jobs backed by Supabase Postgres.

## File tree

```
.
├── .env.example
├── README.md
├── next-env.d.ts
├── next.config.mjs
├── package.json
├── postcss.config.js
├── sql
│   ├── 001_init.sql
│   └── 002_nakhon_step.sql
├── src
│   ├── app
│   │   ├── globals.css
│   │   ├── job
│   │   │   └── [id]
│   │   │       ├── doc
│   │   │       │   └── page.tsx
│   │   │       └── page.tsx
│   │   ├── layout.tsx
│   │   ├── new
│   │   │   └── page.tsx
│   │   └── page.tsx
│   └── lib
│       ├── dateUtils.ts
│       ├── jobsRepo.ts
│       └── supabaseClient.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Setup

1. Create a Supabase project.
2. Run the SQL in `sql/001_init.sql` using the Supabase SQL editor.
3. Run the SQL in `sql/002_nakhon_step.sql` to add ศูนย์นคร + หนังสือดับไฟ fields.
4. Copy `.env.example` to `.env.local` and set the Supabase URL + anon key.
5. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

## Notes

- No authentication or login UI is included yet (open access).
- Data is stored in the `outage_jobs` table and is shared across devices in the same Supabase project.
- Workflow now includes:
  - Step 2 (ศูนย์นคร): mark as notified with date + memo no, or mark not required.
  - Step 3 (หนังสือดับไฟ): request document (placeholder page currently).
