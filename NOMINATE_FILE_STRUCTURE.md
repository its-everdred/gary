# Nominate Command File Structure Plan

## Current Issue
The `nominate.ts` file is already 220+ lines with just `list` and `name` commands. We need to split it before adding `remove`, `start`, and other functionality.

## Proposed Structure

```
src/commands/nominate/
├── index.ts                 # Main command definition and router
├── list.ts                  # /nominate list subcommand
├── name.ts                  # /nominate name subcommand  
├── remove.ts                # /nominate remove subcommand
├── start.ts                 # /nominate start subcommand
└── utils/
    ├── validation.ts        # Common validation logic
    ├── formatting.ts        # List formatting utilities
    └── permissions.ts       # Mod permission checks
```

## File Responsibilities

### `index.ts` (Main Router)
- Export the SlashCommandBuilder definition
- Export the main handler that routes to subcommands
- Keep under 50 lines

### Individual Subcommand Files
- Handle single subcommand logic
- Import shared utilities as needed
- Keep under 100 lines each
- Include error handling and logging

### Utility Files
- `validation.ts`: Name validation, duplicate checking
- `formatting.ts`: List formatting, Discord timestamp helpers
- `permissions.ts`: Moderator permission validation

## Benefits
1. **Maintainability**: Each file has a single responsibility
2. **Testing**: Each subcommand can be tested independently
3. **Collaboration**: Multiple developers can work on different commands
4. **Readability**: Smaller, focused files are easier to understand

## Migration Plan
1. Complete current task (basic `/nominate name`)
2. Implement moderator permission utilities (Task 5) 
3. Split into file structure when implementing `/nominate remove`
4. Move existing logic to new structure
5. Update tests to match new imports

## Example Import Pattern
```typescript
// Instead of:
import { nominateHandler } from './commands/nominate.js';

// We'll use:
import { nominateHandler } from './commands/nominate/index.js';
```

This keeps the external API the same while organizing internal structure.