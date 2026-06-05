const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
    startTime TEXT NOT NULL,
    endTime TEXT,
    affectedModules TEXT,
    rootCause TEXT,
    solution TEXT,
    status TEXT DEFAULT 'active',
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

  const stmt = db.prepare('SELECT COUNT(*) as count FROM faults');
  stmt.get((err, row) => {
    if (row.count === 0) {
      const insertFault = db.prepare(`INSERT INTO faults 
        (title, description, level, startTime, endTime, affectedModules, rootCause, solution, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      insertFault.run(
        '支付系统超时',
        '用户无法完成支付，支付网关响应超时',
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

app.get('/api/faults', (req, res) => {
  const { level, status } = req.query;
  let sql = 'SELECT * FROM faults';
  const params = [];
  
  if (level || status) {
    const conditions = [];
    if (level) {
      conditions.push('level = ?');
      params.push(level);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' ORDER BY startTime DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
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
      (title, description, level, startTime, endTime, affectedModules, rootCause, solution, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    stmt.run(title, description, level, startTime, endTime, affectedModules, rootCause, solution, status || 'active', function(err) {
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

app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});
