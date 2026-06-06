import axios from 'axios';
import type { Fault, Stats, PaginatedResponse, EscalationLog, CsvValidateResponse, CsvImportResponse } from './types';

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
  },

  async validateCsvImport(csvText: string): Promise<CsvValidateResponse> {
    const res = await axios.post(`${API_BASE}/faults/batch/validate`, { csvText });
    return res.data;
  },

  async batchImportFaults(records: any[]): Promise<CsvImportResponse> {
    const res = await axios.post(`${API_BASE}/faults/batch/import`, { records });
    return res.data;
  },

  async downloadCsvTemplate(): Promise<void> {
    const res = await axios.get(`${API_BASE}/faults/csv-template`, {
      responseType: 'blob'
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'faults_import_template.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async exportFaultWord(id: number): Promise<void> {
    const res = await axios.get(`${API_BASE}/faults/${id}/export-word`, {
      responseType: 'blob'
    });
    const contentDisposition = res.headers['content-disposition'];
    let fileName = `故障复盘报告_${id}.docx`;
    if (contentDisposition) {
      const matches = contentDisposition.match(/filename\*=UTF-8''(.+)/);
      if (matches) {
        fileName = decodeURIComponent(matches[1]);
      }
    }
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
};
