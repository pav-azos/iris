export interface GoldenQuery {
  query: string;
  expectedSourceFile: string;
  expectedContains: string;
}

export const GOLDEN_QUERIES: GoldenQuery[] = [
  { query: 'O que é aceitação tácita na lei de seguros?', expectedSourceFile: 'L15040', expectedContains: 'aceitação' },
  { query: 'Qual o prazo para o corretor entregar documentos?', expectedSourceFile: 'FAQ', expectedContains: '5 dias úteis' },
  { query: 'O segurado pode cancelar a apólice?', expectedSourceFile: 'L15040', expectedContains: 'cancelamento' },
  { query: 'O que é agravamento de risco?', expectedSourceFile: 'L15040', expectedContains: 'agravamento' },
  { query: 'Qual o prazo para pagar indenização após sinistro?', expectedSourceFile: 'L15040', expectedContains: 'indenização' },
  { query: 'O corretor pode preencher o questionário pelo cliente?', expectedSourceFile: 'FAQ', expectedContains: 'questionário' },
  { query: 'Quais meios são aceitos para notificar o segurado?', expectedSourceFile: 'L15040', expectedContains: 'notif' },
  { query: 'Inadimplência cancela automaticamente a apólice?', expectedSourceFile: 'L15040', expectedContains: 'inadimplência' },
  { query: 'O que é boa-fé objetiva no contrato de seguro?', expectedSourceFile: 'L15040', expectedContains: 'boa-fé' },
  { query: 'Responsabilidade do corretor aumentou com a nova lei?', expectedSourceFile: 'FAQ', expectedContains: 'responsabilidade' },
  { query: 'Prazo para a seguradora aceitar ou recusar proposta?', expectedSourceFile: 'L15040', expectedContains: 'proposta' },
  { query: 'Quando entra em vigor a Lei 15.040?', expectedSourceFile: 'L15040', expectedContains: 'vigor' },
  { query: 'O que é prescrição no seguro?', expectedSourceFile: 'L15040', expectedContains: 'prescrição' },
  { query: 'Segurado pode trocar de corretor na renovação?', expectedSourceFile: 'FAQ', expectedContains: 'corretor' },
  { query: 'Regulação de sinistro — quais os prazos?', expectedSourceFile: 'L15040', expectedContains: 'sinistro' },
];
