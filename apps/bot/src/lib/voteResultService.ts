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
      
      logger.info({
        channelId: channel.id,
        nomineeName,
        messageCount: messages.size
      }, 'Searching for poll message in channel');
      
      for (const message of messages.values()) {
        // Log details about each message for debugging
        logger.info({
          messageId: message.id,
          authorId: message.author.id,
          authorUsername: message.author.username,
          isEasyPoll: this.isEasyPollMessage(message),
          hasEmbeds: message.embeds.length > 0,
          content: message.content.substring(0, 100),
          embedTitles: message.embeds.map(e => e.title).filter(Boolean)
        }, 'Checking message for poll data');
        
        // Check if message is from EasyPoll bot
        if (!this.isEasyPollMessage(message)) continue;
        
        // Check if poll is about this nominee
        // For EasyPoll, the nominee name might be in the original poll command or embed
        const contentMatches = message.content.includes(nomineeName);
        const embedMatches = message.embeds.some(embed => 
          embed.title?.includes(nomineeName) || 
          embed.description?.includes(nomineeName) ||
          embed.fields?.some(field => 
            field.name?.includes(nomineeName) || 
            field.value?.includes(nomineeName)
          )
        );
        
        // Also check if this is a poll about inviting someone to GA (generic match)
        const isGAPoll = message.content.toLowerCase().includes('invite') && 
                        message.content.toLowerCase().includes('ga') ||
                        message.embeds.some(embed => 
                          embed.description?.toLowerCase().includes('invite') &&
                          embed.description?.toLowerCase().includes('ga')
                        );
        
        logger.info({
          messageId: message.id,
          nomineeName,
          contentMatches,
          embedMatches,
          isGAPoll,
          isRecentPoll,
          messageCreated: new Date(message.createdTimestamp).toISOString(),
          messageContent: message.content,
          embedCount: message.embeds.length,
          allEmbedData: message.embeds.map(embed => ({
            title: embed.title,
            description: embed.description?.substring(0, 500), // First 500 chars
            fields: embed.fields?.map(f => ({ name: f.name, value: f.value?.substring(0, 200) })),
            footer: embed.footer?.text,
            author: embed.author?.name
          }))
        }, 'Checking if message matches nominee');
        
        // Try specific name match first, then fall back to GA poll match or timing-based match
        const isRecentPoll = message.createdTimestamp > (Date.now() - (2 * 60 * 60 * 1000)); // Within last 2 hours
        
        if (!contentMatches && !embedMatches && !isGAPoll && !isRecentPoll) continue;

        // Parse poll data from the message
        const pollData = await this.parsePollMessage(message);
        if (pollData) {
          return pollData;
        }
      }

      logger.warn({
        channelId: channel.id,
        nomineeName,
        totalMessages: messages.size
      }, 'No matching poll found in channel');
      
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
    const authorId = message.author.id;
    const username = message.author.username?.toLowerCase() || '';
    
    // Known EasyPoll bot IDs and patterns
    const easyPollIds = ['437618149505105920'];
    const usernamePatterns = ['easypoll', 'easy poll', 'poll'];
    
    const matchesId = easyPollIds.includes(authorId);
    const matchesUsername = usernamePatterns.some(pattern => username.includes(pattern));
    
    logger.info({
      messageId: message.id,
      authorId,
      username: message.author.username,
      matchesId,
      matchesUsername,
      isEasyPoll: matchesId || matchesUsername
    }, 'EasyPoll bot detection check');
    
    return matchesId || matchesUsername;
  }

  /**
   * Parses poll data from EasyPoll message
   */
  private async parsePollMessage(message: Message): Promise<PollData | null> {
    try {
      const embed = message.embeds[0];
      if (!embed) {
        logger.warn({ messageId: message.id }, 'No embed found in message');
        return null;
      }

      logger.info({
        messageId: message.id,
        embedStructure: {
          title: embed.title,
          description: embed.description,
          fields: embed.fields?.map(f => ({ name: f.name, value: f.value })),
          footer: embed.footer?.text,
          color: embed.color
        }
      }, 'Parsing poll message embed structure');

      // Extract question from embed
      const question = embed.title || embed.description || '';
      
      // Check if poll is closed/completed
      const isClosed = this.isPollClosed(embed);
      logger.info({
        messageId: message.id,
        question,
        isClosed,
        title: embed.title,
        description: embed.description,
        footer: embed.footer?.text
      }, 'Poll closure check');
      
      if (!isClosed) {
        logger.info({ messageId: message.id }, 'Poll is still active, skipping');
        return null; // Poll is still active
      }
      
      // Parse vote counts from embed fields or description
      const yesVotes = this.extractVoteCount(embed, 'yes') || 0;
      const noVotes = this.extractVoteCount(embed, 'no') || 0;
      
      logger.info({
        messageId: message.id,
        yesVotes,
        noVotes,
        extractionDetails: {
          fields: embed.fields?.map(f => ({ name: f.name, value: f.value })),
          description: embed.description
        }
      }, 'Vote count extraction results');
      
      // Extract voter IDs from reactions or embed data
      const voterIds = await this.extractVoterIds(message);

      const pollData = {
        question,
        yesVotes,
        noVotes,
        voterIds,
        pollMessageId: message.id
      };
      
      logger.info({
        messageId: message.id,
        pollData
      }, 'Successfully parsed poll data');

      return pollData;
    } catch (error) {
      logger.error({ error, messageId: message.id }, 'Failed to parse poll message');
      return null;
    }
  }

  /**
   * Checks if poll is closed/completed based on embed content
   */
  private isPollClosed(embed: any): boolean {
    const title = embed.title?.toLowerCase() || '';
    const description = embed.description?.toLowerCase() || '';
    const footer = embed.footer?.text?.toLowerCase() || '';
    
    // Look for EasyPoll specific completion indicators
    return description.includes('final result') ||
           description.includes('poll already ended') ||
           description.includes('poll has ended') ||
           title.includes('closed') || 
           title.includes('ended') ||
           footer.includes('closed') ||
           footer.includes('ended');
  }

  /**
   * Extracts vote count for a specific option from embed
   */
  private extractVoteCount(embed: any, option: 'yes' | 'no'): number {
    const description = embed.description || '';
    
    // Look for EasyPoll "Final Result" section
    // Format: ✅ ▓▓▓▓▓▓▓▓▓▓ | 100.0% (1)
    // or:     ❌ ░░░░░░░░░░ | 0.0% (0)
    
    const emoji = option === 'yes' ? '✅' : '❌';
    const lines = description.split('\n');
    
    logger.info({
      option,
      emoji,
      descriptionLines: lines,
      searchingFor: `${emoji} pattern with vote count`
    }, 'Extracting vote count from EasyPoll format');
    
    for (const line of lines) {
      if (line.includes(emoji)) {
        // Look for pattern: | percentage% (count)
        const match = line.match(/\|\s*\d+\.?\d*%\s*\((\d+)\)/);
        if (match) {
          const count = parseInt(match[1], 10);
          logger.info({
            option,
            line,
            extractedCount: count
          }, 'Successfully extracted vote count');
          return count;
        }
      }
    }
    
    logger.warn({
      option,
      emoji,
      description
    }, 'Could not extract vote count from EasyPoll format');
    
    return 0;
  }

  /**
   * Extracts voter IDs from message reactions or embed data
   */
  private async extractVoterIds(message: Message): Promise<string[]> {
    const voterIds: string[] = [];
    
    try {
      // Try to get voter IDs from reactions
      const reactions = message.reactions.cache;
      
      for (const [emoji, reaction] of reactions) {
        if (emoji === '✅' || emoji === '❌') {
          const users = await reaction.users.fetch();
          users.forEach(user => {
            if (!user.bot && !voterIds.includes(user.id)) {
              voterIds.push(user.id);
            }
          });
        }
      }
    } catch (error) {
      logger.warn({ error, messageId: message.id }, 'Failed to extract voter IDs from reactions');
    }
    
    return voterIds;
  }

  /**
   * Gets member count excluding bots
   */
  private async getNonBotMemberCount(guild: Guild): Promise<number> {
    try {
      await guild.members.fetch(); // Ensure all members are cached
      const nonBotMembers = guild.members.cache.filter(member => !member.user.bot);
      return nonBotMembers.size;
    } catch (error) {
      logger.error({ error, guildId: guild.id }, 'Failed to fetch guild members');
      return 0;
    }
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