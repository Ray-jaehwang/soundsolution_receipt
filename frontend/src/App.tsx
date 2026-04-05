import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  Image as ImageIcon,
  LayoutDashboard,
  Trash2,
  Loader2,
  FileText,
  Wallet,
  Upload,
  Save,
  CreditCard,
  UtensilsCrossed
} from 'lucide-react';

// One-time migration: unprefixed localStorage keys → 'corp_' prefix (법인카드 워크플로우로 이관)
(function migrateWorkspaceKeys() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('workflow_migration_v1')) return;
  ['receipts', 'docDate', 'department', 'manager', 'itemsPerPage', 'rowHeight'].forEach(name => {
    const oldKey = `expense_workspace_${name}`;
    const newKey = `corp_expense_workspace_${name}`;
    const val = localStorage.getItem(oldKey);
    if (val !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, val);
    }
  });
  localStorage.setItem('workflow_migration_v1', '1');
})();

// 대한민국 공휴일 (양력 고정 + 연도별 음력/대체공휴일)
const KR_FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '성탄절',
};
// 연도별 변동 공휴일(음력 포함) + 대체공휴일 (YYYY-MM-DD)
const KR_VARIABLE_HOLIDAYS: Record<string, string> = {
  // 2024
  '2024-02-09': '설날', '2024-02-10': '설날', '2024-02-11': '설날', '2024-02-12': '대체공휴일',
  '2024-04-10': '국회의원선거', '2024-05-06': '대체공휴일', '2024-05-15': '부처님오신날',
  '2024-09-16': '대체공휴일', '2024-09-17': '추석', '2024-09-18': '추석',
  // 2025
  '2025-01-28': '설날', '2025-01-29': '설날', '2025-01-30': '설날',
  '2025-03-03': '대체공휴일', '2025-05-05': '부처님오신날·어린이날', '2025-05-06': '대체공휴일',
  '2025-10-03': '개천절', '2025-10-05': '추석', '2025-10-06': '추석', '2025-10-07': '추석', '2025-10-08': '대체공휴일',
  '2025-10-09': '한글날',
  // 2026
  '2026-02-16': '설날', '2026-02-17': '설날', '2026-02-18': '설날',
  '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
  '2026-08-17': '대체공휴일', '2026-09-24': '추석', '2026-09-25': '추석', '2026-09-26': '추석',
  // 2027
  '2027-02-06': '설날', '2027-02-07': '설날', '2027-02-08': '설날', '2027-02-09': '대체공휴일',
  '2027-05-13': '부처님오신날',
  '2027-09-14': '추석', '2027-09-15': '추석', '2027-09-16': '추석',
};
const isKoreanHoliday = (y: number, m: number, d: number): boolean => {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  if (KR_FIXED_HOLIDAYS[`${mm}-${dd}`]) return true;
  if (KR_VARIABLE_HOLIDAYS[`${y}-${mm}-${dd}`]) return true;
  return false;
};

type WorkflowMode = 'corp' | 'lunch';
const WORKFLOW_LABELS: Record<WorkflowMode, string> = {
  corp: '법인카드 지출증빙',
  lunch: '점심식대 지출증빙',
};
const WORKFLOW_DEFAULTS: Record<WorkflowMode, { department: string; manager: string }> = {
  corp: { department: '설계팀', manager: '임종현 실장' },
  lunch: { department: '설계팀', manager: '임종현 실장' },
};

interface Receipt {
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
}

interface DocumentSettingsPanelProps {
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

function DocumentSettingsPanel({
  docDate, setDocDate, department, setDepartment, manager, setManager,
  itemsPerPage, setItemsPerPage, rowHeight, setRowHeight, width, className,
  showSettlementMonth, settlementMonth, setSettlementMonth,
}: DocumentSettingsPanelProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-card)',
        padding: '24px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-highlight)',
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        ...(width ? { width } : {}),
      }}
    >
      <div className="flex-col" style={{gap: '8px', flex: 1}}>
        <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>작성일자</label>
        <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} />
      </div>
      <div className="flex-col" style={{gap: '8px', flex: 1}}>
        <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>부서명</label>
        <input type="text" placeholder="예: 개발팀" value={department} onChange={e => setDepartment(e.target.value)} />
      </div>
      <div className="flex-col" style={{gap: '8px', flex: 1}}>
        <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>제출자 (담당)</label>
        <input type="text" placeholder="예: 홍길동 대리" value={manager} onChange={e => setManager(e.target.value)} />
      </div>
      {showSettlementMonth && setSettlementMonth ? (
        <div className="flex-col" style={{gap: '8px', flex: 1}}>
          <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>식대 정산월</label>
          <input type="month" value={settlementMonth || ''} onChange={e => setSettlementMonth(e.target.value)} />
        </div>
      ) : (
        <div className="flex-col" style={{gap: '8px', flex: 1}}>
          <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>1페이지당 개수</label>
          <input type="number" value={itemsPerPage} onChange={e => setItemsPerPage(parseInt(e.target.value) || 17)} min={1} max={60} />
        </div>
      )}
      {!showSettlementMonth && (
        <div className="flex-col" style={{gap: '8px', flex: 1}}>
          <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>내역 줄 높이(px)</label>
          <input type="number" value={rowHeight} onChange={e => setRowHeight(parseInt(e.target.value) || 33)} min={10} max={100} />
        </div>
      )}
    </div>
  );
}

interface QuickAddBarProps {
  quickAdd: { date: string; store: string; amount: string; note: string };
  setQuickAdd: (v: { date: string; store: string; amount: string; note: string }) => void;
  onAdd: () => void;
  labelStore: string;
  labelNote: string;
}
function QuickAddBar({ quickAdd, setQuickAdd, onAdd, labelStore, labelNote }: QuickAddBarProps) {
  const inputStyle: React.CSSProperties = { fontSize: '13px', padding: '6px 10px' };
  return (
    <div className="preview-container-settings" style={{
      width: '850px', display: 'flex', gap: '8px', alignItems: 'flex-end',
      marginTop: '-8px', marginBottom: '16px', padding: '14px 16px',
      background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
    }}>
      <div className="flex-col" style={{ gap: '4px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>날짜</label>
        <input type="date" value={quickAdd.date} onChange={e => setQuickAdd({ ...quickAdd, date: e.target.value })} style={inputStyle} />
      </div>
      <div className="flex-col" style={{ gap: '4px', flex: 2 }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{labelStore}</label>
        <input type="text" value={quickAdd.store} onChange={e => setQuickAdd({ ...quickAdd, store: e.target.value })} style={inputStyle} />
      </div>
      <div className="flex-col" style={{ gap: '4px', flex: 1 }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>금액(원)</label>
        <input type="number" value={quickAdd.amount} onChange={e => setQuickAdd({ ...quickAdd, amount: e.target.value })} style={inputStyle} />
      </div>
      <div className="flex-col" style={{ gap: '4px', flex: 2 }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{labelNote}</label>
        <input type="text" value={quickAdd.note} onChange={e => setQuickAdd({ ...quickAdd, note: e.target.value })} style={inputStyle}
          onKeyDown={e => { if (e.key === 'Enter') onAdd(); }} />
      </div>
      <button className="btn-primary" onClick={onAdd} style={{ height: '34px', padding: '0 16px' }}>+ 추가</button>
    </div>
  );
}

function App() {
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>(() =>
    (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp'
  );
  const storagePrefix = `${workflowMode}_`;
  const k = (name: string) => `${storagePrefix}expense_workspace_${name}`;

  const [activeTab, setActiveTab] = useState<'dashboard' | 'preview' | 'evidence'>('dashboard');

  // Storage initialization (모드별 네임스페이스)
  const [receipts, setReceipts] = useState<Receipt[]>(() => {
    try {
      const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
      const saved = localStorage.getItem(`${mode}_expense_workspace_receipts`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [isImgHovered, setIsImgHovered] = useState(false);
  
  // OCR & API State
  const [apiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '');
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
  // 점심식대 전용: 정산월 (YYYY-MM). 작성일자와 독립적으로 설정 가능.
  const [settlementMonth, setSettlementMonth] = useState(() => {
    const mode = (localStorage.getItem('workflow_mode') as WorkflowMode) || 'corp';
    const saved = localStorage.getItem(`${mode}_expense_workspace_settlementMonth`);
    if (saved) return saved;
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const quotaAlertShownRef = useRef(false);
  const prevImageCountRef = useRef(0);
  // 저장된 상태가 현재 workflowMode의 데이터임을 추적 (모드 전환 중 오염 방지)
  const committedModeRef = useRef<WorkflowMode>(workflowMode);

  useEffect(() => {
    // 모드 전환 직후, 아직 상태가 새 모드의 데이터로 재로드되지 않았으면 저장 스킵
    if (committedModeRef.current !== workflowMode) return;

    const currentImageCount = receipts.filter(r => r.imageUrl).length;
    const imagesIncreased = currentImageCount > prevImageCountRef.current;
    prevImageCountRef.current = currentImageCount;

    try {
      localStorage.setItem(k('receipts'), JSON.stringify(receipts));
    } catch {
      console.warn('localStorage quota exceeded, saving text-only receipts...');
      try {
        const textOnlyReceipts = receipts.map(r => ({ ...r, imageUrl: undefined }));
        localStorage.setItem(k('receipts'), JSON.stringify(textOnlyReceipts));
        // 사진이 새로 추가되는 순간(업로드 시)에만, 그리고 세션당 1회만 경고 표시
        if (imagesIncreased && !quotaAlertShownRef.current) {
          quotaAlertShownRef.current = true;
          alert('⚠️ 첨부된 사진 용량이 너무 커서 브라우저 임시저장 용량을 초과했습니다.\n현재 화면에선 사진이 보이지만, 새로고침 시 사진은 날아갈 수 있습니다 (데이터는 보존됨).');
        }
      } catch (err) {
        console.error('Failed to save data to localStorage', err);
      }
    }

    localStorage.setItem(k('docDate'), docDate);
    localStorage.setItem(k('department'), department);
    localStorage.setItem(k('manager'), manager);
    localStorage.setItem(k('itemsPerPage'), itemsPerPage.toString());
    localStorage.setItem(k('rowHeight'), rowHeight.toString());
    localStorage.setItem(k('settlementMonth'), settlementMonth);
  }, [receipts, docDate, department, manager, itemsPerPage, rowHeight, settlementMonth]);

  // 워크플로우 모드 전환: 해당 네임스페이스에서 상태 재로드
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
      const loaded = saved ? JSON.parse(saved) : [];
      setReceipts(loaded);
      prevImageCountRef.current = loaded.filter((r: Receipt) => r.imageUrl).length;
    } catch {
      setReceipts([]);
      prevImageCountRef.current = 0;
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
    quotaAlertShownRef.current = false;
    // 상태 재로드 완료: 이제부터 autosave 활성화
    committedModeRef.current = workflowMode;
  }, [workflowMode]);



  // Image resizing to prevent localStorage quota limit
  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => {
          // If the file is not a valid browser-renderable image (e.g. PDF), fallback to original data url
          resolve(e.target?.result as string);
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('File access failed'));
      reader.readAsDataURL(file);
    });
  };

  // Convert File to Base64
  const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          resolve((reader.result as string).split(',')[1]);
        } else {
          reject(new Error('File reading resulted in null'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading generative file'));
      reader.readAsDataURL(file);
    });
    return {
      inlineData: {
        data: await base64EncodedDataPromise,
        mimeType: file.type,
      },
    };
  };

  // Handle Receipt Image Upload & Gemini Parsing
  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (!apiKey) {
      alert('.env 파일에 VITE_GEMINI_API_KEY 설정이 없습니다. 입력 후 터미널을 다시 껐다 켜주세요.');
      e.target.value = '';
      return;
    }

    try {
      setIsExtracting(true);
      const genAI = new GoogleGenerativeAI(apiKey.trim());
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const newReceipts: Receipt[] = [];
      let successCount = 0;
      let failCount = 0;

      let lastError: unknown = null;

      for (let i = 0; i < files.length; i++) {
        try {
          const file = files[i];
          const imagePart = await fileToGenerativePart(file);
          
          const prompt = `
        당신은 영수증 데이터 추출 전문가입니다.
        이 영수증 이미지에서 데이터를 추출하여 JSON 형식으로만 완벽하게 응답하세요.

        [사용처(store) 추출 특별 규칙]
        "성명", "대표자" 옆의 한국인 이름은 식당/상호명이 아닙니다. 간판에 적힐법한 가장 큰 식당/상호명을 추출하세요.

        [결제 정보 추출 가이드]
        카드 영수증(매출전표)일 경우 나오는 카드명, 승인번호 등도 상세히 추출하세요. 
        모르는 값은 빈 문자열("")로 두세요.

        반드시 아래 형식의 순수 JSON 문자열만 출력하세요.

        {
          "date": "YYYY-MM-DD",
          "time": "HH:mm:ss",
          "store": "진짜 상호명",
          "amount": 0,
          "category": "식비",
          "type": "expense",
          "cardName": "KB국민카드 등",
          "cardNumber": "4703-****-****-1234 등",
          "approvalNum": "30066628 등 승인번호",
          "installment": "일시불 등",
          "merchantNum": "12345678 등 가맹점 번호"
        }
      `;

          const result = await model.generateContent([prompt, imagePart]);
          const responseText = result.response.text().trim();
          
          let cleanJson = responseText;
          const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            cleanJson = jsonMatch[0];
          }

          const parsedData = JSON.parse(cleanJson);
          
          const base64Image = await resizeImage(file);
          
          newReceipts.push({
            id: crypto.randomUUID(),
            date: parsedData.date || new Date().toISOString().split('T')[0],
            time: parsedData.time || '',
            store: parsedData.store || '알 수 없는 가게',
            amount: Number(parsedData.amount) || 0,
            category: parsedData.category || '기타',
            type: parsedData.type || 'expense',
            cardName: parsedData.cardName || '',
            cardNumber: parsedData.cardNumber || '',
            approvalNum: parsedData.approvalNum || '',
            installment: parsedData.installment || '일반승인',
            merchantNum: parsedData.merchantNum || '',
            imageUrl: base64Image
          });
          successCount++;
        } catch(err: unknown) {
          console.error(`File ${i} OCR Error:`, err);
          lastError = err;
          failCount++;
        }
      }

      if (newReceipts.length > 0) {
        setReceipts(prev => [...newReceipts, ...prev]);
      }
      
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
      e.target.value = ''; // Reset input
    }
  };

  // Export to Excel (사용자가 올바른 지출결의서 템플릿 사용)
  const clearData = () => {
    if(confirm('모든 데이터를 삭제하시겠습니까?')) {
      setReceipts([]);
    }
  };

  // 빠른 추가 폼 (문서 미리보기용)
  const [quickAdd, setQuickAdd] = useState({ date: '', store: '', amount: '', note: '' });
  const addQuickReceipt = () => {
    if (!quickAdd.date) { alert('날짜를 입력하세요.'); return; }
    if (!quickAdd.store.trim()) { alert('사용처(식당명)를 입력하세요.'); return; }
    const amt = parseInt((quickAdd.amount || '0').replace(/,/g, ''), 10) || 0;
    const newReceipt: Receipt = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      date: quickAdd.date,
      store: quickAdd.store.trim(),
      amount: amt,
      category: quickAdd.note.trim(),
      type: 'expense',
    };
    setReceipts(prev => [...prev, newReceipt]);
    setQuickAdd({ date: quickAdd.date, store: '', amount: '', note: '' });
  };

  const deleteReceipt = (id: string) => {
    if(confirm('이 항목을 삭제하시겠습니까?')) {
      setReceipts(prev => prev.filter(r => r.id !== id));
    }
  };

  const updateReceipt = (id: string, field: keyof Receipt, value: string | number) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const saveWorkspace = async () => {
    const data = { receipts, docDate, department, manager, itemsPerPage, rowHeight, settlementMonth };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const periodTag = workflowMode === 'lunch' ? (settlementMonth || docDate) : docDate;
    const suggestedName = `${WORKFLOW_LABELS[workflowMode]}_작업상태_${periodTag}.exp`;

    // 최신 브라우저(Chrome/Edge): 저장 위치 선택 다이얼로그
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.showSaveFilePicker === 'function') {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName,
          types: [{ description: '영수증 작업파일 (.exp)', accept: { 'application/json': ['.exp', '.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: unknown) {
        // 사용자가 취소한 경우 조용히 종료
        if (err instanceof Error && err.name === 'AbortError') return;
        console.warn('showSaveFilePicker 실패, 기본 다운로드로 대체:', err);
      }
    }

    // 구형 브라우저 폴백: 기본 다운로드 폴더로 저장
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadWorkspace = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.receipts) setReceipts(data.receipts);
        if (data.docDate) setDocDate(data.docDate);
        if (data.department) setDepartment(data.department);
        if (data.manager) setManager(data.manager);
        if (data.itemsPerPage) setItemsPerPage(data.itemsPerPage);
        if (data.rowHeight) setRowHeight(data.rowHeight);
        if (data.settlementMonth) setSettlementMonth(data.settlementMonth);
      } catch {
        alert("유효하지 않은 파일입니다.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderDashboard = () => (
    <div className="flex-col" style={{ gap: '24px' }}>
      
      {/* Document Settings Panel */}
      <DocumentSettingsPanel
        docDate={docDate} setDocDate={setDocDate}
        department={department} setDepartment={setDepartment}
        manager={manager} setManager={setManager}
        itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage}
        rowHeight={rowHeight} setRowHeight={setRowHeight}
        showSettlementMonth={workflowMode === 'lunch'}
        settlementMonth={settlementMonth} setSettlementMonth={setSettlementMonth}
      />

      {/* Receipts Table Area */}
      <div className="glass-panel">
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <h3 className="flex-row">
            분석된 영수증 내역 <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>({receipts.length}건)</span>
          </h3>
          <div className="flex-row" style={{ gap: '12px' }}>
            <label className="btn-secondary" style={{ cursor: 'pointer', background: '#3b82f6', color: 'white', borderColor: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
              <Upload size={16} /> 백업파일 불러오기
              <input type="file" accept=".exp,.json" onChange={loadWorkspace} style={{ display: 'none' }} />
            </label>
            <button className="btn-secondary" onClick={saveWorkspace} style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>
              <Save size={16} /> 현재 상황 백업저장
            </button>
            <button className="btn-secondary" onClick={clearData} style={{ color: '#ef4444' }}>
              <Trash2 size={16} /> 원본 데이터 초기화
            </button>
          </div>
        </div>
        
        {receipts.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>사용일자</th>
                  <th>사용처</th>
                  <th>사용내역</th>
                  <th style={{ textAlign: 'right' }}>법인카드</th>
                  <th style={{ textAlign: 'right' }}>현금</th>
                  <th style={{ textAlign: 'center', width: '50px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {[...receipts].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: '4px 8px', width: '15%' }}>
                      <input 
                        type="text" 
                        value={r.date} 
                        onChange={(e) => updateReceipt(r.id, 'date', e.target.value)}
                        className="editable-cell"
                        placeholder="예: 04.05"
                        style={{ textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input 
                        type="text" 
                        value={r.store} 
                        onChange={(e) => updateReceipt(r.id, 'store', e.target.value)}
                        className="editable-cell"
                        placeholder="사용처 입력"
                        style={{ fontWeight: 500 }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                       <input 
                        type="text" 
                        value={r.category} 
                        onChange={(e) => updateReceipt(r.id, 'category', e.target.value)}
                        className="editable-cell"
                        placeholder="사용내역 입력"
                      />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                      {r.type === 'expense' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <span style={{marginRight: '2px'}}>₩</span>
                          <input 
                            type="text" 
                            value={r.amount > 0 ? r.amount.toLocaleString() : ''} 
                            onChange={(e) => updateReceipt(r.id, 'amount', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                            className="editable-cell"
                            style={{ textAlign: 'right', fontWeight: 600, width: '100px' }}
                          />
                        </div>
                      ) : ''}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                      {r.type !== 'expense' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <span style={{marginRight: '2px'}}>₩</span>
                          <input 
                            type="text" 
                            value={r.amount > 0 ? r.amount.toLocaleString() : ''} 
                            onChange={(e) => updateReceipt(r.id, 'amount', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                            className="editable-cell"
                            style={{ textAlign: 'right', fontWeight: 600, width: '100px' }}
                          />
                        </div>
                      ) : ''}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => deleteReceipt(r.id)} 
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                        title="항목 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
           <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              아래 점선 영역에 영수증 사진 또는 엑셀 파일을 업로드하여 데이터를 추가해주세요.
           </div>
        )}
      </div>
    </div>
  );

  const renderPreview = () => {
    const expenses = receipts.filter(r => r.type === 'expense')
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const totalAmount = expenses.reduce((sum, r) => sum + r.amount, 0);
    
    // 한국어 표기법 변환기 (십/백/천/만 앞의 "일" 생략)
    const numberToKoreanAmt = (num: number) => {
      if (num === 0) return "";
      const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
      const smallUnits = ["", "십", "백", "천"];
      const bigUnits = ["", "만", "억", "조", "경"];

      let result = "";
      let groupIdx = 0;
      let n = num;
      while (n > 0) {
        const group = n % 10000;
        if (group > 0) {
          let groupStr = "";
          let g = group;
          let pos = 0;
          while (g > 0) {
            const d = g % 10;
            if (d > 0) {
              // 십/백/천 앞의 "일"은 생략 (예: 일천 → 천)
              const digitStr = (d === 1 && pos > 0) ? "" : digits[d];
              groupStr = digitStr + smallUnits[pos] + groupStr;
            }
            g = Math.floor(g / 10);
            pos++;
          }
          result = groupStr + bigUnits[groupIdx] + result;
        }
        n = Math.floor(n / 10000);
        groupIdx++;
      }
      return `일금 ${result}원정`;
    };

    // 페이지 분할 없이 하나의 문서로 렌더링. itemsPerPage는 "최소 표시 행 수"로만 사용 (빈 칸 채우기용).
    const MIN_ROWS = Math.max(itemsPerPage, expenses.length);
    const pages = [expenses];
    const ITEMS_PER_PAGE = MIN_ROWS;

    const docYear = docDate.split('-')[0] || '';
    const docMonth = docDate.split('-')[1] || '';
    const docDay = docDate.split('-')[2] || '';

    return (
      <div className="preview-container flex-col" style={{ alignItems: 'center' }}>
        <div className="flex-row" style={{ width: '850px', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button className="btn-primary" onClick={() => window.print()}>
            <FileText size={18} />
            현재 화면 PDF/A4 인쇄
          </button>
        </div>

        {/* Document Settings Panel */}
        <DocumentSettingsPanel
          className="preview-container-settings"
          width="850px"
          docDate={docDate} setDocDate={setDocDate}
          department={department} setDepartment={setDepartment}
          manager={manager} setManager={setManager}
          itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage}
          rowHeight={rowHeight} setRowHeight={setRowHeight}
        />

        <QuickAddBar quickAdd={quickAdd} setQuickAdd={setQuickAdd} onAdd={addQuickReceipt} labelStore="사 용 처" labelNote="사 용 내 역" />

        <div className="preview-paper">
          <div id="print-area">
            {pages.map((pageExpenses, pageIndex) => {
              const emptyRows = Array.from({ length: Math.max(0, ITEMS_PER_PAGE - pageExpenses.length) });
              return (
                <div key={pageIndex} className="page-break" style={{ 
                  pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto', 
                  marginBottom: pageIndex < pages.length - 1 ? '60px' : '0' 
                }}>
                  <div style={{ 
                    textAlign: 'center', 
                    fontSize: '24px', 
                    fontWeight: 'bold', 
                    height: '84px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    letterSpacing: '8px' 
                  }}>
                    지 출 결 의 서
                  </div>
                  <table className="excel-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '4%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                    </colgroup>
                    <tbody>
                      <tr className="approval-box border-thick-top" style={{height: '32px'}}>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>작 성 일 자</td>
                        <td style={{textAlign: 'left', paddingLeft: '24px'}}>{docDate || '2026-04-04'}</td>
                        <td rowSpan={3} style={{background: '#d9d9d9', writingMode: 'vertical-rl', letterSpacing: '10px', fontWeight: 'bold'}}>결 재</td>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>담 당</td>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>차장/부장</td>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>전무/부사장</td>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>총 무</td>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>대표이사</td>
                      </tr>
                      <tr className="approval-sign" style={{height: '40px'}}>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>부 서</td>
                        <td style={{textAlign: 'left', paddingLeft: '24px'}}>{department}</td>
                        <td rowSpan={2}></td>
                        <td rowSpan={2}></td>
                        <td rowSpan={2}></td>
                        <td rowSpan={2}></td>
                        <td rowSpan={2}></td>
                      </tr>
                      <tr className="approval-box" style={{height: '40px'}}>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>담 당</td>
                        <td style={{textAlign: 'left', paddingLeft: '24px'}}>{manager}</td>
                      </tr>
                      <tr className="approval-box border-thick-top" style={{height: '53px'}}>
                        <td style={{background: '#d9d9d9', fontWeight: 'bold'}}>합 계</td>
                        <td colSpan={5} className="center" style={{fontWeight: '900', fontSize: '15px'}}>{numberToKoreanAmt(totalAmount)}</td>
                        <td colSpan={2} className="right" style={{fontSize: '15px', fontWeight: 'bold'}}>₩{totalAmount.toLocaleString()}</td>
                      </tr>

                      <tr style={{height: '24px', border: 'none'}}><td colSpan={8} style={{border: 'none'}}></td></tr>
                      
                      <tr className="border-thick-bottom" style={{background: '#d9d9d9', fontWeight: 'bold', height: '36px'}}>
                        <td>사 용 일 자</td>
                        <td>사 용 처</td>
                        <td colSpan={4}>사 용 내 역</td>
                        <td>법 인 카 드</td>
                        <td>현 금</td>
                      </tr>
                      {pageExpenses.map((r, i) => (
                        <tr key={i} style={{height: `${rowHeight}px`}}>
                          <td style={{textAlign: 'center'}}>{r.date}</td>
                          <td style={{textAlign: 'left', paddingLeft: '12px'}}>{r.store}</td>
                          <td colSpan={4} style={{textAlign: 'left', paddingLeft: '12px'}}>{r.category}</td>
                          <td style={{textAlign: 'right', paddingRight: '12px'}}>{r.amount.toLocaleString()}</td>
                          <td></td>
                        </tr>
                      ))}
                      {emptyRows.map((_, i) => (
                        <tr key={'empty'+i} style={{height: `${rowHeight}px`}}>
                          <td></td><td></td><td colSpan={4}></td><td></td><td></td>
                        </tr>
                      ))}
                      <tr className="border-thick-top" style={{background: '#fdfdfd', height: '33px', fontWeight: 'bold'}}>
                        <td>소 계</td>
                        <td></td>
                        <td colSpan={4}></td>
                        <td style={{textAlign: 'right', paddingRight: '12px'}}>{totalAmount.toLocaleString()}</td>
                        <td style={{textAlign: 'right', paddingRight: '12px'}}>0</td>
                      </tr>
                      <tr style={{background: '#d9d9d9', height: '33px', fontWeight: 'bold'}}>
                        <td className="border-thick-top">합 계</td>
                        <td className="border-thick-top"></td>
                        <td colSpan={4} className="border-thick-top"></td>
                        <td className="border-thick-top" style={{textAlign: 'right', paddingRight: '12px', fontSize: '15px'}}>{totalAmount.toLocaleString()}</td>
                        <td className="border-thick-top"></td>
                      </tr>
                      <tr style={{ height: '125px' }}>
                        <td colSpan={8} style={{ border: 'none', borderTop: '1px solid black', verticalAlign: 'middle', padding: '0 20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                            <div style={{fontSize: '18px'}}>위 금액을 청구 하오니 지급 바랍니다.</div>
                            <div style={{fontSize: '15px', letterSpacing: '2px'}}>{docYear} 년 {docMonth} 월 {docDay} 일</div>
                            <div style={{fontSize: '16px', width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '80px', marginTop: '-10px'}}>
                              {manager} <span style={{marginLeft: '20px'}}>(인)</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // 점심식대 지출결의서 미리보기 (A4 인쇄용)
  const renderLunchPreview = () => {
    const expenses = receipts.filter(r => r.type === 'expense');

    // 정산월 기준으로 표 생성 (작성일자와 독립)
    const [smYearStr, smMonthStr] = (settlementMonth || '').split('-');
    const year = parseInt(smYearStr || (docDate.split('-')[0] || '2024'), 10);
    const month = parseInt(smMonthStr || (docDate.split('-')[1] || '1'), 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    // 지정 연/월과 일치하는 영수증만 집계
    type DayAgg = { stores: string[]; amount: number; notes: string[] };
    const byDay = new Map<number, DayAgg>();
    expenses.forEach(r => {
      const parts = (r.date || '').split('-');
      const ry = parseInt(parts[0] || '0', 10);
      const rm = parseInt(parts[1] || '0', 10);
      const rd = parseInt(parts[2] || '0', 10);
      if (ry !== year || rm !== month) return;
      if (rd < 1 || rd > daysInMonth) return;
      const agg = byDay.get(rd) || { stores: [], amount: 0, notes: [] };
      if (r.store) agg.stores.push(r.store);
      agg.amount += r.amount || 0;
      if (r.category && r.category.trim() !== '식비') agg.notes.push(r.category);
      byDay.set(rd, agg);
    });

    const totalAmount = Array.from(byDay.values()).reduce((s, a) => s + a.amount, 0);
    const formatKoreanDateWithDow = (isoDate: string) => {
      const parts = (isoDate || '').split('-');
      const y = parseInt(parts[0] || '0', 10);
      const m = parseInt(parts[1] || '0', 10);
      const d = parseInt(parts[2] || '0', 10);
      if (!y || !m || !d) return isoDate;
      const dowName = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
      return `${y}년 ${m}월 ${d}일 ${dowName}요일`;
    };

    return (
      <div className="preview-container flex-col" style={{ alignItems: 'center' }}>
        <div className="flex-row" style={{ width: '850px', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button className="btn-primary" onClick={() => window.print()}>
            <FileText size={18} />
            현재 화면 PDF/A4 인쇄
          </button>
        </div>

        {/* Document Settings Panel */}
        <DocumentSettingsPanel
          className="preview-container-settings"
          width="850px"
          docDate={docDate} setDocDate={setDocDate}
          department={department} setDepartment={setDepartment}
          manager={manager} setManager={setManager}
          itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage}
          rowHeight={rowHeight} setRowHeight={setRowHeight}
          showSettlementMonth={true}
          settlementMonth={settlementMonth} setSettlementMonth={setSettlementMonth}
        />

        <QuickAddBar quickAdd={quickAdd} setQuickAdd={setQuickAdd} onAdd={addQuickReceipt} labelStore="식 당 명" labelNote="비 고" />

        <div className="preview-paper">
          <div id="print-area">
            <div style={{ textAlign: 'center', fontSize: '28px', fontWeight: 'bold', letterSpacing: '6px', marginBottom: '30px', color: '#000' }}>
              {year}년 {month}월 식대 지출결의서
            </div>

            {/* 작성일자/부서/성명 + 결재란 (단일 테이블) — 원본 PDF 실측 비율 */}
            <table style={{ borderCollapse: 'collapse', fontSize: '13px', color: '#000', width: '100%', marginBottom: '24px', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '19.01%' }} />
                <col style={{ width: '35.17%' }} />
                <col style={{ width: '11.22%' }} />
                <col style={{ width: '11.41%' }} />
                <col style={{ width: '11.03%' }} />
                <col style={{ width: '12.16%' }} />
              </colgroup>
              <tbody>
                <tr style={{ height: '38px' }}>
                  <td style={{ border: '1px solid #000', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', letterSpacing: '4px' }}>작 성 일 자</td>
                  <td style={{ border: '1px solid #000', padding: '0 14px' }}>{formatKoreanDateWithDow(docDate)}</td>
                  <td rowSpan={3} style={{ border: '1px solid #000', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', writingMode: 'vertical-rl', letterSpacing: '6px' }}>결 재</td>
                  <td style={{ border: '1px solid #000', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center' }}>담 당</td>
                  <td style={{ border: '1px solid #000', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center' }}>총 무</td>
                  <td style={{ border: '1px solid #000', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center' }}>대표이사</td>
                </tr>
                <tr style={{ height: '38px' }}>
                  <td style={{ border: '1px solid #000', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', letterSpacing: '4px' }}>부 서</td>
                  <td style={{ border: '1px solid #000', padding: '0 14px' }}>{department}</td>
                  <td rowSpan={2} style={{ border: '1px solid #000' }}></td>
                  <td rowSpan={2} style={{ border: '1px solid #000' }}></td>
                  <td rowSpan={2} style={{ border: '1px solid #000' }}></td>
                </tr>
                <tr style={{ height: '38px' }}>
                  <td style={{ border: '1px solid #000', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', letterSpacing: '4px' }}>성 명</td>
                  <td style={{ border: '1px solid #000', padding: '0 14px' }}>{manager}</td>
                </tr>
              </tbody>
            </table>

            {/* 본문 테이블 — 원본 PDF 실측 비율 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#000', border: '2px solid #000', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '19.20%' }} />
                <col style={{ width: '34.98%' }} />
                <col style={{ width: '22.62%' }} />
                <col style={{ width: '23.20%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#f0f0f0', fontWeight: 'bold' }}>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>날 짜</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>식 당 명</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>금 액</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>비 고</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dow = new Date(year, month - 1, day).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const isHoliday = isKoreanHoliday(year, month, day);
                  const agg = byDay.get(day);
                  const dateColor = (isWeekend || isHoliday) ? '#d32f2f' : '#000';
                  // 평일(주말·공휴일 아님)에 영수증 내역이 없으면 "도시락" 표기
                  const isRegularWeekday = !isWeekend && !isHoliday;
                  const storeText = agg ? agg.stores.join(', ') : (isRegularWeekday ? '도시락' : '');
                  return (
                    <tr key={day} style={{ height: '22px' }}>
                      <td style={{ border: '1px solid #000', textAlign: 'center', color: dateColor, padding: '2px 6px' }}>
                        {year}년 {month}월 {day}일
                      </td>
                      <td style={{ border: '1px solid #000', textAlign: 'center', padding: '2px 6px' }}>{storeText}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 8px' }}>{agg && agg.amount > 0 ? agg.amount.toLocaleString() : ''}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'center', padding: '2px 6px' }}>{agg ? agg.notes.join(', ') : ''}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: '#f0f0f0', fontWeight: 'bold', height: '32px' }}>
                  <td colSpan={2} style={{ border: '1px solid #000', textAlign: 'center', fontSize: '15px' }}>합 계</td>
                  <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 8px', fontSize: '15px' }}>{totalAmount.toLocaleString()}</td>
                  <td style={{ border: '1px solid #000' }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderEvidence = () => {
    // 상호별로 카드종류/카드번호/가맹점번호가 채워진 영수증을 우선 찾아 lookup 맵 구성
    const storeInfoMap = new Map<string, { cardName?: string; cardNumber?: string; merchantNum?: string }>();
    receipts.filter(r => r.type === 'expense').forEach(r => {
      const key = (r.store || '').trim();
      if (!key) return;
      const existing = storeInfoMap.get(key) || {};
      if (!existing.cardName && r.cardName) existing.cardName = r.cardName;
      if (!existing.cardNumber && r.cardNumber) existing.cardNumber = r.cardNumber;
      if (!existing.merchantNum && r.merchantNum) existing.merchantNum = r.merchantNum;
      storeInfoMap.set(key, existing);
    });

    const expenses = receipts
      .filter(r => r.type === 'expense')
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''))
      .map(r => {
        const fallback = storeInfoMap.get((r.store || '').trim()) || {};
        return {
          ...r,
          cardName: r.cardName || fallback.cardName || '',
          cardNumber: r.cardNumber || fallback.cardNumber || '',
          merchantNum: r.merchantNum || fallback.merchantNum || '',
        };
      });

    return (
      <div className="preview-container flex-col" style={{ alignItems: 'center' }}>
        <div className="flex-row" style={{ width: '850px', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button className="btn-primary" onClick={() => window.print()}>
            <ImageIcon size={18} />
            현재 화면 PDF/A4 인쇄
          </button>
        </div>

        <div className="preview-paper evidence-section">
          <h2 style={{ textAlign: 'center', fontSize: '30px', fontWeight: 'bold', borderBottom: '3px solid black', paddingBottom: '20px', marginBottom: '40px', letterSpacing: '10px' }}>
            영 수 증 증 빙 철
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 175px)', gridAutoRows: '200px', gap: '16px', justifyContent: 'start' }}>
            {expenses.length > 0 ? expenses.map((r, idx) => (
              <div key={'evidence-'+r.id+'-'+idx} style={{ padding: '0', breakInside: 'avoid', pageBreakInside: 'avoid', display: 'flex', flexDirection: 'column', width: '175px', height: '200px' }}>

                {/* 텍스트 내용 (독립 박스) */}
                <div style={{ border: '1px solid #000', padding: '12px', backgroundColor: '#fff', color: '#000', fontFamily: 'sans-serif', fontSize: '11px', lineHeight: '1.6', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid #000', paddingBottom: '6px', marginBottom: '8px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.store}
                  </div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{fontWeight:'bold', color:'#000'}}>결제일 :</span> {r.date} {r.time || ''}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{fontWeight:'bold', color:'#000'}}>카드종류 :</span> {r.cardName || ''}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{fontWeight:'bold', color:'#000'}}>카드 번호 :</span> {r.cardNumber || ''}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{fontWeight:'bold', color:'#000'}}>승인번호 :</span> {r.approvalNum || ''}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{fontWeight:'bold', color:'#000'}}>가맹점 번호 :</span> {r.merchantNum || ''}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '8px', color:'#000', fontSize: '13px', textAlign: 'right' }}>
                    <span style={{fontWeight:'bold'}}>승인 금액 :</span> {r.amount.toLocaleString()} 원
                  </div>
                </div>
              </div>
            )) : (
              <div style={{ gridColumn: 'span 4', textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
                등록된 영수증 지출 내역이 없습니다.<br/><br/>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '24px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ background: 'var(--accent-primary)', padding: '8px', borderRadius: '12px', color: '#0f1115' }}>
            <Wallet size={24} />
          </div>
          <h2 style={{ fontSize: '20px' }}>Receipt Hub</h2>
        </div>

        {/* 워크플로우 모드 전환 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', paddingLeft: '4px' }}>증빙 유형</div>
          <button
            className="btn-secondary"
            style={{
              justifyContent: 'flex-start',
              background: workflowMode === 'corp' ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
              borderColor: workflowMode === 'corp' ? 'var(--accent-primary)' : 'transparent',
              color: workflowMode === 'corp' ? 'var(--accent-primary)' : 'var(--text-primary)',
              fontWeight: workflowMode === 'corp' ? 600 : 400,
            }}
            onClick={() => setWorkflowMode('corp')}
          >
            <CreditCard size={18} /> {WORKFLOW_LABELS.corp}
          </button>
          <button
            className="btn-secondary"
            style={{
              justifyContent: 'flex-start',
              background: workflowMode === 'lunch' ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
              borderColor: workflowMode === 'lunch' ? 'var(--accent-primary)' : 'transparent',
              color: workflowMode === 'lunch' ? 'var(--accent-primary)' : 'var(--text-primary)',
              fontWeight: workflowMode === 'lunch' ? 600 : 400,
            }}
            onClick={() => setWorkflowMode('lunch')}
          >
            <UtensilsCrossed size={18} /> {WORKFLOW_LABELS.lunch}
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <button 
            className="btn-secondary" 
            style={{ 
              justifyContent: 'flex-start', 
              background: activeTab === 'dashboard' ? 'rgba(255,255,255,0.05)' : 'transparent',
              borderColor: activeTab === 'dashboard' ? 'var(--border-highlight)' : 'transparent'
            }}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} /> SOUND SOLUTION
          </button>

          <button 
            className="btn-secondary" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'preview' ? 'rgba(255,255,255,0.05)' : 'transparent',
              borderColor: activeTab === 'preview' ? 'var(--border-highlight)' : 'transparent'
            }}
            onClick={() => setActiveTab('preview')}
          >
            <FileText size={18} /> 문서 미리보기
          </button>

          <button 
            className="btn-secondary" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'evidence' ? 'rgba(255,255,255,0.05)' : 'transparent',
              borderColor: activeTab === 'evidence' ? 'var(--border-highlight)' : 'transparent'
            }}
            onClick={() => setActiveTab('evidence')}
          >
            <ImageIcon size={18} /> 영수증 증빙철
          </button>
        </nav>

        {/* Input Areas */}
        <div className="flex-col" style={{ gap: '12px' }}>
          
          {/* AI Image Upload */}
          <div 
            style={{
              border: `2px solid ${isImgHovered ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              textAlign: 'center',
              position: 'relative',
              transition: 'all 0.3s ease',
              background: isImgHovered ? 'rgba(74, 222, 128, 0.05)' : 'var(--bg-secondary)',
              cursor: isExtracting ? 'not-allowed' : 'pointer'
            }}
            onMouseOver={() => setIsImgHovered(true)}
            onMouseOut={() => setIsImgHovered(false)}
          >
            <input 
              type="file" 
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              disabled={isExtracting}
              style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                opacity: 0, cursor: isExtracting ? 'not-allowed' : 'pointer',
                zIndex: 10
              }}
            />
            {isExtracting ? (
              <div style={{ color: 'var(--accent-primary)' }}>
                <div style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginBottom: '8px' }}>
                  <Loader2 size={32} />
                </div>
                <h4 style={{ fontSize: '14px' }}>AI 분석 중...</h4>
              </div>
            ) : (
              <>
                <ImageIcon size={32} style={{ margin: '0 auto 12px', color: isImgHovered ? 'var(--accent-primary)' : 'var(--text-secondary)' }} />
                <h4 style={{ fontSize: '14px', marginBottom: '4px', color: 'var(--text-primary)' }}>📷 영수증 사진 분석</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>클릭하여 사진 첨부 (AI 자동입력)</p>
              </>
            )}
          </div>

        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header-area">
          <h1 className="header-title">
            {activeTab === 'dashboard' && 'SOUND SOLUTION'}
            {activeTab === 'preview' && (workflowMode === 'lunch' ? '식대 지출결의서 미리보기' : '지출결의서 미리보기')}
            {activeTab === 'evidence' && '영수증 증빙철 미리보기'}
          </h1>
          
          <div className="flex-row">
            {/* API Key Input has been removed from UI for security/cleanliness. 
                Configure it via .env file (VITE_GEMINI_API_KEY) */}
          </div>
        </header>

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'preview' && (workflowMode === 'lunch' ? renderLunchPreview() : renderPreview())}
        {activeTab === 'evidence' && renderEvidence()}
      </main>
      
      {/* CSS for Spinner */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 
          from { transform: rotate(0deg); } 
          to { transform: rotate(360deg); } 
        }
      `}} />
    </div>
  );
}

export default App;
