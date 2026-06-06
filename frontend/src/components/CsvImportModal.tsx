import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { api } from '../api';
import type { CsvValidateResponse, CsvImportResponse, CsvImportRow } from '../types';
import { levelConfig, statusConfig } from '../types';

interface Props {
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'upload' | 'preview' | 'result';

export const CsvImportModal: React.FC<Props> = ({ onClose, onImportComplete }) => {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validateResult, setValidateResult] = useState<CsvValidateResponse | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResponse | null>(null);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('请上传CSV格式的文件');
      return;
    }

    setFileName(file.name);
    setError('');
    setValidating(true);

    Papa.parse(file, {
      encoding: 'UTF-8',
      complete: async (results) => {
        try {
          const csvText = Papa.unparse(results.data);
          const response = await api.validateCsvImport(csvText);
          setValidateResult(response);
          setStep('preview');
        } catch (err: any) {
          setError(err.response?.data?.error || '校验失败，请检查文件格式');
          if (err.response?.data?.missingHeaders) {
            setError(prev => prev + `，缺少必要列: ${err.response.data.missingHeaders.join(', ')}`);
          }
        } finally {
          setValidating(false);
        }
      },
      error: (parseError) => {
        setError(`解析CSV失败: ${parseError.message}`);
        setValidating(false);
      }
    });
  };

  const handleImport = async () => {
    if (!validateResult || validateResult.valid === 0) {
      setError('没有有效的数据可导入');
      return;
    }

    setImporting(true);
    setError('');

    try {
      const response = await api.batchImportFaults(validateResult.validData);
      setImportResult(response);
      setStep('result');
      if (response.success > 0) {
        onImportComplete();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || '导入失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    api.downloadCsvTemplate();
  };

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setValidateResult(null);
    setImportResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderLevelLabel = (level: string) => {
    return levelConfig[level as keyof typeof levelConfig]?.label || level;
  };

  const renderStatusLabel = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig]?.label || status;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal csv-import-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {step === 'upload' && '批量导入故障记录'}
            {step === 'preview' && '预览校验结果'}
            {step === 'result' && '导入结果'}
          </h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {step === 'upload' && (
            <div className="upload-section">
              <div className="upload-info">
                <h3>CSV格式说明</h3>
                <div className="format-section">
                  <p><strong>必要列（不可缺失）：</strong></p>
                  <ul>
                    <li><code>title</code> - 故障标题</li>
                    <li><code>level</code> - 故障级别 (critical/major/minor/info)</li>
                    <li><code>startTime</code> - 开始时间 (格式: YYYY-MM-DD HH:MM:SS)</li>
                  </ul>
                  <p><strong>可选列：</strong></p>
                  <ul>
                    <li><code>description</code> - 故障描述</li>
                    <li><code>endTime</code> - 结束时间 (格式: YYYY-MM-DD HH:MM:SS)</li>
                    <li><code>affectedModules</code> - 受影响模块（用逗号分隔）</li>
                    <li><code>rootCause</code> - 根因分析</li>
                    <li><code>solution</code> - 解决方案</li>
                    <li><code>status</code> - 状态 (active/monitoring/resolved，默认active)</li>
                  </ul>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadTemplate}
                  style={{ marginBottom: 20 }}
                >
                  📥 下载CSV模板
                </button>
              </div>

              <div className="upload-zone">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div
                  className="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-icon">📁</div>
                  <p className="upload-text">
                    {validating ? '正在校验...' : '点击选择或拖拽CSV文件到此处'}
                  </p>
                  {fileName && <p className="upload-file-name">已选择: {fileName}</p>}
                </div>
              </div>

              {error && (
                <div className="alert alert-error">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && validateResult && (
            <div className="preview-section">
              <div className="validation-summary">
                <div className="summary-card summary-total">
                  <div className="summary-label">总共解析</div>
                  <div className="summary-value">{validateResult.total} 条</div>
                </div>
                <div className="summary-card summary-valid">
                  <div className="summary-label">有效数据</div>
                  <div className="summary-value">{validateResult.valid} 条</div>
                </div>
                <div className="summary-card summary-invalid">
                  <div className="summary-label">无效数据</div>
                  <div className="summary-value">{validateResult.invalid} 条</div>
                </div>
              </div>

              {validateResult.errors.length > 0 && (
                <div className="validation-errors">
                  <h4>⚠️ 校验错误 ({validateResult.errors.length} 条)</h4>
                  <div className="errors-list">
                    {validateResult.errors.slice(0, 20).map((err, idx) => (
                      <div key={idx} className="error-item">
                        <span className="error-icon">❌</span>
                        {err}
                      </div>
                    ))}
                    {validateResult.errors.length > 20 && (
                      <div className="error-item error-more">
                        ... 还有 {validateResult.errors.length - 20} 条错误
                      </div>
                    )}
                  </div>
                </div>
              )}

              {validateResult.previewData.length > 0 && (
                <div className="preview-data">
                  <h4>📋 数据预览（前{validateResult.previewData.length}条）</h4>
                  <div className="preview-table-wrapper">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>标题</th>
                          <th>级别</th>
                          <th>开始时间</th>
                          <th>结束时间</th>
                          <th>受影响模块</th>
                          <th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validateResult.previewData.map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.title}</td>
                            <td>
                              <span className="badge" style={{
                                backgroundColor: levelConfig[row.level]?.bgColor,
                                color: levelConfig[row.level]?.color
                              }}>
                                {renderLevelLabel(row.level)}
                              </span>
                            </td>
                            <td>{row.startTime}</td>
                            <td>{row.endTime || '-'}</td>
                            <td>{row.affectedModules || '-'}</td>
                            <td>
                              <span className="badge" style={{
                                backgroundColor: statusConfig[row.status || 'active']?.bgColor,
                                color: statusConfig[row.status || 'active']?.color
                              }}>
                                {renderStatusLabel(row.status || 'active')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <div className="alert alert-error">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'result' && importResult && (
            <div className="result-section">
              <div className="result-summary">
                <div className="summary-card summary-valid">
                  <div className="summary-icon">✅</div>
                  <div className="summary-label">导入成功</div>
                  <div className="summary-value">{importResult.success} 条</div>
                </div>
                <div className="summary-card summary-invalid">
                  <div className="summary-icon">❌</div>
                  <div className="summary-label">导入失败</div>
                  <div className="summary-value">{importResult.failed} 条</div>
                </div>
              </div>

              <div className="result-message">
                <p className="result-text">{importResult.message}</p>
              </div>

              {importResult.failedRecords && importResult.failedRecords.length > 0 && (
                <div className="failed-records">
                  <h4>失败详情</h4>
                  <div className="failed-list">
                    {importResult.failedRecords.map((item, idx) => (
                      <div key={idx} className="failed-item">
                        <div className="failed-row">第 {item.row} 行: {item.record.title}</div>
                        <div className="failed-error">错误: {item.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 'upload' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button className="btn btn-secondary" onClick={handleReset}>
                重新选择
              </button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || validateResult?.valid === 0}
              >
                {importing ? '导入中...' : `确认导入 (${validateResult?.valid || 0}条)`}
              </button>
            </>
          )}
          {step === 'result' && (
            <>
              <button className="btn btn-secondary" onClick={handleReset}>
                继续导入
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                完成
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
