# Actual Budget MCP Server

Let Claude manage your budget! This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI assistants to interact with your [Actual Budget](https://actualbudget.org/).

## Features

Manage your budget through natural language conversations with Claude:

- 📝 **Add Transactions** - "Add a transaction: $350 at Whole Foods for groceries"
- 💰 **Check Balances** - "What's my checking account balance?"
- 🔄 **Transfer Money** - "Transfer $500 from checking to savings"
- 📊 **Budget Tracking** - "How much have I spent on dining this month?"
- 🔍 **Search Transactions** - "Show me all Costco purchases last month"
- 📈 **Spending Analysis** - "Analyze my spending breakdown for this month"
- 📥 **Batch Import** - Import multiple transactions from CSV or structured data

## Supported Tools

| Tool | Description |
|------|-------------|
| `get_accounts` | Get all accounts with balances |
| `get_account_balance` | Query specific account balance |
| `add_transaction` | Add transaction (income/expense/transfer) |
| `import_transactions` | Batch import multiple transactions |
| `get_transactions` | Query account transaction history |
| `search_transactions` | Search transactions by payee, notes, or amount |
| `update_transaction` | Update existing transaction |
| `delete_transaction` | Delete a transaction |
| `get_categories` | Get all budget categories |
| `get_budget_month` | View monthly budget overview |
| `set_budget_amount` | Set category budget amount |
| `get_payees` | Get all payees/merchants |
| `get_spending_summary` | Get spending summary analysis |
| `get_schedules` | View recurring transactions/bills |
| `create_schedule` | Create recurring transaction |
| `delete_schedule` | Delete recurring transaction |
| `sync_budget` | Sync budget data |

## Quick Start

### Prerequisites

- Running Actual Budget server
- Password authentication (OpenID users need to enable password login)
- Docker (for deployment)

### 1. Get Budget Sync ID

In Actual Budget:
1. Go to **Settings**
2. Click **Show advanced settings**
3. Copy the **Sync ID**

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
ACTUAL_SERVER_URL=http://your-actual-server:5006
ACTUAL_PASSWORD=your-password
ACTUAL_BUDGET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# If you have end-to-end encryption enabled
# ACTUAL_ENCRYPTION_PASSWORD=your-encryption-password
```

### 3. Deploy with Docker

```bash
# Build image
docker build -t actual-budget-mcp .

# Run
docker run -d \
  --name actual-budget-mcp \
  -p 3000:3000 \
  --env-file .env \
  actual-budget-mcp
```

Or use Docker Compose:

```bash
docker-compose up -d
```

### 4. Connect to Claude

Configure the Connector in claude.ai:

1. Go to **Settings** → **Connectors**
2. Click **Add Connector**
3. Select **MCP**
4. Enter URL: `http://your-server:3000/mcp`

## TrueNAS Scale Deployment

### Using Custom App

1. In TrueNAS Scale, go to **Apps** → **Discover Apps** → **Custom App**

2. Configure as follows:

   **Application Name:** `actual-budget-mcp`

   **Image Repository:** Your Docker registry or local build

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

3. If Actual Budget is also on TrueNAS, ensure they're on the same network.

### Integration with Existing Actual Budget

If your Actual Budget is already deployed on TrueNAS:

```yaml
# Configure network in docker-compose.yml
services:
  actual-budget-mcp:
    # ...
    environment:
      - ACTUAL_SERVER_URL=http://actual-budget:5006  # Use container name
    networks:
      - actual-network

networks:
  actual-network:
    external: true  # Use existing network
```

## Local Development

```bash
# Install dependencies
npm install

# Development mode (requires .env)
npm run dev

# Build
npm run build

# Run
npm start
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP request endpoint |
| `/health` | GET | Health check |

## Usage Examples

After configuring the Connector, you can interact with Claude like this:

### Adding a Regular Transaction

```
You: Add a transaction: $180 at Starbucks yesterday

Claude: ✅ Transaction added:
- Account: Checking
- Amount: -$180
- Payee: Starbucks
- Date: 2024-12-29

Would you like to specify a category?
```

### Transferring Between Accounts

```
You: Transfer $500 from checking to savings

Claude: ✅ Transfer created:
- From: Checking
- To: Savings
- Amount: $500
- Date: 2024-12-30

The transfer has been recorded in both accounts.
```

### Batch Importing Transactions

```
You: Import these transactions to my checking account:
- Jan 1: $50 at Grocery Store (Food)
- Jan 2: $100 at Gas Station (Transportation)
- Jan 3: $25 at Coffee Shop (Dining)

Claude: ✅ Imported 3 transactions:
- Added: 3
- Updated: 0

All transactions have been imported successfully.
```

### Viewing Budget Status

```
You: How's my budget for this month?

Claude: Here's your budget summary for 2024-12:

📊 Overall Status
- To Budget: $5,000
- Total Budgeted: $45,000
- Total Spent: $32,450

📁 Category Breakdown
| Category | Budgeted | Spent | Remaining |
|----------|----------|-------|-----------|
| Dining | $8,000 | $6,200 | $1,800 |
| Transportation | $3,000 | $2,100 | $900 |
| Groceries | $5,000 | $4,350 | $650 |
...
```

## New Features in v1.2.0

### Transfer Transactions

The `add_transaction` tool now supports the `transfer_to` parameter for creating transfers between accounts:

```json
{
  "account": "Checking",
  "amount": -100,
  "transfer_to": "Savings",
  "notes": "Monthly savings"
}
```

This automatically creates matching transactions in both accounts using Actual Budget's transfer mechanism.

### Batch Import Transactions

The new `import_transactions` tool allows bulk importing of transactions with improved performance:

```json
{
  "account": "Checking",
  "transactions": [
    {
      "date": "2024-01-01",
      "amount": -50.00,
      "payee_name": "Grocery Store",
      "category": "Food",
      "imported_id": "txn_001"
    },
    {
      "date": "2024-01-02",
      "amount": -100.00,
      "payee_name": "Gas Station",
      "category": "Transportation",
      "imported_id": "txn_002"
    }
  ]
}
```

Benefits:
- Single API call instead of multiple individual calls
- Better duplicate detection using `imported_id`
- Proper rule application across entire batch
- Returns detailed counts of added/updated transactions

## Troubleshooting

### Connection Failed

1. Verify Actual Budget server is running
2. Check that `ACTUAL_SERVER_URL` is correct
3. If using Docker networking, verify container names are correct

### Authentication Failed

1. Verify password is correct
2. If using OpenID, ensure password login is also enabled:
   ```json
   // config.json
   {
     "allowedLoginMethods": ["password", "openid"]
   }
   ```

### Budget Not Found

1. Verify `ACTUAL_BUDGET_ID` is the correct Sync ID
2. Find Sync ID in Actual Budget's Settings → Show advanced settings

### Encryption Error

If your budget has end-to-end encryption enabled, you need to set `ACTUAL_ENCRYPTION_PASSWORD`

## License

MIT License

## Related Resources

- [Actual Budget](https://actualbudget.org/)
- [Actual Budget API Documentation](https://actualbudget.org/docs/api/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
