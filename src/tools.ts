/**
 * MCP Tools for Actual Budget
 * Defines all the tools that Claude can use to interact with Actual Budget
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import ActualBudgetClient from './actual-client.js';

export function registerTools(server: McpServer, client: ActualBudgetClient) {
  // ============ Account Tools ============

  server.registerTool(
    'get_accounts',
    {
      title: '取得所有帳戶',
      description:
        'Get all accounts with their names, types, and current balances. Use this to see available accounts before adding transactions.',
      inputSchema: {},
      outputSchema: {
        accounts: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            balance: z.number(),
            offbudget: z.boolean(),
            closed: z.boolean(),
          })
        ),
      },
    },
    async () => {
      const accounts = await client.getAccounts();
      const accountsWithBalance = await Promise.all(
        accounts.map(async (acc) => ({
          id: acc.id,
          name: acc.name,
          balance: ActualBudgetClient.fromAmount(
            await client.getAccountBalance(acc.id)
          ),
          offbudget: acc.offbudget || false,
          closed: acc.closed || false,
        }))
      );

      const output = { accounts: accountsWithBalance };
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'get_account_balance',
    {
      title: '查詢帳戶餘額',
      description: 'Get the current balance of a specific account by ID or name.',
      inputSchema: {
        account: z.string().describe('Account ID or name'),
      },
      outputSchema: {
        account_name: z.string(),
        balance: z.number(),
      },
    },
    async ({ account }) => {
      const accounts = await client.getAccounts();
      const found = accounts.find(
        (a) => a.id === account || a.name.toLowerCase() === account.toLowerCase()
      );

      if (!found) {
        throw new Error(`Account not found: ${account}`);
      }

      const balance = await client.getAccountBalance(found.id);
      const output = {
        account_name: found.name,
        balance: ActualBudgetClient.fromAmount(balance),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ Transaction Tools ============

  server.registerTool(
    'add_transaction',
    {
      title: '新增交易/記帳',
      description:
        'Add a new transaction (expense or income). Amount should be positive for income, negative for expenses. Use payee_name to specify who you paid or received from.',
      inputSchema: {
        account: z.string().describe('Account ID or name'),
        amount: z
          .number()
          .describe('Amount in currency (positive for income, negative for expense)'),
        payee_name: z.string().optional().describe('Payee/merchant name'),
        category: z.string().optional().describe('Category ID or name'),
        notes: z.string().optional().describe('Transaction notes'),
        date: z
          .string()
          .optional()
          .describe('Date in YYYY-MM-DD format (defaults to today)'),
      },
      outputSchema: {
        success: z.boolean(),
        transaction_id: z.string(),
        message: z.string(),
      },
    },
    async ({ account, amount, payee_name, category, notes, date }) => {
      // Find account
      const accounts = await client.getAccounts();
      const foundAccount = accounts.find(
        (a) => a.id === account || a.name.toLowerCase() === account.toLowerCase()
      );

      if (!foundAccount) {
        throw new Error(`Account not found: ${account}`);
      }

      // Find category if provided
      let categoryId: string | undefined;
      if (category) {
        const categories = await client.getCategories();
        const foundCategory = categories.find(
          (c) =>
            c.id === category || c.name.toLowerCase() === category.toLowerCase()
        );
        categoryId = foundCategory?.id;
      }

      const transactionId = await client.addTransaction({
        account: foundAccount.id,
        date: date || ActualBudgetClient.getToday(),
        amount: ActualBudgetClient.toAmount(amount),
        payee_name,
        category: categoryId,
        notes,
      });

      const output = {
        success: true,
        transaction_id: transactionId,
        message: `Transaction added: ${Math.abs(amount)} ${amount < 0 ? 'expense' : 'income'} to ${foundAccount.name}`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'get_transactions',
    {
      title: '查詢交易記錄',
      description:
        'Get transactions for an account within a date range. Returns transaction details including amount, payee, category, and notes.',
      inputSchema: {
        account: z.string().describe('Account ID or name'),
        start_date: z
          .string()
          .optional()
          .describe('Start date in YYYY-MM-DD format (defaults to 30 days ago)'),
        end_date: z
          .string()
          .optional()
          .describe('End date in YYYY-MM-DD format (defaults to today)'),
      },
      outputSchema: {
        account_name: z.string(),
        transactions: z.array(
          z.object({
            id: z.string(),
            date: z.string(),
            amount: z.number(),
            payee: z.string().optional(),
            category: z.string().optional(),
            notes: z.string().optional(),
            cleared: z.boolean().optional(),
          })
        ),
        total_count: z.number(),
      },
    },
    async ({ account, start_date, end_date }) => {
      const accounts = await client.getAccounts();
      const foundAccount = accounts.find(
        (a) => a.id === account || a.name.toLowerCase() === account.toLowerCase()
      );

      if (!foundAccount) {
        throw new Error(`Account not found: ${account}`);
      }

      // Default to last 30 days
      const endDate = end_date || ActualBudgetClient.getToday();
      const startDate =
        start_date ||
        ActualBudgetClient.formatDate(
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        );

      const transactions = await client.getTransactions(
        foundAccount.id,
        startDate,
        endDate
      );

      // Get payees and categories for name resolution
      const payees = await client.getPayees();
      const categories = await client.getCategories();

      const payeeMap = new Map(payees.map((p) => [p.id, p.name]));
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

      const formattedTransactions = transactions.map((t: any) => ({
        id: t.id,
        date: t.date,
        amount: ActualBudgetClient.fromAmount(t.amount),
        payee: t.payee ? payeeMap.get(t.payee) : undefined,
        category: t.category ? categoryMap.get(t.category) : undefined,
        notes: t.notes,
        cleared: t.cleared,
      }));

      const output = {
        account_name: foundAccount.name,
        transactions: formattedTransactions,
        total_count: formattedTransactions.length,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'search_transactions',
    {
      title: '搜尋交易',
      description:
        'Search transactions across all accounts by payee name, notes, or amount range.',
      inputSchema: {
        payee: z.string().optional().describe('Search by payee name (partial match)'),
        notes: z.string().optional().describe('Search by notes content (partial match)'),
        min_amount: z.number().optional().describe('Minimum amount (absolute value)'),
        max_amount: z.number().optional().describe('Maximum amount (absolute value)'),
        start_date: z.string().optional().describe('Start date in YYYY-MM-DD format'),
        end_date: z.string().optional().describe('End date in YYYY-MM-DD format'),
        limit: z.number().optional().describe('Maximum number of results (default 50)'),
      },
      outputSchema: {
        transactions: z.array(
          z.object({
            id: z.string(),
            account: z.string(),
            date: z.string(),
            amount: z.number(),
            payee: z.string().optional(),
            category: z.string().optional(),
            notes: z.string().optional(),
          })
        ),
        total_count: z.number(),
      },
    },
    async ({ payee, notes, min_amount, max_amount, start_date, end_date, limit }) => {
      const accounts = await client.getAccounts();
      const payees = await client.getPayees();
      const categories = await client.getCategories();

      const payeeMap = new Map(payees.map((p) => [p.id, p.name]));
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
      const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

      const endDate = end_date || ActualBudgetClient.getToday();
      const startDate =
        start_date ||
        ActualBudgetClient.formatDate(
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        );

      // Get transactions from all accounts
      const allTransactions: any[] = [];
      for (const acc of accounts.filter((a) => !a.closed)) {
        const transactions = await client.getTransactions(
          acc.id,
          startDate,
          endDate
        );
        allTransactions.push(
          ...transactions.map((t: any) => ({ ...t, accountId: acc.id }))
        );
      }

      // Filter transactions
      let filtered = allTransactions;

      if (payee) {
        const searchPayee = payee.toLowerCase();
        filtered = filtered.filter((t) => {
          const payeeName = t.payee ? payeeMap.get(t.payee) : undefined;
          return payeeName?.toLowerCase().includes(searchPayee);
        });
      }

      if (notes) {
        const searchNotes = notes.toLowerCase();
        filtered = filtered.filter(
          (t) => t.notes?.toLowerCase().includes(searchNotes)
        );
      }

      if (min_amount !== undefined) {
        const minAmt = ActualBudgetClient.toAmount(min_amount);
        filtered = filtered.filter((t) => Math.abs(t.amount) >= minAmt);
      }

      if (max_amount !== undefined) {
        const maxAmt = ActualBudgetClient.toAmount(max_amount);
        filtered = filtered.filter((t) => Math.abs(t.amount) <= maxAmt);
      }

      // Sort by date descending and limit
      filtered.sort((a, b) => b.date.localeCompare(a.date));
      const maxResults = limit || 50;
      filtered = filtered.slice(0, maxResults);

      const formattedTransactions = filtered.map((t) => ({
        id: t.id,
        account: accountMap.get(t.accountId) || 'Unknown',
        date: t.date,
        amount: ActualBudgetClient.fromAmount(t.amount),
        payee: t.payee ? payeeMap.get(t.payee) : undefined,
        category: t.category ? categoryMap.get(t.category) : undefined,
        notes: t.notes,
      }));

      const output = {
        transactions: formattedTransactions,
        total_count: formattedTransactions.length,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ NEW: Update Transaction ============

  server.registerTool(
    'update_transaction',
    {
      title: '更新交易',
      description:
        'Update an existing transaction. You can modify the amount, category, payee, notes, date, or cleared status.',
      inputSchema: {
        id: z.string().describe('Transaction ID to update'),
        amount: z.number().optional().describe('New amount (positive for income, negative for expense)'),
        category: z.string().optional().describe('New category ID or name'),
        payee_name: z.string().optional().describe('New payee/merchant name'),
        notes: z.string().optional().describe('New notes'),
        date: z.string().optional().describe('New date in YYYY-MM-DD format'),
        cleared: z.boolean().optional().describe('Mark as cleared or not'),
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
    },
    async ({ id, amount, category, payee_name, notes, date, cleared }) => {
      const updates: any = {};

      if (amount !== undefined) {
        updates.amount = ActualBudgetClient.toAmount(amount);
      }

      if (category) {
        const categories = await client.getCategories();
        const foundCategory = categories.find(
          (c) => c.id === category || c.name.toLowerCase() === category.toLowerCase()
        );
        if (foundCategory) {
          updates.category = foundCategory.id;
        }
      }

      if (payee_name !== undefined) {
        updates.payee_name = payee_name;
      }

      if (notes !== undefined) {
        updates.notes = notes;
      }

      if (date !== undefined) {
        updates.date = date;
      }

      if (cleared !== undefined) {
        updates.cleared = cleared;
      }

      await client.updateTransaction(id, updates);

      const output = {
        success: true,
        message: `Transaction ${id} updated successfully`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ NEW: Delete Transaction ============

  server.registerTool(
    'delete_transaction',
    {
      title: '刪除交易',
      description: 'Delete a transaction by its ID. This action cannot be undone.',
      inputSchema: {
        id: z.string().describe('Transaction ID to delete'),
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
    },
    async ({ id }) => {
      await client.deleteTransaction(id);

      const output = {
        success: true,
        message: `Transaction ${id} deleted successfully`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ Category Tools ============

  server.registerTool(
    'get_categories',
    {
      title: '取得所有類別',
      description:
        'Get all spending categories organized by groups. Use this to find category IDs for adding transactions.',
      inputSchema: {},
      outputSchema: {
        category_groups: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            is_income: z.boolean(),
            categories: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
              })
            ),
          })
        ),
      },
    },
    async () => {
      const groups = await client.getCategoryGroups();
      const categories = await client.getCategories();

      const output = {
        category_groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          is_income: g.is_income || false,
          categories: categories
            .filter((c) => c.group_id === g.id)
            .map((c) => ({
              id: c.id,
              name: c.name,
            })),
        })),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ Budget Tools ============

  server.registerTool(
    'get_budget_month',
    {
      title: '查看月預算',
      description:
        'Get the budget summary for a specific month, including budgeted amounts, spending, and remaining balance for each category.',
      inputSchema: {
        month: z
          .string()
          .optional()
          .describe('Month in YYYY-MM format (defaults to current month)'),
      },
      outputSchema: {
        month: z.string(),
        to_budget: z.number(),
        total_budgeted: z.number(),
        total_spent: z.number(),
        category_groups: z.array(
          z.object({
            name: z.string(),
            budgeted: z.number(),
            spent: z.number(),
            balance: z.number(),
            categories: z.array(
              z.object({
                name: z.string(),
                budgeted: z.number(),
                spent: z.number(),
                balance: z.number(),
              })
            ),
          })
        ),
      },
    },
    async ({ month }) => {
      const targetMonth = month || ActualBudgetClient.getCurrentMonth();
      const budget = await client.getBudgetMonth(targetMonth);

      let totalSpent = 0;
      const groups = budget.categoryGroups.map((g) => {
        const groupSpent = g.categories.reduce((sum, c) => sum + Math.abs(c.spent), 0);
        totalSpent += groupSpent;

        return {
          name: g.name,
          budgeted: ActualBudgetClient.fromAmount(g.budgeted),
          spent: ActualBudgetClient.fromAmount(groupSpent),
          balance: ActualBudgetClient.fromAmount(g.balance),
          categories: g.categories.map((c) => ({
            name: c.name,
            budgeted: ActualBudgetClient.fromAmount(c.budgeted),
            spent: ActualBudgetClient.fromAmount(Math.abs(c.spent)),
            balance: ActualBudgetClient.fromAmount(c.balance),
          })),
        };
      });

      const output = {
        month: targetMonth,
        to_budget: ActualBudgetClient.fromAmount(budget.toBudget),
        total_budgeted: ActualBudgetClient.fromAmount(budget.totalBudgeted),
        total_spent: ActualBudgetClient.fromAmount(totalSpent),
        category_groups: groups,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'set_budget_amount',
    {
      title: '設定類別預算',
      description: 'Set the budgeted amount for a specific category in a given month.',
      inputSchema: {
        month: z
          .string()
          .optional()
          .describe('Month in YYYY-MM format (defaults to current month)'),
        category: z.string().describe('Category ID or name'),
        amount: z.number().describe('Budget amount in currency'),
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
    },
    async ({ month, category, amount }) => {
      const targetMonth = month || ActualBudgetClient.getCurrentMonth();

      // Find category
      const categories = await client.getCategories();
      const foundCategory = categories.find(
        (c) =>
          c.id === category || c.name.toLowerCase() === category.toLowerCase()
      );

      if (!foundCategory) {
        throw new Error(`Category not found: ${category}`);
      }

      await client.setBudgetAmount(
        targetMonth,
        foundCategory.id,
        ActualBudgetClient.toAmount(amount)
      );

      const output = {
        success: true,
        message: `Set budget for "${foundCategory.name}" to ${amount} for ${targetMonth}`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ Payee Tools ============

  server.registerTool(
    'get_payees',
    {
      title: '取得所有收款人/商家',
      description:
        'Get all payees (merchants/people you pay or receive money from). Useful for finding exact payee names.',
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe('Optional search term to filter payees'),
      },
      outputSchema: {
        payees: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
          })
        ),
        total_count: z.number(),
      },
    },
    async ({ search }) => {
      let payees = await client.getPayees();

      // Filter out transfer payees and apply search
      payees = payees.filter((p) => !p.transfer_acct);

      if (search) {
        const searchLower = search.toLowerCase();
        payees = payees.filter((p) =>
          p.name.toLowerCase().includes(searchLower)
        );
      }

      const output = {
        payees: payees.map((p) => ({
          id: p.id,
          name: p.name,
        })),
        total_count: payees.length,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ Summary Tools ============

  server.registerTool(
    'get_spending_summary',
    {
      title: '取得支出摘要',
      description:
        'Get a spending summary by category for a specific period. Great for understanding where money is going.',
      inputSchema: {
        start_date: z
          .string()
          .optional()
          .describe('Start date in YYYY-MM-DD format (defaults to start of current month)'),
        end_date: z
          .string()
          .optional()
          .describe('End date in YYYY-MM-DD format (defaults to today)'),
      },
      outputSchema: {
        period: z.object({
          start: z.string(),
          end: z.string(),
        }),
        total_spent: z.number(),
        total_income: z.number(),
        net: z.number(),
        by_category: z.array(
          z.object({
            category: z.string(),
            amount: z.number(),
            percentage: z.number(),
          })
        ),
      },
    },
    async ({ start_date, end_date }) => {
      const endDate = end_date || ActualBudgetClient.getToday();
      const startDate =
        start_date ||
        (() => {
          const d = new Date();
          d.setDate(1);
          return ActualBudgetClient.formatDate(d);
        })();

      const accounts = await client.getAccounts();
      const categories = await client.getCategories();
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

      // Collect all transactions
      const allTransactions: any[] = [];
      for (const acc of accounts.filter((a) => !a.closed && !a.offbudget)) {
        const transactions = await client.getTransactions(
          acc.id,
          startDate,
          endDate
        );
        allTransactions.push(...transactions);
      }

      // Calculate totals by category
      const categoryTotals = new Map<string, number>();
      let totalSpent = 0;
      let totalIncome = 0;

      for (const t of allTransactions) {
        const amount = t.amount;
        if (amount < 0) {
          totalSpent += Math.abs(amount);
          const catName = t.category
            ? categoryMap.get(t.category) || 'Uncategorized'
            : 'Uncategorized';
          categoryTotals.set(
            catName,
            (categoryTotals.get(catName) || 0) + Math.abs(amount)
          );
        } else {
          totalIncome += amount;
        }
      }

      // Sort categories by amount
      const byCategory = Array.from(categoryTotals.entries())
        .map(([category, amount]) => ({
          category,
          amount: ActualBudgetClient.fromAmount(amount),
          percentage:
            totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      const output = {
        period: { start: startDate, end: endDate },
        total_spent: ActualBudgetClient.fromAmount(totalSpent),
        total_income: ActualBudgetClient.fromAmount(totalIncome),
        net: ActualBudgetClient.fromAmount(totalIncome - totalSpent),
        by_category: byCategory,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ NEW: Schedule Tools ============

  server.registerTool(
    'get_schedules',
    {
      title: '查看定期交易/帳單',
      description:
        'Get all scheduled/recurring transactions. Shows upcoming bills, subscriptions, and recurring income.',
      inputSchema: {},
      outputSchema: {
        schedules: z.array(
          z.object({
            id: z.string(),
            name: z.string().optional(),
            next_date: z.string().optional(),
            frequency: z.string().optional(),
            amount: z.number().optional(),
            payee: z.string().optional(),
            account: z.string().optional(),
            completed: z.boolean().optional(),
          })
        ),
        total_count: z.number(),
      },
    },
    async () => {
      const schedules = await client.getSchedules();
      const accounts = await client.getAccounts();
      const payees = await client.getPayees();

      const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
      const payeeMap = new Map(payees.map((p) => [p.id, p.name]));

      const formattedSchedules = schedules.map((s: any) => {
        // Parse amount - could be a number or object with num1/num2
        let amount: number | undefined;
        if (typeof s._amount === 'number') {
          amount = ActualBudgetClient.fromAmount(s._amount);
        } else if (s._amount && typeof s._amount === 'object' && 'num1' in s._amount) {
          amount = ActualBudgetClient.fromAmount(s._amount.num1);
        }

        // Parse frequency from date config
        let frequency: string | undefined;
        if (s._date && typeof s._date === 'object' && 'frequency' in s._date) {
          const interval = s._date.interval || 1;
          const freq = s._date.frequency;
          if (interval === 1) {
            frequency = freq;
          } else {
            frequency = `every ${interval} ${freq}`;
          }
        }

        return {
          id: s.id,
          name: s.name,
          next_date: s.next_date,
          frequency,
          amount,
          payee: s._payee ? payeeMap.get(s._payee) : undefined,
          account: s._account ? accountMap.get(s._account) : undefined,
          completed: s.completed,
        };
      });

      const output = {
        schedules: formattedSchedules,
        total_count: formattedSchedules.length,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'create_schedule',
    {
      title: '建立定期交易',
      description:
        'Create a new scheduled/recurring transaction. Great for setting up recurring bills, subscriptions, or regular income.',
      inputSchema: {
        name: z.string().optional().describe('Name/description of the schedule'),
        account: z.string().describe('Account ID or name'),
        payee: z.string().optional().describe('Payee/merchant name'),
        amount: z.number().describe('Amount (negative for expense, positive for income)'),
        start_date: z.string().describe('Start date in YYYY-MM-DD format'),
        frequency: z
          .enum(['daily', 'weekly', 'monthly', 'yearly'])
          .describe('How often this repeats'),
        interval: z
          .number()
          .optional()
          .describe('Interval between occurrences (default 1, e.g., 2 = every 2 weeks)'),
        end_mode: z
          .enum(['never', 'after_n_occurrences', 'on_date'])
          .optional()
          .describe('When to stop the schedule'),
        end_occurrences: z
          .number()
          .optional()
          .describe('Number of occurrences if end_mode is after_n_occurrences'),
        end_date: z
          .string()
          .optional()
          .describe('End date if end_mode is on_date'),
        posts_transaction: z
          .boolean()
          .optional()
          .describe('Auto-post transactions when due (default false)'),
      },
      outputSchema: {
        success: z.boolean(),
        schedule_id: z.string(),
        message: z.string(),
      },
    },
    async ({
      name,
      account,
      payee,
      amount,
      start_date,
      frequency,
      interval,
      end_mode,
      end_occurrences,
      end_date,
      posts_transaction,
    }) => {
      // Find account
      const accounts = await client.getAccounts();
      const foundAccount = accounts.find(
        (a) => a.id === account || a.name.toLowerCase() === account.toLowerCase()
      );

      if (!foundAccount) {
        throw new Error(`Account not found: ${account}`);
      }

      // Find or create payee
      let payeeId: string | undefined;
      if (payee) {
        const payees = await client.getPayees();
        const foundPayee = payees.find(
          (p) => p.name.toLowerCase() === payee.toLowerCase()
        );
        if (foundPayee) {
          payeeId = foundPayee.id;
        } else {
          payeeId = await client.createPayee(payee);
        }
      }

      const scheduleInput: any = {
        name,
        account: foundAccount.id,
        payee: payeeId,
        amount: ActualBudgetClient.toAmount(amount),
        posts_transaction: posts_transaction || false,
        date: {
          frequency,
          start: start_date,
          interval: interval || 1,
          endMode: end_mode || 'never',
          endOccurrences: end_occurrences,
          endDate: end_date,
        },
      };

      const scheduleId = await client.createSchedule(scheduleInput);

      const output = {
        success: true,
        schedule_id: scheduleId,
        message: `Created ${frequency} schedule "${name || 'Unnamed'}" starting ${start_date}`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    'delete_schedule',
    {
      title: '刪除定期交易',
      description: 'Delete a scheduled/recurring transaction by its ID.',
      inputSchema: {
        id: z.string().describe('Schedule ID to delete'),
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
    },
    async ({ id }) => {
      await client.deleteSchedule(id);

      const output = {
        success: true,
        message: `Schedule ${id} deleted successfully`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // ============ Sync Tool ============

  server.registerTool(
    'sync_budget',
    {
      title: '同步預算',
      description:
        'Synchronize the budget with the server. Use this after making changes to ensure data is saved.',
      inputSchema: {},
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
    },
    async () => {
      await client.sync();
      const output = {
        success: true,
        message: 'Budget synchronized successfully',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
