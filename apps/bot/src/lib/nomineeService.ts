import type { Nominee } from '@prisma/client';
import { NomineeState } from '@prisma/client';
import { prisma } from './db.js';
import pino from 'pino';

const logger = pino();

export interface NomineeValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

export interface StateTransitionResult {
  success: boolean;
  errorMessage?: string;
  nominee?: Nominee;
}

export class NomineeStateManager {
  /**
   * Validates if a nominee can transition to a new state
   */
  static async validateStateTransition(
    nominee: Nominee,
    newState: NomineeState
  ): Promise<NomineeValidationResult> {
    const currentState = nominee.state;
    
    // Define valid state transitions
    const validTransitions: Record<NomineeState, NomineeState[]> = {
      [NomineeState.ACTIVE]: [NomineeState.DISCUSSION, NomineeState.PAST],
      [NomineeState.DISCUSSION]: [NomineeState.VOTE, NomineeState.PAST],
      [NomineeState.VOTE]: [NomineeState.CERTIFY, NomineeState.PAST],
      [NomineeState.CERTIFY]: [NomineeState.PAST],
      [NomineeState.PAST]: [] // No transitions from PAST
    };

    if (!validTransitions[currentState].includes(newState)) {
      return {
        isValid: false,
        errorMessage: `Invalid state transition from ${currentState} to ${newState}`
      };
    }

    // Additional validation based on target state
    switch (newState) {
      case NomineeState.DISCUSSION:
        return await this.validateDiscussionStart(nominee);
      
      case NomineeState.VOTE:
        return await this.validateVoteStart(nominee);
      
      case NomineeState.CERTIFY:
        return await this.validateCertifyStart(nominee);
      
      default:
        return { isValid: true };
    }
  }

  /**
   * Validates if discussion can start for a nominee
   */
  private static async validateDiscussionStart(nominee: Nominee): Promise<NomineeValidationResult> {
    // Check if there's already another nominee in DISCUSSION, VOTE, or CERTIFY state
    const existingInProgress = await prisma.nominee.findFirst({
      where: {
        guildId: nominee.guildId,
        state: {
          in: [NomineeState.DISCUSSION, NomineeState.VOTE, NomineeState.CERTIFY]
        },
        id: {
          not: nominee.id
        }
      }
    });

    if (existingInProgress) {
      return {
        isValid: false,
        errorMessage: `Cannot start discussion: ${existingInProgress.name} is already in ${existingInProgress.state.toLowerCase()} state`
      };
    }

    return { isValid: true };
  }

  /**
   * Validates if vote can start for a nominee
   */
  private static async validateVoteStart(nominee: Nominee): Promise<NomineeValidationResult> {
    if (nominee.state !== NomineeState.DISCUSSION) {
      return {
        isValid: false,
        errorMessage: 'Nominee must be in DISCUSSION state to start voting'
      };
    }

    if (!nominee.discussionStart) {
      return {
        isValid: false,
        errorMessage: 'Discussion start time must be set before starting vote'
      };
    }

    return { isValid: true };
  }

  /**
   * Validates if certification can start for a nominee
   */
  private static async validateCertifyStart(nominee: Nominee): Promise<NomineeValidationResult> {
    if (nominee.state !== NomineeState.VOTE) {
      return {
        isValid: false,
        errorMessage: 'Nominee must be in VOTE state to start certification'
      };
    }

    if (!nominee.voteStart) {
      return {
        isValid: false,
        errorMessage: 'Vote start time must be set before starting certification'
      };
    }

    return { isValid: true };
  }

  /**
   * Transitions a nominee to a new state with validation
   */
  static async transitionNominee(
    nomineeId: string,
    newState: NomineeState,
    updateData?: Partial<Nominee>
  ): Promise<StateTransitionResult> {
    try {
      // Get current nominee
      const nominee = await prisma.nominee.findUnique({
        where: { id: nomineeId }
      });

      if (!nominee) {
        return {
          success: false,
          errorMessage: 'Nominee not found'
        };
      }

      // Validate transition
      const validation = await this.validateStateTransition(nominee, newState);
      if (!validation.isValid) {
        return {
          success: false,
          errorMessage: validation.errorMessage
        };
      }

      // Update nominee state
      const updatedNominee = await prisma.nominee.update({
        where: { id: nomineeId },
        data: {
          state: newState,
          ...updateData
        }
      });


      return {
        success: true,
        nominee: updatedNominee
      };

    } catch (error) {
      logger.error({ error, nomineeId, newState }, 'Nominee state transition failed');
      return {
        success: false,
        errorMessage: 'Failed to transition nominee state'
      };
    }
  }

  /**
   * Gets the next nominee in queue for discussion
   */
  static async getNextNomineeForDiscussion(guildId: string): Promise<Nominee | null> {
    return await prisma.nominee.findFirst({
      where: {
        guildId,
        state: NomineeState.ACTIVE
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  /**
   * Gets the current nominee in a specific state
   */
  static async getCurrentNomineeInState(
    guildId: string, 
    state: NomineeState
  ): Promise<Nominee | null> {
    return await prisma.nominee.findFirst({
      where: {
        guildId,
        state
      }
    });
  }

  /**
   * Checks if any nominee is currently in progress states
   */
  static async hasNomineeInProgress(guildId: string): Promise<boolean> {
    const count = await prisma.nominee.count({
      where: {
        guildId,
        state: {
          in: [NomineeState.DISCUSSION, NomineeState.VOTE, NomineeState.CERTIFY]
        }
      }
    });

    return count > 0;
  }

  /**
   * Gets all active nominees for a guild
   */
  static async getActiveNominees(guildId: string): Promise<Nominee[]> {
    return await prisma.nominee.findMany({
      where: {
        guildId,
        state: {
          not: NomineeState.PAST
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  /**
   * Finds a nominee by name in a guild (case-insensitive)
   */
  static async findNomineeByName(guildId: string, name: string): Promise<Nominee | null> {
    return await prisma.nominee.findFirst({
      where: {
        guildId,
        name: {
          equals: name,
          mode: 'insensitive'
        }
      }
    });
  }

  /**
   * Gets the current nominee in any progress state (DISCUSSION, VOTE, CERTIFY)
   */
  static async getCurrentNomineeInProgress(guildId: string): Promise<Nominee | null> {
    const inProgressStates: NomineeState[] = [NomineeState.DISCUSSION, NomineeState.VOTE, NomineeState.CERTIFY];
    
    return await prisma.nominee.findFirst({
      where: {
        guildId,
        state: {
          in: inProgressStates
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }
}