#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// API Configuration
const API_BASE_URL = process.env.SKILLS_API_URL || "https://skills.lc";
const API_TOKEN = process.env.SKILLS_API_TOKEN || "";

// Color output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string) {
  console.log(message);
}

function success(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function error(message: string) {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
}

function info(message: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
}

// HTTP request wrapper
function request(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "skills-cli/1.0.0",
          ...options.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, data }));
      }
    );

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Parse skill path: owner/repo/skillId or owner/repo
function parseSkillPath(skillPath: string): { owner: string; repo: string; skillId?: string } | null {
  const parts = skillPath.split("/");
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  } else if (parts.length === 3) {
    return { owner: parts[0], repo: parts[1], skillId: parts[2] };
  }
  return null;
}

// Comprehensive list of skill directory locations
const SKILL_DIRECTORIES = [
  'skills',
  'skills/.curated',
  'skills/.experimental',
  'skills/.system',
  '.agents/skills',
  '.agent/skills',
  '.augment/rules',
  '.claude/skills',
  '.cline/skills',
  '.codebuddy/skills',
  '.codex/skills',
  '.commandcode/skills',
  '.continue/skills',
  '.crush/skills',
  '.cursor/skills',
  '.factory/skills',
  '.gemini/skills',
  '.github/skills',
  '.goose/skills',
  '.junie/skills',
  '.iflow/skills',
  '.kilocode/skills',
  '.kiro/skills',
  '.kode/skills',
  '.mcpjam/skills',
  '.vibe/skills',
  '.mux/skills',
  '.opencode/skills',
  '.openclaude/skills',
  '.openhands/skills',
  '.pi/skills',
  '.qoder/skills',
  '.qwen/skills',
  '.roo/skills',
  '.trae/skills',
  '.windsurf/skills',
  '.zencoder/skills',
  '.neovate/skills',
  '.pochi/skills',
  '.adal/skills',
  'plugins',
];

// Build comprehensive list of possible paths for a skillId
function buildPossiblePaths(skillId?: string): string[] {
  const paths: string[] = ['SKILL.md'];

  if (skillId) {
    paths.push(`${skillId}/SKILL.md`);
    paths.push(`${skillId}.md`);

    for (const dir of SKILL_DIRECTORIES) {
      paths.push(`${dir}/${skillId}/SKILL.md`);
      paths.push(`${dir}/${skillId}.md`);
    }
  }

  for (const dir of SKILL_DIRECTORIES) {
    paths.push(`${dir}/SKILL.md`);
  }

  return paths;
}

// Fetch SKILL.md content from GitHub
async function fetchSkillFromGitHub(
  owner: string,
  repo: string,
  skillId?: string
): Promise<{ content: string; skillId: string } | null> {
  const possiblePaths = buildPossiblePaths(skillId);
  const branches = ['main', 'master'];

  for (const branch of branches) {
    for (const skillPath of possiblePaths) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`;
      try {
        const res = await request(url);
        if (res.status === 200) {
          const resolvedSkillId = skillId || extractSkillIdFromPath(skillPath) || repo;
          return { content: res.data, skillId: resolvedSkillId };
        }
      } catch {
        // Continue to next path
      }
    }
  }
  return null;
}

// Extract skillId from path like "skills/my-skill/SKILL.md" -> "my-skill"
function extractSkillIdFromPath(path: string): string | null {
  const match = path.match(/\/([^/]+)\/SKILL\.md$/);
  if (match) return match[1];
  
  const mdMatch = path.match(/\/([^/]+)\.md$/);
  if (mdMatch && mdMatch[1] !== 'SKILL') return mdMatch[1];
  
  return null;
}

// Record install to API
async function recordInstall(skillId: string, source: string): Promise<boolean> {
  try {
    const res = await request(`${API_BASE_URL}/api/install`, {
      method: "POST",
      body: JSON.stringify({ skillId, source: "cli" }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// Detect Agent type
function detectAgent(): { type: string; configPath: string } | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const cwd = process.cwd();

  // Claude Code / Anthropic
  const claudeConfig = path.join(homeDir, ".claude", "CLAUDE.md");
  if (fs.existsSync(path.dirname(claudeConfig))) {
    return { type: "claude", configPath: claudeConfig };
  }

  // Cursor
  const cursorConfig = path.join(cwd, ".cursor", "rules");
  if (fs.existsSync(path.dirname(cursorConfig))) {
    return { type: "cursor", configPath: path.join(cursorConfig, "skill.mdc") };
  }

  // Codex
  const codexConfig = path.join(homeDir, ".codex", "instructions.md");
  if (fs.existsSync(path.dirname(codexConfig))) {
    return { type: "codex", configPath: codexConfig };
  }

  // Default to local .skills folder
  return { type: "local", configPath: path.join(cwd, ".skills") };
}

// Install Skill
async function installSkill(skillPath: string): Promise<void> {
  log("");
  info(`Installing skill: ${colors.bright}${skillPath}${colors.reset}`);

  const parsed = parseSkillPath(skillPath);
  if (!parsed) {
    error("Invalid skill path. Use format: owner/repo or owner/repo/skillId");
    process.exit(1);
  }

  const { owner, repo, skillId } = parsed;
  const source = `${owner}/${repo}`;

  info("Fetching skill from GitHub...");
  const skill = await fetchSkillFromGitHub(owner, repo, skillId);

  if (!skill) {
    error(`Could not find SKILL.md in ${source}${skillId ? `/skills/${skillId}` : ""}`);
    process.exit(1);
  }

  success(`Found skill: ${skill.skillId}`);

  const agent = detectAgent();
  if (!agent) {
    error("Could not detect AI agent configuration");
    process.exit(1);
  }

  info(`Detected agent: ${colors.bright}${agent.type}${colors.reset}`);

  const configDir = path.dirname(agent.configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (agent.type === "local") {
    const skillFile = path.join(agent.configPath, `${skill.skillId}.md`);
    if (!fs.existsSync(agent.configPath)) {
      fs.mkdirSync(agent.configPath, { recursive: true });
    }
    fs.writeFileSync(skillFile, skill.content, "utf-8");
    success(`Saved to ${skillFile}`);
  } else {
    const separator = "\n\n---\n\n";
    const header = `<!-- Skill: ${skill.skillId} from ${source} -->\n`;
    const content = header + skill.content;

    if (fs.existsSync(agent.configPath)) {
      const existing = fs.readFileSync(agent.configPath, "utf-8");
      if (existing.includes(`Skill: ${skill.skillId}`)) {
        info("Skill already installed, updating...");
        const regex = new RegExp(
          `<!-- Skill: ${skill.skillId} from [^>]+ -->\\n[\\s\\S]*?(?=<!-- Skill:|$)`,
          "g"
        );
        const updated = existing.replace(regex, content + separator);
        fs.writeFileSync(agent.configPath, updated, "utf-8");
      } else {
        fs.appendFileSync(agent.configPath, separator + content, "utf-8");
      }
    } else {
      fs.writeFileSync(agent.configPath, content, "utf-8");
    }
    success(`Installed to ${agent.configPath}`);
  }

  info("Recording install...");
  const recorded = await recordInstall(skill.skillId, source);
  if (recorded) {
    success("Install recorded successfully");
  } else {
    info("Could not record install (API may be unavailable)");
  }

  log("");
  success(`${colors.bright}Skill installed successfully!${colors.reset}`);
  log("");
}

// List installed Skills
function listSkills(): void {
  const agent = detectAgent();
  if (!agent) {
    error("Could not detect AI agent configuration");
    process.exit(1);
  }

  log("");
  info(`Agent: ${colors.bright}${agent.type}${colors.reset}`);
  info(`Config: ${agent.configPath}`);
  log("");

  if (agent.type === "local") {
    if (!fs.existsSync(agent.configPath)) {
      info("No skills installed yet.");
      return;
    }
    const files = fs.readdirSync(agent.configPath).filter((f) => f.endsWith(".md"));
    if (files.length === 0) {
      info("No skills installed yet.");
      return;
    }
    log("Installed skills:");
    files.forEach((f) => {
      log(`  ${colors.green}•${colors.reset} ${f.replace(".md", "")}`);
    });
  } else {
    if (!fs.existsSync(agent.configPath)) {
      info("No skills installed yet.");
      return;
    }
    const content = fs.readFileSync(agent.configPath, "utf-8");
    const matches = content.match(/<!-- Skill: ([^ ]+) from ([^ ]+) -->/g);
    if (!matches || matches.length === 0) {
      info("No skills installed yet.");
      return;
    }
    log("Installed skills:");
    matches.forEach((m) => {
      const match = m.match(/<!-- Skill: ([^ ]+) from ([^ ]+) -->/);
      if (match) {
        log(`  ${colors.green}•${colors.reset} ${match[1]} ${colors.dim}(${match[2]})${colors.reset}`);
      }
    });
  }
  log("");
}

// Search Skills
async function searchSkills(query: string): Promise<void> {
  log("");
  info(`Searching for: ${colors.bright}${query}${colors.reset}`);

  try {
    const res = await request(`${API_BASE_URL}/api/v1/skills/search?q=${encodeURIComponent(query)}&limit=20`);
    
    if (res.status !== 200) {
      error("Failed to search skills");
      return;
    }

    const response = JSON.parse(res.data);
    
    if (!response.success || !response.data?.skills || response.data.skills.length === 0) {
      info("No skills found");
      return;
    }

    const { skills, pagination } = response.data;

    log("");
    log(`Found ${colors.bright}${pagination.total}${colors.reset} skills (showing ${skills.length}):`);
    log("");

    skills.forEach((skill: any) => {
      log(`${colors.green}●${colors.reset} ${colors.bright}${skill.name}${colors.reset}`);
      log(`  ${colors.dim}${skill.source}/${skill.skillId}${colors.reset}`);
      if (skill.description) {
        log(`  ${skill.description}`);
      }
      if (skill.author) {
        log(`  ${colors.cyan}Author:${colors.reset} ${skill.author}`);
      }
      if (skill.tags && skill.tags.length > 0) {
        log(`  ${colors.cyan}Tags:${colors.reset} ${skill.tags.join(', ')}`);
      }
      log(`  ${colors.yellow}★${colors.reset} ${skill.stars} stars`);
      log("");
    });

    if (pagination.hasMore) {
      log(`${colors.dim}Showing page ${pagination.page} of ${pagination.totalPages}${colors.reset}`);
    }
    log(`${colors.dim}To install: npx skills-lc-cli add <source/skillId>${colors.reset}`);
    log("");
  } catch (err) {
    error("Search failed. API may be unavailable.");
    info("Try browsing skills at https://skills.lc");
  }
}

// Show help
function showHelp(): void {
  log(`
${colors.bright}skills${colors.reset} - AI Agent Skills CLI

${colors.bright}USAGE${colors.reset}
  npx skills-lc-cli <command> [options]

${colors.bright}COMMANDS${colors.reset}
  add <owner/repo/skillId>    Install a skill from GitHub
  add <owner/repo>            Install default skill from a repo
  list                        List installed skills
  search <query>              Search for skills
  help                        Show this help message

${colors.bright}EXAMPLES${colors.reset}
  npx skills-lc-cli add vercel-labs/agent-skills/react-best-practices
  npx skills-lc-cli add anthropics/skills/frontend-design
  npx skills-lc-cli search react
  npx skills-lc-cli list

${colors.bright}ENVIRONMENT${colors.reset}
  SKILLS_API_URL    API base URL (default: https://skills.lc)

${colors.bright}SUPPORTED AGENTS${colors.reset}
  • Claude Code    ~/.claude/CLAUDE.md
  • Cursor         .cursor/rules/skill.mdc
  • Codex          ~/.codex/instructions.md
  • Local          .skills/*.md
`);
}

// Main function
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "add":
    case "install":
      if (!args[1]) {
        error("Please specify a skill to install");
        log("Usage: npx skills-lc-cli add <owner/repo/skillId>");
        process.exit(1);
      }
      await installSkill(args[1]);
      break;

    case "list":
    case "ls":
      listSkills();
      break;

    case "search":
      if (!args[1]) {
        error("Please specify a search query");
        log("Usage: npx skills-lc-cli search <query>");
        process.exit(1);
      }
      await searchSkills(args[1]);
      break;

    case "help":
    case "--help":
    case "-h":
    case undefined:
      showHelp();
      break;

    default:
      error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
