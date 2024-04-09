import { useState, type ReactElement } from 'react';
import CopyButton from './CopyButton';

export default function Field({ name, content }: { name: string | ReactElement; content: string }) {
    const [showButton, setShowButton] = useState(false);

    const onMouseEnter = () => {
        setShowButton(true);
    };
    const onMouseLeave = () => {
        setShowButton(false);
    };

    return (
        <div className="pb-5 pt-6">
            <div className="mb-2 flex justify-between items-center">
                <p className="text-base font-medium text-gray-900 light:text-white">{name}</p>
            </div>
            <div
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                className="relative bg-gray-50 rounded-lg light:bg-gray-700 p-4">
                <div className="overflow-y-scroll max-h-40">
                    <pre className="text-base text-gray-600 whitespace-pre-wrap break-words min-h-5">
                        {content}
                    </pre>
                </div>
                <div className="absolute top-2 end-2 bg-gray-50 light:bg-gray-700">
                    {showButton ? <CopyButton content={content} /> : null}
                </div>
            </div>
        </div>
    );
}
