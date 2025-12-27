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
        return null;
      }

      const guild = await this.client.guilds.fetch(nominee.guildId);
      const voteChannel = guild.channels.cache.get(nominee.voteChannelId) as TextChannel;
      
      if (!voteChannel) {
        return null;
      }

      // Find EasyPoll message in the channel
      const pollData = await this.findPollInChannel(voteChannel);
      if (!pollData) {
        // No completed poll found yet
        return null;
      }

      // Calculate member count (excluding bots)
      const memberCount = await this.getNonBotMemberCount(guild);
      
      // Calculate results
      const results = this.calculateVoteResults(pollData, memberCount);
      
      // Update nominee with poll results
      await this.updateNomineeWithResults(nominee.id, results, pollData);

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
  private async findPollInChannel(channel: TextChannel): Promise<PollData | null> {
    try {
      // Fetch recent messages to find the poll - force cache bypass
      const messages = await channel.messages.fetch({ limit: 50, force: true });
      
      for (const message of messages.values()) {
        // Only check EasyPoll messages
        if (!this.isEasyPollMessage(message)) continue;
        
        // For EasyPoll, try to match any recent poll (assume it's the one we want)
        const isRecentPoll = message.createdTimestamp > (Date.now() - (2 * 60 * 60 * 1000));
        if (!isRecentPoll) continue;

        // Force refetch the specific message to get latest embed data
        const refreshedMessage = await channel.messages.fetch(message.id, { force: true });
        
        // Check the refreshed message
        
        // Parse poll data from the refreshed message
        const pollData = await this.parsePollMessage(refreshedMessage);
        if (pollData) {
          // Successfully parsed EasyPoll results
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
    const authorId = message.author.id;
    const easyPollIds = ['437618149505105920'];
    return easyPollIds.includes(authorId);
  }

  /**
   * Parses poll data from EasyPoll message
   */
  private async parsePollMessage(message: Message): Promise<PollData | null> {
    try {
      // EasyPoll puts results in the embed description
      const embed = message.embeds[0];
      
      // Check if poll has final results in embed
      const hasFinalResults = embed?.description?.includes('Final Result');
      
      if (!hasFinalResults) return null;
      
      // EasyPoll results are always in the embed description
      const textToParse = embed.description || '';
      
      // Extract question - look for "Question" section with bold markers
      const questionMatch = textToParse.match(/\*\*Question\*\*\s*\n(.+?)(?:\n|$)/);
      const question = questionMatch ? questionMatch[1].trim() : 'Unknown';
      
      // Parse vote counts from "Final Result" section
      const yesVotes = this.extractVoteCountFromText(textToParse, 'yes');
      const noVotes = this.extractVoteCountFromText(textToParse, 'no');
      
      // Extract voter IDs from reactions
      const voterIds = await this.extractVoterIds(message);

      return {
        question,
        yesVotes,
        noVotes,
        voterIds,
        pollMessageId: message.id
      };
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
    const emoji = option === 'yes' ? '✅' : '❌';
    const lines = description.split('\n');
    
    for (const line of lines) {
      if (line.includes(emoji)) {
        // Look for pattern: | percentage% (count)
        const match = line.match(/\|\s*\d+\.?\d*%\s*\((\d+)\)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    }
    
    return 0;
  }

  /**
   * Extracts vote count from text content
   */
  private extractVoteCountFromText(text: string, option: 'yes' | 'no'): number {
    const emoji = option === 'yes' ? '✅' : '❌';
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.includes(emoji)) {
        // Look for pattern with progress bars: ▓▓▓ | percentage% (count)
        // The line format is: ✅ ▓▓▓▓▓▓▓▓▓▓ | 100.0% (1)
        const match = line.match(/[▓░]+\s*\|\s*(\d+\.?\d*)%\s*\((\d+)\)/);
        if (match) {
          const count = parseInt(match[2], 10);
          return count;
        }
      }
    }
    
    return 0;
  }

  /**
   * Extracts voter IDs from message reactions or embed data
   */
  private async extractVoterIds(message: Message): Promise<string[]> {
    const voterIds: string[] = [];
    
    try {
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
      // Silent fail for voter ID extraction
    }
    
    return voterIds;
  }

  /**
   * Gets member count (uses total member count, same as warn feature)
   */
  private async getNonBotMemberCount(guild: Guild): Promise<number> {
    // Use guild.memberCount which doesn't require GuildMembers intent
    // This includes bots but is consistent with how the warn feature works
    return guild.memberCount || 1;
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

  /**
   * Gets the appropriate description text based on vote results
   */
  private getVoteResultDescription(nomineeName: string, voteResults: VoteResults): string {
    if (voteResults.passed) {
      return `🗳️ ${nomineeName} met quorum and succeeded! They will receive an invite within 24 hours.`;
    }
    
    // Failed - determine the reason
    if (!voteResults.quorumMet) {
      return `🗳️ ${nomineeName} failed to meet quorum.`;
    }
    
    // Met quorum but didn't get enough yes votes
    const yesPercentage = voteResults.totalVotes > 0 
      ? Math.round((voteResults.yesVotes / voteResults.totalVotes) * 100) 
      : 0;
    
    return `🗳️ ${nomineeName} met quorum but only received ${yesPercentage}% yes votes.`;
  }

  /**
   * Creates the vote results embed (shared between vote and governance channels)
   */
  private createVoteResultsEmbed(nominee: Nominee, voteResults: VoteResults): any {
    return {
      title: voteResults.passed ? '✅ Vote PASSED' : '❌ Vote FAILED',
      description: this.getVoteResultDescription(nominee.name, voteResults),
      fields: [
        {
          name: '📊 Vote Breakdown',
          value: `✅ Yes: ${voteResults.yesVotes}\n❌ No: ${voteResults.noVotes}\n\n📈 Total: ${voteResults.totalVotes}`,
          inline: true
        },
        {
          name: '📋 Requirements',
          value: `Quorum: ${voteResults.quorumMet ? '✅' : '❌'} ${voteResults.totalVotes}/${voteResults.requiredQuorum} votes\nApproval: ${voteResults.passThresholdMet ? '✅' : '❌'} ${Math.round((voteResults.yesVotes / voteResults.totalVotes) * 100)}% (need 80%)`,
          inline: true
        }
      ],
      color: voteResults.passed ? 0x00ff00 : 0xff0000,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Posts the vote results to the vote channel
   */
  async postDetailedVoteResults(nominee: Nominee, voteResults: VoteResults): Promise<void> {
    try {
      if (!nominee.voteChannelId) {
        return;
      }

      const channel = await this.client.channels.fetch(nominee.voteChannelId) as TextChannel;
      if (!channel) {
        return;
      }

      const resultEmbed = this.createVoteResultsEmbed(nominee, voteResults);
      await channel.send({ embeds: [resultEmbed] });

      // Vote results posted successfully
    } catch (error) {
      logger.error({ error, nomineeId: nominee.id }, 'Failed to post detailed vote results');
    }
  }

  /**
   * Posts the same vote results to the governance channel
   */
  async postVoteResultsToGovernance(nominee: Nominee, voteResults: VoteResults): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(nominee.guildId);
      const governanceChannel = await this.findGovernanceChannel(guild);
      
      if (!governanceChannel) {
        return;
      }

      const resultEmbed = this.createVoteResultsEmbed(nominee, voteResults);
      await governanceChannel.send({ embeds: [resultEmbed] });

    } catch (error) {
      logger.error({ error, nomineeId: nominee.id }, 'Failed to post vote results to governance');
    }
  }

  /**
   * Finds the governance channel in a guild
   */
  private async findGovernanceChannel(guild: any): Promise<any> {
    const governanceChannelId = process.env.GOVERNANCE_CHANNEL_ID;
    if (!governanceChannelId) {
      return null;
    }

    const channel = guild.channels.cache.get(governanceChannelId);
    return channel?.isTextBased() ? channel : null;
  }


}
