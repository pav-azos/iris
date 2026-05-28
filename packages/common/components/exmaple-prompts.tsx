import { useChatStore } from '@repo/common/store';
import { Button } from '@repo/ui';
import {
    IconBook,
    IconBulb,
    IconChartBar,
    IconFileText,
    IconShield,
} from '@tabler/icons-react';
import { Editor } from '@tiptap/react';

export const examplePrompts = {
    coberturas: [
        'O que é cobertura de responsabilidade civil em seguro de automóvel?',
        'Qual a diferença entre cobertura básica e cobertura compreensiva?',
        'O seguro residencial cobre danos causados por enchente?',
        'Quais são as coberturas obrigatórias em um seguro de vida?',
    ],

    sinistros: [
        'Como funciona o processo de abertura de sinistro?',
        'Quais documentos são necessários para acionar um sinistro de automóvel?',
        'Em quanto tempo a seguradora deve responder a um sinistro?',
        'O que é franquia e como ela impacta o valor do sinistro?',
    ],

    conceitos: [
        'Explique o conceito de prêmio de seguro e como ele é calculado.',
        'Qual a diferença entre seguro de vida individual e coletivo?',
        'O que é resseguro e qual sua função no mercado segurador?',
        'Como funciona a portabilidade de planos de previdência privada?',
    ],

    regulacao: [
        'Qual o papel da SUSEP na regulação do mercado de seguros no Brasil?',
        'O que diz o Código de Defesa do Consumidor sobre seguros?',
        'Quais são os direitos do segurado em caso de recusa de sinistro?',
        'Como funciona o processo de reclamação na SUSEP?',
    ],

    analise: [
        'Compare seguro de automóvel com cobertura de terceiros vs. cobertura total.',
        'Analise os fatores que influenciam o custo de um seguro saúde empresarial.',
        'Quais tendências de InsurTech estão transformando o mercado de seguros?',
        'Como a inteligência artificial está sendo usada para prevenção de fraudes em seguros?',
    ],
};

export const getRandomPrompt = (category?: keyof typeof examplePrompts) => {
    if (category && examplePrompts[category]) {
        const prompts = examplePrompts[category];
        return prompts[Math.floor(Math.random() * prompts.length)];
    }

    // If no category specified or invalid category, return a random prompt from any category
    const categories = Object.keys(examplePrompts) as Array<keyof typeof examplePrompts>;
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const prompts = examplePrompts[randomCategory];
    return prompts[Math.floor(Math.random() * prompts.length)];
};

const categoryIcons = {
    coberturas: { name: 'Coberturas', icon: IconShield, color: '!text-brand' },
    sinistros: { name: 'Sinistros', icon: IconFileText, color: '!text-blue-600' },
    conceitos: { name: 'Conceitos', icon: IconBulb, color: '!text-yellow-600' },
    regulacao: { name: 'Regulação', icon: IconBook, color: '!text-purple-600' },
    analise: { name: 'Análise', icon: IconChartBar, color: '!text-green-600' },
};

export const ExamplePrompts = () => {
    const editor: Editor | undefined = useChatStore(state => state.editor);
    const handleCategoryClick = (category: keyof typeof examplePrompts) => {
        console.log('editor', editor);
        if (!editor) return;
        const randomPrompt = getRandomPrompt(category);
        editor.commands.clearContent();
        editor.commands.insertContent(randomPrompt);
    };

    if (!editor) return null;

    return (
        <div className="animate-fade-in mb-8 flex w-full flex-wrap justify-center gap-2 p-6 duration-[1000ms]">
            {Object.entries(categoryIcons).map(([category, value], index) => (
                <Button
                    key={index}
                    variant="bordered"
                    rounded="full"
                    size="sm"
                    onClick={() => handleCategoryClick(category as keyof typeof examplePrompts)}
                >
                    <value.icon size={16} className={'text-muted-foreground/50'} />
                    {value.name}
                </Button>
            ))}
        </div>
    );
};
