import { useReceiptWorkspace } from './hooks/useReceiptWorkspace';
import Sidebar from './components/Sidebar';
import DashboardView from './views/DashboardView';
import PreviewView from './views/PreviewView';
import LunchPreviewView from './views/LunchPreviewView';
import EvidenceView from './views/EvidenceView';

function App() {
  const ws = useReceiptWorkspace();
  const print = () => ws.handlePrint(ws.activeTab, ws.workflowMode, ws.docDate, ws.settlementMonth);

  return (
    <div className="app-container">
      <Sidebar
        workflowMode={ws.workflowMode}
        setWorkflowMode={ws.setWorkflowMode}
        activeTab={ws.activeTab}
        setActiveTab={ws.setActiveTab}
        isExtracting={ws.isExtracting}
        isImgHovered={ws.isImgHovered}
        setIsImgHovered={ws.setIsImgHovered}
        onImageUpload={ws.handleImageUpload}
      />

      <main className="main-content">
        <header className="header-area">
          <h1 className="header-title">
            {ws.activeTab === 'dashboard' && 'SOUND SOLUTION'}
            {ws.activeTab === 'preview' && (ws.workflowMode === 'lunch' ? '식대 지출결의서 미리보기' : '지출결의서 미리보기')}
            {ws.activeTab === 'evidence' && '영수증 증빙철 미리보기'}
          </h1>
          <div className="flex-row">
          </div>
        </header>

        {ws.activeTab === 'dashboard' && (
          <DashboardView
            receipts={ws.receipts}
            workflowMode={ws.workflowMode}
            docDate={ws.docDate} setDocDate={ws.setDocDate}
            department={ws.department} setDepartment={ws.setDepartment}
            manager={ws.manager} setManager={ws.setManager}
            itemsPerPage={ws.itemsPerPage} setItemsPerPage={ws.setItemsPerPage}
            rowHeight={ws.rowHeight} setRowHeight={ws.setRowHeight}
            settlementMonth={ws.settlementMonth} setSettlementMonth={ws.setSettlementMonth}
            selectedIds={ws.selectedIds}
            onToggleSelect={ws.toggleSelect}
            onToggleSelectAll={ws.toggleSelectAll}
            onDeleteSelected={ws.deleteSelected}
            onClearData={ws.clearData}
            onAddManualReceipt={ws.addManualReceipt}
            onAddCashReceipt={ws.addCashReceipt}
            onSaveWorkspace={ws.handleSaveWorkspace}
            onLoadWorkspace={ws.loadWorkspace}
            onDeleteReceipt={ws.deleteReceipt}
            onUpdateReceipt={ws.updateReceipt}
            onTogglePaymentType={ws.togglePaymentType}
          />
        )}
        {ws.activeTab === 'preview' && ws.workflowMode !== 'lunch' && (
          <PreviewView
            receipts={ws.receipts}
            docDate={ws.docDate} setDocDate={ws.setDocDate}
            department={ws.department} setDepartment={ws.setDepartment}
            manager={ws.manager} setManager={ws.setManager}
            itemsPerPage={ws.itemsPerPage} setItemsPerPage={ws.setItemsPerPage}
            rowHeight={ws.rowHeight} setRowHeight={ws.setRowHeight}
            quickAdd={ws.quickAdd} setQuickAdd={ws.setQuickAdd}
            onAddQuickReceipt={ws.addQuickReceipt}
            onPrint={print}
          />
        )}
        {ws.activeTab === 'preview' && ws.workflowMode === 'lunch' && (
          <LunchPreviewView
            receipts={ws.receipts}
            docDate={ws.docDate} setDocDate={ws.setDocDate}
            department={ws.department} setDepartment={ws.setDepartment}
            manager={ws.manager} setManager={ws.setManager}
            settlementMonth={ws.settlementMonth} setSettlementMonth={ws.setSettlementMonth}
            itemsPerPage={ws.itemsPerPage} setItemsPerPage={ws.setItemsPerPage}
            rowHeight={ws.rowHeight} setRowHeight={ws.setRowHeight}
            quickAdd={ws.quickAdd} setQuickAdd={ws.setQuickAdd}
            onAddQuickReceipt={ws.addQuickReceipt}
            onPrint={print}
          />
        )}
        {ws.activeTab === 'evidence' && (
          <EvidenceView
            receipts={ws.receipts}
            workflowMode={ws.workflowMode}
            docDate={ws.docDate}
            onPrint={print}
          />
        )}
      </main>

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
