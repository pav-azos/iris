// ClerkProvider removed — ÍRIS is open access (academic project for I2A2 InsurMinds RAG course)
import { RootLayout } from '@repo/common/components';
import { ReactQueryProvider, RootProvider } from '@repo/common/context';
import { TooltipProvider, cn } from '@repo/ui';
import { GeistMono } from 'geist/font/mono';
import type { Viewport } from 'next';
import { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import localFont from 'next/font/local';

const bricolage = Bricolage_Grotesque({
    subsets: ['latin'],
    variable: '--font-bricolage',
});

import './globals.css';

export const metadata: Metadata = {
    title: 'ÍRIS — Inteligência em Regulação e Informação Securitária',
    description:
        'Agente especialista na Lei nº 15.040/2024 (Marco Legal do Seguro Brasileiro). ' +
        'Tire dúvidas sobre direitos, prazos e obrigações com base na lei.',
    keywords: 'lei 15040, marco legal do seguro, SUSEP, corretor de seguros, segurado',
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

const inter = localFont({
    src: './InterVariable.woff2',
    variable: '--font-inter',
});

const clash = localFont({
    src: './ClashGrotesk-Variable.woff2',
    variable: '--font-clash',
});

export default function ParentLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="pt-BR"
            className={cn(GeistMono.variable, inter.variable, clash.variable, bricolage.variable)}
            suppressHydrationWarning
        >
            <head>
                <link rel="icon" href="/favicon.ico" sizes="any" />

                {/* <script
                    crossOrigin="anonymous"
                    src="//unpkg.com/react-scan/dist/auto.global.js"
                ></script> */}
            </head>
            <body>
                {/* <PostHogProvider> */}
                <RootProvider>
                    {/* <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          > */}
                    <TooltipProvider>
                        <ReactQueryProvider>
                            <RootLayout>{children}</RootLayout>
                        </ReactQueryProvider>
                    </TooltipProvider>
                    {/* </ThemeProvider> */}
                </RootProvider>
                {/* </PostHogProvider> */}
            </body>
        </html>
    );
}
