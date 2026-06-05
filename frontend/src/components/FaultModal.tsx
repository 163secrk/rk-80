import React, { useState, useEffect } from 'react';
import type { Fault, TimelineEvent } from '../types';

interface Props {
  fault?: Fault;
  onClose: () => void;
  onSave: (fault: Omit<Fault, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

const emptyTimeline = (): TimelineEvent => ({
  time: '',
  event: '',
  operator: ''
});

export const FaultModal: React.FC<Props> = ({ fault, onClose, onSave }) => {
  const isEditing = !!fault;
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    level: 'major' as Fault['level'],
    startTime: '',
    endTime: '',
    affectedModules: '',
    rootCause: '',
    solution: '',
    status: 'active' as Fault['status'],
    timelines: [] as TimelineEvent[]
  });
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fault) {
      setFormData({
        title: fault.title,
        description: fault.description || '',
        level: fault.level,
        startTime: fault.startTime,
        endTime: fault.endTime || '',
        affectedModules: fault.affectedModules || '',
        rootCause: fault.rootCause || '',
        solution: fault.solution || '',
        status: fault.status,
        timelines: fault.timelines || []
      });
    }
  }, [fault]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTimelineChange = (index: number, field: keyof TimelineEvent, value: string) => {
    setFormData(prev => {
      const newTimelines = [...prev.timelines];
      newTimelines[index] = { ...newTimelines[index], [field]: value };
      return { ...prev, timelines: newTimelines };
    });
  };

  const addTimeline = () => {
    setFormData(prev => ({
      ...prev,
      timelines: [...prev.timelines, emptyTimeline()]
    }));
  };

  const removeTimeline = (index: number) => {
    setFormData(prev => ({
      ...prev,
      timelines: prev.timelines.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.startTime) {
      alert('请填写标题和开始时间');
      return;
    }
    
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? '编辑故障记录' : '新增故障记录'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>故障标题 *</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="例如：支付系统超时"
                required
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>故障级别 *</label>
                <select name="level" value={formData.level} onChange={handleChange}>
                  <option value="critical">严重</option>
                  <option value="major">重要</option>
                  <option value="minor">一般</option>
                  <option value="info">提示</option>
                </select>
              </div>
              <div className="form-group">
                <label>状态</label>
                <select name="status" value={formData.status} onChange={handleChange}>
                  <option value="active">处理中</option>
                  <option value="monitoring">监控中</option>
                  <option value="resolved">已解决</option>
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>开始时间 *</label>
                <input
                  type="datetime-local"
                  name="startTime"
                  value={formData.startTime ? formData.startTime.replace(' ', 'T').slice(0, 16) : ''}
                  onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value ? e.target.value.replace('T', ' ') + ':00' : '' }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>结束时间</label>
                <input
                  type="datetime-local"
                  name="endTime"
                  value={formData.endTime ? formData.endTime.replace(' ', 'T').slice(0, 16) : ''}
                  onChange={e => setFormData(prev => ({ ...prev, endTime: e.target.value ? e.target.value.replace('T', ' ') + ':00' : '' }))}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>故障描述</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="详细描述故障现象..."
              />
            </div>
            
            <div className="form-group">
              <label>受影响模块（用逗号分隔）</label>
              <input
                type="text"
                name="affectedModules"
                value={formData.affectedModules}
                onChange={handleChange}
                placeholder="例如：支付模块,订单模块"
              />
            </div>
            
            <div className="form-group">
              <label>根本原因</label>
              <textarea
                name="rootCause"
                value={formData.rootCause}
                onChange={handleChange}
                placeholder="故障的根本原因分析..."
              />
            </div>
            
            <div className="form-group">
              <label>解决方案</label>
              <textarea
                name="solution"
                value={formData.solution}
                onChange={handleChange}
                placeholder="采取的解决措施..."
              />
            </div>
            
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ marginBottom: 0 }}>时间线记录</label>
                <button type="button" className="btn btn-secondary" onClick={addTimeline}>
                  + 添加事件
                </button>
              </div>
              
              {formData.timelines.length > 0 && (
                <div className="timeline-form-header">
                  <span>时间</span>
                  <span>事件</span>
                  <span>操作人</span>
                  <span></span>
                </div>
              )}
              
              {formData.timelines.map((tl, index) => (
                <div key={index} className="timeline-form-item">
                  <input
                    type="datetime-local"
                    value={tl.time ? tl.time.replace(' ', 'T').slice(0, 16) : ''}
                    onChange={e => handleTimelineChange(index, 'time', e.target.value ? e.target.value.replace('T', ' ') + ':00' : '')}
                  />
                  <input
                    type="text"
                    value={tl.event}
                    onChange={e => handleTimelineChange(index, 'event', e.target.value)}
                    placeholder="事件描述"
                  />
                  <input
                    type="text"
                    value={tl.operator || ''}
                    onChange={e => handleTimelineChange(index, 'operator', e.target.value)}
                    placeholder="操作人"
                  />
                  <button type="button" className="icon-btn" onClick={() => removeTimeline(index)} style={{ height: 42 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
          
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : (isEditing ? '保存修改' : '创建')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
