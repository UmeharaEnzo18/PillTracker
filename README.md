# 💊 PillTracker

Rastreador de comprimidos diários com interface web, persistência em **MSSQL** e fallback automático em `localStorage`.

---

## 📁 Estrutura do projeto

```
PillTracker/
├── server.js           ← Backend Node.js + Express
├── package.json
├── config.json         ← Gerado automaticamente (não vai pro Git)
├── .gitignore
└── frontend/
    └── index.html      ← Interface completa
```

---

## 🚀 Instalação e execução

### Pré-requisitos
- [Node.js](https://nodejs.org) (versão LTS recomendada)
- SQL Server com banco `PillTracker` criado ([ver script SQL](#banco-de-dados))

### 1. Instale as dependências
```bash
npm install
```

> A pasta `node_modules` não vai para o repositório. Esse passo é obrigatório após clonar.

### 2. Inicie o servidor
```bash
npm start
```

Na **primeira execução**, o `config.json` é gerado automaticamente com os valores padrão:
```json
{
  "user": "sa",
  "password": "",
  "server": "localhost",
  "database": "PillTracker"
}
```

### 3. Acesse o sistema
Abra o navegador em **http://localhost:3000**

---

## ⚙️ Configuração do banco de dados

Se a conexão falhar, um modal será exibido automaticamente na tela com os campos para corrigir as credenciais. Ao salvar, o `config.json` é atualizado e a conexão é refeita sem precisar reiniciar o servidor.

Você também pode editar o `config.json` diretamente:

```json
{
  "user": "sa",
  "password": "SuaSenha",
  "server": "NOME-PC\\INSTANCIA",
  "database": "PillTracker"
}
```

> ⚠️ `config.json` está no `.gitignore` — suas credenciais nunca vão para o repositório.

---

## 🗄️ Banco de dados

Execute o arquivo `PillTracker.sql` no Azure Data Studio ou SSMS para criar o banco e as tabelas:

```bash
# No SSMS ou Azure Data Studio, abra e execute:
PillTracker.sql
```

**Tabelas criadas:**

| Tabela | Descrição |
|--------|-----------|
| `Trackers` | Comprimidos cadastrados (nome, ícone, cor, meta diária) |
| `PillLogs` | Registro diário de doses por tracker |

---

## 🔌 Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/status` | Status da conexão com o banco |
| `POST` | `/api/reconnect` | Reconectar com novas credenciais |
| `GET` | `/api/trackers` | Lista todos os trackers + doses de hoje |
| `POST` | `/api/trackers` | Cria novo tracker |
| `PUT` | `/api/trackers/:id` | Edita tracker existente |
| `DELETE` | `/api/trackers/:id` | Remove tracker |
| `POST` | `/api/trackers/:id/take` | Registra uma dose (incrementa) |
| `POST` | `/api/trackers/:id/remove` | Remove uma dose (decrementa) |
| `GET` | `/api/trackers/:id/history` | Histórico dos últimos 7 dias |

---

## 📴 Modo offline

Se o backend não estiver acessível, o sistema usa `localStorage` automaticamente como fallback. Os dados ficam salvos no navegador até que a conexão com o banco seja restabelecida.

---

## 📋 .gitignore

```
*.zip
*.7z
*.gz
config.json
node_modules
```