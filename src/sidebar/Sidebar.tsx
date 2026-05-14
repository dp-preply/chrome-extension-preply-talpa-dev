import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XCircleIcon, XMarkIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { CheckIcon } from '@heroicons/react/24/outline';
import Field from './Field';
import talpaIcon from './icon-128.png';
import ExperimentForm from './ExperimentForm';

const CROWDIN_LANG_MAP: { [key: string]: string } = {
    ua: 'uk',
    zh: 'zh-CN',
    es: 'es-MX',
    ar: 'ar-EG',
    pt: 'pt',
    de: 'de',
    en: 'en',
    fr: 'fr',
    id: 'id',
    it: 'it',
    ko: 'ko',
    pl: 'pl',
    ru: 'ru',
    tr: 'tr',
    ja: 'ja',
    nl: 'nl',
    ro: 'ro',
    sv: 'sv',
    th: 'th',
    cs: 'cs',
    tw: 'zh-TW',
    hk: 'zh-HK',
};

function CopyLinkButton({ content }: { content: string }) {
    const [clicked, setClicked] = useState(false);

    const onClick = () => {
        navigator.clipboard.writeText(content);
        setClicked(true);
        setTimeout(() => {
            setClicked(false);
        }, 3000);
    };

    const notClickedTsx = <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />;

    const clickedTsx = <CheckIcon className="h-4 w-4 stroke-[4]" aria-hidden="true" />;

    return (
        <button
            onClick={onClick}
            type="button"
            title="Copy link to Crowdin"
            className="inline-flex items-center rounded-r-md bg-[#ff7aac] px-3 py-2 text-sm font-semibold border-2 border-l-0 border-[#121117] text-[#121117] shadow-sm hover:bg-[#fe9fc3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#121117]">
            {clicked ? clickedTsx : notClickedTsx}
        </button>
    );
}

const getCrowdinLink = (lang: string, stringId: string) => {
    let crowdinLang = CROWDIN_LANG_MAP[lang] ?? 'en';
    crowdinLang = crowdinLang.toLowerCase().replace('-', '');
    return `https://preply.crowdin.com/editor/35/all/en-${crowdinLang}/147?view=comfortable&filter=advanced&value=12&verbal_expression_scope=key#q=${stringId}`;
};

const foundDataPanel = ({
    id,
    lang,
    defaultMessage,
    text,
}: {
    id: string;
    lang: string;
    defaultMessage: string;
    text: string;
}) => {
    const link = getCrowdinLink(lang, id);
    const crowdinButton = (
        <span className="isolate inline-flex rounded-md ml-4">
            <a
                target="blank"
                type="button"
                title="Open Crowdin in a new tab"
                className="inline-flex rounded-l-md bg-[#ff7aac] px-3 py-2 text-sm font-semibold border-2 border-[#121117] text-[#121117] shadow-sm hover:bg-[#fe9fc3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#121117]"
                href={link}>
                Access on Crowdin
            </a>
            <CopyLinkButton content={link} />
        </span>
    );
    const body = (
        <>
            <Field name="String ID" content={id} />
            <Field name="Source in English" content={defaultMessage} />
            <Field name={`Localized content (${lang})`} content={text} />
        </>
    );
    return {
        body,
        crowdinButton,
    };
};

const missingDataPanel = ({
    lang,
    text,
    debugInfo,
}: {
    lang: string;
    text: string;
    debugInfo: string;
}) => {
    const link = getCrowdinLink(lang, text);
    const crowdinButton = (
        <span className="isolate inline-flex rounded-md ml-4">
            <a
                target="blank"
                type="button"
                title="Open Crowdin in a new tab"
                className="inline-flex rounded-l-md bg-[#ff7aac] px-3 py-2 text-sm font-semibold border-2 border-[#121117] text-[#121117] shadow-sm hover:bg-[#fe9fc3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#121117]"
                href={link}>
                Search on Crowdin
            </a>
            <CopyLinkButton content={link} />
        </span>
    );
    const body = (
        <>
            <div className="pb-5 pt-6">
                <div className="rounded-md bg-red-50 p-4">
                    <h3 className="text-base font-medium text-red-800 flex flex-row justify-start gap-x-2">
                        <XCircleIcon className="mt-0.5 h-5 w-5 text-red-800" aria-hidden="true" />
                        No string ID detected
                    </h3>
                    <div className="mt-2 text-base text-red-700">
                        Selected content may include backend data, user-generated content, SEO, or
                        alt text, which may not be stored on Crowdin.
                    </div>
                </div>
            </div>
            <Field name={`Localized content (${lang})`} content={text} />
            <Field name="Debug information" content={debugInfo} />
        </>
    );
    return {
        body,
        crowdinButton,
    };
};

export default function Sidebar({
    data,
    mode: initialMode = 'identify',
    pageUrl,
}: {
    data: DetectedLoc;
    mode?: 'identify' | 'experiment';
    pageUrl?: string;
}) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'identify' | 'experiment'>(initialMode);

    useEffect(() => {
        setOpen(true);
    }, []);

    const close = () => {
        setOpen(false);
        setTimeout(() => {
            window.parent.postMessage('close', '*');
        }, 500);
    };

    const destroy = () => {
        setOpen(false);
        setTimeout(() => {
            window.parent.postMessage('destroy', '*');
        }, 500);
    };

    const { body, crowdinButton } =
        data && data.id
            ? foundDataPanel({
                  id: data.id,
                  lang: data.lang,
                  defaultMessage: data.defaultMessage || '',
                  text: data.text,
              })
            : missingDataPanel({
                  lang: data.lang,
                  text: data.text,
                  debugInfo: data.debugInfo || '',
              });

    return (
        <Transition.Root show={open} as={Fragment}>
            <Dialog as="div" className="relative z-10" onClose={close}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-400"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-400"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                            <Transition.Child
                                as={Fragment}
                                enter="transform transition ease-in-out duration-500 sm:duration-700"
                                enterFrom="translate-x-full"
                                enterTo="translate-x-0"
                                leave="transform transition ease-in-out duration-500 sm:duration-700"
                                leaveFrom="translate-x-0"
                                leaveTo="translate-x-full">
                                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                                    <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                                        <div className="flex min-h-0 flex-1 flex-col overflow-y-scroll py-6">
                                            <div className="px-4 sm:px-6">
                                                <div className="flex items-center justify-between">
                                                    <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900 flex items-center">
                                                        <img
                                                            src={talpaIcon}
                                                            className="h-10 w-10"
                                                            alt=""
                                                        />
                                                        Preply Talpa
                                                    </Dialog.Title>
                                                    <div className="ml-3 flex h-7 items-center">
                                                        <button
                                                            type="button"
                                                            className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#121117] focus:ring-offset-2"
                                                            onClick={close}>
                                                            <span className="absolute -inset-2.5" />
                                                            <span className="sr-only">Close panel</span>
                                                            <XMarkIcon
                                                                className="h-6 w-6"
                                                                aria-hidden="true"
                                                            />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            {mode === 'experiment' ? (
                                                <div className="relative mt-6 flex-1 overflow-y-auto">
                                                    <ExperimentForm data={data} onClose={close} pageUrl={pageUrl} />
                                                </div>
                                            ) : (
                                                <div className="flex flex-1 flex-col justify-between">
                                                    <div className="divide-y divide-gray-200 px-4 sm:px-6">
                                                        {body}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {mode !== 'experiment' && (
                                            <div className="flex flex-shrink-0 justify-between px-4 py-4">
                                                <button
                                                    type="button"
                                                    className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:ring-gray-400"
                                                    onClick={destroy}>
                                                    Exit Preply Talpa
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    {data.id && (
                                                        <button
                                                            type="button"
                                                            className="rounded-md bg-[#ff7aac] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
                                                            onClick={() => setMode('experiment')}>
                                                            Create Experiment
                                                        </button>
                                                    )}
                                                    {crowdinButton}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
}
