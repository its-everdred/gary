# Twitter Feature Summary

> High-level overview of the Twitter relay feature for Gary.

## Overview

Add a new Discord channel that automatically relays tweets from member Twitter accounts. When Discord members link their Twitter handles, their tweets are live-posted to a dedicated channel.

## Example

If Alice, Bob, and Charlie are Discord members with linked Twitter accounts, the `#member-tweets` channel would display their tweets in real-time.

## Key Components

- **Database**: Store connections between Discord members and Twitter handles
- **Mod Commands**: New `/mod twitter` commands for managing linked accounts
- **Tweet Relay**: Automatic posting of member tweets to designated channel

## Mod Commands

| Command | Parameters | Description |
|---------|------------|-------------|
| `/mod twitter add` | `user`, `twitter` | Link a Discord user to their Twitter handle |
| `/mod twitter remove` | `user` | Unlink a user's Twitter account |
| `/mod twitter list` | — | List all linked Twitter accounts |

---

*See [TwitterFeatureSpec.md](./TwitterFeatureSpec.md) for detailed implementation.*
