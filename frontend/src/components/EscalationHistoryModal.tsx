import React, { useState, useEffect } from 'react';
import type { Fault, EscalationLog } from '../types';
import { levelConfig } from '../types';
import { api } from '../api';

interface Props {
  fault: Fault;
  onClose: () => void;
}

export const EscalationHistoryModal: React.FC<Props> = ({ fault, onClose }) => {
  const [logs, setLogs] = useState<EscalationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getEscalationLogs(fault.id);
        setLogs(data);
      } catch (err) {
        console.error('获取升级历史失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [fault.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2>升级历史 - {fault.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {loading ? (
            <div className="loading">加载中...</div>
          ) : logs.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-state-icon">📜</div>
              <h3 style={{ marginBottom: 8, color: '#475569' }}>暂无升级记录</h3>
              <p>该故障尚未被自动升级过</p>
            </div>
          ) : (
            <div className="timeline" style={{ maxHeight: 400, overflowY: 'auto' }}>
              {logs.map((log) => {
                const oldLevel = levelConfig[log.oldLevel];
                const newLevel = levelConfig[log.newLevel];
                return (
                  <div key={log.id} className="timeline-item" style={{ borderLeftColor: '#dc2626' }}>
                    <div className="timeline-time" style={{ color: '#dc2626', fontWeight: 500 }}>
                      {log.escalatedAt}
                    </div>
                    <div className="timeline-event" style={{ marginBottom: 8 }}>
                      <span className="badge" style={{ backgroundColor: oldLevel.bgColor, color: oldLevel.color, marginRight: 8 }}>
                        {oldLevel.label}
                      </span>
                      <span style={{ color: '#94a3b8', marginRight: 8 }}>→</span>
                      <span className="badge" style={{ backgroundColor: newLevel.bgColor, color: newLevel.color }}>
                        {newLevel.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {log.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
