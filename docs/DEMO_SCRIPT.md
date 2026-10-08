# 5-minute demo recording script

The brief asks for: *log in with the same account on web and mobile, create a task on one, and show it on the other.* This script covers that in the first two minutes, then uses the rest to show the requirements reviewers check most.

## Setup (before you hit record)

1. Load `{{API_URL}}/api/health` once so the free-tier API is awake (the first response can take up to a minute).
2. Install the APK on an Android phone (or emulator) and open it once.
3. Screen layout: browser on the left, phone mirrored on the right. On Windows/macOS/Linux, `scrcpy` mirrors a USB-connected Android phone; Android Studio's emulator also works.
4. Use the demo account (`demo@lumen.dev` / `LumenDemo2026`) or create a fresh one in the recording (shows registration too).
5. Record with OBS, the Xbox Game Bar (`Win + G`) or QuickTime. 1080p is plenty.

## Script

| Time | Do | Say (briefly) |
|---|---|---|
| 0:00 | Show the README top section | "Lumen: one Express + PostgreSQL API, a React web app and an Expo Android app." |
| 0:15 | **Web:** register a new account (or sign in) | "Passwords are bcrypt-hashed; validation is shared between all three apps." |
| 0:35 | **Phone:** sign in with the same email and password | "Same account, same backend. The token is stored in the Android Keystore." |
| 0:55 | **Web:** create a project "Spectrometer calibration", then add a task "Align the laser", priority High, due tomorrow | |
| 1:20 | **Phone:** go to Tasks, pull to refresh. The task appears | "Created on the web, visible on the phone." |
| 1:35 | **Phone:** tap the task's circle to mark it completed, then create a new task "Order filter" | |
| 2:00 | **Web:** return to the browser tab. The dashboard updates by itself (it refreshes on focus and every 15 s); open Activity and point at the phone icons next to the mobile changes | "Changes from the phone, attributed to the phone." |
| 2:30 | **Web:** search tasks, filter by status and by priority, toggle Overdue, switch a project to Board view and drag a card | Search and filters (required) plus the board (extra) |
| 3:05 | **Phone:** Tasks tab, search + status and priority chips | Mobile search and filters |
| 3:25 | **Phone:** turn on aeroplane mode, reopen the Tasks tab | "No network: a clear banner, saved data stays visible, nothing crashes." Try to complete a task: an error toast explains it. Turn the network back on. |
| 3:55 | **Web:** Settings → Signed-in devices → sign out the Android session | "Sessions are server-side, so this is immediate." |
| 4:10 | **Phone:** pull to refresh | The app returns to sign-in with "You were signed out of this device. Please sign in again." (Token expiry shows "Your session expired".) |
| 4:30 | **Browser:** open `{{API_URL}}/api/docs`, then the GitHub Actions tab | "OpenAPI docs generated from the shared schemas; CI runs 169 tests against PostgreSQL and builds the APK." |
| 4:50 | End on the dashboard | |

## Optional security shots (if you have extra time)

- In DevTools → Application → Cookies, show `lumen_rt` is `HttpOnly`, `Secure`, `SameSite=Strict`, and that `localStorage` has no token.
- Run `curl` with another user's token against your project id and show the 404.
