import type { ChatInputCommandInteraction } from 'discord.js';
import { CommandUtils } from '../../lib/commandUtils.js';
import { ConfigService } from '../../lib/configService.js';
import { PruneService, type InactiveMember } from '../../lib/pruneService.js';
import { formatAbsoluteDate, formatTimeAgo } from '../../lib/pruneFormatUtils.js';

// Safety margin under Discord's 2000-character message limit.
const MAX_MESSAGE_LENGTH = 1900;

/**
 * Builds the ephemeral PRUNE ALERT report, split into Discord-sized messages.
 * Pure function so the formatting/chunking is unit-testable.
 */
export function buildPruneReport(
  members: InactiveMember[],
  pruneWeeks: number,
  now: Date
): string[] {
  if (members.length === 0) {
    return [`✅ No members have been inactive for ${pruneWeeks}+ weeks.`];
  }

  const title = `⚠️ **PRUNE ALERT** — ${members.length} member${
    members.length === 1 ? '' : 's'
  } inactive for ${pruneWeeks}+ weeks`;

  const numberWidth = `${members.length}.`.length;
  const nameWidth = Math.max(...members.map((m) => m.displayName.length));

  const rows = members.map((member, index) => {
    const number = `${index + 1}.`.padEnd(numberWidth);
    const name = member.displayName.padEnd(nameWidth);
    const info = member.lastMessageAt
      ? `${formatAbsoluteDate(member.lastMessageAt)} (${formatTimeAgo(
          member.lastMessageAt,
          now
        )})`
      : `No posts in ${pruneWeeks}+ weeks`;
    return `${number} ${name}  ${info}`;
  });

  // Pack rows into code blocks that each stay under the message limit.
  const messages: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  const flush = () => {
    if (current.length > 0) {
      messages.push('```\n' + current.join('\n') + '\n```');
      current = [];
      currentLength = 0;
    }
  };

  for (const row of rows) {
    if (currentLength + row.length + 1 > MAX_MESSAGE_LENGTH && current.length) {
      flush();
    }
    current.push(row);
    currentLength += row.length + 1;
  }
  flush();

  messages[0] = `${title}\n${messages[0]}`;
  return messages;
}

/**
 * Reports members inactive for at least PRUNE_WEEKS to the calling moderator,
 * silently (ephemeral). Read-only — never kicks or modifies anyone.
 */
export async function handlePruneCheckCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    const guildId = ConfigService.getGuildId();

    const modValidation = await CommandUtils.validateModeratorAccess(
      interaction,
      guildId
    );
    if (!modValidation.isValid) {
      return;
    }

    await interaction.deferReply({ flags: 64 });

    const pruneService = new PruneService(interaction.client);
    const result = await pruneService.getInactiveMembers(guildId);

    const messages = buildPruneReport(
      result.members,
      ConfigService.getPruneWeeks(),
      new Date()
    );

    await interaction.editReply({ content: messages[0] });
    for (let i = 1; i < messages.length; i++) {
      await interaction.followUp({ content: messages[i], flags: 64 });
    }
  } catch (error) {
    await CommandUtils.handleCommandError(
      interaction,
      error,
      'mod prune check',
      'checking for inactive members'
    );
  }
}
