export type WorkflowMode = 'corp' | 'lunch';

export const WORKFLOW_LABELS: Record<WorkflowMode, string> = {
  corp: '법인카드 지출증빙',
  lunch: '점심식대 지출증빙',
};

export const WORKFLOW_DEFAULTS: Record<WorkflowMode, { department: string; manager: string }> = {
  corp: { department: '', manager: '' },
  lunch: { department: '', manager: '' },
};

export interface Receipt {
  id: string;
  date: string;
  store: string;
  amount: number;
  category: string;
  type: 'expense' | 'income';
  imageUrl?: string;
  time?: string;
  cardName?: string;
  cardNumber?: string;
  approvalNum?: string;
  installment?: string;
  merchantNum?: string;
  items?: { name: string; unitPrice: number; qty: number; amount: number }[];
}

export interface DocumentSettingsPanelProps {
  docDate: string;
  setDocDate: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  manager: string;
  setManager: (v: string) => void;
  itemsPerPage: number;
  setItemsPerPage: (v: number) => void;
  rowHeight: number;
  setRowHeight: (v: number) => void;
  width?: string;
  className?: string;
  // 점심식대 모드: 1페이지당 개수 필드를 정산월(YYYY-MM)로 교체
  showSettlementMonth?: boolean;
  settlementMonth?: string;
  setSettlementMonth?: (v: string) => void;
}

export interface QuickAddBarProps {
  quickAdd: { date: string; store: string; amount: string; note: string };
  setQuickAdd: (v: { date: string; store: string; amount: string; note: string }) => void;
  onAdd: () => void;
  labelStore: string;
  labelNote: string;
}
