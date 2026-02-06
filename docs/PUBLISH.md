# Publishing skills-lc-cli to npm

This document explains how to publish the CLI tool to the **official npm public registry**, making it available worldwide.

## Prerequisites

1. An npm account (register at https://www.npmjs.com)
2. Node.js >= 18

## Important: Ensure Publishing to Official npm Registry

If you're using a regional mirror (like China's Taobao mirror), you must publish to the **official npm registry**; otherwise, others won't be able to install your package.

### Check Current Registry

```bash
npm config get registry
```

If it doesn't show `https://registry.npmjs.org/`, you need to specify the official registry when publishing.

## Publishing Steps

### 1. Login to Official npm

```bash
# Login to official npm registry (important!)
npm login --registry https://registry.npmjs.org
```

Enter your username, password, and email when prompted.

### 2. Check if Package Name is Available

```bash
npm search skills-lc-cli --registry https://registry.npmjs.org
```

If the name is taken, modify the `name` field in `package.json`.

### 3. Build the Project

```bash
npm install
npm run build
```

### 4. Check Files to be Published

```bash
npm pack --dry-run
```

Confirm only necessary files are included:
- `dist/` - Compiled code
- `README.md` - Documentation
- `package.json` - Package configuration

### 5. Publish to Official npm (Important!)

```bash
# Publish to official npm registry
npm publish --registry https://registry.npmjs.org
```

For first-time public package publishing:
```bash
npm publish --access public --registry https://registry.npmjs.org
```

### 6. Verify Publication

```bash
# View package info from official npm
npm info skills-lc-cli --registry https://registry.npmjs.org

# Test installation (available worldwide)
npx skills-lc-cli help
```

## Updating Versions

### Update Version Number

```bash
# Patch version 1.0.0 -> 1.0.1 (bug fixes)
npm version patch

# Minor version 1.0.0 -> 1.1.0 (new features)
npm version minor

# Major version 1.0.0 -> 2.0.0 (breaking changes)
npm version major
```

### Publish Update

```bash
npm run build
npm publish --registry https://registry.npmjs.org
```

## Usage

After publishing, users worldwide can use:

```bash
# Using npx (no installation required)
npx skills-lc-cli add vercel-labs/agent-skills/react-best-practices

# Global installation
npm install -g skills-lc-cli
skills add vercel-labs/agent-skills/react-best-practices
```

## FAQ

### Q: What if the package name is taken?

Modify the `name` in `package.json`. Options include:
- `skills-cli-tool`
- `ai-agent-skills`
- `@your-username/skills` (scoped package)

### Q: How to use a scoped package name?

1. Modify `package.json`:
```json
{
  "name": "@your-username/skills"
}
```

2. Publish with `--access public`:
```bash
npm publish --access public
```

### Q: How to unpublish?

```bash
# Can unpublish within 72 hours
npm unpublish skills-lc-cli@1.0.0 --registry https://registry.npmjs.org
```

Note: After unpublishing, you cannot republish the same package name for 24 hours.

### Q: Published to wrong registry?

If you published to a private mirror, others can't access it. Republish to official registry:

```bash
# 1. Login to official npm
npm login --registry https://registry.npmjs.org

# 2. Republish
npm publish --registry https://registry.npmjs.org
```

### Q: How to permanently use official npm?

```bash
# Set registry globally
npm config set registry https://registry.npmjs.org

# Or set only for this project (create .npmrc file)
echo "registry=https://registry.npmjs.org" > .npmrc
```

## npm Registry Comparison

| Registry | URL | Accessibility |
|----------|-----|---------------|
| **npm Official** | `https://registry.npmjs.org` | **Worldwide** |
| Regional Mirrors | `https://registry.npmmirror.com` | Read-only mirror |
| Private Registries | `https://packages.aliyun.com/...` | Organization only |
