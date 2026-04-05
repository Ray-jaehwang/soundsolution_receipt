import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  FileSpreadsheet, 
  Image as ImageIcon,
  LayoutDashboard, 
  Trash2,
  Download,
  Loader2,
  FileText,
  Wallet,
  Upload,
  Save
} from 'lucide-react';

interface Receipt {
  id: string;
  date: string;
  store: string;
  amount: number;
  category: string;
  type: 'expense' | 'income';
  imageUrl?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'preview'>('dashboard');
  
  // Storage initialization
  const [receipts, setReceipts] = useState<Receipt[]>(() => {
    try {
      const saved = localStorage.getItem('expense_workspace_receipts');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [isHovered, setIsHovered] = useState(false);
  const [templateData, setTemplateData] = useState<ArrayBuffer | null>(null);
  const [isImgHovered, setIsImgHovered] = useState(false);
  
  // OCR & API State
  const [apiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '');
  const [isExtracting, setIsExtracting] = useState(false);
  
  const [docDate, setDocDate] = useState(() => localStorage.getItem('expense_workspace_docDate') || new Date().toISOString().split('T')[0]);
  const [department, setDepartment] = useState(() => localStorage.getItem('expense_workspace_department') || '설계팀');
  const [manager, setManager] = useState(() => localStorage.getItem('expense_workspace_manager') || '임종현 실장');
  const [itemsPerPage, setItemsPerPage] = useState(() => parseInt(localStorage.getItem('expense_workspace_itemsPerPage') || '17'));
  const [rowHeight, setRowHeight] = useState(() => parseInt(localStorage.getItem('expense_workspace_rowHeight') || '33'));

  useEffect(() => {
    localStorage.setItem('expense_workspace_receipts', JSON.stringify(receipts));
    localStorage.setItem('expense_workspace_docDate', docDate);
    localStorage.setItem('expense_workspace_department', department);
    localStorage.setItem('expense_workspace_manager', manager);
    localStorage.setItem('expense_workspace_itemsPerPage', itemsPerPage.toString());
    localStorage.setItem('expense_workspace_rowHeight', rowHeight.toString());
  }, [receipts, docDate, department, manager, itemsPerPage, rowHeight]);



  // Image resizing to prevent localStorage quota limit
  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
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
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // Convert File to Base64
  const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
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
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (!apiKey) {
      alert('설정에서 Gemini API Key를 먼저 입력해주세요.');
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

      for (let i = 0; i < files.length; i++) {
        try {
          const file = files[i];
          const imagePart = await fileToGenerativePart(file);
          
          const prompt = `
        당신은 영수증 데이터 추출 전문가입니다.
        이 영수증 이미지에서 데이터를 추출하여 JSON 형식으로만 완벽하게 응답하세요.

        [사용처(store) 추출 특별 규칙 - 반드시 지킬 것!!!!!]
        영수증에는 사업장 정보와 사업주(사람) 정보가 섞여 있습니다.
        "성명:", "대표자:", "대표자명:" 옆에 있는 한국인 이름(예: 김철수, 홍길동 등 사람 이름)은 절대로 사용처가 아닙니다!
        진짜 사용처(store)는 다음과 같이 찾으세요:
        1순위) 영수증 가장 꼭대기에 가장 큰 글씨로 적힌 식당명이나 간판 이름 (예: 문래돼지불백, 스타벅스 강남점)
        2순위) "상호:", "가맹점명:", "업소명:" 옆에 적힌 상호명

        위 규칙을 바탕으로 최종 판단하여 사람 이름이 들어가지 않게 주의하세요.

        반드시 마크다운 코드 블록(\`\`\`json ... \`\`\`) 없이 아래 형식의 순수 JSON 문자열만 출력하세요.

        {
          "date": "YYYY-MM-DD",
          "store": "진짜 상호명",
          "amount": 0,
          "category": "식비",
          "type": "expense"
        }
      `;

          const result = await model.generateContent([prompt, imagePart as any]);
          const responseText = result.response.text().trim();
          
          // Clean up markdown block if present
          let cleanJson = responseText;
          if (cleanJson.startsWith('```json')) cleanJson = cleanJson.substring(7);
          if (cleanJson.startsWith('```')) cleanJson = cleanJson.substring(3);
          if (cleanJson.endsWith('```')) cleanJson = cleanJson.substring(0, cleanJson.length - 3);

          const parsedData = JSON.parse(cleanJson);
          
          const base64Image = await resizeImage(file);
          
          newReceipts.push({
            id: `rec-${Date.now()}-${i}`,
            date: parsedData.date || new Date().toISOString().split('T')[0],
            store: parsedData.store || '알 수 없는 가게',
            amount: Number(parsedData.amount) || 0,
            category: parsedData.category || '기타',
            type: parsedData.type || 'expense',
            imageUrl: base64Image
          });
          successCount++;
        } catch(err) {
          console.error(`File ${i} OCR Error:`, err);
          failCount++;
        }
      }

      if (newReceipts.length > 0) {
        setReceipts(prev => [...newReceipts, ...prev]);
      }
      
      if (failCount > 0) {
        alert(`${successCount}장 성공, ${failCount}장 처리 실패했습니다.`);
      } else {
        alert(`총 ${successCount}장의 영수증 인식이 모두 성공적으로 완료되었습니다!`);
      }
      
    } catch (error: any) {
      console.error('OCR Error:', error);
      alert(`분석 중 오류가 발생했습니다.\n\n[상세 내역]: ${error.message || error}\n\n1. API 키 복사 시 공백이 없는지 확인해주세요.\n2. 방금 발급받은 경우 1~2분 뒤 다시 시도해주세요.`);
    } finally {
      setIsExtracting(false);
      e.target.value = ''; // Reset input
    }
  };

  // Export to Excel (사용자가 올바른 지출결의서 템플릿 사용)
  const exportToExcel = async () => {
    if (receipts.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    try {
      let arrayBuffer: ArrayBuffer;
      if (templateData) {
        // 사용자가 직접 등록한 템플릿 양식이 있는 경우
        arrayBuffer = templateData;
      } else {
        // 없는 경우 기본 내장 템플릿(public) 사용
        const response = await fetch('/template_2026.xls');
        if (!response.ok) {
          throw new Error('기본 템플릿 파일을 찾을 수 없습니다. 좌측 메뉴에서 양식을 직접 업로드 해주세요.');
        }
        arrayBuffer = await response.arrayBuffer();
      }
      
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets['지출결의서'];

      if (!ws) {
        alert('양식 파일에서 "지출결의서" 시트를 찾지 못했습니다.');
        return;
      }

      XLSX.utils.sheet_add_aoa(ws, [[docDate]], { origin: { r: 1, c: 1 } });
      XLSX.utils.sheet_add_aoa(ws, [[department]], { origin: { r: 2, c: 1 } });
      XLSX.utils.sheet_add_aoa(ws, [[manager]], { origin: { r: 3, c: 1 } });

      const START_ROW = 8;
      const MAX_LEN = 13; 
      
      const expenses = receipts.filter(r => r.type === 'expense')
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, MAX_LEN);

      expenses.forEach((receipt, idx) => {
        const row = START_ROW + idx;
        XLSX.utils.sheet_add_aoa(ws, [[receipt.date]], { origin: { r: row, c: 0 } });
        XLSX.utils.sheet_add_aoa(ws, [[receipt.store]], { origin: { r: row, c: 1 } });
        XLSX.utils.sheet_add_aoa(ws, [[receipt.category]], { origin: { r: row, c: 2 } });
        XLSX.utils.sheet_add_aoa(ws, [[receipt.amount]], { origin: { r: row, c: 6 } });
      });

      const totalAmount = expenses.reduce((sum, r) => sum + r.amount, 0);
      XLSX.utils.sheet_add_aoa(ws, [[totalAmount]], { origin: { r: 21, c: 6 } }); 
      XLSX.utils.sheet_add_aoa(ws, [[totalAmount]], { origin: { r: 22, c: 6 } }); 
      XLSX.utils.sheet_add_aoa(ws, [[totalAmount]], { origin: { r: 3, c: 6 } });  
      XLSX.utils.sheet_add_aoa(ws, [[`일금 ${totalAmount.toLocaleString()} 원정`]], { origin: { r: 3, c: 1 } });  

      const docYear = docDate.split('-')[0] || '';
      const docMonth = docDate.split('-')[1] || '';
      const docDay = docDate.split('-')[2] || '';
      const footerText = `위 금액을 청구 하오니 지급 바랍니다.\n\n                                              ${docYear} 년       ${docMonth} 월       ${docDay} 일\n\n                                                                                ${manager}               (인)`;
      XLSX.utils.sheet_add_aoa(ws, [[footerText]], { origin: { r: 24, c: 0 } });

      XLSX.writeFile(wb, `내_지출결의서정산_${docDate}.xlsx`);

    } catch (e: any) {
      console.error(e);
      alert(`엑셀 내보내기 실패: ${e.message}`);
    }
  };

  // Upload Template
  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as ArrayBuffer;
      setTemplateData(data);
      alert('기본 양식(템플릿)이 등록되었습니다! 이제 엑셀로 내보낼 때 이 양식이 사용됩니다.');
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Reset input
  };

  const clearData = () => {
    if(confirm('모든 데이터를 삭제하시겠습니까?')) {
      setReceipts([]);
    }
  };

  const deleteReceipt = (id: string) => {
    if(confirm('이 항목을 삭제하시겠습니까?')) {
      setReceipts(prev => prev.filter(r => r.id !== id));
    }
  };

  const updateReceipt = (id: string, field: keyof Receipt, value: string | number) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const saveWorkspace = () => {
    const data = { receipts, docDate, department, manager, itemsPerPage, rowHeight };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `지출결의서_작업상태_${docDate}.exp`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadWorkspace = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      } catch (err) {
        alert("유효하지 않은 파일입니다.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderDashboard = () => (
    <div className="flex-col" style={{ gap: '24px' }}>
      
      {/* Document Settings Panel (Moved from Preview) */}
      <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-highlight)', display: 'flex', gap: '20px', alignItems: 'center' }}>
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
        <div className="flex-col" style={{gap: '8px', flex: 1}}>
          <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>1페이지당 개수</label>
          <input type="number" value={itemsPerPage} onChange={e => setItemsPerPage(parseInt(e.target.value) || 17)} min={1} max={60} />
        </div>
        <div className="flex-col" style={{gap: '8px', flex: 1}}>
          <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>내역 줄 높이(px)</label>
          <input type="number" value={rowHeight} onChange={e => setRowHeight(parseInt(e.target.value) || 33)} min={10} max={100} />
        </div>
      </div>

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
    
    // 한국어 표기법 변환기
    const numberToKoreanAmt = (num: number) => {
      if (num === 0) return "";
      const numStr = String(num);
      const hanA = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
      const danA = ["", "십", "백", "천"];
      const danG = ["", "만", "억", "조"];
      let result = "";
      for (let i = 0; i < numStr.length; i++) {
        const str = numStr.charAt(i);
        if (str !== "0") {
          result += hanA[parseInt(str)] + danA[(numStr.length - 1 - i) % 4];
        }
        if ((numStr.length - 1 - i) % 4 === 0 && parseInt(numStr.substring(Math.max(0, i - 3), i + 1)) > 0) {
          result += danG[(numStr.length - 1 - i) / 4];
        }
      }
      return result ? `일금 ${result}원정` : "";
    };

    const ITEMS_PER_PAGE = itemsPerPage;
    const pageCount = Math.max(1, Math.ceil(expenses.length / ITEMS_PER_PAGE));
    const pages = Array.from({ length: pageCount }).map((_, pageIndex) => {
      return expenses.slice(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE);
    });

    const docYear = docDate.split('-')[0] || '';
    const docMonth = docDate.split('-')[1] || '';
    const docDay = docDate.split('-')[2] || '';

    return (
      <div className="preview-container flex-col" style={{ alignItems: 'center' }}>
        <div className="flex-row" style={{ width: '850px', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button className="btn-secondary" onClick={exportToExcel} style={{background: '#1d6f42', color: 'white', borderColor: '#1d6f42', marginRight: '12px'}}>
            <Download size={18} />
            등록된 양식으로 엑셀 자동 작성 (.xlsx)
          </button>
          <button className="btn-primary" onClick={() => window.print()}>
            <FileText size={18} />
            현재 화면 PDF/A4 인쇄
          </button>
        </div>

        {/* Document Settings Panel */}
        <div className="preview-container-settings" style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-highlight)', marginBottom: '8px', display: 'flex', gap: '20px', alignItems: 'center', width: '850px' }}>
          <div className="flex-col" style={{gap: '8px', flex: 1}}>
            <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>작성일자</label>
            <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} />
          </div>
          <div className="flex-col" style={{gap: '8px', flex: 1}}>
            <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>부서명</label>
            <input type="text" placeholder="설계팀" value={department} onChange={e => setDepartment(e.target.value)} />
          </div>
          <div className="flex-col" style={{gap: '8px', flex: 1}}>
            <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>제출자 (담당)</label>
            <input type="text" placeholder="임종현 실장" value={manager} onChange={e => setManager(e.target.value)} />
          </div>
          <div className="flex-col" style={{gap: '8px', flex: 1}}>
            <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>1페이지당 개수</label>
            <input type="number" value={itemsPerPage} onChange={e => setItemsPerPage(parseInt(e.target.value) || 17)} min={1} max={60} />
          </div>
          <div className="flex-col" style={{gap: '8px', flex: 1}}>
            <label style={{fontSize: '13px', color: 'var(--text-secondary)'}}>내역 줄 높이(px)</label>
            <input type="number" value={rowHeight} onChange={e => setRowHeight(parseInt(e.target.value) || 33)} min={10} max={100} />
          </div>
        </div>
        
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
            
            {/* 영수증 증빙철 영역 */}
            {expenses.some(r => r.imageUrl) && (
              <div className="preview-paper evidence-section" style={{ marginTop: '40px', pageBreakBefore: 'always' }}>
                <h2 style={{ textAlign: 'center', fontSize: '30px', fontWeight: 'bold', borderBottom: '3px solid black', paddingBottom: '20px', marginBottom: '40px', letterSpacing: '10px' }}>
                  영 수 증 증 빙 철
                </h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                  {expenses.filter(r => r.imageUrl).map((r, idx) => (
                    <div key={'evidence-'+r.id+'-'+idx} style={{ border: '2px solid black', padding: '16px', background: 'white', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <div style={{ marginBottom: '16px', fontSize: '15px', fontWeight: 'bold', borderBottom: '1px dashed #999', paddingBottom: '12px', lineHeight: '1.6' }}>
                        <div>■ 일자 : {r.date}</div>
                        <div>■ 사용처 : {r.store} ({r.category})</div>
                        <div>■ 결제금액 : {r.amount.toLocaleString()}원</div>
                      </div>
                      <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <img src={r.imageUrl} alt="receipt" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                    </div>
                  ))}
                </div>
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
            <LayoutDashboard size={18} /> 오버뷰
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

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

          {/* Template Upload */}
          <div 
            style={{
              border: `2px dashed ${isHovered ? '#10b981' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              textAlign: 'center',
              position: 'relative',
              transition: 'all 0.3s ease',
              background: isHovered ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
            }}
            onMouseOver={() => setIsHovered(true)}
            onMouseOut={() => setIsHovered(false)}
          >
             <input 
              type="file" 
              accept=".xls, .xlsx"
              onChange={handleTemplateUpload}
              style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                opacity: 0, cursor: 'pointer', zIndex: 10
              }}
            />
            <FileSpreadsheet size={24} style={{ margin: '0 auto 8px', color: templateData ? '#10b981' : (isHovered ? '#10b981' : 'var(--text-muted)') }} />
            <h4 style={{ fontSize: '13px', color: templateData ? '#10b981' : 'var(--text-primary)' }}>
              {templateData ? '✅ 양식 등록 완료' : '📋 기본 양식 등록 (.xls)'}
            </h4>
          </div>

        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header-area">
          <h1 className="header-title">
            {activeTab === 'dashboard' && '대시보드 오버뷰'}

            {activeTab === 'preview' && '지출결의서 미리보기'}
          </h1>
          
          <div className="flex-row">
            {/* API Key Input has been removed from UI for security/cleanliness. 
                Configure it via .env file (VITE_GEMINI_API_KEY) */}
          </div>
        </header>

        {activeTab === 'dashboard' && renderDashboard()}

        {activeTab === 'preview' && renderPreview()}
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
