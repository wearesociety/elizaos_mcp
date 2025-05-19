# Society ElizaOS Connector MCP

The Society ElizaOS Connector MCP (Model Context Protocol) allows you to seamlessly integrate your ElizaOS agents with Cursor. This enables you to list available agents, select a specific agent to interact with, and chat directly with your ElizaOS agents from within the Cursor IDE.

This MCP server runs locally on your machine and is managed by Cursor using the `stdio` transport, meaning Cursor automatically starts and communicates with it.

## Features

-   **List Agents**: Retrieve a list of available agents from your ElizaOS instance.
-   **Select Agent**: Choose a specific agent to interact with. The `Room ID` will be automatically set to match the `Agent ID`.
-   **Chat with Agent**: Send messages to the selected ElizaOS agent and receive responses.
-   **Check Status**: Verify the MCP server's connection state and current agent configuration.

## Prerequisites

-   Node.js and npm (v14 or higher).
-   An ElizaOS server instance running and accessible (e.g., locally on `http://localhost:3000`).
-   Cursor IDE with MCP support.

## Installation & Usage with Cursor

### Quick Setup (Recommended)

The easiest way to use this MCP is directly with Cursor using npx. Cursor will automatically handle running the package.

1. **Configure Cursor**:
   Create or open the `.cursor/mcp.json` file in your project folder (or the global `~/.cursor/mcp.json` file) and add:

```json
{
  "mcpServers": {
    "society-elizaos-mcp-npx": { 
      "command": "npx",
      "args": [
        "-y",
        "society-elizaos-mcp@1.0.9"
      ],
      "env": {
        "ELIZAOS_SERVER_URL": "http://localhost:3000",
        "ELIZAOS_USER_ID": "000000000000000000000000000000000000",  example ad64a76a-0e09-0899-b8f8-492d6aea4118
        "ELIZAOS_WORLD_ID": "000000000000000000000000000000000000", example c930b151-dcfb-41c5-96af-550ffea7023c
        "ELIZAOS_AGENT_ID": "000000000000000000000000000000000000", example 85e9fa66-6f8c-0f18-922c-d6c962e21e18
        "ELIZAOS_ROOM_ID": "000000000000000000000000000000000000",  Need to be equal to the ELIZAOS_AGENT_ID 
        "ELIZAOS_CONNECTION_TIMEOUT": "120000",
        "ELIZAOS_RESPONSE_TIMEOUT": "90000",
        "PORT": "3099",
        "DEBUG": "true",
        "NODE_ENV": "production",
        "MCP_DISABLE_PINGS": "true"
      }
  }
}
```

2. **Replace all placeholder UUIDs** with your actual ElizaOS IDs.

3. **Restart Cursor** to apply the configuration changes.

4. **Start using the tools** in the Cursor interface - they'll appear as:
   - `get_status`
   - `list_agents`
   - `chat_with_agent`
   - `set_agent`

### Local Development Setup

If you want to run a local development version of the connector, follow these steps:

1. **Clone and install dependencies**:
   ```bash
   git clone https://github.com/your-username/society-elizaos-mcp.git
   cd society-elizaos-mcp
   npm install
   ```

2. **Build the package**:
   ```bash
   npm run build
   ```

3. **Run locally**:
   ```bash
   # Set required environment variables
   export ELIZAOS_SERVER_URL="http://localhost:3000"
   export ELIZAOS_USER_ID="your-elizaos-user-uuid"
   export ELIZAOS_WORLD_ID="your-elizaos-world-uuid"
   export ELIZAOS_AGENT_ID="your-initial-agent-uuid"
   export ELIZAOS_ROOM_ID="your-initial-agent-uuid"
   
   # Run the server
   node dist/index.js
   ```

4. **Or use the convenience script**:
   ```bash
   # The script sets default environment variables and runs the server
   ./scripts/mcp_run.sh
   ```

5. **Configure Cursor for local version**:
   If you want Cursor to use your local version instead of the npm package, update your `.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "society-elizaos-mcp-local": {
         "command": "node",
         "args": [
           "/path/to/your/society-elizaos-mcp/dist/index.js"
         ],
         "env": {
           "ELIZAOS_SERVER_URL": "http://localhost:3000",
           "ELIZAOS_USER_ID": "your-elizaos-user-uuid",
           "ELIZAOS_WORLD_ID": "your-elizaos-world-uuid",
           "ELIZAOS_AGENT_ID": "your-initial-agent-uuid", 
           "ELIZAOS_ROOM_ID": "your-initial-agent-uuid",
           "ELIZAOS_CONNECTION_TIMEOUT": "120000",
           "ELIZAOS_RESPONSE_TIMEOUT": "90000",
           "PORT": "3069",
           "DEBUG": "true",
           "NODE_ENV": "production",
           "MCP_DISABLE_PINGS": "true"
         }
       }
     }
   }
   ```

## Configuration Options

All configuration is done through environment variables, which you set in the `env` section of your `.cursor/mcp.json` file:

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `ELIZAOS_SERVER_URL` | Yes | URL of your ElizaOS server (e.g., `http://localhost:3000`) |
| `ELIZAOS_USER_ID` | Yes | Your ElizaOS user UUID |
| `ELIZAOS_WORLD_ID` | Yes | Your ElizaOS world UUID |
| `ELIZAOS_AGENT_ID` | No | Initial agent UUID to connect to (optional but recommended) |
| `ELIZAOS_ROOM_ID` | No | Must match `ELIZAOS_AGENT_ID` if provided |
| `ELIZAOS_CONNECTION_TIMEOUT` | No | Socket connection timeout in ms (default: 120000) |
| `ELIZAOS_RESPONSE_TIMEOUT` | No | Agent response timeout in ms (default: 90000) |

## Security Notice

⚠️ **Important**: Never include any API keys or secrets in your `.cursor/mcp.json` file or in any code you publish. The MCP does not require any external API keys to function.

## MCP Tool Reference

Once configured, Cursor can communicate with your ElizaOS agents through these four tools:

### 1. `get_status`

Gets the current connection status and configuration of the ElizaOS MCP.

**Arguments**: None required (pass an empty object `{}` or `{"random_string": "any"}`)

**Returns**:
```json
{
  "connectionState": "connected", 
  "currentAgent": "agent-uuid",
  "currentRoom": "room-uuid",
  "serverUrl": "http://localhost:3000",
  "userId": "user-uuid",
  "worldId": "world-uuid",
  "connectionTimeout": 120000,
  "responseTimeout": 90000
}
```

### 2. `list_agents`

Lists all available agents from your ElizaOS server.

**Arguments**: None required (pass an empty object `{}` or `{"random_string": "any"}`)

**Returns**:
```json
[
  {
    "id": "agent-uuid-1",
    "name": "Agent Name 1"
  },
  {
    "id": "agent-uuid-2",
    "name": "Agent Name 2"
  }
]
```

### 3. `chat_with_agent`

Sends a message to the currently selected agent and returns the response.

**Arguments**:
```json
{
  "message": "Your message to the agent goes here"
}
```

**Returns**:
```json
{
  "messageText": "Your message to the agent goes here",
  "senderId": "your-user-id",
  "response": {
    "senderId": "agent-id",
    "senderName": "Agent Name",
    "text": "The agent's response text",
    "roomId": "room-id",
    "createdAt": 1747632281772,
    "source": "mcp_client_chat",
    "thought": "Optional agent thought process if available",
    "actions": ["REPLY"]
  }
}
```

### 4. `set_agent`

Switches to a different agent. Note that `agent_id` and `room_id` must be identical in ElizaOS.

**Arguments**:
```json
{
  "agent_id": "the-agent-uuid-to-use",
  "room_id": "the-agent-uuid-to-use"
}
```

**Returns**:
```json
{
  "success": true,
  "oldConfig": {
    "agentId": "previous-agent-uuid",
    "roomId": "previous-room-uuid"
  },
  "newConfig": {
    "agentId": "new-agent-uuid",
    "roomId": "new-agent-uuid"
  }
}
```

## Troubleshooting

### Common Issues

- **"Missing required ElizaOS environment variables"**:
  - Ensure `ELIZAOS_USER_ID`, `ELIZAOS_WORLD_ID`, and `ELIZAOS_SERVER_URL` are set in your MCP config.
  
- **"Failed to connect to ElizaOS for chat"**:
  - Confirm your ElizaOS server is running at the specified URL.
  - Verify the agent and room IDs match and are valid.
  
- **No agent responses**:
  - Check that the agent is active in your ElizaOS environment.
  - Increase `ELIZAOS_RESPONSE_TIMEOUT` if your agent takes longer to respond.
  
- **"For ElizaOS, agent_id and room_id must be identical"**:
  - When using `set_agent`, ensure both IDs are the same value.

## License

MIT

---

This README provides a comprehensive guide for setting up and using the Society ElizaOS Connector MCP with Cursor. For additional assistance, please open an issue on the GitHub repository. 