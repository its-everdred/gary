import type { Client, Guild, TextChannel } from 'discord.js';
import pino from 'pino';
import { prisma } from './db.js';
import { AnnouncementService } from './announcementService.js';
import { ChannelFinderService } from './channelFinderService.js';

const logger = pino();

export class VoteAnnouncementManager {
  private client: Client;
  private announcementService: AnnouncementService;

  constructor(client: Client) {
    this.client = client;
    this.announcementService = new AnnouncementService(client);
  }

  async checkAndAnnounceVoteToGovernance(nominee: any): Promise<void> {
    if (!nominee.voteChannelId) return;

    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const voteChannel = guild.channels.cache.get(nominee.voteChannelId) as TextChannel;
      
      if (!voteChannel) return;

      const easyPollMessage = await this.findEasyPollMessage(voteChannel);
      if (!easyPollMessage) return;

      await this.announceVoteAndCleanup(nominee, easyPollMessage.url, guild);
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to check for EasyPoll and announce to governance');
    }
  }

  private async findEasyPollMessage(voteChannel: TextChannel) {
    const messages = await voteChannel.messages.fetch({ limit: 10, force: true });
    return messages.find(msg => 
      msg.author.id === '437618149505105920' && // EasyPoll bot ID
      msg.embeds.length > 0
    );
  }

  private async announceVoteAndCleanup(nominee: any, pollUrl: string, guild: Guild): Promise<void> {
    const announced = await this.announcementService.announceVoteStart(
      nominee,
      nominee.voteChannelId,
      pollUrl
    );

    if (announced) {
      await this.markAsAnnounced(nominee.id);
      await this.cleanupBotMessages(nominee, guild);
    }
  }

  private async markAsAnnounced(nomineeId: string): Promise<void> {
    await prisma.nominee.update({
      where: { id: nomineeId },
      data: { voteGovernanceAnnounced: true }
    });
  }

  private async cleanupBotMessages(nominee: any, guild: Guild): Promise<void> {
    if (!nominee.botMessageIds) return;

    try {
      const modCommsChannel = await ChannelFinderService.findModCommsChannel(guild);
      if (!modCommsChannel) return;

      const messageIds = nominee.botMessageIds.split(',');
      await this.deleteMessages(modCommsChannel, messageIds);
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        botMessageIds: nominee.botMessageIds
      }, 'Failed to delete bot messages');
    }
  }

  private async deleteMessages(channel: TextChannel, messageIds: string[]): Promise<void> {
    for (const messageId of messageIds) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch {
        // Message already deleted or not found, continue
      }
    }
  }
}