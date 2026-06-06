import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api';
import type { Fault, Stats } from './types';
import { levelConfig, statusConfig } from './types';
import { FaultCard } from './components/FaultCard';
import { FaultModal } from './components/FaultModal';
import { EscalationHistoryModal } from './components/EscalationHistoryModal';
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

type SortBy = 'startTime' | 'level' | 'duration';
type SortOrder = 'asc' | 'desc';

function App() {
  const [faults, setFaults] = useState<Fault[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFault, setEditingFault] = useState<Fault | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('startTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string>('active');
  const [showBatchConfirm, setShowBatchConfirm] = useState<'status' | 'delete' | null>(null);
  const [escalationHistoryFault, setEscalationHistoryFault] = useState<Fault | null>(null);

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
        api.getFaults({
          level: filterLevel || undefined,
          status: filterStatus || undefined,
          search: searchKeyword || undefined,
          sortBy,
          sortOrder,
          page,
          pageSize
        }),
        api.getStats()
      ]);
      setFaults(faultsData.data);
      setTotalPages(faultsData.totalPages);
      setTotalCount(faultsData.total);
      setStats(statsData);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterStatus, searchKeyword, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCreate = () => {
    setEditingFault(undefined);
    setShowModal(true);
  };

  const handleEdit = (fault: Fault) => {
    setEditingFault(fault);
    setShowModal(true);
  };

  const handleSave = async (faultData: Omit<Fault, 'id' | 'createdAt' | 'updatedAt' | 'originalLevel' | 'lastEscalatedAt' | 'escalationCount'>) => {
    if (editingFault) {
      await api.updateFault(editingFault.id, faultData);
    } else {
      await api.createFault(faultData);
    }
    setSelectedIds(new Set());
    fetchData();
  };

  const handleDelete = async (id: number) => {
    await api.deleteFault(id);
    setConfirmDelete(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    fetchData();
  };

  const handleSelect = (id: number, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === faults.length && faults.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(faults.map(f => f.id)));
    }
  };

  const handleBatchUpdateStatus = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      alert('请先选择要操作的故障记录');
      return;
    }
    try {
      await api.batchUpdateStatus(ids, batchStatus);
      setShowBatchConfirm(null);
      setSelectedIds(new Set());
      fetchData();
    } catch (err) {
      console.error('批量更新失败:', err);
      alert('批量更新失败，请重试');
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      alert('请先选择要操作的故障记录');
      return;
    }
    try {
      await api.batchDelete(ids);
      setShowBatchConfirm(null);
      setSelectedIds(new Set());
      if (page > 1 && faults.length === ids.length) {
        setPage(page - 1);
      } else {
        fetchData();
      }
    } catch (err) {
      console.error('批量删除失败:', err);
      alert('批量删除失败，请重试');
    }
  };

  const handleViewEscalationHistory = (fault: Fault) => {
    setEscalationHistoryFault(fault);
  };

  const handleSortChange = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleResetFilters = () => {
    setFilterLevel('');
    setFilterStatus('');
    setSearchKeyword('');
    setSortBy('startTime');
    setSortOrder('desc');
    setPage(1);
    setSelectedIds(new Set());
  };

  const renderSortIcon = (field: SortBy) => {
    if (sortBy !== field) return '↕';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const escalatedCount = useMemo(() => {
    return faults.filter(f => f.escalationCount && f.escalationCount > 0).length;
  }, [faults]);

  return (
    <div className="app-container">
      <header className="header">
        <h1>🔧 系统故障复盘看板</h1>
        <div className="header-actions">
          {escalatedCount > 0 && (
            <div className="escalation-alert">
              ⚠️ {escalatedCount} 个故障已被自动升级，请关注处理
            </div>
          )}
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

      <div className="search-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="搜索标题、描述或根原因..."
            value={searchKeyword}
            onChange={(e) => { setSearchKeyword(e.target.value); setPage(1); }}
          />
          {searchKeyword && (
            <button className="clear-search-btn" onClick={() => setSearchKeyword('')}>×</button>
          )}
        </div>
      </div>

      <div className="filters">
        <select
          className="filter-select"
          value={filterLevel}
          onChange={e => { setFilterLevel(e.target.value); setPage(1); }}
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
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
        >
          <option value="">全部状态</option>
          <option value="active">处理中</option>
          <option value="monitoring">监控中</option>
          <option value="resolved">已解决</option>
        </select>
        <div className="sort-buttons">
          <span className="sort-label">排序:</span>
          <button
            className={`sort-btn ${sortBy === 'startTime' ? 'sort-btn-active' : ''}`}
            onClick={() => handleSortChange('startTime')}
          >
            开始时间 {renderSortIcon('startTime')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'level' ? 'sort-btn-active' : ''}`}
            onClick={() => handleSortChange('level')}
          >
            级别 {renderSortIcon('level')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'duration' ? 'sort-btn-active' : ''}`}
            onClick={() => handleSortChange('duration')}
          >
            处理时长 {renderSortIcon('duration')}
          </button>
        </div>
        <button className="btn btn-secondary" onClick={handleResetFilters}>
          重置筛选
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="batch-actions-bar">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedIds.size === faults.length && faults.length > 0}
              onChange={handleSelectAll}
            />
            <span>已选 {selectedIds.size} 项</span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="filter-select"
              value={batchStatus}
              onChange={e => setBatchStatus(e.target.value)}
              style={{ width: 120 }}
            >
              <option value="active">处理中</option>
              <option value="monitoring">监控中</option>
              <option value="resolved">已解决</option>
            </select>
            <button className="btn btn-secondary" onClick={() => setShowBatchConfirm('status')}>
              批量修改状态
            </button>
            <button className="btn btn-danger" onClick={() => setShowBatchConfirm('delete')}>
              批量删除
            </button>
            <button className="btn btn-secondary" onClick={() => setSelectedIds(new Set())}>
              取消选择
            </button>
          </div>
        </div>
      )}

      <div className="list-header">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={faults.length > 0 && selectedIds.size === faults.length}
            onChange={handleSelectAll}
          />
          <span>全选</span>
        </label>
        <span className="list-count">共 {totalCount} 条记录，当前第 {page}/{totalPages} 页</span>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : faults.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3 style={{ marginBottom: 8, color: '#475569' }}>暂无故障记录</h3>
          <p>{searchKeyword || filterLevel || filterStatus ? '没有匹配的筛选结果，请调整筛选条件' : '点击上方按钮添加第一条故障记录'}</p>
        </div>
      ) : (
        <>
          <div className="fault-list">
            {faults.map(fault => (
              <FaultCard
                key={fault.id}
                fault={fault}
                selected={selectedIds.has(fault.id)}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onDelete={(id) => setConfirmDelete(id)}
                onViewEscalationHistory={handleViewEscalationHistory}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                首页
              </button>
              <button
                className="page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </button>
              <span className="page-info">
                第 <strong>{page}</strong> / {totalPages} 页
              </span>
              <button
                className="page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </button>
              <button
                className="page-btn"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >
                末页
              </button>
            </div>
          )}
        </>
      )}

      {showModal && (
        <FaultModal
          fault={editingFault}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {escalationHistoryFault && (
        <EscalationHistoryModal
          fault={escalationHistoryFault}
          onClose={() => setEscalationHistoryFault(null)}
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
              <p style={{ fontSize: 13 }}>此操作不可撤销，相关的时间线记录和升级日志也会被删除。</p>
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

      {showBatchConfirm === 'status' && (
        <div className="modal-overlay" onClick={() => setShowBatchConfirm(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>确认批量修改状态</h2>
              <button className="close-btn" onClick={() => setShowBatchConfirm(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>确定要将选中的 {selectedIds.size} 条故障记录状态修改为「{statusConfig[batchStatus as keyof typeof statusConfig]?.label || batchStatus}」吗？</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBatchConfirm(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleBatchUpdateStatus}>
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchConfirm === 'delete' && (
        <div className="modal-overlay" onClick={() => setShowBatchConfirm(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>确认批量删除</h2>
              <button className="close-btn" onClick={() => setShowBatchConfirm(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>确定要删除选中的 {selectedIds.size} 条故障记录吗？</p>
              <p style={{ fontSize: 13 }}>此操作不可撤销，相关的时间线记录和升级日志也会被删除。</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBatchConfirm(null)}>
                取消
              </button>
              <button className="btn btn-danger" onClick={handleBatchDelete}>
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
