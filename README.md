# 💊 PillTracker

Rastreador de comprimidos com persistência em **MSSQL** e fallback em `localStorage`.

---

## 📁 Estrutura

```
pill-tracker/
├── backend/
│   ├── server.js       ← API Node.js + Express + MSSQL
│   └── package.json
└── frontend/
    └── index.html      ← Interface completa (abre direto no navegador)
```

---

## 🚀 Setup do Backend (MSSQL)

### 1. Instale as dependências
```bash
cd backend
npm install
```

### 2. Configure o banco
Edite as variáveis no topo de `server.js` ou crie um `.env`:

```env
DB_USER=sa
DB_PASSWORD=SuaSenha123!
DB_SERVER=localhost
DB_NAME=PillTracker
PORT=3000
```

> O banco `PillTracker` precisa existir. As tabelas são criadas automaticamente.

### 3. Inicie o servidor
```bash
npm start
# ou em desenvolvimento:
npm run dev
```

### 4. Abra o frontend
Acesse `http://localhost:3000` ou abra `frontend/index.html` diretamente no navegador.

---

## 🗄️ Tabelas criadas automaticamente

```sql
-- Trackers de comprimidos
CREATE TABLE Trackers (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(100) NOT NULL,
  color      NVARCHAR(20)  NOT NULL,
  icon       NVARCHAR(10)  NOT NULL,
  daily_goal INT           NOT NULL DEFAULT 1,
  created_at DATETIME      DEFAULT GETDATE()
);

-- Registro diário de doses
CREATE TABLE PillLogs (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  tracker_id INT  NOT NULL,
  log_date   DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
  count      INT  NOT NULL DEFAULT 0,
  FOREIGN KEY (tracker_id) REFERENCES Trackers(id) ON DELETE CASCADE,
  CONSTRAINT UQ_tracker_date UNIQUE (tracker_id, log_date)
);
```

---

## ⚙️ Modo sem backend

Se o backend não estiver disponível, o app usa **localStorage** automaticamente.
Isso é útil para testar sem banco de dados — basta abrir o `index.html` no navegador.

---

## 🔌 Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/trackers` | Lista todos + count de hoje |
| POST | `/api/trackers` | Cria novo tracker |
| DELETE | `/api/trackers/:id` | Remove tracker |
| POST | `/api/trackers/:id/take` | Registra uma dose hoje |
| GET | `/api/trackers/:id/history` | Histórico dos últimos 7 dias |
