# skills-lc-cli

CLI tool for installing AI Agent Skills from [skills.lc](https://skills.lc). Works with Claude Code, Cursor, Codex and more.

[![npm version](https://badge.fury.io/js/skills-lc-cli.svg)](https://www.npmjs.com/package/skills-lc-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Install a skill with npx (no installation required)
npx skills-lc-cli add vercel-labs/agent-skills/react-best-practices
```

## Installation

```bash
# Using npx (recommended, no installation needed)
npx skills-lc-cli add <owner/repo/skillId>

# Or install globally
npm install -g skills-lc-cli
skills add <owner/repo/skillId>
```

## Usage

```bash
# Install a skill from GitHub
skills add vercel-labs/agent-skills/react-best-practices
skills add anthropics/skills/frontend-design

# List installed skills
skills list

# Show help
skills help
```

## Supported AI Agents

The CLI automatically detects your environment and installs skills to the right location:

| Agent | Config Path | Description |
|-------|-------------|-------------|
| Claude Code | `~/.claude/CLAUDE.md` | Anthropic's AI coding assistant |
| Cursor | `.cursor/rules/skill.mdc` | Cursor IDE rules |
| Codex | `~/.codex/instructions.md` | OpenAI Codex CLI |
| Local | `.skills/*.md` | Local project directory |

## How It Works

1. **Fetches** the SKILL.md file from the specified GitHub repository
2. **Detects** which AI agent you're using
3. **Installs** the skill to the appropriate configuration file
4. **Records** the installation for analytics

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILLS_API_URL` | `https://skills.lc` | API base URL for analytics |

## Examples

```bash
# Install React best practices from Vercel
npx skills-lc-cli add vercel-labs/agent-skills/react-best-practices

# Install frontend design skill from Anthropic
npx skills-lc-cli add anthropics/skills/frontend-design

# Install with custom API endpoint
SKILLS_API_URL=https://my-api.com npx skills-lc-cli add owner/repo/skill
```

## Links

- [Skills Directory](https://skills.lc) - Browse all available skills
- [Documentation](https://github.com/anthropics/skills/blob/main/docs/cli-guide.md) - Full CLI guide
- [GitHub](https://github.com/anthropics/skills) - Source code

## License

MIT

