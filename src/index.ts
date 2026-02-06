#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// API 配置
const API_BASE_URL = process.env.SKILLS_API_URL || "https://skills.lc";

// 颜色输出
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

// HTTP 请求封装
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

// 解析 skill 路径: owner/repo/skillId 或 owner/repo
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
  'skills',                    // Standard skills directory
  'skills/.curated',           // Curated skills
  'skills/.experimental',      // Experimental skills
  'skills/.system',            // System skills
  '.agents/skills',            // Agents skills (Amp, Kimi)
  '.agent/skills',             // Agent skills (Antigravity, Replit)
  '.augment/rules',            // Augment rules
  '.claude/skills',            // Claude Code skills
  '.cline/skills',             // Cline skills
  '.codebuddy/skills',         // CodeBuddy skills
  '.codex/skills',             // Codex skills
  '.commandcode/skills',       // Command Code skills
  '.continue/skills',          // Continue skills
  '.crush/skills',             // Crush skills
  '.cursor/skills',            // Cursor skills
  '.factory/skills',           // Factory skills (Droid)
  '.gemini/skills',            // Gemini CLI skills
  '.github/skills',            // GitHub Copilot skills
  '.goose/skills',             // Goose skills
  '.junie/skills',             // Junie skills
  '.iflow/skills',             // iFlow CLI skills
  '.kilocode/skills',          // Kilo Code skills
  '.kiro/skills',              // Kiro CLI skills
  '.kode/skills',              // Kode skills
  '.mcpjam/skills',            // MCPJam skills
  '.vibe/skills',              // Mistral Vibe skills
  '.mux/skills',               // Mux skills
  '.opencode/skills',          // OpenCode skills
  '.openclaude/skills',        // OpenClaude IDE skills
  '.openhands/skills',         // OpenHands skills
  '.pi/skills',                // Pi skills
  '.qoder/skills',             // Qoder skills
  '.qwen/skills',              // Qwen Code skills
  '.roo/skills',               // Roo Code skills
  '.trae/skills',              // Trae skills
  '.windsurf/skills',          // Windsurf skills
  '.zencoder/skills',          // Zencoder skills
  '.neovate/skills',           // Neovate skills
  '.pochi/skills',             // Pochi skills
  '.adal/skills',              // AdaL skills
  'plugins',                   // Legacy plugins directory
];

// Build comprehensive list of possible paths for a skillId
function buildPossiblePaths(skillId?: string): string[] {
  const paths: string[] = ['SKILL.md']; // Root directory

  if (skillId) {
    // Direct skillId paths
    paths.push(`${skillId}/SKILL.md`);
    paths.push(`${skillId}.md`);

    // Paths for each skill directory
    for (const dir of SKILL_DIRECTORIES) {
      paths.push(`${dir}/${skillId}/SKILL.md`);
      paths.push(`${dir}/${skillId}.md`);
    }
  }

  // Add directory root SKILL.md for each directory
  for (const dir of SKILL_DIRECTORIES) {
    paths.push(`${dir}/SKILL.md`);
  }

  return paths;
}

// 从 GitHub 获取 SKILL.md 内容
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
          // Determine skillId from path if not provided
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
  // Try to extract from paths like "dir/skillId/SKILL.md"
  const match = path.match(/\/([^/]+)\/SKILL\.md$/);
  if (match) return match[1];
  
  // Try to extract from paths like "dir/skillId.md"
  const mdMatch = path.match(/\/([^/]+)\.md$/);
  if (mdMatch && mdMatch[1] !== 'SKILL') return mdMatch[1];
  
  return null;
}

// 记录安装到 API
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

// 检测 Agent 类型
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

  // 默认使用当前目录的 .skills 文件夹
  return { type: "local", configPath: path.join(cwd, ".skills") };
}

// 安装 Skill
async function installSkill(skillPath: string): Promise<void> {
  log("");
  info(`Installing skill: ${colors.bright}${skillPath}${colors.reset}`);

  // 解析路径
  const parsed = parseSkillPath(skillPath);
  if (!parsed) {
    error("Invalid skill path. Use format: owner/repo or owner/repo/skillId");
    process.exit(1);
  }

  const { owner, repo, skillId } = parsed;
  const source = `${owner}/${repo}`;

  // 从 GitHub 获取 Skill 内容
  info("Fetching skill from GitHub...");
  const skill = await fetchSkillFromGitHub(owner, repo, skillId);

  if (!skill) {
    error(`Could not find SKILL.md in ${source}${skillId ? `/skills/${skillId}` : ""}`);
    process.exit(1);
  }

  success(`Found skill: ${skill.skillId}`);

  // 检测 Agent
  const agent = detectAgent();
  if (!agent) {
    error("Could not detect AI agent configuration");
    process.exit(1);
  }

  info(`Detected agent: ${colors.bright}${agent.type}${colors.reset}`);

  // 确保目录存在
  const configDir = path.dirname(agent.configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // 写入 Skill 内容
  if (agent.type === "local") {
    // 本地模式：保存到 .skills 目录
    const skillFile = path.join(agent.configPath, `${skill.skillId}.md`);
    if (!fs.existsSync(agent.configPath)) {
      fs.mkdirSync(agent.configPath, { recursive: true });
    }
    fs.writeFileSync(skillFile, skill.content, "utf-8");
    success(`Saved to ${skillFile}`);
  } else {
    // Agent 模式：追加到配置文件
    const separator = "\n\n---\n\n";
    const header = `<!-- Skill: ${skill.skillId} from ${source} -->\n`;
    const content = header + skill.content;

    if (fs.existsSync(agent.configPath)) {
      const existing = fs.readFileSync(agent.configPath, "utf-8");
      // 检查是否已安装
      if (existing.includes(`Skill: ${skill.skillId}`)) {
        info("Skill already installed, updating...");
        // 替换现有内容
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

  // 记录安装统计
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

// 列出已安装的 Skills
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

// 显示帮助
function showHelp(): void {
  log(`
${colors.bright}skills${colors.reset} - AI Agent Skills CLI

${colors.bright}USAGE${colors.reset}
  npx skills-lc-cli <command> [options]

${colors.bright}COMMANDS${colors.reset}
  add <owner/repo/skillId>    Install a skill from GitHub
  add <owner/repo>            Install default skill from a repo
  list                        List installed skills
  help                        Show this help message

${colors.bright}EXAMPLES${colors.reset}
  npx skills-lc-cli add vercel-labs/agent-skills/react-best-practices
  npx skills-lc-cli add anthropics/skills/frontend-design
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

// 主函数
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

