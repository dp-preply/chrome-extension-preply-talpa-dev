import { useState } from 'react';
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/solid';

export default function CopyButton({ content }: { content: string }) {
    const [clicked, setClicked] = useState(false);

    const onClick = () => {
        navigator.clipboard.writeText(content);
        setClicked(true);
        setTimeout(() => {
            setClicked(false);
        }, 3000);
    };

    const notClickedTsx = (
        <>
            <ClipboardDocumentIcon className="w-4 h-4 me-1.5" />
            <span className="text-xs font-semibold">Copy</span>
        </>
    );

    const clickedTsx = (
        <>
            <ClipboardDocumentCheckIcon className="w-4 h-4 me-1.5" />
            <span className="text-xs font-semibold text-blue-700 light:text-blue-500">Copied</span>
        </>
    );

    return (
        <button
            onClick={onClick}
            className="text-gray-900 m-0.5 hover:bg-gray-100 light:bg-gray-800 light:border-gray-600 light:hover:bg-gray-700 rounded-lg py-2 px-2.5 inline-flex items-center justify-center bg-white border-gray-200 border">
            <span className="inline-flex items-center">{clicked ? clickedTsx : notClickedTsx}</span>
        </button>
    );
}
