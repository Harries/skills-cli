# skills-lc-cli

CLI tool for installing AI Agent Skills from [skills.lc](https://skills.lc). Works with 40+ AI agents including Claude Code, Cursor, Windsurf, Qoder, and more.

[![npm version](https://badge.fury.io/js/skills-lc-cli.svg)](https://www.npmjs.com/package/skills-lc-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Search for skills
npx skills-lc-cli search react

# Install a skill by ID (recommended)
npx skills-lc-cli add react-best-practices

# Install from GitHub URL
npx skills-lc-cli add https://github.com/vercel-labs/agent-skills

# Install to specific agent
npx skills-lc-cli add react-best-practices --agent cursor

# List installed skills (interactive delete)
npx skills-lc-cli list
```

## Installation

```bash
# Using npx (recommended, no installation needed)
npx skills-lc-cli add <skillId>

# Or install globally
npm install -g skills-lc-cli
skills-lc add <skillId>
```

## Usage

### Basic Commands

```bash
# Search for skills (interactive with pagination)
skills-lc search react
skills-lc search "python testing"

# Install a skill by ID
skills-lc add react-best-practices
skills-lc add text-generation

# Install from GitHub
skills-lc add vercel-labs/agent-skills
skills-lc add https://github.com/vercel-labs/agent-skills

# List installed skills (with interactive delete)
skills-lc list

# Show help
skills-lc help
```

### Advanced Usage

```bash
# Install to specific agent (project-level)
skills-lc add react-best-practices --agent cursor
skills-lc add composition-patterns --agent windsurf
skills-lc add frontend-design --agent qoder

# Install globally (user-level)
skills-lc add react-best-practices --agent cursor --global
skills-lc add text-generation --agent claude-code --global

# Enable debug mode
skills-lc add react-best-practices --debug
skills-lc search react --debug

# Multi-skill installation (auto-detects all SKILL.md files)
skills-lc add https://github.com/vercel-labs/agent-skills
# Installs all skills found in the repository
```

## Features

- 🚀 **Zero Configuration** - Automatically detects your AI agent and installs to the right location
- 🔍 **Interactive Search** - Search skills with pagination and one-click installation
- 📦 **Multi-Skill Install** - Automatically detects and installs all skills from a repository
- 🎯 **40+ Agent Support** - Works with Claude Code, Cursor, Windsurf, Qoder, Cline, and more
- 🌍 **Project & Global** - Install to project directory or user home directory
- 🗑️ **Interactive Delete** - List and delete skills with interactive prompts
- 🐛 **Debug Mode** - Verbose logging with `--debug` flag
- 💾 **Offline Support** - Works with GitHub without internet (no API required)

## Supported AI Agents

The CLI supports 40+ AI agents with both **project-level** and **global** installation:

### Popular Agents

| Agent | Project Path | Global Path |
|-------|--------------|-------------|
| **Claude Code** | `.claude/skills/` | `~/.claude/skills/` |
| **Cursor** | `.cursor/skills/` | `~/.cursor/skills/` |
| **Windsurf** | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| **Qoder** | `.qoder/skills/` | `~/.qoder/skills/` |
| **Cline** | `.cline/skills/` | `~/.cline/skills/` |
| **Continue** | `.continue/skills/` | `~/.continue/skills/` |
| **Roo Code** | `.roo/skills/` | `~/.roo/skills/` |
| **GitHub Copilot** | `.github/skills/` | `~/.copilot/skills/` |

### All Supported Agents

<details>
<summary>Click to expand full list (40+ agents)</summary>

- Amp, Kimi Code CLI
- Antigravity
- Augment
- Claude Code
- OpenClaw
- Cline
- CodeBuddy
- Codex
- Command Code
- Continue
- Crush
- Cursor
- Droid
- Gemini CLI
- GitHub Copilot
- Goose
- Junie
- iFlow CLI
- Kilo Code
- Kiro CLI
- Kode
- MCPJam
- Mistral Vibe
- Mux
- OpenCode
- OpenClaude IDE
- OpenHands
- Pi
- Qoder
- Qwen Code
- Replit
- Roo Code
- Trae
- Trae CN
- Windsurf
- Zencoder
- Neovate
- Pochi
- AdaL
- Local (`.skills/` directory)

</details>

### Usage Examples

```bash
# Auto-detect agent
skills-lc add react-best-practices

# Install to Cursor (project)
skills-lc add react-best-practices --agent cursor

# Install to Windsurf (global)
skills-lc add react-best-practices --agent windsurf --global

# Install to Qoder
skills-lc add composition-patterns --agent qoder
```

## How It Works

1. **Search** - Browse skills from skills.lc registry with interactive pagination
2. **Fetch** - Downloads SKILL.md files from GitHub repositories (supports multiple skills)
3. **Detect** - Automatically identifies your AI agent or uses specified `--agent`
4. **Install** - Saves skills to appropriate directory (project or global with `--global`)
5. **Record** - Reports installation to skills.lc for analytics

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SKILLS_API_TOKEN` | No | API token (optional, has default) |
| `SKILLS_API_URL` | No | API base URL (default: https://skills.lc) |

## Examples

### Search and Install

```bash
# Interactive search with pagination
npx skills-lc-cli search react
# Select [1-10] to install, [n] for next page, [p] for previous, [q] to quit
```

### Install by Skill ID

```bash
# From skills.lc registry (easiest)
npx skills-lc-cli add react-best-practices
npx skills-lc-cli add text-generation
npx skills-lc-cli add composition-patterns
```

### Install from GitHub

```bash
# Install all skills from a repository
npx skills-lc-cli add vercel-labs/agent-skills
# Auto-detects and installs all SKILL.md files

# Install from full GitHub URL
npx skills-lc-cli add https://github.com/vercel-labs/agent-skills

# Install specific skill path
npx skills-lc-cli add https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns
```

### Install to Specific Agent

```bash
# Install to Cursor (project-level)
npx skills-lc-cli add react-best-practices --agent cursor

# Install to Windsurf (global)
npx skills-lc-cli add react-best-practices --agent windsurf --global

# Install to Qoder
npx skills-lc-cli add frontend-design --agent qoder

# Install to Claude Code (global)
npx skills-lc-cli add text-generation --agent claude-code --global
```

### List and Delete

```bash
# List all installed skills (interactive)
npx skills-lc-cli list
# Select [1-N] to delete, [q] to quit
# Confirms before deletion
```

### Debug Mode

```bash
# Show detailed logs
npx skills-lc-cli add react-best-practices --debug
npx skills-lc-cli search react --debug

# See API requests, responses, and GitHub fetches
```

### Custom API Endpoint

```bash
# Use custom API URL
SKILLS_API_URL=https://my-api.com npx skills-lc-cli search react
SKILLS_API_URL=https://my-api.com npx skills-lc-cli add owner/repo/skill
```

## Links

- [Skills Directory](https://skills.lc) - Browse all available skills
- [GitHub](https://github.com/Harries/skills-cli) - Source code

## Contributing

Contributions are welcome! See documentation in the [docs](https://github.com/Harries/skills-cli/tree/main/docs) folder.

## License

MIT

