import React from 'react';
import {
  Upload,
  Trash2,
  Wallet,
  Save,
} from 'lucide-react';
import DocumentSettingsPanel from '../components/DocumentSettingsPanel';
import type { Receipt, WorkflowMode, EntertainmentRecord } from '../types';

interface DashboardViewProps {
  receipts: Receipt[];
  workflowMode: WorkflowMode;
  docDate: string; setDocDate: (v: string) => void;
  department: string; setDepartment: (v: string) => void;
  manager: string; setManager: (v: string) => void;
  itemsPerPage: number; setItemsPerPage: (v: number) => void;
  rowHeight: number; setRowHeight: (v: number) => void;
  settlementMonth: string; setSettlementMonth: (v: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  onClearData: () => void;
  onAddManualReceipt: () => void;
  onAddCashReceipt: () => void;
  onSaveWorkspace: () => void;
  onLoadWorkspace: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteReceipt: (id: string) => void;
  onUpdateReceipt: (id: string, field: keyof Receipt, value: string | number) => void;
  onTogglePaymentType: (id: string) => void;
  entertainmentRecords: EntertainmentRecord[];
  onUpdateEntertainmentRecord: (id: string, field: keyof EntertainmentRecord, value: string | number) => void;
}

export default function DashboardView({
  receipts,
  workflowMode,
  docDate, setDocDate,
  department, setDepartment,
  manager, setManager,
  itemsPerPage, setItemsPerPage,
  rowHeight, setRowHeight,
  settlementMonth, setSettlementMonth,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSelected,
  onClearData,
  onAddManualReceipt,
  onAddCashReceipt,
  onSaveWorkspace,
  onLoadWorkspace,
  onDeleteReceipt,
  onUpdateReceipt,
  onTogglePaymentType,
  entertainmentRecords,
  onUpdateEntertainmentRecord,
}: DashboardViewProps) {
  const sortedReceipts = [...receipts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
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
            <button className="btn-secondary" onClick={onAddManualReceipt} style={{ background: '#10b981', color: 'white', borderColor: '#10b981' }}>
              <Upload size={16} /> 수동 내역 추가
            </button>
            {workflowMode === 'corp' && (
              <button className="btn-secondary" onClick={onAddCashReceipt} style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b' }}>
                <Wallet size={16} /> 현금 내역 추가
              </button>
            )}
            <label className="btn-secondary" style={{ cursor: 'pointer', background: '#3b82f6', color: 'white', borderColor: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
              <Upload size={16} /> 백업파일 불러오기
              <input type="file" accept=".exp,.json" onChange={onLoadWorkspace} style={{ display: 'none' }} />
            </label>
            <button className="btn-secondary" onClick={onSaveWorkspace} style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>
              <Save size={16} /> 현재 상황 백업저장
            </button>
            {selectedIds.size > 0 && (
              <button className="btn-secondary" onClick={onDeleteSelected} style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}>
                <Trash2 size={16} /> 선택 삭제 ({selectedIds.size}건)
              </button>
            )}
            <button className="btn-secondary" onClick={onClearData} style={{ color: '#ef4444' }}>
              <Trash2 size={16} /> 전체 초기화
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
                  <th style={{ width: '36px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedIds.size === receipts.length && receipts.length > 0} onChange={onToggleSelectAll} title="전체 선택" />
                  </th>
                  <th style={{ textAlign: 'center', width: '50px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedReceipts.map(r => {
                  const isHighAmount = workflowMode === 'corp' && r.amount >= 100000;
                  const er = isHighAmount ? entertainmentRecords.find(rec => rec.receiptId === r.id) : undefined;
                  return (
                    <React.Fragment key={r.id}>
                      {/* 영수증 행 */}
                      <tr style={{ background: selectedIds.has(r.id) ? 'rgba(239, 68, 68, 0.08)' : isHighAmount ? 'rgba(234, 179, 8, 0.06)' : undefined }}>
                        <td style={{ padding: '4px 8px', width: '15%' }}>
                          <input
                            type="text"
                            value={r.date}
                            onChange={(e) => onUpdateReceipt(r.id, 'date', e.target.value)}
                            className="editable-cell"
                            placeholder="예: 04.05"
                            style={{ textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input
                            type="text"
                            value={r.store}
                            onChange={(e) => onUpdateReceipt(r.id, 'store', e.target.value)}
                            className="editable-cell"
                            placeholder="사용처 입력"
                            style={{ fontWeight: 500 }}
                          />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input
                            type="text"
                            value={r.category}
                            onChange={(e) => onUpdateReceipt(r.id, 'category', e.target.value)}
                            className="editable-cell"
                            placeholder="사용내역 입력"
                          />
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                          {r.type === 'expense' ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              <span style={{ marginRight: '2px' }}>₩</span>
                              <input
                                type="text"
                                value={r.amount > 0 ? r.amount.toLocaleString() : ''}
                                onChange={(e) => onUpdateReceipt(r.id, 'amount', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                                className="editable-cell"
                                style={{ textAlign: 'right', fontWeight: 600, width: '100px' }}
                              />
                            </div>
                          ) : (
                            <button onClick={() => onTogglePaymentType(r.id)} title="법인카드로 전환"
                              style={{ background: 'transparent', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 10px', fontSize: '11px', borderRadius: '4px' }}>
                              카드로 →
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                          {r.type !== 'expense' ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              <span style={{ marginRight: '2px' }}>₩</span>
                              <input
                                type="text"
                                value={r.amount > 0 ? r.amount.toLocaleString() : ''}
                                onChange={(e) => onUpdateReceipt(r.id, 'amount', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                                className="editable-cell"
                                style={{ textAlign: 'right', fontWeight: 600, width: '100px' }}
                              />
                            </div>
                          ) : (
                            <button onClick={() => onTogglePaymentType(r.id)} title="현금으로 전환"
                              style={{ background: 'transparent', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 10px', fontSize: '11px', borderRadius: '4px' }}>
                              ← 현금으로
                            </button>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', width: '36px' }}>
                          <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => onToggleSelect(r.id)} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => onDeleteReceipt(r.id)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                            title="항목 삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>

                      {/* 접대사유서 입력 행 (100,000원 이상, corp 모드) */}
                      {isHighAmount && er && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0', borderTop: 'none' }}>
                            <div style={{
                              margin: '0 0 4px 0',
                              padding: '10px 16px',
                              background: 'rgba(234, 179, 8, 0.05)',
                              borderLeft: '3px solid #eab308',
                              borderBottom: '1px solid rgba(234, 179, 8, 0.2)',
                            }}>
                              <div style={{ fontSize: '11px', color: '#eab308', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.5px' }}>
                                ⚠ 접대사유서 (100,000원 이상)
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 120px 2fr', gap: '8px', alignItems: 'end' }}>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>접대날짜</div>
                                  <input
                                    type="text"
                                    value={er.date}
                                    onChange={e => onUpdateEntertainmentRecord(er.id, 'date', e.target.value)}
                                    className="editable-cell"
                                    style={{ textAlign: 'center', width: '100%' }}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>접대처</div>
                                  <input
                                    type="text"
                                    value={er.counterpart}
                                    onChange={e => onUpdateEntertainmentRecord(er.id, 'counterpart', e.target.value)}
                                    className="editable-cell"
                                    placeholder="접대처 입력"
                                    style={{ width: '100%' }}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>인원</div>
                                  <input
                                    type="text"
                                    value={er.headcount}
                                    onChange={e => onUpdateEntertainmentRecord(er.id, 'headcount', e.target.value)}
                                    className="editable-cell"
                                    placeholder="0명"
                                    style={{ textAlign: 'center', width: '100%' }}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>사용처</div>
                                  <input
                                    type="text"
                                    value={er.place}
                                    onChange={e => onUpdateEntertainmentRecord(er.id, 'place', e.target.value)}
                                    className="editable-cell"
                                    placeholder="사용처"
                                    style={{ width: '100%' }}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>금액</div>
                                  <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '2px' }}>₩</span>
                                    <input
                                      type="text"
                                      value={er.amount > 0 ? er.amount.toLocaleString() : ''}
                                      onChange={e => onUpdateEntertainmentRecord(er.id, 'amount', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                                      className="editable-cell"
                                      style={{ textAlign: 'right', fontWeight: 600, flex: 1 }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>사유</div>
                                  <input
                                    type="text"
                                    value={er.reason}
                                    onChange={e => onUpdateEntertainmentRecord(er.id, 'reason', e.target.value)}
                                    className="editable-cell"
                                    placeholder="접대 사유 입력"
                                    style={{ width: '100%' }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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
}
