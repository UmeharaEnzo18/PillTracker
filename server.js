const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── MSSQL CONFIG ────────────────────────────────────────────────────────────
const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'SuaSenha123!',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'PillTracker',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let pool;

async function connectDB() {
  try {
    pool = await sql.connect(dbConfig);
    console.log('✅ Conectado ao MSSQL');
    await initDB();
  } catch (err) {
    console.error('❌ Erro ao conectar ao MSSQL:', err.message);
    console.log('⚠️  Rodando em modo localStorage (sem banco)');
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
  console.log('✅ Tabelas verificadas/criadas');
}

// ─── ROTAS ───────────────────────────────────────────────────────────────────

// GET todos os trackers + count de hoje
app.get('/api/trackers', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.request().input('today', sql.Date, today).query(`
      SELECT 
        t.id, t.name, t.color, t.icon, t.daily_goal,
        ISNULL(p.count, 0) AS today_count
      FROM Trackers t
      LEFT JOIN PillLogs p ON t.id = p.tracker_id AND p.log_date = @today
      ORDER BY t.created_at
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST criar tracker
app.post('/api/trackers', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  const { name, color, icon, daily_goal } = req.body;
  try {
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('color', sql.NVarChar, color)
      .input('icon', sql.NVarChar, icon)
      .input('daily_goal', sql.Int, daily_goal)
      .query(`
        INSERT INTO Trackers (name, color, icon, daily_goal)
        OUTPUT INSERTED.*
        VALUES (@name, @color, @icon, @daily_goal)
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE tracker
app.delete('/api/trackers/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  try {
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Trackers WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST incrementar dose de hoje
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET histórico dos últimos 7 dias
app.get('/api/trackers/:id/history', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'DB não disponível' });
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT log_date, count 
        FROM PillLogs 
        WHERE tracker_id = @id AND log_date >= DATEADD(day, -6, CAST(GETDATE() AS DATE))
        ORDER BY log_date
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  connectDB();
});
