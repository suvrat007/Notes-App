# Focus — Productivity Tracker - Project Context

## Overview
A modern, gamified productivity tracker built using the MERN stack (MongoDB, Express, React, Node.js). This project is a revamp of an older Notes app, completely reimagined to help users track habits, complete tasks, and visualize their productivity. Ships as an installable PWA, responsive from mobile up through desktop.

## Key Features
- **Gamification:** Users earn "Stars" for completing tasks. Overachieving rewards up to 150% of base reward (capped), partial completions yield partial stars.
- **Penalty System:** "Avoid" tasks deduct stars when logged; slip-ups accumulate per day.
- **Break Days:** Toggled directly from the Calendar tab (calendar-level, independent of any task). Any positive stars earned on a marked break day get a 150% bonus, since the user wasn't expected to do anything that day.
- **Task Types:** Daily, Occasional, Avoid, and Break Day.
- **Calendar / day schedule:** Month grid (dot = day has activity, filled = break day) + a connected timeline below showing every task's status for the selected day (empty ring = pending, check = done, X = slipped on an avoid task). Logging from the timeline targets that specific date, not just "today".
- **Progress Tracking:** Area/bar charts and a donut breakdown (`recharts`) with a Week/Month/3-Months range toggle.
- **PWA Capabilities:** Installable and offline-capable via `vite-plugin-pwa` (`autoUpdate` service worker).

## Tech Stack
- **Frontend:** React 19 (Vite), plain CSS design tokens (no Tailwind), Framer Motion, Recharts, Axios.
- **Backend:** Node.js, Express, MongoDB (Mongoose), JWT in an httpOnly cookie, bcryptjs.
- **Styling:** Strict monochrome design system (black/white/gray only, no hue anywhere) inspired by sidebar-dashboard references (Helios/Fierce-style) — circular gauge hero metric rendered as a white/gray gradient ring, 2-up stat-grid cards with delta badges, segmented pill range toggles, donut chart with center label, connected day-timeline with status circles. Mobile uses a bottom nav + raised FAB; desktop (≥980px) swaps to a persistent left sidebar with the same nav items plus an "Add Task" button and user/theme/logout footer.

## Architecture
- `backend/index.js` — all routes (auth, tasks, logs, break-days). Auth is cookie-based: `/login` and `/create-account` set an httpOnly JWT cookie (`utilities.js` exports `COOKIE_NAME`/`cookieOptions`); `/logout` clears it. CORS requires `credentials: true` and an explicit origin (`CORS_ORIGIN` env var, defaults to `http://localhost:5173`) — cookies don't work with `origin: "*"`.
- `backend/utilities.js` — single `authenticateToken` middleware reading the JWT from the cookie (not a header), sets `req.userId`.
- `backend/models/{user,task,log,breakday}.model.js` — Mongoose schemas. `User` hashes passwords via a pre-save hook and exposes `comparePassword`; `toJSON` strips the password field. `BreakDay` is `{ userId, date }` with a unique compound index.
- `frontend/notes-app/src/utils/api.js` — single axios instance (`VITE_API_URL` env var, `withCredentials: true`). On a 401 it hard-redirects to `/login`, *except* for the `/get-user` auth-probe call and while already on `/login`/`/signup` — otherwise the initial unauthenticated auth-check causes a redirect loop.
- `frontend/notes-app/src/utils/AuthContext.jsx` — since the JWT cookie is httpOnly (unreadable by JS), this probes `/get-user` on mount to know whether a session exists; `PrivateRoute` in `App.jsx` reads `status` from it.
- `frontend/notes-app/src/utils/ToastContext.jsx` — app-wide toast notifications (mounted in `main.jsx`, inside `AuthProvider`).
- `frontend/notes-app/src/pages/Dashboard/Dashboard.jsx` — `.app-layout` (Sidebar + main content). Renders one of the tabs (Home / Statistic / Calendar / Data / More) plus `TaskModal`.
- `frontend/notes-app/src/pages/Dashboard/tabs/` — one file per tab. `Calendar.jsx` owns month navigation + break-day toggle and delegates the per-day list to `DayTimeline`.
- `frontend/notes-app/src/components/` — `Sidebar.jsx` (desktop nav), `BottomNav.jsx` (mobile nav, shares `navConfig.js` with Sidebar), `CircularGauge.jsx`, `DayTimeline.jsx` (connected status-circle list, reused by Home's "Today's Plan" logic and Calendar's day panel), `TaskList.jsx`, `TaskModal.jsx`.
- All CSS lives in `index.css` as design tokens (`--bg-*`, `--text-*`, `--accent-gold/-red/-green` + `-soft` variants, `--accent-ink`, `--shadow-*`, `--glow-color`). The accent tokens are literally grayscale (white in dark mode / near-black in light mode) — there is no hue anywhere in the app, by design. When adding new UI, reference these tokens rather than hardcoding colors, and never introduce a hex/rgb literal with a non-zero saturation.
- The `@media (min-width: 980px)` block that hides `.bottom-nav`/`.fab` **must stay the last rule in `index.css`** — CSS cascade order, not media-query specificity, decides ties, so an unconditional `.bottom-nav { display: flex }` declared later in the file would otherwise win at all viewport widths.

## State of Development
Core flows verified end-to-end via a scripted Playwright pass across both mobile (420px) and desktop (1440px) viewports, both themes: signup, login, wrong-password rejection, logout, unauthenticated route guard, task creation (daily + avoid), logging progress (today and via Calendar for an arbitrary date), break-day toggle + bonus, all five tabs, theme toggle, production build + PWA service worker generation. No unexpected console errors.

Remaining known gaps / nice-to-haves:
1. No automated test suite (the Playwright smoke scripts used this session were ad hoc, not committed to the repo).
2. `backend/.env` was removed from git tracking, but the previously-committed Mongo URI and JWT secret were exposed in git history before that — **still need to be rotated**.
3. No password-reset flow.
4. No task editing UI yet (backend `PATCH /tasks/:taskId` exists, frontend doesn't call it).
5. Marking a day as a break day only affects *future* logs on that day — it doesn't retroactively re-apply the bonus to logs already recorded before the toggle.
6. Bundle is a single ~864KB JS chunk — could code-split if it becomes a problem.
