# A/B Test Experiment Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Create Experiment" right-click context menu item that opens the sidebar in experiment mode, pre-fills string context, and on submit creates a Jira ticket + Slack channel using the user's existing browser sessions.

**Architecture:** Extend `src/background.ts` to register a context menu and handle its click; extend `src/sidebar/Sidebar.tsx` with a `mode` prop so it renders a form when `mode === 'experiment'`; add two service modules (`src/services/jira.ts`, `src/services/slack.ts`) that call Jira REST API v3 and Slack Web API using `credentials: 'include'`; add `ExperimentData` type to `src/global.d.ts`.

**Tech Stack:** TypeScript 5.4, React 18, Tailwind CSS 3, Bun 1.1, Chrome Extension Manifest V3, Jira REST API v3 (`https://preply.atlassian.net`), Slack Web API (`https://slack.com/api`)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/global.d.ts` | Add `ExperimentData` type and `ExperimentResult` type |
| Modify | `manifest.json` | Add `contextMenus` permission |
| Create | `src/services/jira.ts` | Jira REST API client — session check + ticket creation |
| Create | `src/services/slack.ts` | Slack Web API client — channel create, invite self, post message |
| Modify | `src/background.ts` | Register context menu; handle `contextMenus.onClicked`; pass `mode` to sidebar |
| Modify | `src/sidebar/index.tsx` | Pass `mode` from message to `Sidebar` |
| Create | `src/sidebar/ExperimentForm.tsx` | Controlled form component for experiment creation |
| Modify | `src/sidebar/Sidebar.tsx` | Accept `mode` prop; render `ExperimentForm` when `mode === 'experiment'` |

---

## Task 1: Add types to `global.d.ts`

**Files:**
- Modify: `src/global.d.ts`

- [ ] **Step 1: Add `ExperimentData` and `ExperimentResult` types**

Open `src/global.d.ts` and append after the existing `DetectedLoc` type (currently ends around line 34):

```typescript
declare type ExperimentData = {
    detectedLoc: DetectedLoc;
    variantCopy: string;
    experimentName: string;
};

declare type ExperimentResult = {
    jiraUrl: string;
    slackChannel: string;
};
```

- [ ] **Step 2: Verify TypeScript accepts the changes**

```bash
cd /Users/daniele.paleari/Documents/chrome-extension-preply-talpa
bun run build 2>&1 | head -30
```

Expected: build completes with no TypeScript errors (zip + dist files generated).

- [ ] **Step 3: Commit**

```bash
git add src/global.d.ts
git commit -m "feat: add ExperimentData and ExperimentResult types"
```

---

## Task 2: Add `contextMenus` permission to `manifest.json`

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add permission**

Open `manifest.json`. The current `permissions` array is:
```json
"permissions": ["scripting", "activeTab"]
```

Change it to:
```json
"permissions": ["scripting", "activeTab", "contextMenus"]
```

- [ ] **Step 2: Verify build still passes**

```bash
bun run build 2>&1 | tail -5
```

Expected: build completes, `dist/manifest.json` contains `"contextMenus"` in permissions.

```bash
grep contextMenus dist/manifest.json
```

Expected: `"contextMenus"` appears in output.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add contextMenus permission to manifest"
```

---

## Task 3: Create `src/services/jira.ts`

**Files:**
- Create: `src/services/jira.ts`

The Jira REST API v3 base URL is `https://preply.atlassian.net/rest/api/3`. We use `credentials: 'include'` so the user's existing Jira browser session cookies are sent. **Note:** If Jira's CORS policy blocks cross-origin credentialed requests from a service worker, the fallback is to call from the content script context instead — but try `credentials: 'include'` first.

- [ ] **Step 1: Create the service file**

```typescript
// src/services/jira.ts

const JIRA_BASE = 'https://preply.atlassian.net/rest/api/3';

export class JiraAuthError extends Error {
    constructor() {
        super('You need to be logged into Jira. Open jira.preply.com and try again.');
        this.name = 'JiraAuthError';
    }
}

async function checkSession(): Promise<void> {
    const res = await fetch(`${JIRA_BASE}/myself`, {
        credentials: 'include',
    });
    if (res.status === 401) throw new JiraAuthError();
    if (!res.ok) throw new Error(`Jira session check failed: ${res.status}`);
}

export async function createExperimentTicket(data: ExperimentData): Promise<string> {
    await checkSession();

    const { detectedLoc, variantCopy, experimentName } = data;
    const variantStringId = `${detectedLoc.id}_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;

    const description = [
        `## Experiment: ${experimentName}`,
        '',
        `**String ID:** ${detectedLoc.id}`,
        `**Variant string ID:** ${variantStringId}`,
        `**Variant copy:** ${variantCopy}`,
        `**Original copy:** ${detectedLoc.defaultMessage ?? detectedLoc.text}`,
        `**Current language:** ${detectedLoc.lang}`,
        `**Page URL:** ${detectedLoc.debugInfo ?? 'unknown'}`,
        '',
        '## Implementation tasks',
        `- [ ] BE: Create waffle flag \`${experimentName}\` in Apollo`,
        `- [ ] FE: Wrap \`FormattedMessage id="${detectedLoc.id}"\` with flag condition, show variant copy (id="${variantStringId}") when flag is on`,
    ].join('\n');

    const body = {
        fields: {
            summary: `[Experiment] ${experimentName}`,
            issuetype: { name: 'Task' },
            labels: ['claude', 'repo:apollo'],
            description: {
                type: 'doc',
                version: 1,
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: description }],
                    },
                ],
            },
        },
    };

    const res = await fetch(`${JIRA_BASE}/issue`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (res.status === 401) throw new JiraAuthError();
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create Jira ticket: ${text}`);
    }

    const json = (await res.json()) as { key: string };
    return `https://preply.atlassian.net/browse/${json.key}`;
}
```

- [ ] **Step 2: Verify TypeScript accepts it**

```bash
bun run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/jira.ts
git commit -m "feat: add Jira service for experiment ticket creation"
```

---

## Task 4: Create `src/services/slack.ts`

**Files:**
- Create: `src/services/slack.ts`

Slack Web API is called at `https://slack.com/api/*` with `credentials: 'include'`. Same CORS caveat as Jira applies.

- [ ] **Step 1: Create the service file**

```typescript
// src/services/slack.ts

const SLACK_BASE = 'https://slack.com/api';

export class SlackAuthError extends Error {
    constructor() {
        super('You need to be logged into Slack. Open slack.com and try again.');
        this.name = 'SlackAuthError';
    }
}

async function slackPost(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${SLACK_BASE}/${method}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Slack HTTP error: ${res.status}`);
    const json = (await res.json()) as { ok: boolean; error?: string; [key: string]: unknown };
    if (!json.ok) {
        if (json.error === 'not_authed' || json.error === 'invalid_auth') throw new SlackAuthError();
        throw new Error(`Slack API error (${method}): ${json.error}`);
    }
    return json;
}

async function getMyUserId(): Promise<string> {
    const json = (await slackPost('users.identity', {})) as { user: { id: string } };
    return json.user.id;
}

export async function createExperimentChannel(
    experimentName: string,
    jiraUrl: string,
): Promise<string> {
    const channelName = `proj_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;

    // Create channel
    const createJson = (await slackPost('conversations.create', {
        name: channelName,
        is_private: false,
    })) as { channel: { id: string } };
    const channelId = createJson.channel.id;

    // Get current user ID and invite them
    const userId = await getMyUserId();
    await slackPost('conversations.invite', { channel: channelId, users: userId });

    // Post Jira ticket link
    await slackPost('chat.postMessage', {
        channel: channelId,
        text: `Experiment *${experimentName}* created. Jira ticket: ${jiraUrl}`,
    });

    return channelName;
}
```

- [ ] **Step 2: Verify TypeScript accepts it**

```bash
bun run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/slack.ts
git commit -m "feat: add Slack service for experiment channel creation"
```

---

## Task 5: Extend `src/background.ts` with context menu

**Files:**
- Modify: `src/background.ts`

The current `src/background.ts` has:
- `triggerElementPicker(tabId)` at lines 1-19
- `chrome.action.onClicked` at lines 21-26
- `chrome.runtime.onMessage` at lines 28-35
- `chrome.runtime.onMessageExternal` at lines 37-89

The sidebar iframe injection in `onMessageExternal` posts a JSON string of `DetectedLoc`. We need to extend it to also pass a `mode` field. We also need to handle the `generateExperiment` message from the sidebar.

- [ ] **Step 1: Add context menu registration and experiment message handler**

Replace the entire content of `src/background.ts` with:

```typescript
import { createExperimentTicket } from '@src/services/jira';
import { createExperimentChannel } from '@src/services/slack';

function triggerElementPicker(tabId: number) {
    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (extensionId: string) => {
            window.__PREPLY_LOC__ = extensionId;
        },
        args: [chrome.runtime.id],
    });
    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['src/scripts/content.js'],
    });
}

function injectSidebar(
    tabId: number,
    message: DetectedLoc,
    mode: 'identify' | 'experiment',
) {
    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (
            sidebarUrl: string,
            messageJson: string,
            sidebarMode: 'identify' | 'experiment',
        ) => {
            const existingIframe = document.getElementById('preply-loc-iframe-sidebar');
            if (existingIframe) existingIframe.remove();

            const iframe = document.createElement('iframe');
            iframe.id = 'preply-loc-iframe-sidebar';
            iframe.src = sidebarUrl;
            iframe.setAttribute('allow', 'clipboard-write');
            iframe.style.cssText =
                'top: 0; right: 0; width: 100%; height: 100%; z-index: 2147483650; border: none; position:fixed;';
            document.body.appendChild(iframe);
            document.body.style.overflow = 'hidden';

            iframe.addEventListener('load', () => {
                iframe.contentWindow?.postMessage(
                    JSON.stringify({ ...JSON.parse(messageJson), mode: sidebarMode }),
                    sidebarUrl,
                );
            });

            window.addEventListener('message', function handler(event: MessageEvent) {
                if (event.data === 'close' || event.data === 'destroy') {
                    iframe.remove();
                    document.body.style.overflow = '';
                    window.removeEventListener('message', handler);
                }
            });
        },
        args: [
            chrome.runtime.getURL('src/sidebar/index.html'),
            JSON.stringify(message),
            mode,
        ],
    });
}

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'preply-talpa-create-experiment',
        title: 'Create Experiment',
        contexts: ['all'],
    });
});

chrome.action.onClicked.addListener((tab) => {
    if (tab.id) triggerElementPicker(tab.id);
});

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message === 'preply-talpa-close') {
        if (_sender.tab?.id) triggerElementPicker(_sender.tab.id);
    }
});

// Context menu click — extract trans props from clicked element then open experiment sidebar
chrome.contextMenus.onClicked.addListener((_info, tab) => {
    if (!tab?.id) return;
    const tabId = tab.id;

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (extensionId: string) => {
            window.__PREPLY_LOC__ = extensionId;
        },
        args: [chrome.runtime.id],
    });

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['src/scripts/content.js'],
    });
});

// Message from content.ts (element picked) or from sidebar (generateExperiment)
chrome.runtime.onMessageExternal.addListener(
    (message: DetectedLoc | { type: 'generateExperiment'; data: ExperimentData }, _sender, sendResponse) => {
        // Experiment generation triggered from sidebar
        if (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === 'generateExperiment'
        ) {
            (async () => {
                try {
                    const jiraUrl = await createExperimentTicket(message.data);
                    const slackChannel = await createExperimentChannel(
                        message.data.experimentName,
                        jiraUrl,
                    );
                    sendResponse({ ok: true, result: { jiraUrl, slackChannel } });
                } catch (err) {
                    sendResponse({ ok: false, error: (err as Error).message });
                }
            })();
            return true; // keep message channel open for async response
        }

        // DetectedLoc from element picker (identify mode)
        const detectedLoc = message as DetectedLoc;
        // Determine mode: if the content script was triggered via context menu,
        // window.__PREPLY_EXPERIMENT__ will be set. We use a separate flag for this.
        // For now all onMessageExternal messages from content.ts open in identify mode;
        // context menu opens experiment mode by directly calling injectSidebar after extraction.
        // See context menu handler above — it injects content.ts which sends back here.
        // We distinguish by checking if __PREPLY_EXPERIMENT__ flag was set on the page.
        // Since we cannot read page globals here, we rely on the message including a `_mode` field.
        const mode: 'identify' | 'experiment' =
            (detectedLoc as DetectedLoc & { _mode?: string })._mode === 'experiment'
                ? 'experiment'
                : 'identify';

        if (!_sender.tab?.id) return;
        injectSidebar(_sender.tab.id, detectedLoc, mode);
    },
);
```

- [ ] **Step 2: Update `content.ts` to pass `_mode` field when triggered from context menu**

Open `src/scripts/content.ts`. Find the initialization block at the bottom (lines 389-404):

```typescript
const elementSelector = new ElementSelector();
elementSelector.togglePrompt().then(detectedLoc => {
    chrome.runtime.sendMessage(window.__PREPLY_LOC__, detectedLoc);
    elementSelector.destroy();
});
```

Replace with:

```typescript
const elementSelector = new ElementSelector();
elementSelector.togglePrompt().then(detectedLoc => {
    const mode = (window as Window & { __PREPLY_EXPERIMENT__?: boolean }).__PREPLY_EXPERIMENT__
        ? 'experiment'
        : 'identify';
    chrome.runtime.sendMessage(window.__PREPLY_LOC__, { ...detectedLoc, _mode: mode });
    elementSelector.destroy();
});
```

- [ ] **Step 3: Update context menu handler in `background.ts` to set `__PREPLY_EXPERIMENT__` flag**

In `src/background.ts`, find the `chrome.contextMenus.onClicked` listener and add the flag injection before the content script injection:

```typescript
chrome.contextMenus.onClicked.addListener((_info, tab) => {
    if (!tab?.id) return;
    const tabId = tab.id;

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (extensionId: string) => {
            window.__PREPLY_LOC__ = extensionId;
            (window as Window & { __PREPLY_EXPERIMENT__?: boolean }).__PREPLY_EXPERIMENT__ = true;
        },
        args: [chrome.runtime.id],
    });

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['src/scripts/content.js'],
    });
});
```

- [ ] **Step 4: Verify build passes**

```bash
bun run build 2>&1 | head -40
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/background.ts src/scripts/content.ts
git commit -m "feat: register context menu and wire experiment mode through background"
```

---

## Task 6: Create `src/sidebar/ExperimentForm.tsx`

**Files:**
- Create: `src/sidebar/ExperimentForm.tsx`

This component owns all the experiment form state and calls back to the parent when the user submits. It uses `chrome.runtime.sendMessage` (via `window.parent`) to call `generateExperiment` in background, then shows success or error.

- [ ] **Step 1: Create the component**

```typescript
// src/sidebar/ExperimentForm.tsx
import { useState } from 'react';
import CopyButton from './CopyButton';

type Props = {
    data: DetectedLoc;
    onClose: () => void;
};

type FormState = 'idle' | 'loading' | 'success' | 'error';

export default function ExperimentForm({ data, onClose }: Props): JSX.Element {
    const [variantCopy, setVariantCopy] = useState('');
    const [experimentName, setExperimentName] = useState('');
    const [formState, setFormState] = useState<FormState>('idle');
    const [result, setResult] = useState<ExperimentResult | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    const variantStringId = data.id
        ? `${data.id}_${experimentName.toLowerCase().replace(/\s+/g, '_')}`
        : '';

    const canSubmit = variantCopy.trim() !== '' && experimentName.trim() !== '';

    async function handleSubmit() {
        setFormState('loading');
        try {
            const experimentData: ExperimentData = {
                detectedLoc: data,
                variantCopy,
                experimentName,
            };
            const response = await new Promise<{ ok: boolean; result?: ExperimentResult; error?: string }>(
                (resolve) => {
                    window.parent.postMessage(
                        JSON.stringify({ type: 'generateExperiment', data: experimentData }),
                        '*',
                    );
                    window.addEventListener(
                        'message',
                        function handler(event: MessageEvent) {
                            try {
                                const msg = JSON.parse(event.data as string) as {
                                    type: string;
                                    ok: boolean;
                                    result?: ExperimentResult;
                                    error?: string;
                                };
                                if (msg.type === 'generateExperimentResponse') {
                                    window.removeEventListener('message', handler);
                                    resolve({ ok: msg.ok, result: msg.result, error: msg.error });
                                }
                            } catch {
                                // ignore non-JSON messages
                            }
                        },
                    );
                },
            );
            if (response.ok && response.result) {
                setResult(response.result);
                setFormState('success');
            } else {
                setErrorMessage(response.error ?? 'Unknown error');
                setFormState('error');
            }
        } catch (err) {
            setErrorMessage((err as Error).message);
            setFormState('error');
        }
    }

    if (formState === 'success' && result) {
        return (
            <div className="flex flex-col gap-4 p-4">
                <p className="text-green-600 font-semibold">Experiment created!</p>
                <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-gray-500 font-medium">Jira ticket</span>
                    <a
                        href={result.jiraUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline break-all text-sm"
                    >
                        {result.jiraUrl}
                    </a>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-gray-500 font-medium">Slack channel</span>
                    <span className="text-sm font-mono">#{result.slackChannel}</span>
                </div>
                <button
                    onClick={onClose}
                    className="mt-2 rounded bg-[#ff7aac] px-4 py-2 text-white text-sm font-medium hover:opacity-90"
                >
                    Close
                </button>
            </div>
        );
    }

    if (formState === 'error') {
        return (
            <div className="flex flex-col gap-4 p-4">
                <p className="text-red-600 font-semibold">Something went wrong</p>
                <p className="text-sm text-gray-700">{errorMessage}</p>
                <button
                    onClick={() => setFormState('idle')}
                    className="rounded bg-gray-200 px-4 py-2 text-sm font-medium hover:opacity-90"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Read-only pre-filled fields */}
            <div className="flex flex-col gap-1">
                <span className="text-xs uppercase text-gray-500 font-medium">String ID</span>
                <div className="flex items-center gap-2 rounded bg-gray-100 px-3 py-2">
                    <pre className="flex-1 text-sm overflow-auto max-h-10 whitespace-pre-wrap break-all">
                        {data.id ?? '—'}
                    </pre>
                    {data.id && <CopyButton content={data.id} />}
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs uppercase text-gray-500 font-medium">Original copy</span>
                <div className="rounded bg-gray-100 px-3 py-2">
                    <pre className="text-sm overflow-auto max-h-10 whitespace-pre-wrap break-all">
                        {data.defaultMessage ?? data.text}
                    </pre>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs uppercase text-gray-500 font-medium">Page URL</span>
                <div className="rounded bg-gray-100 px-3 py-2">
                    <pre className="text-sm overflow-auto max-h-10 whitespace-pre-wrap break-all">
                        {window.location.href}
                    </pre>
                </div>
            </div>

            {/* Editable fields */}
            <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-gray-500 font-medium" htmlFor="experiment-name">
                    Experiment name
                </label>
                <input
                    id="experiment-name"
                    type="text"
                    value={experimentName}
                    onChange={(e) => setExperimentName(e.target.value)}
                    disabled={formState === 'loading'}
                    className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7aac]"
                    placeholder="e.g. hero_cta_test"
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-gray-500 font-medium" htmlFor="variant-copy">
                    Variant copy
                </label>
                <textarea
                    id="variant-copy"
                    value={variantCopy}
                    onChange={(e) => setVariantCopy(e.target.value)}
                    disabled={formState === 'loading'}
                    rows={3}
                    className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff7aac] resize-none"
                    placeholder="Enter the variant copy..."
                />
            </div>

            {/* Auto-computed variant string ID */}
            {experimentName.trim() && (
                <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-gray-500 font-medium">Variant string ID</span>
                    <div className="flex items-center gap-2 rounded bg-gray-100 px-3 py-2">
                        <pre className="flex-1 text-sm overflow-auto max-h-10 whitespace-pre-wrap break-all">
                            {variantStringId}
                        </pre>
                        <CopyButton content={variantStringId} />
                    </div>
                </div>
            )}

            <button
                onClick={handleSubmit}
                disabled={!canSubmit || formState === 'loading'}
                className="mt-2 rounded bg-[#ff7aac] px-4 py-2 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {formState === 'loading' ? 'Generating experiment...' : 'Generate Experiment'}
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Verify build passes**

```bash
bun run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/sidebar/ExperimentForm.tsx
git commit -m "feat: add ExperimentForm component"
```

---

## Task 7: Extend `src/sidebar/Sidebar.tsx` with `mode` prop

**Files:**
- Modify: `src/sidebar/Sidebar.tsx`

The current `Sidebar.tsx` signature is `function Sidebar({ data }: { data: DetectedLoc })`. We need to add a `mode` prop and render `ExperimentForm` when `mode === 'experiment'`.

- [ ] **Step 1: Add the import and mode prop**

At the top of `src/sidebar/Sidebar.tsx`, add the import after the existing imports:

```typescript
import ExperimentForm from './ExperimentForm';
```

- [ ] **Step 2: Update the component signature**

Change:
```typescript
export default function Sidebar({ data }: { data: DetectedLoc }): JSX.Element {
```

To:
```typescript
export default function Sidebar({
    data,
    mode = 'identify',
}: {
    data: DetectedLoc;
    mode?: 'identify' | 'experiment';
}): JSX.Element {
```

- [ ] **Step 3: Add experiment mode rendering**

Find the section where the panel content is determined (around lines 171-183, the block that calls `foundDataPanel()` or `missingDataPanel()`). Add an experiment branch before the existing `let panel`:

```typescript
// Experiment mode — show the form instead of identification result
if (mode === 'experiment') {
    // Inline the panel content to reuse the same Dialog/Transition wrapper below
}
```

Actually, the cleanest way is to replace the body content in the Dialog render. Find the `<div className="...">` that wraps the body and footer (around line 240), and wrap it:

```typescript
{mode === 'experiment' ? (
    <ExperimentForm data={data} onClose={close} />
) : (
    <>
        <div ...> {/* existing body with Field components */} </div>
        <div ...> {/* existing footer with Crowdin buttons */} </div>
    </>
)}
```

To do this precisely, find in `Sidebar.tsx` the JSX block after the header section (after the `</div>` closing the header, around line 239). The structure is:

```tsx
{/* Header */}
<div className="flex shrink-0 ...">
  ...title and close button...
</div>
{/* Body */}
<div className="relative mt-6 flex-1 px-4 sm:px-6">
  {panel.body}
</div>
{/* Footer */}
<div className="...">
  ...buttons...
</div>
```

Replace the body + footer block with:

```tsx
{mode === 'experiment' ? (
    <div className="relative mt-6 flex-1 overflow-y-auto">
        <ExperimentForm data={data} onClose={close} />
    </div>
) : (
    <>
        <div className="relative mt-6 flex-1 px-4 sm:px-6">
            {panel.body}
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-4 py-4 sm:px-6">
            <button
                type="button"
                className="inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
                onClick={destroy}
            >
                Exit Preply Talpa
            </button>
            {panel.crowdinButton}
        </div>
    </>
)}
```

- [ ] **Step 4: Verify build passes**

```bash
bun run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/Sidebar.tsx
git commit -m "feat: add mode prop to Sidebar, render ExperimentForm in experiment mode"
```

---

## Task 8: Extend `src/sidebar/index.tsx` to pass `mode`

**Files:**
- Modify: `src/sidebar/index.tsx`

The current `src/sidebar/index.tsx` receives a JSON message with `DetectedLoc` shape. We extended the message to include `mode` in Task 5. Now pass it to `Sidebar`.

The current content is approximately:

```typescript
function init(data: DetectedLoc) {
    // creates React root and renders <Sidebar data={data} />
}
window.addEventListener('message', (message: MessageEvent) => {
    init(JSON.parse(message.data) as DetectedLoc);
});
```

- [ ] **Step 1: Update to parse and pass `mode`**

Replace the entire file content with:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from './Sidebar';
import './index.css';

type SidebarMessage = DetectedLoc & { mode?: 'identify' | 'experiment' };

function init(message: SidebarMessage) {
    const { mode, ...data } = message;
    const container = document.getElementById('app-container');
    if (!container) return;
    createRoot(container).render(
        <StrictMode>
            <Sidebar data={data} mode={mode ?? 'identify'} />
        </StrictMode>,
    );
}

window.addEventListener('message', (event: MessageEvent) => {
    init(JSON.parse(event.data as string) as SidebarMessage);
});
```

- [ ] **Step 2: Verify build passes**

```bash
bun run build 2>&1 | head -30
```

Expected: no TypeScript errors, all 3 entry points build successfully.

- [ ] **Step 3: Commit**

```bash
git add src/sidebar/index.tsx
git commit -m "feat: pass mode from message to Sidebar in index.tsx"
```

---

## Task 9: Wire `generateExperiment` message in `background.ts`

**Files:**
- Modify: `src/background.ts`

In Task 5 we set up `onMessageExternal` to handle `{ type: 'generateExperiment' }` messages, but `ExperimentForm` posts to `window.parent` (the iframe parent = the page), not directly to the background. We need to relay that message.

Actually, re-examining the architecture: the sidebar iframe is injected into the page. `window.parent.postMessage` sends to the page content, not directly to `background.ts`. We need a relay through the content script or a direct `chrome.runtime.sendMessage` from the sidebar.

The sidebar can call `chrome.runtime.sendMessage` directly since it's a chrome extension page (loaded via `chrome-extension://` URL). Update `ExperimentForm.tsx` to use `chrome.runtime.sendMessage` instead of `window.parent.postMessage`.

- [ ] **Step 1: Update `ExperimentForm.tsx` to use `chrome.runtime.sendMessage`**

In `src/sidebar/ExperimentForm.tsx`, replace the `handleSubmit` async block's message-passing logic:

Replace:
```typescript
const response = await new Promise<{ ok: boolean; result?: ExperimentResult; error?: string }>(
    (resolve) => {
        window.parent.postMessage(
            JSON.stringify({ type: 'generateExperiment', data: experimentData }),
            '*',
        );
        window.addEventListener(
            'message',
            function handler(event: MessageEvent) {
                try {
                    const msg = JSON.parse(event.data as string) as {
                        type: string;
                        ok: boolean;
                        result?: ExperimentResult;
                        error?: string;
                    };
                    if (msg.type === 'generateExperimentResponse') {
                        window.removeEventListener('message', handler);
                        resolve({ ok: msg.ok, result: msg.result, error: msg.error });
                    }
                } catch {
                    // ignore non-JSON messages
                }
            },
        );
    },
);
```

With:
```typescript
const response = await new Promise<{ ok: boolean; result?: ExperimentResult; error?: string }>(
    (resolve) => {
        chrome.runtime.sendMessage(
            { type: 'generateExperiment', data: experimentData },
            (resp: { ok: boolean; result?: ExperimentResult; error?: string }) => {
                resolve(resp);
            },
        );
    },
);
```

- [ ] **Step 2: Remove the `generateExperimentResponse` message handler from `background.ts`**

In `src/background.ts`, in the `onMessageExternal` listener, the message from the sidebar will now come via `chrome.runtime.onMessage` (internal), not `onMessageExternal` (external). Add a new internal listener:

Add after the `chrome.runtime.onMessage` listener block:

```typescript
chrome.runtime.onMessage.addListener(
    (
        message: { type: 'generateExperiment'; data: ExperimentData } | string,
        _sender,
        sendResponse,
    ) => {
        if (message === 'preply-talpa-close') {
            if (_sender.tab?.id) triggerElementPicker(_sender.tab.id);
            return;
        }
        if (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === 'generateExperiment'
        ) {
            (async () => {
                try {
                    const jiraUrl = await createExperimentTicket(message.data);
                    const slackChannel = await createExperimentChannel(
                        message.data.experimentName,
                        jiraUrl,
                    );
                    sendResponse({ ok: true, result: { jiraUrl, slackChannel } });
                } catch (err) {
                    sendResponse({ ok: false, error: (err as Error).message });
                }
            })();
            return true; // keep channel open for async response
        }
    },
);
```

Remove the `generateExperiment` handling from `onMessageExternal` (which is only for external pages).

- [ ] **Step 3: Verify build passes**

```bash
bun run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 4: Manual smoke test**

1. Run `bun run dev`
2. Open `chrome://extensions`, enable Developer Mode, load unpacked from `dist/`
3. Navigate to any Preply page that has `FormattedMessage` components
4. Right-click any text → should see "Create Experiment" in context menu
5. Click "Create Experiment" → sidebar should open in experiment mode
6. String ID, original copy should be pre-filled
7. Type an experiment name → variant string ID should update live
8. Type variant copy → "Generate Experiment" button should become enabled
9. (With valid Jira/Slack sessions) Click Generate → success state with Jira URL and Slack channel name

- [ ] **Step 5: Commit**

```bash
git add src/background.ts src/sidebar/ExperimentForm.tsx
git commit -m "feat: wire generateExperiment via chrome.runtime.sendMessage"
```

---

## Task 10: Build and package

**Files:**
- No source changes — production build only

- [ ] **Step 1: Run production build**

```bash
bun run build
```

Expected output ends with something like:
```
✓ Built dist/chrome-extension-preply-talpa.zip
```

- [ ] **Step 2: Verify zip contents**

```bash
unzip -l dist/chrome-extension-preply-talpa.zip | grep -E "(background|content|sidebar|manifest)"
```

Expected: all 4 key files present (`background.js`, `content.js`, `sidebar/index.js`, `manifest.json`).

- [ ] **Step 3: Verify manifest has correct permissions**

```bash
cat dist/manifest.json | python3 -m json.tool | grep -A5 '"permissions"'
```

Expected: `"scripting"`, `"activeTab"`, `"contextMenus"` all present.

- [ ] **Step 4: Commit**

```bash
git add dist/
git commit -m "chore: production build with experiment feature"
```

---

## Implementation Notes

### CORS / credentials risk (Task 3 & 4)
If Jira or Slack return CORS errors when called from the background service worker with `credentials: 'include'`, the fallback is to move the API calls into the sidebar itself (which runs in an iframe on the page, not a service worker). The sidebar is a `chrome-extension://` page so it has access to `chrome.storage` and can hold tokens if needed. Try `credentials: 'include'` from the background first.

### Page URL in Jira ticket (Task 3)
`window.location.href` inside the sidebar iframe returns the sidebar's own URL (`chrome-extension://...`), not the page URL. The fix is to include `pageUrl` in the message posted to the sidebar.

In `src/background.ts`, in `injectSidebar`, change the `postMessage` payload:
```typescript
iframe.contentWindow?.postMessage(
    JSON.stringify({ ...JSON.parse(messageJson), mode: sidebarMode, pageUrl: tabUrl }),
    sidebarUrl,
);
```
And update the `injectSidebar` signature to accept `tabUrl: string | undefined`.

In `src/sidebar/index.tsx`, update `SidebarMessage` type:
```typescript
type SidebarMessage = DetectedLoc & { mode?: 'identify' | 'experiment'; pageUrl?: string };
```
Pass `pageUrl` as a prop to `Sidebar` and down to `ExperimentForm`, where it replaces `window.location.href`.

In `src/services/jira.ts`, update `ExperimentData` usage to read `data.pageUrl ?? 'unknown'`.

### Slack `name_taken` error
In `src/services/slack.ts`, in the `slackPost` function, add a specific check:
```typescript
if (json.error === 'name_taken') {
    throw new Error(`A Slack channel named proj_${channelName} already exists. Try a different experiment name.`);
}
```
