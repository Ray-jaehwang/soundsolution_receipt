import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { WORKFLOW_LABELS, WORKFLOW_DEFAULTS } from '../types';
import type { WorkflowMode, Receipt } from '../types';
import { runOcr } from '../utils/ocr';
import { saveWorkspace, parseWorkspaceFile } from '../utils/workspace';

export type ActiveTab = 'dashboard' | 'preview' | 'evidence';

export function useReceiptWorkspace() {
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>(() =>
    (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp'
  );
  const storagePrefix = `${workflowMode}_`;
  const k = (name: string) => `${storagePrefix}expense_workspace_${name}`;

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  const [receipts, setReceipts] = useState<Receipt[]>(() => {
    try {
      const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
      const saved = localStorage.getItem(`${mode}_expense_workspace_receipts`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [isImgHovered, setIsImgHovered] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const [docDate, setDocDate] = useState(() => {
    const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
    return localStorage.getItem(`${mode}_expense_workspace_docDate`) || new Date().toISOString().split('T')[0];
  });
  const [department, setDepartment] = useState(() => {
    const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
    return localStorage.getItem(`${mode}_expense_workspace_department`) || WORKFLOW_DEFAULTS[mode].department;
  });
  const [manager, setManager] = useState(() => {
    const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
    return localStorage.getItem(`${mode}_expense_workspace_manager`) || WORKFLOW_DEFAULTS[mode].manager;
  });
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
    return parseInt(localStorage.getItem(`${mode}_expense_workspace_itemsPerPage`) || '17');
  });
  const [rowHeight, setRowHeight] = useState(() => {
    const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
    return parseInt(localStorage.getItem(`${mode}_expense_workspace_rowHeight`) || '33');
  });
  const [settlementMonth, setSettlementMonth] = useState(() => {
    const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
    const saved = localStorage.getItem(`${mode}_expense_workspace_settlementMonth`);
    if (saved) return saved;
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const committedModeRef = useRef<WorkflowMode>(workflowMode);

  useEffect(() => {
    if (committedModeRef.current !== workflowMode) return;
    try {
      localStorage.setItem(k('receipts'), JSON.stringify(receipts));
    } catch {
      console.warn('localStorage quota exceeded');
    }
    localStorage.setItem(k('docDate'), docDate);
    localStorage.setItem(k('department'), department);
    localStorage.setItem(k('manager'), manager);
    localStorage.setItem(k('itemsPerPage'), itemsPerPage.toString());
    localStorage.setItem(k('rowHeight'), rowHeight.toString());
    localStorage.setItem(k('settlementMonth'), settlementMonth);
  }, [receipts, docDate, department, manager, itemsPerPage, rowHeight, settlementMonth]);

  const isInitialMountRef = useRef(true);
  useEffect(() => {
    localStorage.setItem('workflow_mode', workflowMode);
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      committedModeRef.current = workflowMode;
      return;
    }
    const p = `${workflowMode}_expense_workspace_`;
    try {
      const saved = localStorage.getItem(`${p}receipts`);
      setReceipts(saved ? JSON.parse(saved) : []);
    } catch {
      setReceipts([]);
    }
    setDocDate(localStorage.getItem(`${p}docDate`) || new Date().toISOString().split('T')[0]);
    setDepartment(localStorage.getItem(`${p}department`) || WORKFLOW_DEFAULTS[workflowMode].department);
    setManager(localStorage.getItem(`${p}manager`) || WORKFLOW_DEFAULTS[workflowMode].manager);
    setItemsPerPage(parseInt(localStorage.getItem(`${p}itemsPerPage`) || '17'));
    setRowHeight(parseInt(localStorage.getItem(`${p}rowHeight`) || '33'));
    const savedSM = localStorage.getItem(`${p}settlementMonth`);
    if (savedSM) {
      setSettlementMonth(savedSM);
    } else {
      const today = new Date();
      setSettlementMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
    }
    setActiveTab('dashboard');
    committedModeRef.current = workflowMode;
  }, [workflowMode]);

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      setIsExtracting(true);
      const { receipts: newReceipts, successCount, failCount, lastError } = await runOcr(files);
      if (newReceipts.length > 0) setReceipts(prev => [...newReceipts, ...prev]);
      if (failCount > 0) {
        const errMsg = lastError instanceof Error ? lastError.message : String(lastError ?? '');
        alert(`${successCount}장 성공, ${failCount}장 처리 실패했습니다.\n[마지막 에러 내용]: ${errMsg}`);
      } else {
        alert(`총 ${successCount}장의 영수증 인식이 모두 성공적으로 완료되었습니다!`);
      }
    } catch (error: unknown) {
      console.error('OCR Error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`분석 중 오류가 발생했습니다.\n\n[상세 내역]: ${msg}\n\n1. API 키가 정확한지 확인해주세요.\n2. 환경변수 수정 후 서버(npm run dev)를 재시작 했는지 확인해주세요.`);
    } finally {
      setIsExtracting(false);
      e.target.value = '';
    }
  };

  const clearData = () => {
    if (confirm('모든 데이터를 삭제하시겠습니까?')) setReceipts([]);
  };

  const handlePrint = (activeTab: ActiveTab, workflowMode: WorkflowMode, docDate: string, settlementMonth: string) => {
    const originalTitle = document.title;
    let name = '';
    if (activeTab === 'evidence') {
      const periodTag = workflowMode === 'lunch' ? (settlementMonth || docDate) : docDate;
      name = `${WORKFLOW_LABELS[workflowMode]}_증빙철_${periodTag}`;
    } else if (activeTab === 'preview') {
      name = workflowMode === 'lunch' ? `점심식대지출증빙_${settlementMonth || docDate}` : `법인카드지출증빙_${docDate}`;
    } else {
      name = `${WORKFLOW_LABELS[workflowMode]}_${docDate}`;
    }
    document.title = name;
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = originalTitle; }, 500);
    }, 50);
  };

  const addCashReceipt = () => {
    const today = new Date().toISOString().split('T')[0];
    setReceipts(prev => [...prev, { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), date: today, store: '', amount: 0, category: '', type: 'income' }]);
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === receipts.length ? new Set() : new Set(receipts.map(r => r.id)));
  };
  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;
    setReceipts(prev => prev.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
  };

  const addManualReceipt = () => {
    const today = new Date().toISOString().split('T')[0];
    setReceipts(prev => [...prev, { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), date: today, store: '', amount: 0, category: '', type: 'expense' }]);
  };

  const togglePaymentType = (id: string) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, type: r.type === 'expense' ? 'income' : 'expense' } : r));
  };

  const [quickAdd, setQuickAdd] = useState({ date: '', store: '', amount: '', note: '' });
  const addQuickReceipt = () => {
    if (!quickAdd.date) { alert('날짜를 입력하세요.'); return; }
    if (!quickAdd.store.trim()) { alert('사용처(식당명)를 입력하세요.'); return; }
    const amt = parseInt((quickAdd.amount || '0').replace(/,/g, ''), 10) || 0;
    setReceipts(prev => [...prev, { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), date: quickAdd.date, store: quickAdd.store.trim(), amount: amt, category: quickAdd.note.trim(), type: 'expense' }]);
    setQuickAdd({ date: quickAdd.date, store: '', amount: '', note: '' });
  };

  const deleteReceipt = (id: string) => {
    if (confirm('이 항목을 삭제하시겠습니까?')) setReceipts(prev => prev.filter(r => r.id !== id));
  };

  const updateReceipt = (id: string, field: keyof Receipt, value: string | number) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSaveWorkspace = () =>
    saveWorkspace({ receipts, docDate, department, manager, itemsPerPage, rowHeight, settlementMonth }, workflowMode);

  const loadWorkspace = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = parseWorkspaceFile(event.target?.result as string);
        if (data.receipts) setReceipts(data.receipts);
        if (data.docDate) setDocDate(data.docDate);
        if (data.department) setDepartment(data.department);
        if (data.manager) setManager(data.manager);
        if (data.itemsPerPage) setItemsPerPage(data.itemsPerPage);
        if (data.rowHeight) setRowHeight(data.rowHeight);
        if (data.settlementMonth) setSettlementMonth(data.settlementMonth);
      } catch {
        alert('유효하지 않은 파일입니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return {
    workflowMode, setWorkflowMode,
    activeTab, setActiveTab,
    receipts,
    isImgHovered, setIsImgHovered,
    isExtracting,
    docDate, setDocDate,
    department, setDepartment,
    manager, setManager,
    itemsPerPage, setItemsPerPage,
    rowHeight, setRowHeight,
    settlementMonth, setSettlementMonth,
    selectedIds,
    quickAdd, setQuickAdd,
    handleImageUpload,
    clearData,
    handlePrint,
    addCashReceipt,
    toggleSelect,
    toggleSelectAll,
    deleteSelected,
    addManualReceipt,
    togglePaymentType,
    addQuickReceipt,
    deleteReceipt,
    updateReceipt,
    handleSaveWorkspace,
    loadWorkspace,
  };
}
