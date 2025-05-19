// tools_schema.ts - Contains simplified schema definitions for all tools

// Export all tool definitions in a single array for convenience
export const toolDefinitions = [
  {
    name: 'get_status',
    enabled: true,
    description: 'Gets the current connection status and configuration of the ElizaOS MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        random_string: { 
          type: 'string', 
          description: 'Dummy parameter for no-parameter tools' 
        }
      }
    }
  },
  {
    name: 'list_agents',
    enabled: true,
    description: 'Lists available agents from the configured ElizaOS server.',
    inputSchema: {
      type: 'object',
      properties: {
        random_string: { 
          type: 'string', 
          description: 'Dummy parameter for no-parameter tools' 
        }
      }
    }
  },
  {
    name: 'chat_with_agent',
    enabled: true,
    description: 'Sends a message to the currently configured ElizaOS agent and gets a response.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { 
          type: 'string', 
          description: 'The message to send to the agent.' 
        }
      },
      required: ['message']
    }
  },
  {
    name: 'set_agent',
    enabled: true,
    description: 'Switches the active ElizaOS agent and room for the MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { 
          type: 'string', 
          description: 'The UUID of the agent to switch to.' 
        },
        room_id: { 
          type: 'string', 
          description: 'The UUID of the room to join (must match agent_id).'
        }
      },
      required: ['agent_id', 'room_id']
    }
  }
];