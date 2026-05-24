import { ChatInput } from '@repo/common/components';
import { HealthBanner } from '../components/health-banner';

export default function ChatPageLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: { threadId: string };
}) {
    return (
        <div className="relative flex h-full w-full flex-col">
            <HealthBanner />
            {children}
            <ChatInput />
        </div>
    );
}
