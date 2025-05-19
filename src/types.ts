/**
 * ElizaOS Connector Types
 * 
 * This file contains all the type definitions used by the ElizaOS connector.
 * It includes enums, interfaces, and types for socket messages, client configuration,
 * agent data, and connection states.
 */

/**
 * Types of messages that can be sent to the ElizaOS server via the socket connection
 */
export enum SOCKET_MESSAGE_TYPE {
  /** Join a room with specific agents */
  ROOM_JOINING = 1,
  /** Send a message to agents in a room */
  SEND_MESSAGE = 2
}

/**
 * Configuration options for ElizaClient
 * 
 * All fields are optional when initializing but are required for actual connection.
 * Default values are provided in the ElizaClient constructor.
 */
export interface ElizaClientConfig {
  /** UUID of the agent to connect to */
  agentId?: string;
  /** UUID of the connecting user */
  userId?: string;
  /** UUID of the room to join (must match agent ID in ElizaOS) */
  roomId?: string;
  /** UUID of the ElizaOS world */
  worldId?: string;
  /** URL of the ElizaOS server */
  serverUrl?: string;
  /** Timeout in milliseconds for establishing connection */
  connectionTimeout?: number;
  /** Timeout in milliseconds for waiting for agent responses */
  responseTimeout?: number;
}

/**
 * Represents an agent in the ElizaOS system
 */
export interface Agent {
  /** Unique identifier for the agent */
  id: string;
  /** Display name of the agent */
  name: string;
  /** Current status of the agent (online, offline, etc.) */
  status?: string; // Added status from display_agent_selection
}

/**
 * Represents a message in the ElizaOS system
 */
export interface Message {
  /** Unique identifier for the message */
  id: string;
  /** Text content of the message */
  content: string;
  /** ID of the sender (user or agent) */
  sender: string;
  /** Timestamp when the message was sent (milliseconds since epoch) */
  timestamp: number;
}

/**
 * Payload for socket messages sent to the ElizaOS server
 * 
 * Different fields are required depending on the message type:
 * - ROOM_JOINING requires roomId and optionally agentIds
 * - SEND_MESSAGE requires sender details, message content, and room/agent IDs
 */
export interface SocketMessagePayload {
  /** UUID of the room for the operation */
  roomId: string;
  /** Array of agent UUIDs to interact with */
  agentIds?: string[];
  /** UUID of the message sender (usually the user) */
  senderId?: string;
  /** Display name of the sender */
  senderName?: string;
  /** Text content of the message being sent */
  message?: string;
  /** UUID of the target agent */
  agentId?: string;
  /** UUID of the world */
  worldId?: string;
  /** Unique identifier for the message */
  messageId?: string;
  /** Source of the message (e.g., 'mcp_client_chat') */
  source?: string;
  /** Alternate field for text content in responses */
  text?: string;
}

/**
 * Complete socket message structure for communication with ElizaOS
 */
export interface SocketMessage {
  /** Type of the message */
  type: SOCKET_MESSAGE_TYPE;
  /** Message payload with operation-specific data */
  payload: SocketMessagePayload;
}

/**
 * Response message from an ElizaOS agent
 * 
 * This interface is intentionally flexible to accommodate the variety
 * of response structures that different agent types might return.
 */
export interface AgentResponseMessage {
  /** Unique identifier for the message */
  id?: string;
  /** Primary text content of the response */
  text?: string;
  /** Alternative field for text content */
  message?: string;
  /** Alternative field for text content */
  content?: string;
  /** Error message if an error occurred */
  error?: string;
  /** Allow for additional properties in agent responses */
  [key: string]: unknown;
}

/**
 * Connection states for the ElizaClient
 * 
 * Represents the current state of the connection to the ElizaOS server.
 */
export enum ConnectionState {
  /** Not connected to the server */
  DISCONNECTED = 'disconnected',
  /** Connection attempt in progress */
  CONNECTING = 'connecting',
  /** Successfully connected to the server */
  CONNECTED = 'connected',
  /** Connection error occurred */
  ERROR = 'error'
}

/**
 * Environment variables for ElizaOS configuration
 * 
 * These are typically loaded from process.env and used to configure
 * the ElizaClient in the MCP server.
 */
export interface ElizaEnvVars {
  /** URL of the ElizaOS server */
  ELIZAOS_SERVER_URL: string;
  /** UUID of the connecting user */
  ELIZAOS_USER_ID: string;
  /** UUID of the ElizaOS world */
  ELIZAOS_WORLD_ID: string;
  /** UUID of the agent to connect to */
  ELIZAOS_AGENT_ID: string;
  /** UUID of the room to join (must match agent ID) */
  ELIZAOS_ROOM_ID: string;
  /** Port for the MCP server to listen on */
  PORT?: string;
  /** Timeout in milliseconds for establishing connection */
  ELIZAOS_CONNECTION_TIMEOUT?: string;
  /** Timeout in milliseconds for waiting for agent responses */
  ELIZAOS_RESPONSE_TIMEOUT?: string;
}
