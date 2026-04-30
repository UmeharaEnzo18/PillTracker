const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve o frontend da pasta ./frontend (relativa ao server.js)
app.use(express.static(path.join(__dirname, 'frontend')));

// ─── PERSISTÊNCIA DE CONFIG ──────────────────────────────────────────────────
// Salva as credenciais em config.json na mesma pasta do server.js
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log('Configuração carregada de config.json');
      return saved;
    }
  } catch (e) {
    console.log('Erro ao ler config.json, usando padrões.');
  }
  return {
    user:     process.env.DB_USER     || 'sa',
    password: process.env.DB_PASSWORD || '',
    server:   process.env.DB_SERVER   || 'localhost',
    database: process.env.DB_NAME     || 'PillTracker',
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('Configuração salva em config.json');
  } catch (e) {
    console.error('Não foi possível salvar config.json:', e.message);
  }
}

let dbConfig = {
  ...loadConfig(),
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 6000,
};

// ─── CONEXÃO ─────────────────────────────────────────────────────────────────
let pool = null;
let dbStatus = { connected: false, error: null };

async function connectDB(customConfig) {
  if (customConfig) {
    dbConfig = { ...dbConfig, ...customConfig };
    // Persiste as novas credenciais
    saveConfig({
      user:     dbConfig.user,
      password: dbConfig.password,
      server:   dbConfig.server,
      database: dbConfig.database,
    });
  }

  dbStatus = { connected: false, error: null };

  try {
    if (pool) { try { await pool.close(); } catch {} pool = null; }
    pool = await sql.connect(dbConfig);
    await initDB();
    dbStatus = { connected: true, error: null };
    console.log('Conectado ao MSSQL -', dbConfig.server, '/', dbConfig.database);
  } catch (err) {
    pool = null;
    const msg = err.message || '';
    let field = null;
    if (/Login failed|password|credentials/i.test(msg)) field = 'password';
    else if (/ECONNREFUSED|connect|server|host|getaddrinfo/i.test(msg)) field = 'server';
    else if (/Cannot open database|database/i.test(msg)) field = 'database';
    else if (/Login|user/i.test(msg)) field = 'user';
    dbStatus = { connected: false, error: { message: msg, field } };
    console.error('Erro MSSQL:', msg);
  }
}

async function initDB() {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Trackers' AND xtype='U')
    CREATE TABLE Trackers (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(100) NOT NULL,
      color NVARCHAR(20) NOT NULL,
      icon NVARCHAR(10) NOT NULL,
      daily_goal INT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT GETDATE()
    );
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PillLogs' AND xtype='U')
    CREATE TABLE PillLogs (
      id INT IDENTITY(1,1) PRIMARY KEY,
      tracker_id INT NOT NULL,
      log_date DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      count INT NOT NULL DEFAULT 0,
      FOREIGN KEY (tracker_id) REFERENCES Trackers(id) ON DELETE CASCADE,
      CONSTRAINT UQ_tracker_date UNIQUE (tracker_id, log_date)
    );
  `);
}

// ─── STATUS ───────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    ...dbStatus,
    config: { user: dbConfig.user, server: dbConfig.server, database: dbConfig.database }
  });
});

// ─── RECONECTAR ───────────────────────────────────────────────────────────────
app.post('/api/reconnect', async (req, res) => {
  const { user, password, server, database } = req.body;
  await connectDB({ user, password, server, database });
  res.json({
    ...dbStatus,
    config: { user: dbConfig.user, server: dbConfig.server, database: dbConfig.database }
  });
});

// ─── ROTAS ────────────────────────────────────────────────────────────────────
app.get('/api/trackers', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.request().input('today', sql.Date, today).query(`
      SELECT t.id, t.name, t.color, t.icon, t.daily_goal,
        ISNULL(p.count, 0) AS today_count
      FROM Trackers t
      LEFT JOIN PillLogs p ON t.id = p.tracker_id AND p.log_date = @today
      ORDER BY t.created_at
    `);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/trackers', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  const { name, color, icon, daily_goal } = req.body;
  try {
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('color', sql.NVarChar, color)
      .input('icon', sql.NVarChar, icon)
      .input('daily_goal', sql.Int, daily_goal)
      .query(`INSERT INTO Trackers (name, color, icon, daily_goal) OUTPUT INSERTED.* VALUES (@name, @color, @icon, @daily_goal)`);
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT editar tracker
app.put('/api/trackers/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  const { name, color, icon, daily_goal } = req.body;
  try {
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('color', sql.NVarChar, color)
      .input('icon', sql.NVarChar, icon)
      .input('daily_goal', sql.Int, daily_goal)
      .query('UPDATE Trackers SET name=@name, color=@color, icon=@icon, daily_goal=@daily_goal WHERE id=@id');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST remover uma dose do dia (decrementar)
app.post('/api/trackers/:id/remove', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  const today = new Date().toISOString().split('T')[0];
  try {
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('today', sql.Date, today)
      .query('UPDATE PillLogs SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END WHERE tracker_id=@id AND log_date=@today');
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('today', sql.Date, today)
      .query('SELECT ISNULL((SELECT count FROM PillLogs WHERE tracker_id=@id AND log_date=@today), 0) AS count');
    res.json({ count: result.recordset[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/trackers/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  try {
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Trackers WHERE id = @id');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/trackers/:id/take', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  const today = new Date().toISOString().split('T')[0];
  try {
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('today', sql.Date, today)
      .query(`
        MERGE PillLogs AS target
        USING (SELECT @id AS tracker_id, @today AS log_date) AS source
        ON target.tracker_id = source.tracker_id AND target.log_date = source.log_date
        WHEN MATCHED THEN UPDATE SET count = count + 1
        WHEN NOT MATCHED THEN INSERT (tracker_id, log_date, count) VALUES (@id, @today, 1);
      `);
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('today', sql.Date, today)
      .query('SELECT count FROM PillLogs WHERE tracker_id = @id AND log_date = @today');
    res.json({ count: result.recordset[0]?.count || 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/trackers/:id/history', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT log_date, count FROM PillLogs WHERE tracker_id = @id AND log_date >= DATEADD(day, -6, CAST(GETDATE() AS DATE)) ORDER BY log_date`);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor em http://localhost:${PORT}`);
  connectDB();
});