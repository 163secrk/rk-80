import axios from 'axios';
import type { Fault, Stats } from './types';

const API_BASE = '/api';

export const api = {
  async getFaults(level?: string, status?: string): Promise<Fault[]> {
    const params = new URLSearchParams();
    if (level) params.append('level', level);
    if (status) params.append('status', status);
    const url = params.toString() ? `${API_BASE}/faults?${params.toString()}` : `${API_BASE}/faults`;
    const res = await axios.get(url);
    return res.data;
  },

  async getFault(id: number): Promise<Fault> {
    const res = await axios.get(`${API_BASE}/faults/${id}`);
    return res.data;
  },

  async createFault(fault: Omit<Fault, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ id: number }> {
    const res = await axios.post(`${API_BASE}/faults`, fault);
    return res.data;
  },

  async updateFault(id: number, fault: Omit<Fault, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await axios.put(`${API_BASE}/faults/${id}`, fault);
  },

  async deleteFault(id: number): Promise<void> {
    await axios.delete(`${API_BASE}/faults/${id}`);
  },

  async getStats(): Promise<Stats> {
    const res = await axios.get(`${API_BASE}/stats`);
    return res.data;
  }
};
