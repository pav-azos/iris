import { cn, Dialog, DialogContent } from '@repo/ui';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Logo } from './logo';

export const IntroDialog = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const hasSeenIntro = localStorage.getItem('hasSeenIntro');
        if (!hasSeenIntro) {
            setIsOpen(true);
        }
    }, []);

    const handleClose = () => {
        localStorage.setItem('hasSeenIntro', 'true');
        setIsOpen(false);
    };

    const icon = (
        <IconCircleCheckFilled className="text-brand/60 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full" />
    );

    const points = [
        {
            icon,
            text: `**Especializado em Seguros**: Fine-tuned no domínio de seguros para respostas precisas e contextualizadas.`,
        },
        {
            icon,
            text: `**RAG Avançado**: Recupera contexto de documentos de seguros para embasar cada resposta com fontes confiáveis.`,
        },
        {
            icon,
            text: `**Modelo Fine-tuned**: ÍRIS Mistral 7B treinado especificamente no corpus InsurMinds do curso I2A2.`,
        },
        {
            icon,
            text: `**Privacidade Local**: O modelo roda localmente via Ollama — suas perguntas não saem do seu ambiente.`,
        },
        {
            icon,
            text: `**Provedor Externo Opcional**: Conecte OpenAI ou Anthropic como alternativa ao modelo local.`,
        },
        {
            icon,
            text: `**Projeto Acadêmico**: Desenvolvido no curso RAG da I2A2 — InsurMinds.`,
        },
    ];

    return (
        <Dialog
            open={isOpen}
            onOpenChange={open => {
                if (open) {
                    setIsOpen(true);
                } else {
                    handleClose();
                }
            }}
        >
            <DialogContent
                ariaTitle="Bem-vindo ao ÍRIS"
                className="flex max-w-[420px] flex-col gap-0 overflow-hidden p-0"
            >
                <div className="flex flex-col gap-8 p-5">
                    <div className="flex flex-col gap-2">
                        <div
                            className={cn(
                                'flex h-8 w-full cursor-pointer items-center justify-start gap-1.5'
                            )}
                        >
                            <Logo className="text-brand size-5" />
                            <p className="font-clash text-foreground text-lg font-bold tracking-wide">
                                ÍRIS
                            </p>
                        </div>
                        <p className="text-base font-semibold">
                            Assistente de IA para Seguros
                        </p>
                        <p className="text-muted-foreground text-sm">
                            Powered by RAG + Mistral 7B fine-tuned — I2A2 InsurMinds
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold">O que o ÍRIS oferece:</h3>

                        <div className="flex flex-col items-start gap-1.5">
                            {points.map((point, index) => (
                                <div key={index} className="flex-inline flex items-start gap-2">
                                    {point.icon}
                                    <ReactMarkdown
                                        className="text-sm"
                                        components={{
                                            p: ({ children }) => (
                                                <p className="text-muted-foreground text-sm">
                                                    {children}
                                                </p>
                                            ),
                                            strong: ({ children }) => (
                                                <span className="text-foreground text-sm font-semibold">
                                                    {children}
                                                </span>
                                            ),
                                        }}
                                    >
                                        {point.text}
                                    </ReactMarkdown>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
