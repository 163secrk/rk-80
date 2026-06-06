export interface TimelineEvent {
  id?: number;
  faultId?: number;
  time: string;
  event: string;
  operator?: string;
}

export interface Fault {
  id: number;
  title: string;
  description: string;
  level: 'critical' | 'major' | 'minor' | 'info';
  originalLevel?: 'critical' | 'major' | 'minor' | 'info';
  startTime: string;
  endTime?: string;
  affectedModules: string;
  rootCause?: string;
  solution?: string;
  status: 'active' | 'resolved' | 'monitoring';
  lastEscalatedAt?: string;
  escalationCount?: number;
  createdAt: string;
  updatedAt: string;
  timelines?: TimelineEvent[];
}

export interface EscalationLog {
  id: number;
  faultId: number;
  oldLevel: 'critical' | 'major' | 'minor' | 'info';
  newLevel: 'critical' | 'major' | 'minor' | 'info';
  reason: string;
  escalatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TrendItem {
  date: string;
  count: number;
}

export interface ModuleItem {
  name: string;
  value: number;
}

export interface Stats {
  total: number;
  active: number;
  byLevel: {
    critical?: number;
    major?: number;
    minor?: number;
    info?: number;
  };
  mttrSeconds: number;
  last30DaysTrend: TrendItem[];
  moduleDistribution: ModuleItem[];
}

export const levelConfig = {
  critical: { label: '严重', color: '#dc2626', bgColor: '#fef2f2' },
  major: { label: '重要', color: '#ea580c', bgColor: '#fff7ed' },
  minor: { label: '一般', color: '#ca8a04', bgColor: '#fefce8' },
  info: { label: '提示', color: '#2563eb', bgColor: '#eff6ff' }
};

export const statusConfig = {
  active: { label: '处理中', color: '#dc2626', bgColor: '#fef2f2' },
  resolved: { label: '已解决', color: '#16a34a', bgColor: '#f0fdf4' },
  monitoring: { label: '监控中', color: '#2563eb', bgColor: '#eff6ff' }
};
