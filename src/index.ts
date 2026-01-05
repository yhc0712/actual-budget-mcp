/**
 * Actual Budget MCP Server
 * 
 * A Model Context Protocol server that exposes Actual Budget functionality
 * to AI assistants like Claude.
 * 
 * Supports both Streamable HTTP (for remote deployment) and stdio (for local use).
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import ActualBudgetClient from './actual-client.js';
import { registerTools } from './tools.js';

// Configuration from environment variables
const config = {
  // Actual Budget connection
  actualServerURL: process.env.ACTUAL_SERVER_URL || 'http://localhost:5006',
  actualPassword: process.env.ACTUAL_PASSWORD || '',
  actualBudgetId: process.env.ACTUAL_BUDGET_ID || '',
  actualEncryptionPassword: process.env.ACTUAL_ENCRYPTION_PASSWORD,
  actualDataDir: process.env.ACTUAL_DATA_DIR || '/data/actual-cache',

  // MCP Server settings
  port: parseInt(process.env.PORT || '3000'),
  transport: process.env.MCP_TRANSPORT || 'http', // 'http' or 'stdio'
  
  // Auth token for URL-based authentication
  authToken: process.env.MCP_AUTH_TOKEN || '',
};

// Validate required configuration
function validateConfig() {
  const missing: string[] = [];
  
  if (!config.actualPassword) missing.push('ACTUAL_PASSWORD');
  if (!config.actualBudgetId) missing.push('ACTUAL_BUDGET_ID');
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('\nRequired environment variables:');
    console.error('  ACTUAL_SERVER_URL     - URL of your Actual Budget server');
    console.error('  ACTUAL_PASSWORD       - Password for Actual Budget server');
    console.error('  ACTUAL_BUDGET_ID      - Sync ID of your budget (from Settings → Show advanced settings)');
    console.error('\nOptional environment variables:');
    console.error('  ACTUAL_ENCRYPTION_PASSWORD - If your budget uses end-to-end encryption');
    console.error('  ACTUAL_DATA_DIR            - Directory for cached budget data (default: /data/actual-cache)');
    console.error('  PORT                       - HTTP server port (default: 3000)');
    console.error('  MCP_TRANSPORT              - Transport type: "http" or "stdio" (default: http)');
    process.exit(1);
  }
}

// Create the MCP server
function createMcpServer(client: ActualBudgetClient): McpServer {
  const server = new McpServer({
    name: 'actual-budget-mcp',
    version: '1.2.0',
  });

  // Register all tools
  registerTools(server, client);

  return server;
}

// Start with HTTP transport (for remote deployment)
async function startHttpServer(mcpServer: McpServer) {
  const app = express();
  app.use(express.json());

  // Token authentication middleware
  const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Skip auth if no token configured
    if (!config.authToken) {
      return next();
    }

    // Check token from query param or Authorization header
    const tokenFromQuery = req.query.token as string;
    const tokenFromHeader = req.headers.authorization?.replace('Bearer ', '');
    const providedToken = tokenFromQuery || tokenFromHeader;

    if (!providedToken || providedToken !== config.authToken) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Invalid or missing token',
        },
        id: null,
      });
    }

    next();
  };

  // Health check endpoint (no auth required)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', server: 'actual-budget-mcp' });
  });

  // MCP endpoint - Streamable HTTP (with auth)
  app.post('/mcp', authenticateToken, async (req, res) => {
    try {
      // Create a new transport for each request (stateless mode)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      res.on('close', () => {
        transport.close();
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Handle GET for SSE (for clients that support it)
  app.get('/mcp', authenticateToken, async (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST for MCP requests.',
      },
      id: null,
    });
  });

  app.listen(config.port, () => {
    const authStatus = config.authToken ? 'Enabled (token required)' : 'Disabled (open access)';
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Actual Budget MCP Server                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:    Running                                           ║
║  Transport: Streamable HTTP                                   ║
║  Endpoint:  http://localhost:${config.port}/mcp${' '.repeat(Math.max(0, 27 - config.port.toString().length))}║
║  Health:    http://localhost:${config.port}/health${' '.repeat(Math.max(0, 24 - config.port.toString().length))}║
║  Auth:      ${authStatus.padEnd(48)}║
╠═══════════════════════════════════════════════════════════════╣
║  Connected to: ${config.actualServerURL.slice(0, 44).padEnd(44)}║
║  Budget ID:    ${config.actualBudgetId.slice(0, 44).padEnd(44)}║
╚═══════════════════════════════════════════════════════════════╝
${config.authToken ? `
MCP URL: http://your-server:${config.port}/mcp?token=YOUR_TOKEN
` : `
Add to Claude.ai Connectors with URL: http://your-server:${config.port}/mcp
`}
    `);
  }).on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

// Start with stdio transport (for local use)
async function startStdioServer(mcpServer: McpServer) {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  
  // Log to stderr so it doesn't interfere with stdio
  console.error('Actual Budget MCP Server started (stdio transport)');
}

// Main entry point
async function main() {
  validateConfig();

  // Create Actual Budget client
  const actualClient = new ActualBudgetClient({
    serverURL: config.actualServerURL,
    password: config.actualPassword,
    budgetId: config.actualBudgetId,
    encryptionPassword: config.actualEncryptionPassword,
    dataDir: config.actualDataDir,
  });

  // Initialize connection to Actual Budget
  console.log('Connecting to Actual Budget server...');
  try {
    await actualClient.init();
    console.log('Connected to Actual Budget successfully!');
  } catch (error) {
    console.error('Failed to connect to Actual Budget:', error);
    process.exit(1);
  }

  // Create MCP server
  const mcpServer = createMcpServer(actualClient);

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await actualClient.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await actualClient.shutdown();
    process.exit(0);
  });

  // Start appropriate transport
  if (config.transport === 'stdio') {
    await startStdioServer(mcpServer);
  } else {
    await startHttpServer(mcpServer);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
