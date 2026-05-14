import { useState } from 'react';
import CopyButton from './CopyButton';

type Props = {
    data: DetectedLoc;
    onClose: () => void;
    pageUrl?: string;
    tabId?: number;
};

type FormState = 'idle' | 'loading' | 'success' | 'error';

export default function ExperimentForm({ data, onClose, pageUrl, tabId }: Props): JSX.Element {
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
                pageUrl,
                tabId,
            };
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
                        {pageUrl ?? '—'}
                    </pre>
                </div>
            </div>

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
