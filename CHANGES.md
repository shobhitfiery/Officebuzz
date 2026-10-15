# OfficeBuzz – fixes & redesign (Oct 2026)

The pre-change code is in `backup0/` (git-ignored). Restore by copying `backup0/OB-backend` and `backup0/officebuzz/src` back.

## Bugs / issues fixed
**Security & permissions**
- `PUT /api/employees/:id` had no permission check – any signed-in user could edit anyone. Now: admins edit anyone; members only their own linked record (and not name/email).
- Registration enforced the `@fiery.com` rule only in the browser; now enforced on the server too (`ALLOWED_EMAIL_DOMAIN`, default `fiery.com`), plus password length.
- `db.js` printed the full `MONGO_URI` (may contain credentials) to logs – now logs only host/db.
- Auth middleware let requests through with a deleted user's token; admin check now returns 403 instead of 401.
- Admins can no longer delete their own account. Disallowed CORS origins no longer cause a 500.

**Correctness**
- Login/registration were email case-sensitive (`Priya@fiery.com` ≠ `priya@fiery.com`).
- Ledger running balance was computed in deposit-date order but displayed in creation order, so backdated entries showed confusing balances; entries without a deposit date sorted first. Both now use one consistent date order; balances rounded to paise.
- Birthday/anniversary dates could show a day off depending on time zone (UTC vs local); Feb-29 dates handled.
- Unknown `/api/*` routes returned the React HTML page instead of a JSON 404. Bad IDs / bad JSON now give 400/404 instead of 500.
- Frontend rendered the app twice in `index.js` (once outside the router), imported an empty `logo.svg`, and tried 4 different reset-password URLs in sequence.
- Members' Employees page called the admin-only `/api/users` on every visit (401 errors).
- Celebration popup timers were never cleared (leaked timers / duplicate popups).
- Dates could not be cleared once set. `package-lock.json` was out of sync (`npm ci` failed).
- Expired tokens left the UI "signed in" but broken – now auto sign-out.

## New UI (same features)
- Brand-matched red/black design, light & dark mode, responsive with mobile menu.
- Dashboard: greeting, fun-jar balance + counts, upcoming birthdays/anniversaries, Ledger / Users tabs.
- Notifications (top bar 🔔 with unread count → /notifications):
  - Every morning at 10:00 (server time, `DAILY_REMINDER_HOUR`) everyone gets one reminder for today's birthdays/anniversaries/work anniversaries and one per event starting today — in-app, by push and by email. Restarts never double-send (per-day dedupe), and if the server was down at 10:00 it catches up when it starts. Inactive employees are skipped.
  - Admins: "Send & history" tab to send an announcement to everyone or to selected people (push and/or email), see delivery results (emails sent/failed, devices reached, read count, errors), delete, and "Send today's now".
  - Everyone: inbox with unread/read, "Mark all as read", and a "Turn on push" switch per device.
  - Emails avoid spam-filter triggers: plain subject ("OfficeBuzz: …", no emoji), and no clickable link while `APP_URL` is an IP address or localhost (set `EMAIL_LINKS=true` to force links, or put a real hostname in `APP_URL`).
  - Email: nodemailer over Gmail SMTP (smtp.gmail.com:587, STARTTLS). Settings live in `OB-backend/.env` (`SMTP_*`, `MAIL_FROM`, `APP_URL`).
  - Scheduled tab (everyone): the next 7/30/90 days of automatic 10 am reminders (projected from employees and events) and announcements admins have scheduled. Members see items addressed to them. Admins can schedule an announcement for any date/time (from this tab or via "Schedule for later" on the Send form), edit, send now or cancel it, and Skip/Undo-skip an individual automatic reminder. Scheduled items are checked every minute and can never be sent twice.
  - Push setup help: after sign-in, a one-time prompt offers to turn notifications on (or shows step-by-step browser instructions with copy buttons when the site is on http://). The choice — Turn on / Remind me later (3 days) / Don't ask again — is remembered per device in localStorage. The Notifications page has a "Show me how" button. While the app is open, new notifications also appear as an in-app pop-up (works on http:// too).
  - Push: Web Push with VAPID keys generated into `.env`. **Browsers only allow push on HTTPS (or localhost)**, so it won't work at http://10.220.84.66:5001 until the site is served over HTTPS.
- Polls page (top bar → 📊 Polls): admins create standalone polls (question, optional details, 2–15 options, single/multiple choice, optional closing date, optional "notify everyone" by push + email), edit them (renaming an option keeps its votes), close/reopen and delete. Everyone votes on Active polls and can browse Past polls with full results and the winner (ties shown). Event polls appear here too. Admins can see who voted. The top bar collapses into the ☰ menu below 1140px wide.
- Events page (top bar → Events): admins create, edit and delete events with title, start/end date, start/end time, venue, activities and free-text details. Upcoming / Past tabs. The dashboard shows the next 3 upcoming events.
- Event polls (optional per event): question + 2–15 options, single or multiple choice, optional closing date, admins can close voting. Everyone can vote, change or remove their vote; results show counts and %. Admins can see who voted for what. Editing options keeps existing votes on options that remain.
- Top bar: Events, Team Ledger and Leaderboard buttons (Team Ledger page = the full ledger with Net remaining amount, filters and pagination; the bar collapses into a menu below 1000px wide) (Leaderboard page = same three boards as the dashboard tab).
- Dashboard: new first tab "Leaderboard" with three boards (last 30 days, last 1 year, all time). Ranks employees by total deposits (credits only), top 5 with "Show all".
- Employees: Active/Inactive status (default Active, admins change it from the pill next to the name or in the edit form). Inactive people keep all their history (directory, ledger, leaderboard), but are left out of new ledger entries (also blocked on the server) and of birthday/anniversary reminders and the celebration popup. The directory has an Active / Inactive / All filter.
- Ledger: a single "Net remaining amount" (current fund balance), paginated table (10/20/50 rows per page), credit/debit toggle in a modal, search, date range.
- Employees: search, "soon" badges, add/edit in a modal, "My details" for members.
- Employees (admin): "Password" column with a Reset button for every employee linked to a login. Admins set a new password (a random one is suggested) and see it once with a Copy button to share. Existing passwords are one-way hashed and can't be displayed by design.
- Users: search, reset password in a modal (same flow), toasts and confirm dialogs replace browser alerts.

## Still to do (needs a human)
- `OB-backend/.env` now also holds the Gmail app password and push keys — make sure it is never pushed (see next item). If it ever was, revoke the app password in Google Account → Security → App passwords and create a new one.
- `JWT_SECRET` in `OB-backend/.env` looks like a placeholder. Replace it with a long random value (e.g. `openssl rand -hex 32`) — everyone will need to sign in again.
- `OB-backend/.env` (with `JWT_SECRET`) is committed to git. Run `git rm --cached OB-backend/.env`, then rotate `JWT_SECRET` (this signs everyone out).
- `officebuzz/` is a nested git repo, so the parent repo only stores a pointer – commit inside `officebuzz/` too.
- Root `package.json` lists unused `@mui/*`, `@emotion/styled`, `xlsx` (xlsx 0.18.5 has known advisories).
- Restart the backend to load the fixes: `npm run deploy` (or `pm2 restart officebuzz-backend`).

## Password reset (OTP) & admin-only registration

- **Forgot password / change password**: new `/reset-password` page. Step 1 emails a 6-digit code; step 2 takes the code plus the new password.
  - Codes are bcrypt-hashed and expire after 10 minutes.
  - Each code allows 5 attempts; resending is allowed every 60 s, up to 5 codes per hour per user and 20 requests per hour per IP.
  - The response is the same whether or not the email exists.
  - New API: `POST /api/users/forgot-password`, `POST /api/users/reset-password`. New model: `models/passwordResetModel.js`.
- **Entry points**: a "Forgot password?" link on Sign in (carries the typed email) and on the Home hero. A new avatar menu in the toolbar has Change password and Sign out.
- **Admin-only registration**:
  - `POST /api/users` and `/register` now require an admin token. The public Register page is removed, and `/register` redirects to `/signin`.
  - Admins use Dashboard → Users → "+ Add user". It suggests a temporary password (shown once, with Copy) and can optionally add the person to the Employee directory, send a welcome email (no password in it), or grant admin.

## Edit profile & single group emails

- **Edit profile** (avatar menu → 👤 Edit profile, page `/profile`):
  - Members can change their display name, birthday, anniversary, joining date and contact number.
  - The email can't be changed (it's the sign-in). The employee-directory name stays admin-managed, because ledger entries reference it.
  - New API: `PUT /api/users/profile`. `GET /api/users/profile` now also returns the linked employee record.
- **Group emails**: a notification to several people is now **one email with everyone in the "To" line**, not one email per person.
  - Very large lists are split into batches of `MAIL_MAX_RECIPIENTS` (default 90) to stay under Gmail's per-message limit.
  - Set `MAIL_MODE=individual` in `.env` to go back to separate emails.

## Dashboard button in every email

- Every email has an **"Open OfficeBuzz dashboard"** button linking to `APP_URL/dashboard`, with the same link in the plain-text version. This covers notifications, scheduled sends, daily reminders, password-reset codes and welcome emails.
- Set `EMAIL_LINKS=false` in `.env` to remove it. If `APP_URL` is empty there's no address to link to, so the emails go out without the button.

## Email categories & templates, anniversaries, fun-jar QR

- **Category dropdown** when sending or scheduling a notification:
  - Categories: Birthday, Marriage anniversary, Work anniversary, Event, Polling, Festival, General info, Farewell, Welcome / new joiner, Fun-jar contribution, Reminder, Other.
  - Each category has its own email design (colour, icon, banner, closing line, dashboard button) and a starter title/message with `[placeholders]`. Sending is blocked until the placeholders are replaced.
  - "Preview the email" shows the exact email live.
  - The categories are defined in `OB-backend/services/emailTemplates.js`; new API: `GET /api/notifications/templates`, `POST /api/notifications/preview`.
- **Automatic emails use the templates too**:
  - The 10 am reminders use the birthday, marriage-anniversary, work-anniversary and event designs, or "Today's celebrations" when several kinds fall on the same day.
  - Poll announcements use the Polling design and welcome emails the Welcome design. Older notifications (type `manual`) show as General info.
- **Upcoming anniversaries** on the dashboard now lists marriage and work (joining-date) anniversaries together, tagged "💍 Marriage · N yrs" / "🏆 Work · N yrs". Work anniversaries appear from the first full year.
- **Fun-jar card** on the dashboard:
  - Shows the UPI QR code (`officebuzz/public/funjar-qr.png`) with steps to pay and to email the screenshot to hemant.naik@fiery.com.
  - The UPI ID and email address have Copy buttons. The email button opens a pre-filled email; on phones there's also a "Pay with a UPI app" button.
  - The payee details are set in `src/components/FunJarCard.js`.

## Fun-jar: phone payment fixes

- **iPhone:** a plain `upi://` link opens whichever single app iOS assigned to it (often WhatsApp), with no chooser. The card now has separate buttons for Google Pay (`gpay://`), PhonePe (`phonepe://`) and Paytm (`paytmmp://`), plus "Other UPI app" for the generic `upi://` link.
- **Android:** "Choose UPI app & pay" still opens the system chooser. The link now always includes an amount (`am=500.00`): a missing amount is a common cause of the misleading "limit reached / exceeded" error. The payment note is encoded with `%20` instead of `+`, and the UPI ID keeps a literal `@`.
- An amount field (₹1–₹1,00,000) is required before the payment buttons work.
- **Fallbacks** under "Payment not going through?": pay by copying the UPI ID, or save the QR image and scan it from the gallery in the UPI app. These help when the bank or app blocks link-started payments to a personal UPI ID.

## Profile pictures & usage analytics

- **Profile picture** (Edit profile):
  - Upload, change or remove a photo. The browser crops it to the centre and shrinks it to a 256×256 JPEG before upload (≈20–40 KB). It's previewed before saving.
  - Photos show everywhere a person appears: toolbar, employee directory, users list, birthdays and anniversaries, leaderboard, recipient picker, analytics. Matching is by account email, account name or employee name.
  - Storage: new `avatars` collection (`models/avatarModel.js`). `users.avatarVersion` busts the cache.
  - API: `PUT/DELETE /api/users/profile/avatar`, `GET /api/users/avatars`, and `GET /api/users/avatar/:id`. The last one is public so `<img>` tags work; ids aren't guessable.
- **Analytics** (admins: avatar menu → 📈 Analytics, page `/analytics`):
  - What's tracked:
    - Every page view, with time spent while the tab is visible.
    - Sign-ins and failed sign-ins, password resets.
    - Changes to the ledger, employees, events, polls, notifications and profiles.
    - Fun-jar pay/QR/email clicks, push on/off.
    - Device type, OS and browser.
  - Not stored: IP addresses, passwords, message contents.
  - The page:
    - Range picker (7 days, 30 days, 90 days, 1 year) and KPIs with change vs the previous period.
    - Daily page-view chart, busiest hours, most-visited pages.
    - People table (click a person to filter the log) and a list of accounts with no activity.
    - Device, OS and browser breakdowns, and an action counts table.
    - Paginated activity log with filters and CSV export.
  - Storage: `analyticsevents` collection (`models/analyticsEventModel.js`), kept 365 days by a TTL index. Set `ANALYTICS_RETENTION_DAYS` and `ANALYTICS_TZ` (default Asia/Kolkata) in `.env` to change this.
  - API: `POST /api/analytics/track` (browser, throttled); `GET /api/analytics/summary|events|export` (admin).

## Activity log kept for 30 days

- Analytics records are now deleted automatically after **30 days** (was 365), to keep the database small.
  - On start the backend updates the existing TTL index in place and removes anything already older.
  - Override with `ANALYTICS_RETENTION_DAYS` in `.env` (7–365).
- The Analytics page offers Today / 7 / 14 / 30 days. The "vs previous period" comparison is shown only when that earlier period is still stored (Today, 7 and 14 days).

## Account setup email & setup reminders

- **New email category "🔐 Account setup / first login"**:
  - Ready-made welcome email covering: what OfficeBuzz is, the site link, signing in with the official @fiery.com email and the temporary password Fiery.1, and changing the password and updating the profile on priority.
  - A note that the site runs on the Fiery intranet (office network or VPN only), and a "Log in to OfficeBuzz" button linking to /signin.
- **Optional password reset when sending it now**: "Reset every member's password to this temporary password just before sending" (default on, `Fiery.1`).
  - All non-admin accounts get that password and are flagged `mustChangePassword`. Admin passwords are never changed.
  - The server refuses if the message doesn't mention the temporary password.
- **Setup reminder banner** for signed-in users:
  - Shows "You're using a temporary password" with a button to change it, until they do.
  - Then asks them to add their photo and birthday.
  - It can be dismissed for the current visit.
- A temporary password can't be reused as the new password. Admin-created accounts and admin password resets are also flagged as temporary.
- Links written in any email message are now clickable.
