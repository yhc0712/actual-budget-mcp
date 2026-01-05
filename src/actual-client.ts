/**
 * Actual Budget API Wrapper
 * Handles all interactions with the Actual Budget server
 */

import api from '@actual-app/api';

export interface ActualConfig {
  serverURL: string;
  password: string;
  budgetId: string;
  encryptionPassword?: string;
  dataDir?: string;
}

export interface Transaction {
  id?: string;
  account: string;
  date: string;
  amount: number;
  payee?: string;
  payee_name?: string;
  category?: string;
  notes?: string;
  imported_id?: string;
  cleared?: boolean;
}

export interface Account {
  id: string;
  name: string;
  offbudget?: boolean;
  closed?: boolean;
}

export interface Category {
  id: string;
  name: string;
  group_id?: string;
  is_income?: boolean;
}

export interface CategoryGroup {
  id: string;
  name: string;
  is_income?: boolean;
  categories?: Category[];
}

export interface Payee {
  id: string;
  name: string;
  category?: string;
  transfer_acct?: string;
}

export interface BudgetMonth {
  month: string;
  incomeAvailable: number;
  lastMonthOverspent: number;
  forNextMonth: number;
  totalBudgeted: number;
  toBudget: number;
  categoryGroups: CategoryGroupBudget[];
}

export interface CategoryGroupBudget {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  balance: number;
  categories: CategoryBudget[];
}

export interface CategoryBudget {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  balance: number;
  carryover: boolean;
}

export interface Schedule {
  id: string;
  name?: string;
  rule?: string;
  next_date?: string;
  completed?: boolean;
  posts_transaction?: boolean;
  _payee?: string;
  _account?: string;
  _amount?: number | { num1: number; num2: number };
  _amountOp?: 'is' | 'isapprox' | 'isbetween';
  _date?: ScheduleDate;
}

export interface ScheduleDate {
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  start?: string;
  endMode?: 'never' | 'after_n_occurrences' | 'on_date';
  endOccurrences?: number;
  endDate?: string;
  skipWeekend?: boolean;
  weekendSolveMode?: 'before' | 'after';
  patterns?: SchedulePattern[];
}

export interface SchedulePattern {
  type: 'day' | 'dayOfWeek' | 'dayOfMonth';
  value: number;
}

export interface CreateScheduleInput {
  name?: string;
  posts_transaction?: boolean;
  payee?: string;
  account?: string;
  amount?: number | { num1: number; num2: number };
  amountOp?: 'is' | 'isapprox' | 'isbetween';
  date: string | ScheduleDate;
}

class ActualBudgetClient {
  private config: ActualConfig;
  private initialized = false;

  constructor(config: ActualConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await api.init({
      serverURL: this.config.serverURL,
      password: this.config.password,
      dataDir: this.config.dataDir || '/tmp/actual-data',
    });

    if (this.config.encryptionPassword) {
      await api.downloadBudget(this.config.budgetId, {
        password: this.config.encryptionPassword,
      });
    } else {
      await api.downloadBudget(this.config.budgetId);
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (this.initialized) {
      await api.shutdown();
      this.initialized = false;
    }
  }

  async sync(): Promise<void> {
    await this.ensureInitialized();
    await api.sync();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  // ============ Accounts ============

  async getAccounts(): Promise<Account[]> {
    await this.ensureInitialized();
    const accounts = await api.getAccounts();
    return accounts as Account[];
  }

  async getAccountBalance(accountId: string): Promise<number> {
    await this.ensureInitialized();
    const balance = await api.getAccountBalance(accountId);
    return balance;
  }

  // ============ Transactions ============

  async getTransactions(
    accountId: string,
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    await this.ensureInitialized();
    const transactions = await api.getTransactions(accountId, startDate, endDate);
    return transactions as Transaction[];
  }

  async addTransaction(transaction: Transaction): Promise<string> {
    await this.ensureInitialized();
    const result = await api.importTransactions(transaction.account, [
      {
        account: transaction.account,
        date: transaction.date,
        amount: transaction.amount,
        payee: transaction.payee,
        payee_name: transaction.payee_name,
        category: transaction.category,
        notes: transaction.notes,
        cleared: transaction.cleared,
      },
    ]);
    await api.sync();
    return result.added[0] || 'unknown';
  }

  async importTransactions(
    accountId: string,
    transactions: Omit<Transaction, 'account'>[]
  ): Promise<{ added: string[]; updated: string[] }> {
    await this.ensureInitialized();
    const transactionsWithAccount = transactions.map(t => ({
      ...t,
      account: accountId,
    }));
    const result = await api.importTransactions(accountId, transactionsWithAccount);
    await api.sync();
    return { added: result.added, updated: result.updated };
  }

  async updateTransaction(
    id: string,
    fields: Partial<Transaction>
  ): Promise<void> {
    await this.ensureInitialized();
    await api.updateTransaction(id, fields);
    await api.sync();
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.ensureInitialized();
    await api.deleteTransaction(id);
    await api.sync();
  }

  // ============ Categories ============

  async getCategories(): Promise<Category[]> {
    await this.ensureInitialized();
    const categories = await api.getCategories();
    return categories as Category[];
  }

  async getCategoryGroups(): Promise<CategoryGroup[]> {
    await this.ensureInitialized();
    const groups = await api.getCategoryGroups();
    return groups as CategoryGroup[];
  }

  // ============ Payees ============

  async getPayees(): Promise<Payee[]> {
    await this.ensureInitialized();
    const payees = await api.getPayees();
    return payees as Payee[];
  }

  async createPayee(name: string): Promise<string> {
    await this.ensureInitialized();
    const id = await api.createPayee({ name });
    await api.sync();
    return id;
  }

  // ============ Budget ============

  async getBudgetMonths(): Promise<string[]> {
    await this.ensureInitialized();
    return await api.getBudgetMonths();
  }

  async getBudgetMonth(month: string): Promise<BudgetMonth> {
    await this.ensureInitialized();
    const budget = await api.getBudgetMonth(month) as any;
    
    // Transform the API response to match our interface
    const categoryGroups: CategoryGroupBudget[] = (budget.categoryGroups || []).map((g: any) => ({
      id: g.id || '',
      name: g.name || '',
      budgeted: g.budgeted || 0,
      spent: g.spent || 0,
      balance: g.balance || 0,
      categories: (g.categories || []).map((c: any) => ({
        id: c.id || '',
        name: c.name || '',
        budgeted: c.budgeted || 0,
        spent: c.spent || 0,
        balance: c.balance || 0,
        carryover: c.carryover || false,
      })),
    }));

    return {
      month: budget.month || month,
      incomeAvailable: budget.incomeAvailable || 0,
      lastMonthOverspent: budget.lastMonthOverspent || 0,
      forNextMonth: budget.forNextMonth || 0,
      totalBudgeted: budget.totalBudgeted || 0,
      toBudget: budget.toBudget || 0,
      categoryGroups,
    };
  }

  async setBudgetAmount(
    month: string,
    categoryId: string,
    amount: number
  ): Promise<void> {
    await this.ensureInitialized();
    await api.setBudgetAmount(month, categoryId, amount);
    await api.sync();
  }

  // ============ Schedules ============

  async getSchedules(): Promise<Schedule[]> {
    await this.ensureInitialized();
    const schedules = await api.getSchedules();
    return schedules as Schedule[];
  }

  async createSchedule(schedule: CreateScheduleInput): Promise<string> {
    await this.ensureInitialized();
    const id = await api.createSchedule(schedule as any);
    await api.sync();
    return id;
  }

  async updateSchedule(id: string, fields: Partial<CreateScheduleInput>): Promise<void> {
    await this.ensureInitialized();
    await api.updateSchedule(id, fields as any);
    await api.sync();
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.ensureInitialized();
    await api.deleteSchedule(id);
    await api.sync();
  }

  // ============ Utilities ============

  /**
   * Convert currency amount to integer (Actual uses integers internally)
   * e.g., $12.34 -> 1234
   */
  static toAmount(value: number): number {
    return Math.round(value * 100);
  }

  /**
   * Convert integer amount to currency
   * e.g., 1234 -> $12.34
   */
  static fromAmount(value: number): number {
    return value / 100;
  }

  /**
   * Format date to YYYY-MM-DD
   */
  static formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Format month to YYYY-MM
   */
  static formatMonth(date: Date): string {
    return date.toISOString().slice(0, 7);
  }

  /**
   * Get current month in YYYY-MM format
   */
  static getCurrentMonth(): string {
    return this.formatMonth(new Date());
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  static getToday(): string {
    return this.formatDate(new Date());
  }
}

export default ActualBudgetClient;
