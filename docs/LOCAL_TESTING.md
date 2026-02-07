# Local Development & Testing Guide

This document explains how to test the skills-lc-cli locally during development.

## Prerequisites

- Node.js >= 18
- npm or yarn

## Setup

```bash
# Clone the repository
git clone <repository-url>
cd skill-cli

# Install dependencies
npm install
```

## Development Commands

### Run Directly (Development Mode)

Use `npm run dev` to run the CLI without building:

```bash
# Show help
npm run dev help

# Search for skills
npm run dev search react

# Add a skill
npm run dev add vercel-labs/agent-skills/react-best-practices

# List installed skills
npm run dev list
```

### Build and Run

```bash
# Build TypeScript to JavaScript
npm run build

# Run the built version
node dist/index.js help
node dist/index.js search react
node dist/index.js add vercel-labs/agent-skills/react-best-practices
```

## Local Global Installation (Testing)

To test the CLI as if it were installed globally:

```bash
# Build first
npm run build

# Link the package globally
npm link

# Now you can use the CLI commands
skills-lc help
skills-lc search react
skills-lc add vercel-labs/agent-skills/react-best-practices
skills-lc list

# Unlink when done testing
npm unlink -g skills-lc-cli
```

## Testing Individual Features

### Test Search

```bash
# Search with different queries
npm run dev search react
npm run dev search "python testing"
npm run dev search typescript
```

### Test Add/Install

```bash
# Test with different skill paths
npm run dev add vercel-labs/agent-skills/react-best-practices
npm run dev add anthropics/skills/frontend-design

# Test with owner/repo format (auto-detect skill)
npm run dev add vercel-labs/agent-skills
```

### Test List

```bash
npm run dev list
```

## Environment Variables

You can override default settings during testing:

```bash
# Use a different API URL
SKILLS_API_URL=http://localhost:3000 npm run dev search react

# Use a different API token
SKILLS_API_TOKEN=your_test_token npm run dev search react
```

## Debug Mode

Add console.log statements to debug:

```typescript
// In src/index.ts
console.log('Debug:', variable);
```

Then run with:

```bash
npm run dev <command>
```

## Testing Agent Detection

The CLI auto-detects AI agents. To test different agents:

```bash
# Create test directories to simulate different agents
mkdir -p ~/.claude
mkdir -p .cursor/rules
mkdir -p ~/.codex

# Run the CLI and check which agent is detected
npm run dev add vercel-labs/agent-skills/react-best-practices
```

## Verify Build Before Publishing

```bash
# Clean build
rm -rf dist/
npm run build

# Check what files will be published
npm pack --dry-run

# Test the built CLI
node dist/index.js help
```

## Common Issues

### TypeScript Errors

```bash
# Check for type errors
npx tsc --noEmit
```

### Permission Issues (after npm link)

```bash
# If 'skills-lc' command not found after linking
npm unlink -g skills-lc-cli
npm link
```

### API Errors

If search fails, check:
1. Network connectivity
2. API token validity
3. API URL correctness

```bash
# Test API directly
curl -X GET "https://skills.lc/api/v1/skills/search?q=react&limit=5" \
  -H "Authorization: Bearer <token>"
```

## Quick Test Checklist

- [ ] `npm run dev help` - Shows help message
- [ ] `npm run dev search react` - Returns search results
- [ ] `npm run dev add vercel-labs/agent-skills/react-best-practices` - Installs skill
- [ ] `npm run dev list` - Lists installed skills
- [ ] `npm run build` - Builds without errors
- [ ] `npm link && skills-lc help` - Works as global command
