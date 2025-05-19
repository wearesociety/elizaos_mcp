#!/usr/bin/env node

/**
 * Society ElizaOS Connector MCP - Index
 * 
 * This file implements a FastMCP server that allows communication between
 * Cursor and ElizaOS. It exposes four main tools:
 * - get_status: Get the current connection status and agent settings
 * - list_agents: List all available agents from the ElizaOS server
 * - chat_with_agent: Send a message to the currently selected agent and get a response
 * - set_agent: Switch to a different agent (agent_id and room_id must be identical)
 * 
 * The MCP server uses the stdio transport for communication with Cursor
 * and connects to an ElizaOS server defined by environment variables.
 * 
 * @author Society Team
 * @version 1.0.9
 */

// Global warning filter for FastMCP
const originalWarn = console.warn;
console.warn = (message?: any, ...optionalParams: any[]) => {
  // Don't log warnings about client capabilities
  if (typeof message === 'string' && message.includes('could not infer client capabilities')) {
    return;
  }
  // Log other warnings normally
  originalWarn(message, ...optionalParams);
};

// Keep critical imports only, remove problematic ones
import { ElizaClient } from './ElizaClient.js';
import { ElizaEnvVars, ConnectionState } from './types.js';
import fs from 'fs';
// Import FastMCP for our actual implementation
import { FastMCP } from 'fastmcp';
// Import zod for parameter validation
import { z } from 'zod';
// Import pino for logging silencing
import pino from 'pino';

/**
 * Interface for chat_with_agent tool parameters
 */
interface ChatWithAgentParams {
  message: string;
}

/**
 * Interface for set_agent tool parameters
 */
interface SetAgentParams {
  agent_id: string;
  room_id: string;
}

/**
 * Path to the debug log file
 */
const DEBUG_LOG_FILE = '/tmp/mcp-debug.log';

/**
 * Append a message to the debug log file
 * 
 * @param message - The message to log
 */
function debugLog(message: string): void {
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, `${new Date().toISOString()}: ${message}\n`, 'utf8');
  } catch (error) {
    // Silent fail if debug logging fails
  }
}

// Clear the debug log
try {
  fs.writeFileSync(DEBUG_LOG_FILE, `MCP Debug Log - Started ${new Date().toISOString()}\n`, 'utf8');
} catch (error) {
  // Silent fail for debug logging
}

// Log startup info
debugLog(`Node version: ${process.version}`);
debugLog(`Current dir: ${process.cwd()}`);
try {
  debugLog(`Environment variables: ${JSON.stringify(process.env, (key, value) => 
    key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD') 
      ? '[REDACTED]' 
      : value, 2)}`);
} catch (error) {
  debugLog(`Error logging environment: ${error}`);
}

/**
 * Initialize environment variables from process.env with defaults
 */
const env: ElizaEnvVars = {
  ELIZAOS_SERVER_URL: process.env.ELIZAOS_SERVER_URL || 'http://localhost:3000',
  ELIZAOS_USER_ID: process.env.ELIZAOS_USER_ID || '',
  ELIZAOS_WORLD_ID: process.env.ELIZAOS_WORLD_ID || '',
  ELIZAOS_AGENT_ID: process.env.ELIZAOS_AGENT_ID || '',
  ELIZAOS_ROOM_ID: process.env.ELIZAOS_ROOM_ID || '',
  ELIZAOS_CONNECTION_TIMEOUT: process.env.ELIZAOS_CONNECTION_TIMEOUT,
  ELIZAOS_RESPONSE_TIMEOUT: process.env.ELIZAOS_RESPONSE_TIMEOUT,
  PORT: process.env.PORT
};

// Log loaded environment
debugLog(`Loaded environment: ${JSON.stringify(env, null, 2)}`);

// Validate required environment variables
if (!env.ELIZAOS_USER_ID || !env.ELIZAOS_WORLD_ID) {
  const errorMsg = 'Missing required ElizaOS environment variables (USER_ID, WORLD_ID). Exiting.';
  debugLog(`ERROR: ${errorMsg}`);
  process.stderr.write(`${errorMsg}\n`);
  process.exit(1);
}

try {
  debugLog('Creating ElizaClient');
  /**
   * Create a silent logger that discards all log messages
   * This prevents unwanted log output from interfering with the MCP protocol
   */ 
  const silentLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => silentLogger
  };
  
  /**
   * Initialize the ElizaClient with configuration from environment variables
   * and a silent logger to prevent interference with the MCP protocol
   */
  const elizaClient = new ElizaClient(
    {
      serverUrl: env.ELIZAOS_SERVER_URL,
      userId: env.ELIZAOS_USER_ID,
      worldId: env.ELIZAOS_WORLD_ID,
      agentId: env.ELIZAOS_AGENT_ID || '',
      roomId: env.ELIZAOS_ROOM_ID || '',
      connectionTimeout: env.ELIZAOS_CONNECTION_TIMEOUT ? parseInt(env.ELIZAOS_CONNECTION_TIMEOUT, 10) : undefined,
      responseTimeout: env.ELIZAOS_RESPONSE_TIMEOUT ? parseInt(env.ELIZAOS_RESPONSE_TIMEOUT, 10) : undefined,
    },
    silentLogger as any
  );

  // --- Create FastMCP Server ---
  debugLog('Creating FastMCP Server');
  
  // Set NODE_ENV to production to suppress some development warnings
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  
  // Add environment variable to disable pings if needed
  process.env.MCP_DISABLE_PINGS = process.env.MCP_DISABLE_PINGS || 'true';
  
  /**
   * Create a custom console that filters out specific warnings
   * related to client capabilities inference
   */
  const silentConsole = {
    ...console,
    warn: (message?: any, ...optionalParams: any[]) => {
      // Only log warnings that aren't about client capabilities
      if (typeof message === 'string' && !message.includes('could not infer client capabilities')) {
        console.warn(message, ...optionalParams);
      }
    }
  };
  
  // Temporarily replace console with silent version
  const originalConsole = console;
  // @ts-ignore - Overriding console
  global.console = silentConsole;
  
  /**
   * Initialize the FastMCP server with our connector details
   */
  const fastMcpServer = new FastMCP({ 
    name: 'Society ElizaOS Connector',
    version: '1.0.9'
  });
  
  // Restore original console after initialization
  // @ts-ignore - Restoring console
  global.console = originalConsole;
  
  // Define tool implementations
  debugLog('Defining tools for FastMCP');
  
  /**
   * Tool: get_status
   * 
   * Returns the current connection state and configuration of the ElizaOS client.
   * No parameters required.
   * 
   * @returns A JSON string containing the connection state and client configuration
   */
  fastMcpServer.addTool({
    name: 'get_status',
    description: 'Get the current status of the ElizaOS connection',
    // @ts-ignore - FastMCP typing issues
    execute: async () => {
      try {
        const status = {
          connectionState: elizaClient.getConnectionState(),
          currentAgent: elizaClient.getConfig().agentId,
          currentRoom: elizaClient.getConfig().roomId,
          serverUrl: elizaClient.getConfig().serverUrl,
          userId: elizaClient.getConfig().userId,
          worldId: elizaClient.getConfig().worldId,
          connectionTimeout: elizaClient.getConfig().connectionTimeout,
          responseTimeout: elizaClient.getConfig().responseTimeout,
        };
        
        return JSON.stringify(status, null, 2);
      } catch (error: any) {
        throw new Error(error.message);
      }
    }
  });

  /**
   * Tool: list_agents
   * 
   * Retrieves a list of all available agents from the ElizaOS server.
   * No parameters required.
   * 
   * @returns A JSON string array of agents with their ids and names
   */
  fastMcpServer.addTool({
    name: 'list_agents',
    description: 'List all available agents in ElizaOS',
    // @ts-ignore - FastMCP typing issues
    execute: async () => {
      try {
        const agents = await elizaClient.listAvailableAgents();
        return JSON.stringify(agents, null, 2);
      } catch (error: any) {
        throw new Error(error.message);
      }
    }
  });

  /**
   * Tool: chat_with_agent
   * 
   * Sends a message to the currently selected agent and returns the response.
   * Requires the client to be connected to an agent. Will attempt to connect
   * if not already connected.
   * 
   * @param params - Contains the message to send to the agent
   * @returns A JSON string with the agent's response and metadata
   */
  fastMcpServer.addTool({
    name: 'chat_with_agent',
    description: 'Send a message to the selected agent and get a response',
    parameters: z.object({
      message: z.string().describe('The message to send to the agent.')
    }),
    // @ts-ignore - FastMCP typing issues
    execute: async (params: ChatWithAgentParams) => {
      try {
        const message = params.message;
        
        if (!message) {
          throw new Error('Message is required.');
        }

        // Ensure we have an active connection before sending a message
        if (elizaClient.getConnectionState() !== ConnectionState.CONNECTED) {
          await elizaClient.connect(); // Ensure connection
          if (elizaClient.getConnectionState() !== ConnectionState.CONNECTED) {
            throw new Error('Failed to connect to ElizaOS for chat.');
          }
        }
        
        // Execute the request
        const response = await elizaClient.sendMessageAndGetResponse(message);
        
        // Create a brand new, simplified response object with just the essential data
        // This avoids any references to the original complex object
        const cleanResponse = {
          text: typeof response.text === 'string' ? response.text : 'No response text',
          senderId: typeof response.senderId === 'string' ? response.senderId : 'unknown',
          senderName: typeof response.senderName === 'string' ? response.senderName : 'unknown',
          roomId: typeof response.roomId === 'string' ? response.roomId : 'unknown'
        };
        
        // Stringify and parse to ensure we break any object references
        return JSON.stringify(JSON.parse(JSON.stringify(cleanResponse)), null, 2);
      } catch (error: any) {
        // Return a simple error object that won't have reference issues
        const errorObj = {
          error: true,
          message: error.message || 'Unknown error in chat_with_agent'
        };
        return JSON.stringify(errorObj, null, 2);
      }
    }
  });

  /**
   * Tool: set_agent
   * 
   * Changes the active agent and room for the ElizaOS client.
   * In ElizaOS, the agent_id and room_id must be identical.
   * 
   * @param params - Contains the agent_id and room_id to set
   * @returns A JSON string with the result of the operation
   */
  fastMcpServer.addTool({
    name: 'set_agent',
    description: 'Set the active agent and room for communication',
    parameters: z.object({
      agent_id: z.string().describe('The UUID of the agent to switch to.'),
      room_id: z.string().describe('The UUID of the room to join (must match agent_id).')
    }),
    // @ts-ignore - FastMCP typing issues
    execute: async (params: SetAgentParams) => {
      try {
        const agent_id = params.agent_id;
        const room_id = params.room_id;
        
        if (!agent_id || !room_id) {
          throw new Error('agent_id and room_id are required.');
        }
        
        // ElizaOS requires agent_id and room_id to be identical
        if (agent_id !== room_id) {
          throw new Error('For ElizaOS, agent_id and room_id must be identical.');
        }
        
        // Store old config for reporting
        const oldConfig = {
          agentId: elizaClient.getConfig().agentId,
          roomId: elizaClient.getConfig().roomId
        };

        // Update the client configuration
        await elizaClient.setConfig({
          agentId: agent_id,
          roomId: room_id,
        });

        // Check connection state *after* setConfig, as setConfig might trigger a reconnect
        if (elizaClient.getConnectionState() === ConnectionState.CONNECTED) {
          const responseData = {
            success: true,
            message: `Agent and room set successfully. Old agent/room: ${oldConfig.agentId}/${oldConfig.roomId}. New agent/room: ${agent_id}/${room_id}.`,
            oldConfig: oldConfig,
            newConfig: {
              agentId: agent_id,
              roomId: room_id
            }
          };
          // Return a stringified JSON, similar to get_status and list_agents
          // Use JSON.parse + JSON.stringify to break any object references
          return JSON.stringify(JSON.parse(JSON.stringify(responseData)), null, 2);
        } else {
          // This case implies that setConfig internally attempted a reconnect which failed.
          throw new Error(`Failed to establish connection with new agent ${agent_id} after setting config. Current state: ${elizaClient.getConnectionState()}`);
        }
      } catch (error: any) {
        // Return a simple error object that won't have reference issues
        const errorObj = {
          error: true,
          message: error.message || 'Unknown error in set_agent'
        };
        return JSON.stringify(errorObj, null, 2);
      }
    }
  });

  /**
   * Main function to initialize the ElizaClient connection and start the FastMCP server.
   * Handles graceful startup, error handling, and periodic heartbeats for monitoring.
   */
  async function main() {
    debugLog('Starting main function');
    try {
      // Connect to ElizaOS if initial agent/room IDs are provided
      debugLog('Connecting to ElizaClient');
      if (env.ELIZAOS_AGENT_ID && env.ELIZAOS_ROOM_ID) {
        await elizaClient.connect(); // Initial connection using env vars
        debugLog('ElizaClient connected');
      } else {
        debugLog('Skipping initial connection - no agent/room IDs provided');
      }
      
      // Start FastMCP server with stdio transport
      debugLog('Starting FastMCP server with stdio transport');
      
      // Temporarily replace console with silent version again for server start
      // @ts-ignore - Overriding console
      global.console = silentConsole;
      
      // @ts-ignore - FastMCP typing issues
      await fastMcpServer.start({
        transportType: 'stdio'
      });
      
      // Restore original console
      // @ts-ignore - Restoring console
      global.console = originalConsole;
      
      debugLog('FastMCP server started successfully');
      
      // Keep the process alive
      process.stdin.resume();
      
      // Log periodic heartbeats to debug log
      setInterval(() => {
        debugLog(`Heartbeat - FastMCP server still running`);
      }, 60000); // Log every minute
    } catch (error: any) {
      const errorMsg = `Failed to start MCP: ${error?.message || 'Unknown error'}`;
      debugLog(`ERROR: ${errorMsg}`);
      debugLog(`Stack: ${error?.stack || 'No stack trace'}`);
      process.stderr.write(`${errorMsg}\n`);
      process.exit(1);
    }
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach(signal => {
    process.on(signal, async () => {
      debugLog(`Received ${signal}, shutting down...`);
      await elizaClient.disconnect();
      await fastMcpServer.stop();
      debugLog('Shutdown complete.');
      process.exit(0);
    });
  });

  /**
   * Global error handler for uncaught exceptions
   */
  process.on('uncaughtException', (error) => {
    debugLog(`FATAL: Uncaught exception: ${error?.message || 'Unknown error'}`);
    debugLog(`Stack: ${error?.stack || 'No stack trace'}`);
    process.exit(1);
  });

  debugLog('Calling main function');
  main();

} catch (outerError: any) {
  const errorMsg = `Fatal error during initialization: ${outerError?.message || 'Unknown error'}`;
  try {
    debugLog(`FATAL: ${errorMsg}`);
    debugLog(`Stack: ${outerError?.stack || 'No stack trace'}`);
  } catch (logError) {
    // Ignore debug logging errors
  }
  process.stderr.write(`${errorMsg}\n`);
  process.exit(1);
}