import type { Client, Guild, TextChannel, Message } from 'discord.js';
import pino from 'pino';
import { prisma } from './db.js';
import type { Nominee } from '@prisma/client';
import { NOMINATION_CONFIG } from './constants.js';

const logger = pino();

export interface VoteResults {
  passed: boolean;
  yesVotes: number;
  noVotes: number;
  totalVotes: number;
  quorumMet: boolean;
  passThresholdMet: boolean;
  memberCount: number;
  requiredQuorum: number;
  requiredPassVotes: number;
}

export interface PollData {
  question: string;
  yesVotes: number;
  noVotes: number;
  voterIds: string[];
  pollMessageId: string;
}

export class VoteResultService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Monitors vote channel for EasyPoll completion and calculates results
   */
  async checkVoteCompletion(nominee: Nominee): Promise<VoteResults | null> {
    try {
      if (!nominee.voteChannelId) {
        logger.warn({ nomineeId: nominee.id }, 'No vote channel ID found');
        return null;
      }

      const guild = await this.client.guilds.fetch(nominee.guildId);
      const voteChannel = guild.channels.cache.get(nominee.voteChannelId) as TextChannel;
      
      if (!voteChannel) {
        logger.warn({ 
          nomineeId: nominee.id,
          voteChannelId: nominee.voteChannelId 
        }, 'Vote channel not found');
        return null;
      }

      // Find EasyPoll message in the channel
      const pollData = await this.findPollInChannel(voteChannel, nominee.name);
      if (!pollData) {
        logger.debug({ 
          nomineeId: nominee.id,
          channelId: voteChannel.id 
        }, 'No completed poll found yet');
        return null;
      }

      // Calculate member count (excluding bots)
      const memberCount = await this.getNonBotMemberCount(guild);
      
      // Calculate results
      const results = this.calculateVoteResults(pollData, memberCount);
      
      // Update nominee with poll results
      await this.updateNomineeWithResults(nominee.id, results, pollData);

      logger.info({
        nomineeId: nominee.id,
        nomineeName: nominee.name,
        ...results
      }, 'Vote results calculated');

      return results;
    } catch (error) {
      logger.error({
        error,
        nomineeId: nominee.id,
        nomineeName: nominee.name
      }, 'Failed to check vote completion');
      return null;
    }
  }

  /**
   * Finds and parses EasyPoll message in channel
   */
  private async findPollInChannel(channel: TextChannel, nomineeName: string): Promise<PollData | null> {
    try {
      // Fetch recent messages to find the poll
      const messages = await channel.messages.fetch({ limit: 50 });
      
      for (const message of messages.values()) {
        // Check if message is from EasyPoll bot
        if (!this.isEasyPollMessage(message)) continue;
        
        // Check if poll is about this nominee
        if (!message.content.includes(nomineeName) && 
            !message.embeds[0]?.title?.includes(nomineeName)) continue;

        // Parse poll data from the message
        const pollData = await this.parsePollMessage(message);
        if (pollData) {
          return pollData;
        }
      }

      return null;
    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Failed to find poll in channel');
      return null;
    }
  }

  /**
   * Checks if message is from EasyPoll bot
   */
  private isEasyPollMessage(message: Message): boolean {
    // EasyPoll bot ID: 437618149505105920
    return message.author.id === '437618149505105920' || 
           message.author.username?.toLowerCase().includes('easypoll') ||
           false;
  }

  /**
   * Parses poll data from EasyPoll message
   */
  private async parsePollMessage(message: Message): Promise<PollData | null> {
    try {
      // This is a simplified parser - actual implementation would need to
      // parse EasyPoll's specific embed format and reaction data
      
      const embed = message.embeds[0];
      if (!embed) return null;

      // Extract question from embed
      const question = embed.title || embed.description || '';
      
      // For demonstration, we'll simulate poll results
      // In reality, this would parse the actual poll data from EasyPoll's format
      const yesVotes = this.extractVoteCount(embed, 'yes') || 0;
      const noVotes = this.extractVoteCount(embed, 'no') || 0;
      
      // Extract voter IDs (this would require EasyPoll API or parsing reactions)
      const voterIds = await this.extractVoterIds(message);

      // Only return data if poll appears to be completed
      if (this.isPollCompleted(embed)) {
        return {
          question,
          yesVotes,
          noVotes,
          voterIds,
          pollMessageId: message.id
        };
      }

      return null;
    } catch (error) {
      logger.error({ error, messageId: message.id }, 'Failed to parse poll message');
      return null;
    }
  }

  /**
   * Extracts vote count for a specific option from embed
   */
  private extractVoteCount(embed: any, option: 'yes' | 'no'): number {
    const description = embed.description || '';
    const fields = embed.fields || [];
    
    // Look for vote counts in embed fields or description
    // This is a simplified implementation
    const regex = option === 'yes' 
      ? /✅.*?(\d+)/i 
      : /❌.*?(\d+)/i;
    
    const match = description.match(regex) || 
                  fields.find((f: any) => f.name.toLowerCase().includes(option))?.value?.match(/(\d+)/);
    
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Checks if poll is completed
   */
  private isPollCompleted(embed: any): boolean {
    const description = embed.description || '';
    const title = embed.title || '';
    
    // Look for completion indicators
    return description.includes('closed') || 
           description.includes('ended') ||
           title.includes('Results') ||
           embed.color === 0xff0000; // Red color often indicates closed poll
  }

  /**
   * Extracts voter IDs from poll message (would need EasyPoll API)
   */
  private async extractVoterIds(message: Message): Promise<string[]> {
    // This would require EasyPoll API or parsing reaction users
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Gets member count excluding bots
   */
  private async getNonBotMemberCount(guild: Guild): Promise<number> {
    await guild.members.fetch(); // Ensure all members are cached
    
    const nonBotMembers = guild.members.cache.filter(member => !member.user.bot);
    return nonBotMembers.size;
  }

  /**
   * Calculates vote results based on poll data and requirements
   */
  private calculateVoteResults(pollData: PollData, memberCount: number): VoteResults {
    const { yesVotes, noVotes } = pollData;
    const totalVotes = yesVotes + noVotes;
    
    // Calculate quorum requirement (40% of members)
    const requiredQuorum = Math.ceil(memberCount * NOMINATION_CONFIG.VOTE_QUORUM_THRESHOLD);
    const quorumMet = totalVotes >= requiredQuorum;
    
    // Calculate pass threshold (80% of votes must be yes)
    const requiredPassVotes = Math.ceil(totalVotes * NOMINATION_CONFIG.VOTE_PASS_THRESHOLD);
    const passThresholdMet = yesVotes >= requiredPassVotes;
    
    const passed = quorumMet && passThresholdMet;

    return {
      passed,
      yesVotes,
      noVotes,
      totalVotes,
      quorumMet,
      passThresholdMet,
      memberCount,
      requiredQuorum,
      requiredPassVotes
    };
  }

  /**
   * Updates nominee record with vote results
   */
  private async updateNomineeWithResults(
    nomineeId: string, 
    results: VoteResults, 
    pollData: PollData
  ): Promise<void> {
    try {
      await prisma.nominee.update({
        where: { id: nomineeId },
        data: {
          voteYesCount: results.yesVotes,
          voteNoCount: results.noVotes,
          votePassed: results.passed,
          votePollMessageId: pollData.pollMessageId
        }
      });

      logger.info({
        nomineeId,
        yesVotes: results.yesVotes,
        noVotes: results.noVotes,
        passed: results.passed
      }, 'Nominee updated with vote results');
    } catch (error) {
      logger.error({ error, nomineeId }, 'Failed to update nominee with results');
    }
  }

  /**
   * Manually calculate results for testing (when poll data isn't available)
   */
  async simulateVoteResults(nominee: Nominee, yesVotes: number, noVotes: number): Promise<VoteResults> {
    const guild = await this.client.guilds.fetch(nominee.guildId);
    const memberCount = await this.getNonBotMemberCount(guild);
    
    const pollData: PollData = {
      question: `Should we invite ${nominee.name} to GA?`,
      yesVotes,
      noVotes,
      voterIds: [],
      pollMessageId: 'simulated'
    };

    const results = this.calculateVoteResults(pollData, memberCount);
    await this.updateNomineeWithResults(nominee.id, results, pollData);
    
    return results;
  }
}