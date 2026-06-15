import React from 'react';
import {
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  FileText,
  Wallet,
  CreditCard,
  UtensilsCrossed,
} from 'lucide-react';
import type { WorkflowMode } from '../types';
import { WORKFLOW_LABELS } from '../types';

interface SidebarProps {
  workflowMode: WorkflowMode;
  setWorkflowMode: (m: WorkflowMode) => void;
  activeTab: 'dashboard' | 'preview' | 'evidence';
  setActiveTab: (t: 'dashboard' | 'preview' | 'evidence') => void;
  isExtracting: boolean;
  isImgHovered: boolean;
  setIsImgHovered: (v: boolean) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function Sidebar({
  workflowMode,
  setWorkflowMode,
  activeTab,
  setActiveTab,
  isExtracting,
  isImgHovered,
  setIsImgHovered,
  onImageUpload,
}: SidebarProps) {
  return (
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
            borderColor: activeTab === 'dashboard' ? 'var(--border-highlight)' : 'transparent',
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
            borderColor: activeTab === 'preview' ? 'var(--border-highlight)' : 'transparent',
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
            borderColor: activeTab === 'evidence' ? 'var(--border-highlight)' : 'transparent',
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
            cursor: isExtracting ? 'not-allowed' : 'pointer',
          }}
          onMouseOver={() => setIsImgHovered(true)}
          onMouseOut={() => setIsImgHovered(false)}
        >
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={onImageUpload}
            disabled={isExtracting}
            style={{
              position: 'absolute',
              top: 0, left: 0, width: '100%', height: '100%',
              opacity: 0, cursor: isExtracting ? 'not-allowed' : 'pointer',
              zIndex: 10,
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
              <h4 style={{ fontSize: '14px', marginBottom: '4px', color: 'var(--text-primary)' }}>📷 영수증 사진 / PDF 분석</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>클릭하여 사진·PDF 첨부 (AI 자동입력)</p>
            </>
          )}
        </div>

      </div>
    </aside>
  );
}
