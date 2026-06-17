import { useReceiptWorkspace } from './hooks/useReceiptWorkspace';
import Sidebar from './components/Sidebar';
import DashboardView from './views/DashboardView';
import PreviewView from './views/PreviewView';
import LunchPreviewView from './views/LunchPreviewView';
import EvidenceView from './views/EvidenceView';
import EntertainmentDashboardView from './views/EntertainmentDashboardView';
import EntertainmentPreviewView from './views/EntertainmentPreviewView';

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
            {ws.activeTab === 'preview' && ws.workflowMode === 'lunch' && '식대 지출결의서 미리보기'}
            {ws.activeTab === 'preview' && ws.workflowMode === 'corp' && '지출결의서 미리보기'}
            {ws.activeTab === 'preview' && ws.workflowMode === 'entertainment' && '접대사유서 미리보기'}
            {ws.activeTab === 'evidence' && '영수증 증빙철 미리보기'}
          </h1>
          <div className="flex-row">
          </div>
        </header>

        {/* 대시보드 - entertainment 모드 */}
        {ws.activeTab === 'dashboard' && ws.workflowMode === 'entertainment' && (
          <EntertainmentDashboardView
            entertainmentRecords={ws.entertainmentRecords}
            docDate={ws.docDate} setDocDate={ws.setDocDate}
            department={ws.department} setDepartment={ws.setDepartment}
            manager={ws.manager} setManager={ws.setManager}
            itemsPerPage={ws.itemsPerPage} setItemsPerPage={ws.setItemsPerPage}
            rowHeight={ws.rowHeight} setRowHeight={ws.setRowHeight}
            onAddRecord={ws.addEntertainmentRecord}
            onUpdateRecord={ws.updateEntertainmentRecord}
            onDeleteRecord={ws.deleteEntertainmentRecord}
          />
        )}

        {/* 대시보드 - corp/lunch 모드 */}
        {ws.activeTab === 'dashboard' && ws.workflowMode !== 'entertainment' && (
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
            entertainmentRecords={ws.entertainmentRecords}
            onUpdateEntertainmentRecord={ws.updateEntertainmentRecord}
          />
        )}

        {/* 미리보기 - corp 모드 */}
        {ws.activeTab === 'preview' && ws.workflowMode === 'corp' && (
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
            entertainmentRecords={ws.entertainmentRecords}
            onUpdateEntertainmentRecord={ws.updateEntertainmentRecord}
          />
        )}

        {/* 미리보기 - lunch 모드 */}
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

        {/* 미리보기 - entertainment 모드 */}
        {ws.activeTab === 'preview' && ws.workflowMode === 'entertainment' && (
          <EntertainmentPreviewView
            entertainmentRecords={ws.entertainmentRecords}
            docDate={ws.docDate} setDocDate={ws.setDocDate}
            department={ws.department} setDepartment={ws.setDepartment}
            manager={ws.manager} setManager={ws.setManager}
            itemsPerPage={ws.itemsPerPage} setItemsPerPage={ws.setItemsPerPage}
            rowHeight={ws.rowHeight} setRowHeight={ws.setRowHeight}
            onPrint={print}
          />
        )}

        {ws.activeTab === 'evidence' && ws.workflowMode !== 'entertainment' && (
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
