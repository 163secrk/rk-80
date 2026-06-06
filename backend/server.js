const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const csv = require('csv-parser');
const { Readable } = require('stream');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle
} = require('docx');

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, 'faults.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('已连接到 SQLite 数据库');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS faults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    level TEXT NOT NULL,
    originalLevel TEXT,
    startTime TEXT NOT NULL,
    endTime TEXT,
    affectedModules TEXT,
    rootCause TEXT,
    solution TEXT,
    status TEXT DEFAULT 'active',
    lastEscalatedAt TEXT,
    escalationCount INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS timelines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faultId INTEGER NOT NULL,
    time TEXT NOT NULL,
    event TEXT NOT NULL,
    operator TEXT,
    FOREIGN KEY (faultId) REFERENCES faults(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS escalation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faultId INTEGER NOT NULL,
    oldLevel TEXT NOT NULL,
    newLevel TEXT NOT NULL,
    reason TEXT NOT NULL,
    escalatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faultId) REFERENCES faults(id) ON DELETE CASCADE
  )`);

  const stmt = db.prepare('SELECT COUNT(*) as count FROM faults');
  stmt.get((err, row) => {
    if (row.count === 0) {
      const insertFault = db.prepare(`INSERT INTO faults 
        (title, description, level, originalLevel, startTime, endTime, affectedModules, rootCause, solution, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      insertFault.run(
        '支付系统超时',
        '用户无法完成支付，支付网关响应超时',
        'critical',
        'critical',
        '2026-06-03 14:30:00',
        '2026-06-03 15:45:00',
        '支付模块,订单模块',
        '第三方支付网关故障',
        '切换备用支付通道',
        'resolved'
      );
      
      insertFault.run(
        '用户登录异常',
        '部分用户无法登录系统，验证码发送失败',
        'major',
        'major',
        '2026-06-02 09:15:00',
        '2026-06-02 10:30:00',
        '用户模块,认证模块',
        '短信服务提供商接口限流',
        '增加重试机制，接入备用短信通道',
        'resolved'
      );
      
      insertFault.finalize();

      const insertTimeline = db.prepare(`INSERT INTO timelines 
        (faultId, time, event, operator) VALUES (?, ?, ?, ?)`);
      
      insertTimeline.run(1, '2026-06-03 14:30:00', '监控告警：支付接口成功率下降', '系统');
      insertTimeline.run(1, '2026-06-03 14:35:00', '运维人员介入排查', '张三');
      insertTimeline.run(1, '2026-06-03 14:50:00', '确认第三方支付网关故障', '李四');
      insertTimeline.run(1, '2026-06-03 15:10:00', '切换至备用支付通道', '李四');
      insertTimeline.run(1, '2026-06-03 15:45:00', '支付功能恢复正常', '张三');

      insertTimeline.run(2, '2026-06-02 09:15:00', '用户反馈无法获取验证码', '客服');
      insertTimeline.run(2, '2026-06-02 09:25:00', '技术团队开始排查', '王五');
      insertTimeline.run(2, '2026-06-02 09:45:00', '发现短信服务返回限流错误', '王五');
      insertTimeline.run(2, '2026-06-02 10:10:00', '启用备用短信通道', '赵六');
      insertTimeline.run(2, '2026-06-02 10:30:00', '登录功能恢复', '王五');
      
      insertTimeline.finalize();
    }
  });
});

const LEVEL_ORDER = { info: 0, minor: 1, major: 2, critical: 3 };

app.get('/api/faults', (req, res) => {
  const { level, status, search, sortBy, sortOrder, page, pageSize } = req.query;
  let sql = 'SELECT * FROM faults';
  const params = [];
  const conditions = [];
  
  if (level) {
    conditions.push('level = ?');
    params.push(level);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(title LIKE ? OR description LIKE ? OR rootCause LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  const sortField = sortBy || 'startTime';
  const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  if (sortField === 'level') {
    sql += ' ORDER BY CASE level ';
    Object.entries(LEVEL_ORDER).forEach(([lvl, idx]) => {
      sql += `WHEN '${lvl}' THEN ${idx} `;
    });
    sql += `END ${sortDir}`;
  } else if (sortField === 'duration') {
    sql += ` ORDER BY (CASE WHEN endTime IS NOT NULL THEN strftime('%s', endTime) ELSE strftime('%s', 'now') END - strftime('%s', startTime)) ${sortDir}`;
  } else {
    sql += ` ORDER BY ${sortField} ${sortDir}`;
  }
  
  const p = parseInt(page) || 1;
  const ps = parseInt(pageSize) || 10;
  const offset = (p - 1) * ps;
  
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  db.get(countSql, params, (err, countResult) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    sql += ' LIMIT ? OFFSET ?';
    params.push(ps, offset);
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({
        data: rows,
        total: countResult.total,
        page: p,
        pageSize: ps,
        totalPages: Math.ceil(countResult.total / ps)
      });
    });
  });
});

app.get('/api/faults/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM faults WHERE id = ?', [id], (err, fault) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!fault) {
      res.status(404).json({ error: '故障记录不存在' });
      return;
    }
    db.all('SELECT * FROM timelines WHERE faultId = ? ORDER BY time ASC', [id], (err, timelines) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ ...fault, timelines });
    });
  });
});

app.post('/api/faults', (req, res) => {
  const { title, description, level, startTime, endTime, affectedModules, rootCause, solution, status, timelines } = req.body;
  
  db.serialize(() => {
    const stmt = db.prepare(`INSERT INTO faults 
      (title, description, level, originalLevel, startTime, endTime, affectedModules, rootCause, solution, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    stmt.run(title, description, level, level, startTime, endTime, affectedModules, rootCause, solution, status || 'active', function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const faultId = this.lastID;
      
      if (timelines && timelines.length > 0) {
        const timelineStmt = db.prepare(`INSERT INTO timelines 
          (faultId, time, event, operator) VALUES (?, ?, ?, ?)`);
        
        timelines.forEach(tl => {
          timelineStmt.run(faultId, tl.time, tl.event, tl.operator || null);
        });
        
        timelineStmt.finalize();
      }
      
      res.json({ id: faultId, message: '创建成功' });
    });
    
    stmt.finalize();
  });
});

app.put('/api/faults/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, level, startTime, endTime, affectedModules, rootCause, solution, status, timelines } = req.body;
  
  db.serialize(() => {
    db.run(`UPDATE faults SET 
      title = ?, description = ?, level = ?, startTime = ?, endTime = ?, 
      affectedModules = ?, rootCause = ?, solution = ?, status = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [title, description, level, startTime, endTime, affectedModules, rootCause, solution, status || 'active', id],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        if (this.changes === 0) {
          res.status(404).json({ error: '故障记录不存在' });
          return;
        }
        
        db.run('DELETE FROM timelines WHERE faultId = ?', [id], (err) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          
          if (timelines && timelines.length > 0) {
            const timelineStmt = db.prepare(`INSERT INTO timelines 
              (faultId, time, event, operator) VALUES (?, ?, ?, ?)`);
            
            timelines.forEach(tl => {
              timelineStmt.run(id, tl.time, tl.event, tl.operator || null);
            });
            
            timelineStmt.finalize();
          }
          
          res.json({ message: '更新成功' });
        });
      }
    );
  });
});

app.delete('/api/faults/:id', (req, res) => {
  const { id } = req.params;
  
  db.serialize(() => {
    db.run('DELETE FROM timelines WHERE faultId = ?', [id], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.run('DELETE FROM faults WHERE id = ?', [id], function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        if (this.changes === 0) {
          res.status(404).json({ error: '故障记录不存在' });
          return;
        }
        
        res.json({ message: '删除成功' });
      });
    });
  });
});

app.post('/api/faults/batch/update-status', (req, res) => {
  const { ids, status } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供要更新的故障ID列表' });
  }
  if (!status) {
    return res.status(400).json({ error: '请提供目标状态' });
  }
  
  const placeholders = ids.map(() => '?').join(',');
  const sql = `UPDATE faults SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
  const params = [status, ...ids];
  
  db.run(sql, params, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: `成功更新 ${this.changes} 条记录`, updated: this.changes });
  });
});

app.post('/api/faults/batch/delete', (req, res) => {
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供要删除的故障ID列表' });
  }
  
  db.serialize(() => {
    const placeholders = ids.map(() => '?').join(',');
    
    db.run(`DELETE FROM timelines WHERE faultId IN (${placeholders})`, ids, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.run(`DELETE FROM escalation_logs WHERE faultId IN (${placeholders})`, ids, (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        db.run(`DELETE FROM faults WHERE id IN (${placeholders})`, ids, function(err) {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ message: `成功删除 ${this.changes} 条记录`, deleted: this.changes });
        });
      });
    });
  });
});

app.get('/api/faults/:id/escalation-logs', (req, res) => {
  const { id } = req.params;
  db.all('SELECT * FROM escalation_logs WHERE faultId = ? ORDER BY escalatedAt DESC', [id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

const ESCALATION_MAP = {
  info: 'minor',
  minor: 'major',
  major: 'critical',
  critical: 'critical'
};

const LEVEL_LABELS = {
  info: '提示',
  minor: '一般',
  major: '重要',
  critical: '严重'
};

const checkAndEscalateFaults = () => {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  
  db.all(`SELECT * FROM faults 
          WHERE status != 'resolved' 
            AND (lastEscalatedAt IS NULL OR lastEscalatedAt < ?)
            AND (lastEscalatedAt IS NULL OR startTime < ?)
            AND (lastEscalatedAt IS NOT NULL OR startTime < ?)`,
    [twentyFourHoursAgo, twentyFourHoursAgo, twentyFourHoursAgo],
    (err, faults) => {
      if (err) {
        console.error('检查升级故障失败:', err.message);
        return;
      }
      
      faults.forEach(fault => {
        const checkTime = fault.lastEscalatedAt ? new Date(fault.lastEscalatedAt) : new Date(fault.startTime);
        const hoursSinceCheck = (Date.now() - checkTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceCheck >= 24 && fault.level !== 'critical') {
          const oldLevel = fault.level;
          const newLevel = ESCALATION_MAP[oldLevel];
          const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
          
          db.serialize(() => {
            db.run(`UPDATE faults 
                    SET level = ?, escalationCount = COALESCE(escalationCount, 0) + 1, 
                        lastEscalatedAt = ?, updatedAt = CURRENT_TIMESTAMP 
                    WHERE id = ?`,
              [newLevel, now, fault.id],
              (err) => {
                if (err) {
                  console.error(`升级故障 ${fault.id} 失败:`, err.message);
                  return;
                }
                
                db.run(`INSERT INTO escalation_logs 
                        (faultId, oldLevel, newLevel, reason, escalatedAt) 
                        VALUES (?, ?, ?, ?, ?)`,
                  [fault.id, oldLevel, newLevel, 
                   `故障处理超过24小时未解决，自动从${LEVEL_LABELS[oldLevel]}升级为${LEVEL_LABELS[newLevel]}`, 
                   now],
                  (err) => {
                    if (err) {
                      console.error(`记录升级日志失败:`, err.message);
                      return;
                    }
                    console.log(`故障 ${fault.id} 已从 ${oldLevel} 升级为 ${newLevel}`);
                  }
                );
                
                db.run(`INSERT INTO timelines 
                        (faultId, time, event, operator) 
                        VALUES (?, ?, ?, ?)`,
                  [fault.id, now, 
                   `系统自动升级：故障级别从${LEVEL_LABELS[oldLevel]}调整为${LEVEL_LABELS[newLevel]}（处理超过24小时未解决）`, 
                   '系统'],
                  (err) => {
                    if (err) {
                      console.error(`添加时间线记录失败:`, err.message);
                    }
                  }
                );
              }
            );
          });
        }
      });
    }
  );
};

setInterval(checkAndEscalateFaults, 60 * 60 * 1000);
setTimeout(checkAndEscalateFaults, 5000);

app.get('/api/stats', (req, res) => {
  db.serialize(() => {
    db.get('SELECT COUNT(*) as total FROM faults', (err, totalResult) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.get("SELECT COUNT(*) as active FROM faults WHERE status = 'active'", (err, activeResult) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        db.all('SELECT level, COUNT(*) as count FROM faults GROUP BY level', (err, levelResult) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          
          const levelCounts = {};
          levelResult.forEach(item => {
            levelCounts[item.level] = item.count;
          });

          db.get("SELECT AVG(strftime('%s', endTime) - strftime('%s', startTime)) as avgDuration FROM faults WHERE status = 'resolved' AND endTime IS NOT NULL", (err, mttrResult) => {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

            db.all("SELECT DATE(startTime) as date, COUNT(*) as count FROM faults WHERE startTime >= ? GROUP BY DATE(startTime) ORDER BY date ASC", [thirtyDaysAgoStr + ' 00:00:00'], (err, trendResult) => {
              if (err) {
                res.status(500).json({ error: err.message });
                return;
              }

              const trendMap = {};
              trendResult.forEach(item => {
                trendMap[item.date] = item.count;
              });

              const last30DaysTrend = [];
              for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().slice(0, 10);
                last30DaysTrend.push({
                  date: dateStr,
                  count: trendMap[dateStr] || 0
                });
              }

              db.all("SELECT affectedModules FROM faults WHERE affectedModules IS NOT NULL AND affectedModules != ''", (err, modulesResult) => {
                if (err) {
                  res.status(500).json({ error: err.message });
                  return;
                }

                const moduleCounts = {};
                modulesResult.forEach(row => {
                  const modules = row.affectedModules.split(/[,，]/).map(m => m.trim()).filter(m => m);
                  modules.forEach(mod => {
                    moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
                  });
                });

                const moduleDistribution = Object.entries(moduleCounts)
                  .map(([name, value]) => ({ name, value }))
                  .sort((a, b) => b.value - a.value);

                res.json({
                  total: totalResult.total,
                  active: activeResult.active,
                  byLevel: levelCounts,
                  mttrSeconds: mttrResult.avgDuration ? Math.round(mttrResult.avgDuration) : 0,
                  last30DaysTrend,
                  moduleDistribution
                });
              });
            });
          });
        });
      });
    });
  });
});

const REQUIRED_CSV_HEADERS = ['title', 'level', 'startTime'];
const OPTIONAL_CSV_HEADERS = ['description', 'endTime', 'affectedModules', 'rootCause', 'solution', 'status'];
const VALID_LEVELS = ['critical', 'major', 'minor', 'info'];
const VALID_STATUSES = ['active', 'resolved', 'monitoring'];

const validateDatetime = (str) => {
  if (!str) return true;
  const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (!regex.test(str)) return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
};

const parseCSV = (csvText) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(csvText);
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

app.post('/api/faults/batch/validate', async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      return res.status(400).json({ error: '请提供CSV数据' });
    }

    const rows = await parseCSV(csvText);
    const headers = Object.keys(rows[0] || {}).map(h => h.trim());

    const missingHeaders = REQUIRED_CSV_HEADERS.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        error: '缺少必要的列',
        missingHeaders,
        requiredHeaders: REQUIRED_CSV_HEADERS,
        optionalHeaders: OPTIONAL_CSV_HEADERS
      });
    }

    const validRows = [];
    const errors = [];

    rows.forEach((row, index) => {
      const rowErrors = [];
      const rowNum = index + 2;

      if (!row.title || !row.title.trim()) {
        rowErrors.push(`第${rowNum}行: 标题不能为空`);
      }

      if (!row.level || !VALID_LEVELS.includes(row.level.trim())) {
        rowErrors.push(`第${rowNum}行: 级别必须是 ${VALID_LEVELS.join(', ')} 之一`);
      }

      if (!row.startTime || !validateDatetime(row.startTime.trim())) {
        rowErrors.push(`第${rowNum}行: 开始时间格式必须为 YYYY-MM-DD HH:MM:SS`);
      }

      if (row.endTime && row.endTime.trim() && !validateDatetime(row.endTime.trim())) {
        rowErrors.push(`第${rowNum}行: 结束时间格式必须为 YYYY-MM-DD HH:MM:SS`);
      }

      if (row.status && row.status.trim() && !VALID_STATUSES.includes(row.status.trim())) {
        rowErrors.push(`第${rowNum}行: 状态必须是 ${VALID_STATUSES.join(', ')} 之一`);
      }

      if (row.endTime && row.startTime && row.endTime.trim() && row.startTime.trim()) {
        const start = new Date(row.startTime.trim()).getTime();
        const end = new Date(row.endTime.trim()).getTime();
        if (end < start) {
          rowErrors.push(`第${rowNum}行: 结束时间不能早于开始时间`);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        validRows.push({
          title: row.title.trim(),
          description: row.description?.trim() || '',
          level: row.level.trim(),
          startTime: row.startTime.trim(),
          endTime: row.endTime?.trim() || null,
          affectedModules: row.affectedModules?.trim() || '',
          rootCause: row.rootCause?.trim() || '',
          solution: row.solution?.trim() || '',
          status: row.status?.trim() || 'active'
        });
      }
    });

    res.json({
      total: rows.length,
      valid: validRows.length,
      invalid: errors.length > 0 ? rows.length - validRows.length : 0,
      errors,
      previewData: validRows.slice(0, 10),
      validData: validRows
    });
  } catch (err) {
    console.error('校验CSV失败:', err);
    res.status(500).json({ error: '解析CSV文件失败: ' + err.message });
  }
});

app.post('/api/faults/batch/import', (req, res) => {
  const { records } = req.body;

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: '请提供要导入的故障记录' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const insertStmt = db.prepare(`INSERT INTO faults 
      (title, description, level, originalLevel, startTime, endTime, affectedModules, rootCause, solution, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    let successCount = 0;
    const failedRecords = [];

    records.forEach((record, index) => {
      try {
        insertStmt.run(
          record.title,
          record.description || '',
          record.level,
          record.level,
          record.startTime,
          record.endTime || null,
          record.affectedModules || '',
          record.rootCause || '',
          record.solution || '',
          record.status || 'active',
          function(err) {
            if (err) {
              failedRecords.push({
                row: index + 1,
                record,
                error: err.message
              });
            } else {
              successCount++;
            }
          }
        );
      } catch (err) {
        failedRecords.push({
          row: index + 1,
          record,
          error: err.message
        });
      }
    });

    insertStmt.finalize();

    db.run('COMMIT', (commitErr) => {
      if (commitErr) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: '导入失败，事务已回滚: ' + commitErr.message });
      }

      res.json({
        message: `导入完成`,
        success: successCount,
        failed: failedRecords.length,
        failedRecords
      });
    });
  });
});

app.get('/api/faults/:id/export-word', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM faults WHERE id = ?', [id], (err, fault) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!fault) {
      return res.status(404).json({ error: '故障记录不存在' });
    }

    db.all('SELECT * FROM timelines WHERE faultId = ? ORDER BY time ASC', [id], async (timelineErr, timelines) => {
      if (timelineErr) {
        return res.status(500).json({ error: timelineErr.message });
      }

      const levelLabels = { critical: '严重', major: '重要', minor: '一般', info: '提示' };
      const statusLabels = { active: '处理中', resolved: '已解决', monitoring: '监控中' };
      const modules = fault.affectedModules ? fault.affectedModules.split(/[,，]/).map(m => m.trim()).filter(Boolean) : [];

      const getDuration = () => {
        if (!fault.endTime) return '处理中';
        const start = new Date(fault.startTime).getTime();
        const end = new Date(fault.endTime).getTime();
        const diff = Math.floor((end - start) / 1000 / 60);
        if (diff < 60) return `${diff} 分钟`;
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
      };

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: '故障复盘报告',
                  bold: true,
                  size: 36,
                  font: '微软雅黑'
                })
              ]
            }),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 600 },
              children: [
                new TextRun({
                  text: fault.title,
                  bold: true,
                  size: 28,
                  font: '微软雅黑',
                  color: 'dc2626'
                })
              ]
            }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 20, type: WidthType.PERCENTAGE },
                      shading: { fill: 'f1f5f9' },
                      children: [new Paragraph({ children: [new TextRun({ text: '故障级别', bold: true, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: levelLabels[fault.level] || fault.level, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      width: { size: 20, type: WidthType.PERCENTAGE },
                      shading: { fill: 'f1f5f9' },
                      children: [new Paragraph({ children: [new TextRun({ text: '当前状态', bold: true, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: statusLabels[fault.status] || fault.status, font: '微软雅黑', size: 24 })] })]
                    })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      shading: { fill: 'f1f5f9' },
                      children: [new Paragraph({ children: [new TextRun({ text: '开始时间', bold: true, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: fault.startTime, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      shading: { fill: 'f1f5f9' },
                      children: [new Paragraph({ children: [new TextRun({ text: '结束时间', bold: true, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: fault.endTime || '-', font: '微软雅黑', size: 24 })] })]
                    })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      shading: { fill: 'f1f5f9' },
                      children: [new Paragraph({ children: [new TextRun({ text: '持续时间', bold: true, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: getDuration(), font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      shading: { fill: 'f1f5f9' },
                      children: [new Paragraph({ children: [new TextRun({ text: '报告编号', bold: true, font: '微软雅黑', size: 24 })] })]
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: `FAULT-${String(fault.id).padStart(4, '0')}`, font: '微软雅黑', size: 24 })] })]
                    })
                  ]
                })
              ]
            }),

            new Paragraph({ spacing: { before: 400, after: 200 }, children: [] }),

            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({ text: '一、故障描述', bold: true, font: '微软雅黑', size: 28 })
              ]
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({ text: fault.description || '无', font: '微软雅黑', size: 24 })
              ]
            }),

            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({ text: '二、受影响模块', bold: true, font: '微软雅黑', size: 28 })
              ]
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: modules.length > 0 ? modules.join('、') : '无',
                  font: '微软雅黑',
                  size: 24
                })
              ]
            }),

            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({ text: '三、时间线', bold: true, font: '微软雅黑', size: 28 })
              ]
            }),
            ...(timelines && timelines.length > 0 ? timelines.map((tl, idx) => [
              new Paragraph({
                spacing: { before: 100, after: 50 },
                children: [
                  new TextRun({ text: `${idx + 1}. ${tl.time}`, bold: true, font: '微软雅黑', size: 24, color: '2563eb' })
                ]
              }),
              new Paragraph({
                spacing: { after: 100 },
                indent: { left: 400 },
                children: [
                  new TextRun({ text: `事件：${tl.event}`, font: '微软雅黑', size: 24 })
                ]
              }),
              ...(tl.operator ? [new Paragraph({
                spacing: { after: 100 },
                indent: { left: 400 },
                children: [
                  new TextRun({ text: `操作人：${tl.operator}`, font: '微软雅黑', size: 24 })
                ]
              })] : [])
            ]).flat() : [
              new Paragraph({
                children: [
                  new TextRun({ text: '无时间线记录', font: '微软雅黑', size: 24 })
                ]
              })
            ]),

            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({ text: '四、根因分析', bold: true, font: '微软雅黑', size: 28 })
              ]
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({ text: fault.rootCause || '待分析', font: '微软雅黑', size: 24 })
              ]
            }),

            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({ text: '五、解决方案', bold: true, font: '微软雅黑', size: 28 })
              ]
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({ text: fault.solution || '待完善', font: '微软雅黑', size: 24 })
              ]
            }),

            new Paragraph({
              spacing: { before: 600, after: 200 },
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `报告生成时间：${new Date().toLocaleString('zh-CN')}`,
                  font: '微软雅黑',
                  size: 20,
                  color: '64748b'
                })
              ]
            })
          ]
        }]
      });

      try {
        const buffer = await Packer.toBuffer(doc);
        const fileName = `故障复盘报告_${fault.title.replace(/[\\/:*?"<>|]/g, '_')}_${fault.id}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.send(buffer);
      } catch (docErr) {
        console.error('生成Word文档失败:', docErr);
        res.status(500).json({ error: '生成Word文档失败: ' + docErr.message });
      }
    });
  });
});

app.get('/api/faults/csv-template', (req, res) => {
  const headers = [...REQUIRED_CSV_HEADERS, ...OPTIONAL_CSV_HEADERS];
  const csvContent = headers.join(',') + '\n' +
    '支付系统超时,critical,2026-06-03 14:30:00,用户无法完成支付,2026-06-03 15:45:00,支付模块,订单模块,第三方网关故障,切换备用通道,resolved\n' +
    '登录异常,major,2026-06-02 09:15:00,验证码发送失败,2026-06-02 10:30:00,用户模块,认证模块,短信限流,接入备用通道,resolved';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="faults_import_template.csv"');
  res.send('\ufeff' + csvContent);
});

app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});
