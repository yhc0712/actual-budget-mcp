# Actual Budget MCP Server

讓 Claude 幫你記帳！這是一個 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 伺服器，讓 AI 助手可以與你的 [Actual Budget](https://actualbudget.org/) 互動。

## 功能

透過自然語言與 Claude 對話來管理你的預算：

- 📝 **記帳** - 「幫我記帳，今天在全聯花了 $350 買日用品」
- 💰 **查詢餘額** - 「我的現金帳戶還有多少錢？」
- 📊 **預算追蹤** - 「這個月餐飲花了多少？還剩多少預算？」
- 🔍 **搜尋交易** - 「上個月在 Costco 的消費有哪些？」
- 📈 **支出分析** - 「幫我分析這個月的支出分佈」

## 支援的工具

| 工具 | 說明 |
|------|------|
| `get_accounts` | 取得所有帳戶及餘額 |
| `get_account_balance` | 查詢特定帳戶餘額 |
| `add_transaction` | 新增交易（收入/支出） |
| `get_transactions` | 查詢帳戶交易記錄 |
| `search_transactions` | 搜尋交易（依收款人、備註、金額） |
| `get_categories` | 取得所有類別 |
| `get_budget_month` | 查看月預算概覽 |
| `set_budget_amount` | 設定類別預算金額 |
| `get_payees` | 取得所有收款人/商家 |
| `get_spending_summary` | 取得支出摘要分析 |
| `sync_budget` | 同步預算資料 |

## 快速開始

### 前置需求

- 運作中的 Actual Budget 伺服器
- 密碼認證（OpenID 用戶需同時啟用密碼登入）
- Docker（用於部署）

### 1. 取得 Budget Sync ID

在 Actual Budget 中：
1. 進入 **Settings**
2. 點擊 **Show advanced settings**
3. 複製 **Sync ID**

### 2. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`：

```env
ACTUAL_SERVER_URL=http://your-actual-server:5006
ACTUAL_PASSWORD=your-password
ACTUAL_BUDGET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 如果有啟用端對端加密
# ACTUAL_ENCRYPTION_PASSWORD=your-encryption-password
```

### 3. 使用 Docker 部署

```bash
# 建置映像
docker build -t actual-budget-mcp .

# 執行
docker run -d \
  --name actual-budget-mcp \
  -p 3000:3000 \
  --env-file .env \
  actual-budget-mcp
```

或使用 Docker Compose：

```bash
docker-compose up -d
```

### 4. 連接到 Claude

在 claude.ai 中設定 Connector：

1. 進入 **Settings** → **Connectors**
2. 點擊 **Add Connector**
3. 選擇 **MCP**
4. 輸入 URL：`http://your-server:3000/mcp`

## TrueNAS Scale 部署

### 使用 Custom App

1. 在 TrueNAS Scale 中，進入 **Apps** → **Discover Apps** → **Custom App**

2. 設定如下：

   **Application Name:** `actual-budget-mcp`
   
   **Image Repository:** 你的 Docker registry 或本地建置
   
   **Container Images:**
   - Image: `actual-budget-mcp:latest`
   
   **Container Environment Variables:**
   ```
   ACTUAL_SERVER_URL=http://actual-budget:5006
   ACTUAL_PASSWORD=your-password
   ACTUAL_BUDGET_ID=your-sync-id
   ```
   
   **Networking:**
   - Port: 3000 → 3000 (TCP)
   
   **Storage:**
   - Host Path: `/mnt/your-pool/actual-mcp-cache`
   - Mount Path: `/data/actual-cache`

3. 如果 Actual Budget 也在 TrueNAS 上，確保它們在同一個網路中。

### 與現有 Actual Budget 整合

如果你的 Actual Budget 已經部署在 TrueNAS：

```yaml
# 在 docker-compose.yml 中設定網路
services:
  actual-budget-mcp:
    # ...
    environment:
      - ACTUAL_SERVER_URL=http://actual-budget:5006  # 使用容器名稱
    networks:
      - actual-network

networks:
  actual-network:
    external: true  # 使用現有網路
```

## 本地開發

```bash
# 安裝依賴
npm install

# 開發模式（需要 .env）
npm run dev

# 建置
npm run build

# 執行
npm start
```

## API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/mcp` | POST | MCP 請求端點 |
| `/health` | GET | 健康檢查 |

## 使用範例

設定好 Connector 後，你可以這樣與 Claude 對話：

```
你：幫我記帳，昨天在星巴克花了 $180

Claude：✅ 已新增交易：
- 帳戶：現金
- 金額：-$180
- 收款人：星巴克
- 日期：2024-12-29

需要指定類別嗎？
```

```
你：這個月的預算執行狀況如何？

Claude：以下是 2024-12 的預算摘要：

📊 整體狀況
- 可分配：$5,000
- 已預算：$45,000
- 已支出：$32,450

📁 分類明細
| 類別 | 預算 | 已花費 | 剩餘 |
|------|------|--------|------|
| 餐飲 | $8,000 | $6,200 | $1,800 |
| 交通 | $3,000 | $2,100 | $900 |
| 日用品 | $5,000 | $4,350 | $650 |
...
```

## 故障排除

### 連線失敗

1. 確認 Actual Budget 伺服器正在運行
2. 檢查 `ACTUAL_SERVER_URL` 是否正確
3. 如果使用 Docker 網路，確認容器名稱正確

### 認證失敗

1. 確認密碼正確
2. 如果使用 OpenID，確保同時啟用密碼登入：
   ```json
   // config.json
   {
     "allowedLoginMethods": ["password", "openid"]
   }
   ```

### Budget 找不到

1. 確認 `ACTUAL_BUDGET_ID` 是正確的 Sync ID
2. Sync ID 在 Actual Budget 的 Settings → Show advanced settings 中

### 加密錯誤

如果 budget 有啟用端對端加密，需要設定 `ACTUAL_ENCRYPTION_PASSWORD`

## 授權

MIT License

## 相關資源

- [Actual Budget](https://actualbudget.org/)
- [Actual Budget API 文件](https://actualbudget.org/docs/api/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
