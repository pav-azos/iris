'use client';
import type { ReactNode } from 'react';

interface DisabledFeatureProps {
    children: ReactNode;
    reason?: string;
}

const DEFAULT_REASON =
    'Celso (I2A2): o I2A2 ainda vai ensinar a gente a fazer isso direito 😄';

export function DisabledFeature({
    children,
    reason = DEFAULT_REASON,
}: DisabledFeatureProps) {
    return (
        <div className="relative group cursor-not-allowed">
            <div className="opacity-40 pointer-events-none select-none">{children}</div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none max-w-xs text-center">
                {reason}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </div>
        </div>
    );
}
