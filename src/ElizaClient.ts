import { io, Socket } from 'socket.io-client';
import pino from 'pino';
import {
  ElizaClientConfig,
  SocketMessage,
  AgentResponseMessage,
  ConnectionState,
  SOCKET_MESSAGE_TYPE
} from './types.js';
import axios from 'axios';

/**
 * Default logger configuration if none is provided
 * Uses pino-pretty for readable console output
 */
// @ts-ignore - Working around TypeScript ESM import issue with pino
const defaultLogger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

/**
 * ElizaClient provides a client-side interface to the ElizaOS server.
 * It handles WebSocket communication, room management, and message exchange with ElizaOS agents.
 * 
 * Features:
 * - Connecting to ElizaOS server via WebSockets
 * - Joining rooms to communicate with specific agents
 * - Sending messages to agents and processing their responses
 * - Managing connection state and error handling
 * - Listing available agents from the server
 */
export class ElizaClient {
  /** Socket.io connection to the ElizaOS server */
  private socket: Socket | null = null;
  
  /** Configuration for the client, including server URL, user/agent IDs, and timeouts */
  private config: Required<ElizaClientConfig>;
  
  /** Current connection state of the client */
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  
  /** Timestamp when connection attempt started */
  private connectionStartTime = 0;
  
  /** Duration it took to establish the connection in milliseconds */
  private connectionTime = 0;
  
  /** Flag indicating whether the client has successfully joined a room */
  private roomJoined = false;
  
  /** List of listeners for agent response messages */
  private messageListeners: ((message: AgentResponseMessage) => void)[] = [];
  
  /** List of listeners for connection state changes */
  private stateChangeListeners: ((state: ConnectionState) => void)[] = [];
  
  /** List of listeners for client errors */
  private errorListeners: ((error: Error) => void)[] = [];
  
  /** Queue of messages received from agents */
  private messageQueue: AgentResponseMessage[] = [];
  
  /** List of promise resolvers waiting for agent messages */
  private resolvers: ((message: AgentResponseMessage) => void)[] = [];
  
  /** Logger instance used for client logging */
  private logger: pino.Logger;

  /**
   * Creates a new ElizaClient instance
   * 
   * @param config - Configuration object for the client
   * @param loggerInstance - Optional custom logger instance (pino-compatible)
   */
  constructor(config?: ElizaClientConfig, loggerInstance?: pino.Logger) {
    this.config = {
      agentId: config?.agentId || '',
      userId: config?.userId || '',
      roomId: config?.roomId || '',
      worldId: config?.worldId || '',
      serverUrl: config?.serverUrl || '',
      connectionTimeout: config?.connectionTimeout || 120000,
      responseTimeout: config?.responseTimeout || 90000
    };
    this.logger = loggerInstance || defaultLogger;
    
    this.logger.info('ElizaClient initialized with configuration: %o', {
      agentId: this.config.agentId,
      roomId: this.config.roomId,
      serverUrl: this.config.serverUrl,
      responseTimeout: this.config.responseTimeout
    });
  }

  /**
   * Connects to the ElizaOS server using Socket.io
   * 
   * Establishes a WebSocket connection to the ElizaOS server, sets up event handlers,
   * and joins the specified room if agent ID and room ID are configured.
   * 
   * @returns Promise that resolves to true if connection is successful, rejects with error otherwise
   * @throws Error if agent ID or room ID is not set or they don't match
   */
  public async connect(): Promise<boolean> {
    if (this.socket?.connected) {
      this.logger.info('Already Connected to ElizaOS server');
      return Promise.resolve(true);
    }

    if (!this.config.agentId || !this.config.roomId) {
        const errMsg = 'Agent ID and Room ID must be set before connecting';
        this.logger.error(errMsg);
        throw new Error(errMsg);
    }

    if (this.config.agentId !== this.config.roomId) {
        const errMsg = 'Agent ID and Room ID must be identical for connection.';
        this.logger.error(errMsg);
        throw new Error(errMsg);
    }

    this.connectionStartTime = Date.now();
    this.updateState(ConnectionState.CONNECTING);
    
    return new Promise((resolve, reject) => {
      try {
        this.logger.info(`Connecting to ElizaOS server at ${this.config.serverUrl}`);
        this.socket = io(this.config.serverUrl, {
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 3000,
          timeout: this.config.connectionTimeout,
          autoConnect: true,
          transports: ['polling', 'websocket'],
          path: '/socket.io',
          query: {
            clientType: 'client',
            agentId: this.config.agentId,
            userId: this.config.userId,
          }
        });

        const connectionTimeoutId = setTimeout(() => {
          if (this.connectionState !== ConnectionState.CONNECTED) {
            const error = new Error(`Connection timeout after ${this.config.connectionTimeout}ms`);
            this.handleError(error);
            reject(error);
          }
        }, this.config.connectionTimeout);

        this.socket.on('connect', () => {
          clearTimeout(connectionTimeoutId);
          this.connectionTime = Date.now() - this.connectionStartTime;
          this.updateState(ConnectionState.CONNECTED);
          this.logger.info(`Successfully connected to ElizaOS server in ${this.connectionTime}ms.`);
          this.joinRoom();
          resolve(true);
        });

        this.socket.on('connect_error', (error: Error) => {
          this.logger.error({ err: error }, 'Connection error:');
        });

        this.socket.on('reconnect_attempt', (attemptNumber: number) => {
          this.logger.warn(`Reconnection attempt ${attemptNumber}/5`);
        });

        this.socket.on('reconnect_failed', () => {
          const error = new Error('Failed to reconnect to ElizaOS server after multiple attempts');
          this.handleError(error); 
          reject(error); 
        });

        this.socket.on('disconnect', (reason: string) => {
          this.logger.warn(`Disconnected from ElizaOS server: ${reason}`);
          this.updateState(ConnectionState.DISCONNECTED);
          this.roomJoined = false;
        });

        this.socket.on('messageBroadcast', (data: AgentResponseMessage) => {
          const agentResponse = data as AgentResponseMessage;
          this.logger.debug({ data: agentResponse }, 'Received messageBroadcast event (raw data):');
          this.notifyMessageListeners(agentResponse);
        });

        this.socket.on('messageComplete', (data: unknown) => {
          this.logger.debug({ data }, 'Received messageComplete event:');
        });

      } catch (error: unknown) {
        const typedError = error instanceof Error ? error : new Error(String(error));
        this.handleError(typedError);
        reject(typedError);
      }
    });
  }

  /**
   * Joins a room with the configured agent
   * 
   * Sends a room join message to the server to establish a connection
   * with the specified room and agent.
   * 
   * @private
   */
  private joinRoom(): void {
    if (!this.socket || !this.socket.connected) {
      this.logger.error('Cannot join room: not connected');
      return;
    }

    if (this.roomJoined) {
      this.logger.info('Already joined room');
      return;
    }
    
    if (!this.config.roomId || !this.config.agentId) {
        this.logger.error('Cannot join room: roomId or agentId is not configured.');
        return;
    }

    this.logger.info(`Joining room ${this.config.roomId} with agent ${this.config.agentId}`);
    const message: SocketMessage = {
      type: SOCKET_MESSAGE_TYPE.ROOM_JOINING,
      payload: {
        roomId: this.config.roomId,
        agentIds: [this.config.agentId]
      }
    };

    this.socket.emit('message', message);
    this.roomJoined = true;
    this.logger.info(`Successfully sent join room message for room ${this.config.roomId}`);
  }

  /**
   * Sends a message to the configured agent
   * 
   * Ensures connection is established before sending the message.
   * Creates a unique message ID for tracking purposes.
   * 
   * @param messageText - The message text to send to the agent
   * @throws Error if unable to connect or send the message
   */
  public async sendMessage(messageText: string): Promise<void> {
    if (!this.socket?.connected) {
      this.logger.warn('Not connected, attempting to connect before sending message');
      await this.connect();
    }

    if (!this.roomJoined) {
      this.logger.warn('Not joined to room, joining now');
      if (this.connectionState !== ConnectionState.CONNECTED) {
        this.logger.error('Cannot send message, connection not established and room not joined.');
        throw new Error('Cannot send message, connection not established.');
      }
      if (!this.roomJoined) this.joinRoom(); 
    }

    const messageId = `mcp-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    this.logger.info(`Sending message to agent ${this.config.agentId}: "${messageText.substring(0, 50)}..." (ID: ${messageId})`);
    const socketMessage: SocketMessage = {
      type: SOCKET_MESSAGE_TYPE.SEND_MESSAGE,
      payload: {
        senderId: this.config.userId,
        senderName: 'mcp-user', 
        message: messageText,
        roomId: this.config.roomId,
        agentId: this.config.agentId,
        worldId: this.config.worldId,
        messageId: messageId,
        source: 'mcp_client_chat' 
      }
    };

    if (this.socket) {
      this.socket.emit('message', socketMessage);
      this.logger.debug({ messageId }, 'Message sent via socket.');
    } else {
      this.logger.error('Socket is not initialized, cannot send message.');
      throw new Error('Socket is not initialized');
    }
  }

  /**
   * Gets the current connection state of the client
   * 
   * @returns The connection state enum value
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Gets the time it took to establish the connection in milliseconds
   * 
   * @returns Connection time in milliseconds
   */
  public getConnectionTime(): number {
    return this.connectionTime;
  }

  /**
   * Disconnects from the ElizaOS server
   * 
   * Cleanly terminates the Socket.io connection
   */
  public disconnect(): void {
    this.logger.info('Disconnecting from ElizaOS server by client call.');
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  /**
   * Registers a listener for agent response messages
   * 
   * @param listener - Function to call when a message is received
   */
  public onMessage(listener: (message: AgentResponseMessage) => void): void {
    this.messageListeners.push(listener);
  }

  /**
   * Registers a listener for connection state changes
   * 
   * @param listener - Function to call when the connection state changes
   */
  public onStateChange(listener: (state: ConnectionState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  /**
   * Registers a listener for client errors
   * 
   * @param listener - Function to call when an error occurs
   */
  public onError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  /**
   * Updates the connection state and notifies listeners
   * 
   * @param state - The new connection state
   * @private
   */
  private updateState(state: ConnectionState): void {
    if (this.connectionState === state) return; 
    this.connectionState = state;
    this.logger.info(`Connection state changed to: ${state}`);
    for (const listener of this.stateChangeListeners) {
      try {
        listener(state);
      } catch (err) {
        this.logger.error({ err }, 'Error in stateChange listener');
      }
    }
  }

  /**
   * Handles errors by logging them and notifying error listeners
   * 
   * @param error - The error that occurred
   * @private
   */
  private handleError(error: Error): void {
    this.logger.error({ err: error.message, stack: error.stack }, 'ElizaClient error encountered');
    this.updateState(ConnectionState.ERROR);
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (errL) {
        this.logger.error({ err: errL }, 'Error in error listener itself');
      }
    }
  }

  /**
   * Processes incoming agent messages and notifies listeners
   * 
   * Filters messages to ensure they are from the correct agent
   * and have valid text content. Updates message queue and resolves
   * any pending promises waiting for messages.
   * 
   * @param data - The message received from the agent
   * @private
   */
  private notifyMessageListeners(data: AgentResponseMessage): void {
    this.logger.debug({ data, queueSize: this.messageQueue.length, resolverCount: this.resolvers.length }, 'NotifyMessageListeners called with raw message.');

    if (data.text && data.text.trim() !== '' && data.senderId === this.config.agentId) {
      this.logger.info({ messageText: data.text, senderId: data.senderId }, 'Valid textual message received from agent. Processing for waitForNextMessage.');
      this.messageQueue.push(data);
      while (this.resolvers.length > 0 && this.messageQueue.length > 0) {
        const resolver = this.resolvers.shift();
        const message = this.messageQueue.shift();
        if (resolver && message) {
          this.logger.debug({ messageText: message.text, messageSender: message.senderId, messageId: message.id }, 'Calling resolver for waitForNextMessage with filtered message.');
          try {
              resolver(message);
          } catch (err) {
              this.logger.error({ err }, 'Error in resolver for waitForNextMessage');
          }
        }
      }
    } else {
      this.logger.warn({ 
        messageText: data.text,
        senderId: data.senderId,
        expectedAgentId: this.config.agentId,
        hasText: !!data.text,
        textIsEmpty: data.text?.trim() === ''
      }, 'Discarding message: not a valid textual response from the configured agent, or text is empty.');
    }

    for (const listener of this.messageListeners) {
      try {
        listener(data);
      } catch (err) {
         this.logger.error({ err }, 'Error in general onMessage listener'); 
      }
    }
  }

  /**
   * Waits for the next message from the configured agent
   * 
   * Returns a promise that resolves when the next valid message
   * is received from the agent, or rejects after the timeout.
   * 
   * @param timeout - Optional custom timeout in milliseconds
   * @returns Promise that resolves with the agent's message
   */
  public async waitForNextMessage(timeout?: number): Promise<AgentResponseMessage> {
    const waitTimeout = timeout || this.config.responseTimeout;
    const messageIdForLog = `wait-${Date.now()}`;
    this.logger.debug({ waitId: messageIdForLog, timeout: waitTimeout, queueSize: this.messageQueue.length }, `Waiting for a VALID TEXTUAL message from agent ${this.config.agentId}.`);
    
    return new Promise((resolve, reject) => {
      if (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (message) {
          this.logger.debug({ waitId: messageIdForLog, messageText: message.text, messageSender: message.senderId, messageId: message.id }, 'Resolved waitForNextMessage immediately from filtered queue.');
          resolve(message);
        } else {
          this.logger.error({ waitId: messageIdForLog }, 'Message queue error during waitForNextMessage (filtered queue not empty but shift failed)');
          reject(new Error('Filtered message queue inconsistency')); 
        }
        return;
      }
      
      let timer: NodeJS.Timeout | null = null;
      const resolverWrapper = (message: AgentResponseMessage) => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            this.logger.debug({ waitId: messageIdForLog, messageText: message.text, messageSender: message.senderId, messageId: message.id }, 'Timer cleared, resolving waitForNextMessage with filtered message via listener.');
        } else {
            this.logger.debug({ waitId: messageIdForLog, messageText: message.text, messageSender: message.senderId, messageId: message.id }, 'Resolver called for waitForNextMessage with filtered message (timer state unknown or already cleared).');
        }
        resolve(message);
      };
      
      this.resolvers.push(resolverWrapper);
      this.logger.debug({ waitId: messageIdForLog, resolverCount: this.resolvers.length }, 'Added resolver to filtered message queue.');

      timer = setTimeout(() => {
        const index = this.resolvers.indexOf(resolverWrapper);
        if (index > -1) {
          this.resolvers.splice(index, 1);
          this.logger.warn({ waitId: messageIdForLog, resolverCount: this.resolvers.length, agentId: this.config.agentId }, `Timeout waiting for a VALID TEXTUAL response from agent after ${waitTimeout}ms. Rejecting.`);
          reject(new Error(`Timeout waiting for a VALID TEXTUAL response from agent ${this.config.agentId} after ${waitTimeout}ms`));
        } else {
          this.logger.debug({ waitId: messageIdForLog }, 'Timeout fired, but resolver was already processed for a filtered message.');
        }
      }, waitTimeout);
    });
  }

  /**
   * Switches to a different agent and room
   * 
   * Disconnects from the current agent, updates configuration,
   * and reconnects to the new agent.
   * 
   * @param newAgentId - The ID of the agent to switch to
   * @param newRoomId - The ID of the room to join (must match agent ID)
   * @throws Error if agent ID and room ID don't match or connection fails
   */
  public async switchAgent(newAgentId: string, newRoomId: string): Promise<void> {
    this.logger.info(`Attempting to switch agent to ID: ${newAgentId}, Room ID: ${newRoomId}`);
    if (newAgentId !== newRoomId) {
        const errMsg = 'Switching agent failed: newAgentId and newRoomId must be identical.';
        this.logger.error(errMsg);
        throw new Error(errMsg);
    }
    if (this.socket && this.socket.connected) {
        this.logger.info('Disconnecting current agent before switching...');
        this.disconnect();
        await new Promise(resolve => setTimeout(resolve, 250)); 
    }
    
    this.config.agentId = newAgentId;
    this.config.roomId = newRoomId;
    this.roomJoined = false; 
    this.messageQueue = [];
    this.resolvers = []; 

    this.logger.info(`Configuration updated for new agent. Attempting to connect with agent ${newAgentId}.`);
    try {
        await this.connect();
        this.logger.info(`Successfully switched and connected to agent ${newAgentId}`);
    } catch (error) {
        this.logger.error({ err: error }, `Failed to connect after switching to agent ${newAgentId}`);
        throw error;
    }
  }

  /**
   * Gets the current client configuration
   * 
   * @returns Read-only reference to the current configuration
   */
  public getConfig(): Readonly<Required<ElizaClientConfig>> {
    return this.config;
  }

  /**
   * Updates the client configuration
   * 
   * If critical parameters like agent ID or room ID change,
   * this will trigger a disconnect and reconnect process.
   * 
   * @param newConfigPartial - Partial configuration object with updates
   */
  public async setConfig(newConfigPartial: Partial<ElizaClientConfig>): Promise<void> {
    this.logger.info({ newConfigPartial }, 'Setting new ElizaClient configuration');
    
    const oldConfig = { ...this.config };
    // Update internal config
    this.config = { ...this.config, ...newConfigPartial };

    this.logger.info({ oldConfig, newConfig: this.config }, 'ElizaClient configuration updated');

    // If critical connection parameters changed, disconnect and reconnect
    const criticalChange = oldConfig.agentId !== this.config.agentId ||
                           oldConfig.roomId !== this.config.roomId ||
                           oldConfig.serverUrl !== this.config.serverUrl ||
                           oldConfig.userId !== this.config.userId ||
                           oldConfig.worldId !== this.config.worldId;

    if (criticalChange && this.connectionState !== ConnectionState.DISCONNECTED) {
      this.logger.info('Critical configuration changed, initiating disconnect before reconnecting.');
      await this.disconnect(); // Ensure disconnect completes
    }
    
    // Attempt to connect with the new configuration if not already connecting/connected with identical relevant params
    // Or if it was disconnected due to critical changes
    if (this.connectionState === ConnectionState.DISCONNECTED || (criticalChange && this.connectionState !== ConnectionState.CONNECTING)) {
      if (this.config.agentId && this.config.roomId && this.config.serverUrl && this.config.userId && this.config.worldId) {
        this.logger.info('Attempting to connect with new configuration.');
        try {
          await this.connect();
        } catch (error) {
          this.logger.error({ error }, 'Failed to connect with new configuration after setConfig');
          // Optionally revert to old config or handle error as appropriate
          // For now, we'll leave it in a disconnected state with the new config.
        }
      } else {
        this.logger.warn('New configuration is missing required fields (agentId, roomId, serverUrl, userId, worldId). Client will remain disconnected.');
        this.updateState(ConnectionState.DISCONNECTED); // Ensure state reflects inability to connect
      }
    }
  }

  /**
   * Sends a message to the agent and waits for a response
   * 
   * Combines sendMessage and waitForNextMessage into a single operation.
   * Includes automatic connection handling and robust error management.
   * 
   * @param messageText - The message text to send to the agent
   * @returns Promise that resolves with the agent's response
   */
  public async sendMessageAndGetResponse(messageText: string): Promise<AgentResponseMessage> {
    if (!this.socket?.connected) {
      this.logger.warn('Not connected, attempting to connect before sending message');
      await this.connect();
      if (!this.socket?.connected) {
        const errorMsg = 'Failed to connect. Cannot send message.';
        this.logger.error(errorMsg);
        // Return an error structure consistent with AgentResponseMessage
        return {
          payload: {
            message: { error: errorMsg },
            requestId: '' // Or generate one
          },
          status: 'error',
          error: errorMsg,
        };
      }
    }

    if (!this.roomJoined) {
      this.logger.warn('Not joined to room, joining now');
      if (this.connectionState !== ConnectionState.CONNECTED) {
         const errorMsg = 'Cannot send message, connection not established and room not joined.';
        this.logger.error(errorMsg);
        return {
          payload: {
            message: { error: errorMsg },
            requestId: '' 
          },
          status: 'error',
          error: errorMsg,
        };
      }
      this.joinRoom(); // joinRoom is synchronous in its socket.emit call
      // There isn't a direct confirmation for room join in the current setup to await here.
      // Assuming joinRoom is effective immediately for subsequent messages.
    }
    
    const messageId = `mcp-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.logger.info(`Sending message to agent ${this.config.agentId}: "${messageText.substring(0, 50)}..." (ID: ${messageId})`);
    
    const socketMessage: SocketMessage = {
      type: SOCKET_MESSAGE_TYPE.SEND_MESSAGE,
      payload: {
        senderId: this.config.userId,
        senderName: 'mcp-user',
        message: messageText,
        roomId: this.config.roomId,
        agentId: this.config.agentId,
        worldId: this.config.worldId,
        messageId: messageId,
        source: 'mcp_client_chat',
      },
    };

    return new Promise<AgentResponseMessage>((resolve, reject) => {
      const responseTimeoutId = setTimeout(() => {
        const errorMsg = `Response timeout after ${this.config.responseTimeout}ms for message ID ${messageId}`;
        this.logger.error(errorMsg);
        // Remove resolver to prevent late response processing
        this.resolvers = this.resolvers.filter(r => r !== resolverWrapper);
        resolve({ // Resolve with error message, not reject, to keep tool flow consistent
          payload: { message: { error: errorMsg }, requestId: messageId },
          status: 'error',
          error: errorMsg,
        });
      }, this.config.responseTimeout);

      const resolverWrapper = (response: AgentResponseMessage) => {
        // Check if this response is for the current message
        // This assumes response.payload.requestId or similar field matches messageId
        // For ElizaOS, the response might not have a direct requestId linking.
        // We'll assume the next message is for this request for now, which is how waitForNextMessage worked.
        // A more robust solution would involve matching IDs if the server provides them.
        if (response) { // Basic check, ideally match response.payload.requestId with messageId
          clearTimeout(responseTimeoutId);
          this.logger.debug({ response, messageId }, 'Response received for sent message.');
          resolve(response);
        }
      };
      
      this.resolvers.push(resolverWrapper); // Add to general resolvers

      if (this.socket) {
        this.socket.emit('message', socketMessage);
        this.logger.debug({ messageId }, 'Message sent via socket, awaiting response.');
      } else {
        clearTimeout(responseTimeoutId);
        this.resolvers = this.resolvers.filter(r => r !== resolverWrapper);
        const errorMsg = 'Socket is not initialized, cannot send message.';
        this.logger.error(errorMsg);
        resolve({ 
            payload: { message: { error: errorMsg }, requestId: messageId },
            status: 'error',
            error: errorMsg,
        });
      }
    });
  }

  /**
   * Lists all available agents from the ElizaOS server
   * 
   * Makes an HTTP request to the server's API endpoint to retrieve
   * the list of all available agents.
   * 
   * @returns Promise that resolves with an array of agent objects, each with id and name
   * @throws Error if the API request fails or returns unexpected data
   */
  public async listAvailableAgents(): Promise<Array<{id: string, name: string}>> {
    try {
      const response = await axios.get(`${this.config.serverUrl}/api/agents`);
      if (response.data && response.data.data && response.data.data.agents) {
        return response.data.data.agents.map((agent: any) => ({ 
          id: agent.id, 
          name: agent.name 
        }));
      }
      throw new Error('Failed to fetch agents or malformed response');
    } catch (error: any) {
      this.logger.error(`Failed to list available agents: ${error.message}`);
      throw error;
    }
  }
}