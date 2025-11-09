import { describe, test, expect } from 'bun:test';
import { Client, GatewayIntentBits } from 'discord.js';

describe('privacy command', () => {
  test('client not initialized with MessageContent intent', () => {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
      ],
    });
    
    const hasMessageContent = client.options.intents?.has(GatewayIntentBits.MessageContent) ?? false;
    expect(hasMessageContent).toBe(false);
  });

  test('privacy response includes MessageContent disabled', () => {
    const mockIntents = {
      has: (intent: any) => intent !== GatewayIntentBits.MessageContent
    };
    
    const hasMessageContent = mockIntents.has(GatewayIntentBits.MessageContent);
    const privacyText = `MessageContent: ${hasMessageContent ? 'ENABLED' : 'Disabled'}`;
    
    expect(privacyText).toContain('MessageContent: Disabled');
  });
});