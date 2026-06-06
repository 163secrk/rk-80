import React, { useState } from 'react';
import type { Fault } from '../types';
import { levelConfig, statusConfig } from '../types';
import { api } from '../api';

interface Props {
  fault: Fault;
  selected: boolean;
  onSelect: (id: number, selected: boolean) => void;
  onEdit: (fault: Fault) => void;
  onDelete: (id: number) => void;
  onViewEscalationHistory: (fault: Fault) => void;
}

export const FaultCard: React.FC<Props> = ({ fault, selected, onSelect, onEdit, onDelete, onViewEscalationHistory }) => {
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const level = levelConfig[fault.level];
  const status = statusConfig[fault.status];

  const handleExportWord = async () => {
    setExporting(true);
    try {
      await api.exportFaultWord(fault.id);
    } catch (err) {
      console.error('导出Word失败:', err);
      alert('导出Word报告失败，请重试');
    } finally {
      setExporting(false);
    }
  };
  
  const modules = fault.affectedModules ? fault.affectedModules.split(',').filter(Boolean) : [];
  const isEscalated = fault.escalationCount && fault.escalationCount > 0;
  
  const getDuration = () => {
    const start = new Date(fault.startTime).getTime();
    const end = fault.endTime ? new Date(fault.endTime).getTime() : Date.now();
    const diff = Math.floor((end - start) / 1000 / 60);
    if (diff < 60) return `${diff} 分钟`;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
  };

  const cardClass = `fault-card ${selected ? 'fault-card-selected' : ''} ${isEscalated ? 'fault-card-escalated' : ''}`;

  return (
    <div className={cardClass}>
      <div className="fault-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <input
            type="checkbox"
            className="fault-checkbox"
            checked={selected}
            onChange={(e) => onSelect(fault.id, e.target.checked)}
            style={{ marginTop: 6, width: 18, height: 18, cursor: 'pointer' }}
          />
          <div className="fault-info" style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <h3 className="fault-title">{fault.title}</h3>
              <span className="badge" style={{ backgroundColor: level.bgColor, color: level.color }}>
                {level.label}
              </span>
              <span className="badge" style={{ backgroundColor: status.bgColor, color: status.color }}>
                {status.label}
              </span>
              {isEscalated && (
                <span className="badge escalation-badge" title={`已自动升级 ${fault.escalationCount} 次`}>
                  ⚠️ 已升级 {fault.escalationCount} 次
                </span>
              )}
            </div>
            <div className="fault-meta">
              <span>🕐 开始: {fault.startTime}</span>
              {fault.endTime && <span>🏁 结束: {fault.endTime}</span>}
              <span>⏱ {fault.endTime ? '持续' : '已处理'}: {getDuration()}</span>
            </div>
          </div>
        </div>
        <div className="fault-actions">
          {isEscalated && (
            <button className="icon-btn" onClick={() => onViewEscalationHistory(fault)} title="查看升级历史">
              📜
            </button>
          )}
          <button
            className="icon-btn"
            onClick={handleExportWord}
            title="导出Word复盘报告"
            disabled={exporting}
          >
            {exporting ? '⏳' : '📄'}
          </button>
          <button className="icon-btn" onClick={() => onEdit(fault)} title="编辑">✏️</button>
          <button className="icon-btn" onClick={() => onDelete(fault.id)} title="删除">🗑️</button>
        </div>
      </div>
      
      {fault.description && (
        <div className="fault-details">
          <p className="fault-description">{fault.description}</p>
        </div>
      )}
      
      {modules.length > 0 && (
        <div className="fault-details" style={{ paddingTop: 0 }}>
          <div className="fault-section">
            <div className="section-label">受影响模块</div>
            <div className="module-tags">
              {modules.map((mod, idx) => (
                <span key={idx} className="module-tag">{mod.trim()}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {expanded && (
        <div className="fault-details" style={{ paddingTop: 0 }}>
          {fault.rootCause && (
            <div className="fault-section">
              <div className="section-label">根本原因</div>
              <p style={{ color: '#475569', fontSize: 14 }}>{fault.rootCause}</p>
            </div>
          )}
          
          {fault.solution && (
            <div className="fault-section">
              <div className="section-label">解决方案</div>
              <p style={{ color: '#475569', fontSize: 14 }}>{fault.solution}</p>
            </div>
          )}
          
          {fault.timelines && fault.timelines.length > 0 && (
            <div className="fault-section">
              <div className="section-label">时间线</div>
              <div className="timeline">
                {fault.timelines.map((tl) => (
                  <div key={tl.id} className="timeline-item">
                    <div className="timeline-time">{tl.time}</div>
                    <div className="timeline-event">{tl.event}</div>
                    {tl.operator && <div className="timeline-operator">操作人: {tl.operator}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      <div style={{ padding: '0 24px 20px' }}>
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? '收起详情 ▲' : '展开详情 ▼'}
        </button>
      </div>
    </div>
  );
};
