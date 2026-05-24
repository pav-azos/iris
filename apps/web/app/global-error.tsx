'use client';
// Sentry removed — ÍRIS academic project
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
    return (
        <html>
            <body>
                <div className="flex h-screen w-screen flex-col items-center justify-center">
                    <div className="flex w-[300px] flex-col gap-2">
                        <p className="text-base">Oops! Something went wrong.</p>
                        <p className="text-sm">
                            Please try refreshing the page.
                        </p>
                    </div>
                </div>
            </body>
        </html>
    );
}
