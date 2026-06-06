import axios from 'axios';
import type { Fault, Stats, PaginatedResponse, EscalationLog } from './types';

const API_BASE = '/api';

export interface GetFaultsParams {
  level?: string;
  status?: string;
  search?: string;
  sortBy?: 'startTime' | 'level' | 'duration';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export const api = {
  async getFaults(params: GetFaultsParams = {}): Promise<PaginatedResponse<Fault>> {
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        urlParams.append(key, String(value));
      }
    });
    const url = urlParams.toString() ? `${API_BASE}/faults?${urlParams.toString()}` : `${API_BASE}/faults`;
    const res = await axios.get(url);
    return res.data;
  },

  async getFault(id: number): Promise<Fault> {
    const res = await axios.get(`${API_BASE}/faults/${id}`);
    return res.data;
  },

  async createFault(fault: Omit<Fault, 'id' | 'createdAt' | 'updatedAt' | 'originalLevel' | 'lastEscalatedAt' | 'escalationCount'>): Promise<{ id: number }> {
    const res = await axios.post(`${API_BASE}/faults`, fault);
    return res.data;
  },

  async updateFault(id: number, fault: Omit<Fault, 'id' | 'createdAt' | 'updatedAt' | 'originalLevel' | 'lastEscalatedAt' | 'escalationCount'>): Promise<void> {
    await axios.put(`${API_BASE}/faults/${id}`, fault);
  },

  async deleteFault(id: number): Promise<void> {
    await axios.delete(`${API_BASE}/faults/${id}`);
  },

  async batchUpdateStatus(ids: number[], status: string): Promise<{ message: string; updated: number }> {
    const res = await axios.post(`${API_BASE}/faults/batch/update-status`, { ids, status });
    return res.data;
  },

  async batchDelete(ids: number[]): Promise<{ message: string; deleted: number }> {
    const res = await axios.post(`${API_BASE}/faults/batch/delete`, { ids });
    return res.data;
  },

  async getEscalationLogs(faultId: number): Promise<EscalationLog[]> {
    const res = await axios.get(`${API_BASE}/faults/${faultId}/escalation-logs`);
    return res.data;
  },

  async getStats(): Promise<Stats> {
    const res = await axios.get(`${API_BASE}/stats`);
    return res.data;
  }
};
