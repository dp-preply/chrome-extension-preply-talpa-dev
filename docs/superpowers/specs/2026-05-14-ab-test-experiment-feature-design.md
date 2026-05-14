# A/B Test Experiment Feature — Design Spec

**Date:** 2026-05-14  
**Project:** chrome-extension-preply-talpa  

---

## Overview

Extend the Preply Talpa Chrome extension to allow anyone (developers, PMs) to create an A/B copy experiment directly from any page. The user right-clicks a copy element, fills in a variant and experiment name, and the extension automatically creates a Jira ticket and a Slack channel with all the context a developer needs to implement the experiment.

---

## User Flow

1. User right-clicks any copy element on a Preply page
2. Context menu shows "Create Experiment" option
3. Extension extracts string ID, original copy, and page URL from the React component (same mechanism as existing string identification)
4. Existing sidebar opens in **experiment mode** with the extracted data pre-filled
5. User fills in:
   - Variant copy
   - Experiment name
6. Variant string ID is auto-computed as `<original_id>_<experiment_name>` (lowercased, spaces → underscores), shown read-only and updates live
7. User clicks "Generate Experiment"
8. Extension calls Jira API → creates ticket
9. Extension calls Slack API → creates channel, adds user as member, posts Jira ticket link
10. Sidebar shows success state with Jira URL and Slack channel name (or specific error if either call fails)

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/scripts/context-menu.ts` | Registers `chrome.contextMenus` item; on click, triggers string extraction on the target element and opens the sidebar in experiment mode |
| `src/services/jira.ts` | Jira REST API v3 client — creates ticket using user's browser Jira session (`credentials: 'include'`); first call verifies session via `/rest/api/3/myself` |
| `src/services/slack.ts` | Slack Web API client — creates channel, resolves logged-in user identity via `slack.users.identity`, adds user as member, posts message; uses user's browser Slack session |

### Modified files

| File | Change |
|------|--------|
| `src/background.ts` | Register context menu on extension install; handle `contextMenus.onClicked` — extract trans props from clicked element, inject sidebar in experiment mode |
| `src/sidebar/Sidebar.tsx` | Add `mode` prop (`'identify' \| 'experiment'`); render experiment form when mode is `'experiment'` |
| `manifest.json` | Add `contextMenus` permission |

### Sidebar modes

The sidebar gains a `mode` prop:
- `identify` — existing read-only display behavior (triggered by extension icon click)
- `experiment` — new form-based experiment creation (triggered by context menu)

The mode is passed via the existing `chrome.runtime` message that opens the sidebar.

---

## Jira Ticket

**Endpoint:** `POST https://preply.atlassian.net/rest/api/3/issue`  
**Auth:** Browser session (`credentials: 'include'`)

**Fields:**
- **Summary:** `[Experiment] <experiment_name>`
- **Labels:** `claude`, `repo:apollo`
- **Description:**

```
## Experiment: <experiment_name>

**String ID:** <crowdin_string_id>
**Variant string ID:** <original_id>_<experiment_name>
**Variant copy:** <user_input>
**Original copy:** <defaultMessage>
**Current language:** <lang>
**Page URL:** <url where experiment was created>

## Implementation tasks
- [ ] BE: Create waffle flag `<experiment_name>` in Apollo
- [ ] FE: Wrap `FormattedMessage id="<string_id>"` with flag condition, show variant copy (id="<variant_string_id>") when flag is on
```

**Session check:** Before creating the ticket, call `GET /rest/api/3/myself`. If it returns 401, show error: "You need to be logged into Jira. Open jira.preply.com and try again."

---

## Slack Channel

**Auth:** Browser session (`credentials: 'include'`) against `https://slack.com/api/*`

**Steps (sequential):**
1. `POST slack.com/api/conversations.create` — channel name: `proj_<experiment_name>` (lowercased, spaces → underscores)
2. `GET slack.com/api/users.identity` — resolve logged-in user ID
3. `POST slack.com/api/conversations.invite` — add user to channel
4. `POST slack.com/api/chat.postMessage` — post Jira ticket URL + one-line summary

**Session check:** If `users.identity` returns `not_authed`, show error: "You need to be logged into Slack. Open slack.com and try again."

---

## Experiment Sidebar UI

### Form fields

| Field | Type | Pre-filled | Editable |
|-------|------|-----------|---------|
| String ID | text | yes | no |
| Original copy | text | yes | no |
| Page URL | text | yes | no |
| Variant copy | text input | no | yes |
| Experiment name | text input | no | yes |
| Variant string ID | text | auto-computed | no |

Variant string ID formula: `<original_id>_<experiment_name>` — lowercased, spaces replaced with underscores. Updates live as the user types the experiment name.

### UI states

- **Idle** — form with "Generate Experiment" button; button disabled until both variant copy and experiment name are filled
- **Loading** — "Generating experiment..." spinner; button disabled
- **Success** — Jira ticket URL (clickable link) + Slack channel name displayed
- **Error** — specific message per failure point (Jira session, Slack session, API error)

### Styling

Matches existing sidebar: Tailwind CSS, Preply pink `#ff7aac` for primary actions, same close button and slide-in animation pattern.

---

## Permissions added to manifest.json

```json
"contextMenus"
```

No new host permissions needed — Jira and Slack API calls are made from the background service worker which already has broad host access, and the browser session cookies are passed via `credentials: 'include'`.

**Implementation risk:** Jira and Slack may set `SameSite=Strict` or restrictive CORS headers that prevent cross-origin credentialed requests from a service worker. If `credentials: 'include'` doesn't work, the fallback is to inject the API calls into the page context (content script) where the browser treats them as same-origin, or to prompt the user to provide a personal API token on first use.

---

## Error handling

| Scenario | Error shown |
|----------|------------|
| Not logged into Jira | "You need to be logged into Jira. Open jira.preply.com and try again." |
| Not logged into Slack | "You need to be logged into Slack. Open slack.com and try again." |
| Jira API error | "Failed to create Jira ticket: <api error message>" |
| Slack channel already exists | "A Slack channel named proj_<name> already exists. Try a different experiment name." |
| String ID not found on element | Sidebar shows existing debug/error state (same as current identify mode) |

---

## Out of scope

- GitHub API integration (file location resolved by developer from string ID)
- Crew / Django admin setup (covered by BE implementation task in Jira ticket)
- Automatic waffle flag creation (triggered by GitHub Action via Jira labels)
- Token/credential management UI (users rely on existing browser sessions)
