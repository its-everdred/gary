import type { Client } from 'discord.js';
import pino from 'pino';
import { NomineeStateManager } from './nomineeService.js';
import { TimeCalculationService } from './timeCalculation.js';
import { ChannelManagementService } from './channelService.js';
import { AnnouncementService } from './announcementService.js';
import { VoteResultService } from './voteResultService.js';
import { NomineeState } from '@prisma/client';

const logger = pino();

export class StateTransitionProcessor {
  private client: Client;
  private channelService: ChannelManagementService;
  private announcementService: AnnouncementService;
  private voteResultService: VoteResultService;

  constructor(client: Client) {
    this.client = client;
    this.channelService = new ChannelManagementService(client);
    this.announcementService = new AnnouncementService(client);
    this.voteResultService = new VoteResultService(client);
  }

  async processGuildTransitions(guildId: string): Promise<void> {
    const activeNominees = await NomineeStateManager.getActiveNominees(guildId);
    const currentTime = new Date();

    await this.checkDiscussionTransitions(activeNominees, currentTime);
    await this.checkVoteTransitions(activeNominees, currentTime);
    await this.checkCertifyTransitions(activeNominees, currentTime);
  }

  private async checkDiscussionTransitions(activeNominees: any[], currentTime: Date): Promise<void> {
    const readyForDiscussion = TimeCalculationService.getNomineeForStateAtTime(
      activeNominees,
      NomineeState.DISCUSSION,
      currentTime
    );

    if (readyForDiscussion) {
      await this.transitionToDiscussion(readyForDiscussion);
    }
  }

  private async checkVoteTransitions(activeNominees: any[], currentTime: Date): Promise<void> {
    const readyForVote = TimeCalculationService.getNomineeForStateAtTime(
      activeNominees,
      NomineeState.VOTE,
      currentTime
    );

    if (readyForVote) {
      await this.transitionToVote();
    }

    await this.processActiveVotes(activeNominees, currentTime);
  }

  private async processActiveVotes(activeNominees: any[], currentTime: Date): Promise<void> {
    const voteNominees = activeNominees.filter(n => n.state === NomineeState.VOTE);

    for (const nominee of voteNominees) {
      await this.processVoteNominee(nominee, currentTime);
    }
  }

  private async processVoteNominee(nominee: any, currentTime: Date): Promise<void> {
    // Check if governance announcement needs to be sent
    if (!nominee.voteGovernanceAnnounced && nominee.voteChannelId) {
      // This will be handled by VoteAnnouncementManager
    }
    
    // Check if vote has completed
    const voteResults = await this.voteResultService.checkVoteCompletion(nominee);
    
    // Add buffer time for EasyPoll to finalize
    const bufferTime = new Date(currentTime);
    bufferTime.setMinutes(bufferTime.getMinutes() - 1);
    const readyWithBuffer = nominee.certifyStart && nominee.certifyStart <= bufferTime;
    
    if (voteResults || readyWithBuffer) {
      await this.transitionToCertify();
    }
  }

  private async checkCertifyTransitions(activeNominees: any[], currentTime: Date): Promise<void> {
    const certifyNominees = activeNominees.filter(n => n.state === NomineeState.CERTIFY);

    for (const nominee of certifyNominees) {
      const shouldTransition = TimeCalculationService.shouldTransitionToPast(nominee, currentTime);
      if (shouldTransition) {
        await this.transitionToPast();
      }
    }
  }

  private async transitionToDiscussion(nominee: any): Promise<void> {
    const result = await NomineeStateManager.transitionNominee(
      nominee.id,
      NomineeState.DISCUSSION,
      { discussionStart: new Date() }
    );

    if (result.success) {
      const channelResult = await this.channelService.createDiscussionChannel(result.nominee);
      if (!channelResult.success) {
        logger.error({
          nomineeId: nominee.id,
          error: channelResult.errorMessage
        }, 'Failed to create discussion channel');
      } else {
        await this.announcementService.announceDiscussionStart(
          result.nominee, 
          channelResult.channel!.id
        );
      }
    } else {
      logger.error({
        nomineeId: nominee.id,
        error: result.errorMessage
      }, 'Failed to transition nominee to DISCUSSION');
    }
  }

  private async transitionToVote(): Promise<void> {
    // TODO: Implement transition to vote logic
  }

  private async transitionToCertify(): Promise<void> {
    // TODO: Implement transition to certify logic
  }

  private async transitionToPast(): Promise<void> {
    // TODO: Implement transition to past logic  
  }
}