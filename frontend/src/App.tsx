import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api';
import type { Fault, Stats } from './types';
import { levelConfig, statusConfig } from './types';
import { FaultCard } from './components/FaultCard';
import { FaultModal } from './components/FaultModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const formatDuration = (seconds: number): string => {
  if (!seconds) return '0 分钟';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  return `${minutes} 分钟`;
};

const CHART_COLORS = ['#2563eb', '#dc2626', '#ea580c', '#16a34a', '#8b5cf6', '#ca8a04', '#0891b2', '#db2777'];

function App() {
  const [faults, setFaults] = useState<Fault[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFault, setEditingFault] = useState<Fault | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const chartTrendData = useMemo(() => {
    if (!stats?.last30DaysTrend) return [];
    return stats.last30DaysTrend.map(item => ({
      ...item,
      displayDate: item.date.slice(5)
    }));
  }, [stats]);

  const pieData = useMemo(() => {
    if (!stats?.moduleDistribution) return [];
    return stats.moduleDistribution;
  }, [stats]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [faultsData, statsData] = await Promise.all([
        api.getFaults(filterLevel || undefined, filterStatus || undefined),
        api.getStats()
      ]);
      setFaults(faultsData);
      setStats(statsData);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = () => {
    setEditingFault(undefined);
    setShowModal(true);
  };

  const handleEdit = (fault: Fault) => {
    setEditingFault(fault);
    setShowModal(true);
  };

  const handleSave = async (faultData: Omit<Fault, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingFault) {
      await api.updateFault(editingFault.id, faultData);
    } else {
      await api.createFault(faultData);
    }
    fetchData();
  };

  const handleDelete = async (id: number) => {
    await api.deleteFault(id);
    setConfirmDelete(null);
    fetchData();
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>🔧 系统故障复盘看板</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleCreate}>
            + 新增故障记录
          </button>
        </div>
      </header>

      {stats && (
        <>
          <div className="stats-grid">
            <div className="stat-card" style={{ borderLeftColor: '#2563eb' }}>
              <div className="stat-label">故障总数</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: '#dc2626' }}>
              <div className="stat-label">处理中</div>
              <div className="stat-value">{stats.active}</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: levelConfig.critical.color }}>
              <div className="stat-label">严重故障</div>
              <div className="stat-value">{stats.byLevel.critical || 0}</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: levelConfig.major.color }}>
              <div className="stat-label">重要故障</div>
              <div className="stat-value">{stats.byLevel.major || 0}</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: levelConfig.minor.color }}>
              <div className="stat-label">一般故障</div>
              <div className="stat-value">{stats.byLevel.minor || 0}</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: '#16a34a' }}>
              <div className="stat-label">MTTR 平均修复时长</div>
              <div className="stat-value">{formatDuration(stats.mttrSeconds)}</div>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h3 className="chart-title">最近30天故障趋势</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="displayDate" stroke="#64748b" fontSize={11} tick={{ fill: '#64748b' }} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value) => [`${value} 起`, '故障数']}
                    labelFormatter={(label) => `日期: ${label}`}
                  />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="故障数" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3 className="chart-title">受影响模块分布</h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                      formatter={(value) => [`${value} 起`, '故障数']}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">暂无模块数据</div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="filters">
        <select
          className="filter-select"
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}
        >
          <option value="">全部级别</option>
          <option value="critical">严重</option>
          <option value="major">重要</option>
          <option value="minor">一般</option>
          <option value="info">提示</option>
        </select>
        <select
          className="filter-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="active">处理中</option>
          <option value="monitoring">监控中</option>
          <option value="resolved">已解决</option>
        </select>
        <button className="btn btn-secondary" onClick={() => { setFilterLevel(''); setFilterStatus(''); }}>
          重置筛选
        </button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : faults.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3 style={{ marginBottom: 8, color: '#475569' }}>暂无故障记录</h3>
          <p>点击上方按钮添加第一条故障记录</p>
        </div>
      ) : (
        <div className="fault-list">
          {faults.map(fault => (
            <FaultCard
              key={fault.id}
              fault={fault}
              onEdit={handleEdit}
              onDelete={(id) => setConfirmDelete(id)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <FaultModal
          fault={editingFault}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {confirmDelete !== null && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>确认删除</h2>
              <button className="close-btn" onClick={() => setConfirmDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>确定要删除这条故障记录吗？</p>
              <p style={{ fontSize: 13 }}>此操作不可撤销，相关的时间线记录也会被删除。</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                取消
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
