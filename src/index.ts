#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// Read package.json for version
const packageJsonPath = path.join(__dirname, '../package.json');
let PACKAGE_VERSION = '1.0.0';
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  PACKAGE_VERSION = packageJson.version || '1.0.0';
} catch {
  // Fallback version if package.json cannot be read
}

// API Configuration
const API_BASE_URL = process.env.SKILLS_API_URL || "https://skills.lc";
const API_TOKEN = process.env.SKILLS_API_TOKEN || "sk_live_XY2_nCklnKAL7nDyCLLEVyLe6Q1g_ebGDjfUk6i-fvY";

// Debug mode flag
let DEBUG_MODE = false;

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

function debug(message: string) {
  if (DEBUG_MODE) {
    console.log(`${colors.dim}${message}${colors.reset}`);
  }
}

// HTTP request wrapper with timeout
const REQUEST_TIMEOUT = 5000; // 5 seconds

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
        timeout: REQUEST_TIMEOUT,
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

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Parse skill input - supports multiple formats
function parseSkillInput(input: string): {
  type: 'skillId' | 'github-shorthand' | 'github-url' | 'gitlab-url' | 'git-url' | 'local';
  owner?: string;
  repo?: string;
  skillId?: string;
  path?: string;
  url?: string;
} | null {
  // Local path
  if (input.startsWith('./') || input.startsWith('../') || input.startsWith('/')) {
    return { type: 'local', path: input };
  }

  // Git URL (git@github.com:owner/repo.git)
  const gitMatch = input.match(/^git@([^:]+):([^/]+)\/(.+)\.git$/);
  if (gitMatch) {
    const [, , owner, repo] = gitMatch;
    return { type: 'git-url', owner, repo, url: input };
  }

  // Full GitHub URL with tree path
  const githubTreeMatch = input.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)$/);
  if (githubTreeMatch) {
    const [, owner, repo, path] = githubTreeMatch;
    return { type: 'github-url', owner, repo, path, url: input };
  }

  // Full GitHub URL (simple)
  const githubMatch = input.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (githubMatch) {
    const [, owner, repo] = githubMatch;
    return { type: 'github-url', owner, repo: repo.replace(/\.git$/, ''), url: input };
  }

  // GitLab URL
  const gitlabMatch = input.match(/^https?:\/\/gitlab\.com\/([^/]+)\/([^/]+)/);
  if (gitlabMatch) {
    const [, owner, repo] = gitlabMatch;
    return { type: 'gitlab-url', owner, repo: repo.replace(/\.git$/, ''), url: input };
  }

  // GitHub shorthand (owner/repo or owner/repo/skillId)
  const parts = input.split('/');
  if (parts.length === 2) {
    return { type: 'github-shorthand', owner: parts[0], repo: parts[1] };
  } else if (parts.length === 3) {
    return { type: 'github-shorthand', owner: parts[0], repo: parts[1], skillId: input };
  } else if (parts.length === 1 && parts[0]) {
    // Just skillId
    return { type: 'skillId', skillId: parts[0] };
  }

  return null;
}

// Parse command-line options
interface InstallOptions {
  global?: boolean;
  agents?: string[];
  skills?: string[];
  list?: boolean;
  yes?: boolean;
  all?: boolean;
}

function parseOptions(args: string[]): { input: string; options: InstallOptions } | null {
  const input = args[0];
  if (!input) return null;

  const options: InstallOptions = {};
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-g' || arg === '--global') {
      options.global = true;
    } else if (arg === '-l' || arg === '--list') {
      options.list = true;
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '-a' || arg === '--agent') {
      options.agents = options.agents || [];
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.agents.push(args[++i]);
      }
    } else if (arg === '-s' || arg === '--skill') {
      options.skills = options.skills || [];
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.skills.push(args[++i]);
      }
    }
  }

  return { input, options };
}
async function getSkillDetails(skillId: string): Promise<{ githubUrl: string; skillId: string; name: string; source: string } | null> {
  try {
    const res = await request(
      `${API_BASE_URL}/api/v1/skills/${encodeURIComponent(skillId)}`,
      {
        headers: {
          "Authorization": `Bearer ${API_TOKEN}`,
        },
      }
    );
    
    if (res.status !== 200) return null;
    
    const response = JSON.parse(res.data);
    if (!response.success || !response.data) return null;
    
    const skill = response.data;
    return {
      githubUrl: skill.githubUrl,
      skillId: skill.skillId,
      name: skill.name,
      source: skill.source
    };
  } catch {
    return null;
  }
}

// Fetch SKILL.md from GitHub URL directly
async function fetchSkillFromUrl(githubUrl: string, skillName: string): Promise<{ content: string; skillId: string } | null> {
  if (!githubUrl) return null;
  
  // Parse GitHub URL - check if it contains tree path
  // Example: https://github.com/facebook/react/tree/main/.claude/skills/extract-errors
  const treeMatch = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/);
  
  if (treeMatch) {
    // URL contains exact path to skill directory
    const [, owner, repo, branch, skillPath] = treeMatch;
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}/SKILL.md`;
    
    debug(`Direct fetch from: ${branch}/${skillPath}/SKILL.md`);
    
    try {
      const res = await request(url);
      if (res.status === 200) {
        success(`Found at: ${branch}/${skillPath}/SKILL.md`);
        return { content: res.data, skillId: skillName };
      }
    } catch {
      // If direct path fails, fall back to search
      debug(`Direct path failed, trying alternatives...`);
    }
  }
  
  // Fallback: parse basic GitHub URL and search
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  
  const [, owner, repo] = match;
  const branches = ['main', 'master'];
  
  debug(`Fetching from: ${owner}/${repo}`);
  
  for (const branch of branches) {
    // Try common paths first based on skill name
    const directPaths = [
      `skills/${skillName}/SKILL.md`,
      `${skillName}/SKILL.md`,
      `.claude/skills/${skillName}/SKILL.md`,
      `skills/${skillName}.md`,
    ];
    
    for (const path of directPaths) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      debug(`Trying: ${branch}/${path}`);
      try {
        const res = await request(url);
        if (res.status === 200) {
          success(`Found at: ${branch}/${path}`);
          return { content: res.data, skillId: skillName };
        }
      } catch {
        // Continue
      }
    }
  }
  
  return null;
}

// Common skill directory locations (prioritized)
const SKILL_DIRECTORIES = [
  'skills',
  '.skills',
  '.claude/skills',
  '.cursor/skills',
  '.codex/skills',
];

// Scan GitHub repository for all SKILL.md files using GitHub API
async function scanGitHubForSkills(owner: string, repo: string): Promise<Array<{ path: string; name: string; dir: string }>> {
  const skills: Array<{ path: string; name: string; dir: string }> = [];
  const branches = ['main', 'master'];
  
  for (const branch of branches) {
    try {
      // Try to get repository tree from GitHub API
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
      const res = await request(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'skills-cli/1.0.0'
        }
      });
      
      if (res.status === 200) {
        const data = JSON.parse(res.data);
        if (data.tree) {
          // Find all SKILL.md files
          for (const item of data.tree) {
            if (item.type === 'blob' && item.path.endsWith('/SKILL.md')) {
              // Extract skill directory from path
              // e.g., "skills/composition-patterns/SKILL.md" -> "skills/composition-patterns"
              const pathParts = item.path.split('/');
              pathParts.pop(); // Remove SKILL.md
              const skillDir = pathParts.join('/');
              const skillName = pathParts[pathParts.length - 1] || repo;
              
              skills.push({ 
                path: item.path, 
                name: skillName,
                dir: skillDir
              });
            }
          }
        }
        
        if (skills.length > 0) {
          return skills; // Found skills in this branch
        }
      }
    } catch {
      // Continue to next branch
    }
  }
  
  return skills;
}
function buildPossiblePaths(skillId?: string): string[] {
  const paths: string[] = [];

  if (skillId) {
    // Try root level SKILL.md first (for repos with skill at root)
    paths.push('SKILL.md');
    
    // Try direct skillId paths (for repos with skills in subdirectories)
    paths.push(`${skillId}/SKILL.md`);
    paths.push(`skills/${skillId}/SKILL.md`);
    paths.push(`skills/${skillId}.md`);
    paths.push(`${skillId}.md`);
    
    // Then try other common directories
    for (const dir of SKILL_DIRECTORIES) {
      if (dir !== 'skills') {
        paths.push(`${dir}/${skillId}/SKILL.md`);
        paths.push(`${dir}/${skillId}.md`);
      }
    }
  } else {
    // No skillId provided - try common root locations
    paths.push('SKILL.md');
    paths.push('README.md');
    
    // Try common skill directories
    for (const dir of SKILL_DIRECTORIES) {
      paths.push(`${dir}/SKILL.md`);
    }
  }
  
  return paths;
}

// Fetch SKILL.md content from GitHub
async function fetchSkillFromGitHub(
  owner: string,
  repo: string,
  skillId?: string
): Promise<{ content: string; skillId: string; url?: string } | null> {
  const possiblePaths = buildPossiblePaths(skillId);
  const branches = ['main', 'master'];
  let tried = 0;
  const total = branches.length * possiblePaths.length;

  for (const branch of branches) {
    for (const skillPath of possiblePaths) {
      tried++;
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`;
      process.stdout.write(`\r${colors.dim}Trying ${tried}/${total}: ${branch}/${skillPath.substring(0, 40)}...${colors.reset}`);
      try {
        const res = await request(url);
        if (res.status === 200) {
          process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
          const resolvedSkillId = skillId || extractSkillIdFromPath(skillPath) || repo;
          
          // Extract directory path (remove /SKILL.md)
          const pathParts = skillPath.split('/');
          pathParts.pop(); // Remove SKILL.md
          const skillDir = pathParts.join('/');
          
          // Use tree URL (directory) not blob URL (file)
          const githubUrl = skillDir 
            ? `https://github.com/${owner}/${repo}/tree/${branch}/${skillDir}`
            : `https://github.com/${owner}/${repo}/tree/${branch}`;
          
          return { content: res.data, skillId: resolvedSkillId, url: githubUrl };
        }
      } catch {
        // Continue to next path (timeout or error)
      }
    }
  }
  process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
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
async function recordInstall(skillId: string, source: string, githubUrl?: string): Promise<boolean> {
  try {
    const payload: { skillId?: string; githubUrl?: string; source: string } = { source };
    
    // Always send githubUrl if provided
    if (githubUrl) {
      payload.githubUrl = githubUrl;
    }
    
    // Only send skillId if it's a valid registry identifier:
    // - Not empty
    // - Not a URL (doesn't start with http)
    // - Not a path (doesn't contain /)
    if (skillId && !skillId.startsWith('http') && !skillId.includes('/')) {
      payload.skillId = skillId;
    }
    
    // If no githubUrl but skillId is a URL, use skillId as githubUrl
    if (!payload.githubUrl && skillId && skillId.startsWith('http')) {
      payload.githubUrl = skillId;
    }
    
    debug(`Recording to: ${API_BASE_URL}/api/install`);
    debug(`Payload: ${JSON.stringify(payload)}`);
    
    const res = await request(`${API_BASE_URL}/api/install`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    
    debug(`Response status: ${res.status}`);
    if (res.status !== 200) {
      debug(`Response body: ${res.data}`);
    }
    
    return res.status === 200;
  } catch (err) {
    debug(`Record install error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// Download entire skill directory from GitHub
async function downloadSkillDirectory(
  owner: string,
  repo: string,
  branch: string,
  skillDir: string,
  targetDir: string
): Promise<boolean> {
  try {
    // Get directory tree from GitHub API
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await request(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'skills-cli/1.0.0'
      }
    });
    
    if (res.status !== 200) {
      return false;
    }
    
    const data = JSON.parse(res.data);
    if (!data.tree) {
      return false;
    }
    
    // Filter files in the skill directory
    const prefix = skillDir ? `${skillDir}/` : '';
    const files = data.tree.filter((item: any) => {
      if (item.type !== 'blob') return false;
      
      if (prefix === '') {
        // Root level - download all files
        return true;
      } else {
        // Subdirectory - only download files in that directory
        return item.path.startsWith(prefix) && item.path !== prefix;
      }
    });
    
    if (files.length === 0) {
      return false;
    }
    
    debug(`Found ${files.length} files in ${skillDir || 'root'}`);
    
    // Download each file
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
      try {
        const fileRes = await request(rawUrl);
        if (fileRes.status === 200) {
          // Calculate relative path within skill directory
          let relativePath: string;
          if (prefix === '') {
            // Root level - use the file path as-is
            relativePath = file.path;
          } else {
            // Subdirectory - remove the prefix
            relativePath = file.path.substring(prefix.length);
          }
          
          const targetPath = path.join(targetDir, relativePath);
          
          // Create subdirectories if needed
          const targetFileDir = path.dirname(targetPath);
          if (!fs.existsSync(targetFileDir)) {
            fs.mkdirSync(targetFileDir, { recursive: true });
          }
          
          // Write file
          fs.writeFileSync(targetPath, fileRes.data, 'utf-8');
          debug(`Downloaded: ${relativePath}`);
          successCount++;
        } else {
          debug(`Failed to download ${file.path}: HTTP ${fileRes.status}`);
          failCount++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        debug(`Failed to download ${file.path}: ${errorMsg}`);
        error(`Failed to download ${file.path}: ${errorMsg}`);
        failCount++;
      }
    }
    
    debug(`Download complete: ${successCount} succeeded, ${failCount} failed`);
    
    // Only return true if at least some files were downloaded successfully
    if (successCount === 0) {
      error(`Failed to download any files from the skill directory`);
      return false;
    }
    
    if (failCount > 0) {
      error(`Warning: ${failCount} file(s) failed to download`);
    }
    
    return true;
  } catch (err) {
    debug(`Error downloading directory: ${err}`);
    return false;
  }
}

// Install a single skill and record it
async function installSingleSkill(
  skill: { content: string; skillId: string; url?: string },
  source: string,
  githubUrl: string,
  agent: { type: string; configPath: string }
): Promise<void> {
  info(`Installing: ${colors.bright}${skill.skillId}${colors.reset}`);
  
  const configDir = agent.configPath;
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Create skill directory
  const skillDir = path.join(configDir, skill.skillId);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Try to download entire directory from GitHub
  let downloadedDirectory = false;
  if (githubUrl) {
    // Match URL with subdirectory: github.com/owner/repo/tree/branch/dirPath
    const urlMatchWithDir = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
    if (urlMatchWithDir) {
      const [, owner, repo, branch, dirPath] = urlMatchWithDir;
      debug(`Downloading directory from GitHub: ${owner}/${repo}/${dirPath}`);
      downloadedDirectory = await downloadSkillDirectory(owner, repo, branch, dirPath, skillDir);
    } else {
      // Match URL without subdirectory (skill at repo root): github.com/owner/repo/tree/branch
      const urlMatchRoot = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?$/);
      if (urlMatchRoot) {
        const [, owner, repo, branch] = urlMatchRoot;
        debug(`Downloading directory from GitHub root: ${owner}/${repo}`);
        downloadedDirectory = await downloadSkillDirectory(owner, repo, branch, '', skillDir);
      }
    }
  }
  
  if (downloadedDirectory) {
    success(`Downloaded skill directory to ${skillDir}`);
  } else {
    // Fallback: just save SKILL.md file
    const skillFile = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillFile, skill.content, "utf-8");
    success(`Saved to ${skillFile}`);
  }

  // Record install
  debug("Recording install...");
  const recorded = await recordInstall('', source, githubUrl);
  if (recorded) {
    debug("Install recorded successfully");
  } else {
    debug("Could not record install (API may be unavailable)");
  }
}

// Agent configuration mapping
const AGENT_CONFIGS: Record<string, { projectPath: string; globalPath: string }> = {
  'amp': { projectPath: '.agents/skills/', globalPath: '~/.config/agents/skills/' },
  'kimi-cli': { projectPath: '.agents/skills/', globalPath: '~/.config/agents/skills/' },
  'antigravity': { projectPath: '.agent/skills/', globalPath: '~/.gemini/antigravity/global_skills/' },
  'augment': { projectPath: '.augment/rules/', globalPath: '~/.augment/rules/' },
  'claude': { projectPath: '.claude/skills/', globalPath: '~/.claude/skills/' },
  'claude-code': { projectPath: '.claude/skills/', globalPath: '~/.claude/skills/' },
  'openclaw': { projectPath: 'skills/', globalPath: '~/.moltbot/skills/' },
  'cline': { projectPath: '.cline/skills/', globalPath: '~/.cline/skills/' },
  'codebuddy': { projectPath: '.codebuddy/skills/', globalPath: '~/.codebuddy/skills/' },
  'codex': { projectPath: '.codex/skills/', globalPath: '~/.codex/skills/' },
  'command-code': { projectPath: '.commandcode/skills/', globalPath: '~/.commandcode/skills/' },
  'continue': { projectPath: '.continue/skills/', globalPath: '~/.continue/skills/' },
  'crush': { projectPath: '.crush/skills/', globalPath: '~/.config/crush/skills/' },
  'cursor': { projectPath: '.cursor/skills/', globalPath: '~/.cursor/skills/' },
  'droid': { projectPath: '.factory/skills/', globalPath: '~/.factory/skills/' },
  'gemini-cli': { projectPath: '.gemini/skills/', globalPath: '~/.gemini/skills/' },
  'github-copilot': { projectPath: '.github/skills/', globalPath: '~/.copilot/skills/' },
  'goose': { projectPath: '.goose/skills/', globalPath: '~/.config/goose/skills/' },
  'junie': { projectPath: '.junie/skills/', globalPath: '~/.junie/skills/' },
  'iflow-cli': { projectPath: '.iflow/skills/', globalPath: '~/.iflow/skills/' },
  'kilo': { projectPath: '.kilocode/skills/', globalPath: '~/.kilocode/skills/' },
  'kiro-cli': { projectPath: '.kiro/skills/', globalPath: '~/.kiro/skills/' },
  'kode': { projectPath: '.kode/skills/', globalPath: '~/.kode/skills/' },
  'mcpjam': { projectPath: '.mcpjam/skills/', globalPath: '~/.mcpjam/skills/' },
  'mistral-vibe': { projectPath: '.vibe/skills/', globalPath: '~/.vibe/skills/' },
  'mux': { projectPath: '.mux/skills/', globalPath: '~/.mux/skills/' },
  'opencode': { projectPath: '.opencode/skills/', globalPath: '~/.config/opencode/skills/' },
  'openclaude': { projectPath: '.openclaude/skills/', globalPath: '~/.openclaude/skills/' },
  'openhands': { projectPath: '.openhands/skills/', globalPath: '~/.openhands/skills/' },
  'pi': { projectPath: '.pi/skills/', globalPath: '~/.pi/agent/skills/' },
  'qoder': { projectPath: '.qoder/skills/', globalPath: '~/.qoder/skills/' },
  'qwen-code': { projectPath: '.qwen/skills/', globalPath: '~/.qwen/skills/' },
  'replit': { projectPath: '.agent/skills/', globalPath: '' }, // project-only
  'roo': { projectPath: '.roo/skills/', globalPath: '~/.roo/skills/' },
  'trae': { projectPath: '.trae/skills/', globalPath: '~/.trae/skills/' },
  'trae-cn': { projectPath: '.trae/skills/', globalPath: '~/.trae-cn/skills/' },
  'windsurf': { projectPath: '.windsurf/skills/', globalPath: '~/.codeium/windsurf/skills/' },
  'zencoder': { projectPath: '.zencoder/skills/', globalPath: '~/.zencoder/skills/' },
  'neovate': { projectPath: '.neovate/skills/', globalPath: '~/.neovate/skills/' },
  'pochi': { projectPath: '.pochi/skills/', globalPath: '~/.pochi/skills/' },
  'adal': { projectPath: '.adal/skills/', globalPath: '~/.adal/skills/' },
  'local': { projectPath: '.skills/', globalPath: '~/.skills/' },
};

// Detect Agent type or get specified agent
function getAgent(agentType?: string, useGlobal?: boolean): { type: string; configPath: string } | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const cwd = process.cwd();

  // If agent type is specified, use it
  if (agentType) {
    const type = agentType.toLowerCase();
    const config = AGENT_CONFIGS[type];
    
    if (config) {
      // Determine which path to use
      let basePath: string;
      if (useGlobal && config.globalPath) {
        basePath = config.globalPath.replace('~', homeDir);
      } else {
        basePath = path.join(cwd, config.projectPath);
      }
      
      return { type, configPath: basePath };
    }
    
    // Unknown agent type
    error(`Unknown agent type: ${agentType}`);
    info("Supported agents: " + Object.keys(AGENT_CONFIGS).join(', '));
    return null;
  }

  // Auto-detect agent
  return detectAgent();
}

// Detect Agent type
function detectAgent(): { type: string; configPath: string } | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const cwd = process.cwd();

  // Check for Claude Code / Anthropic (use new skills directory)
  const claudeSkillsDir = path.join(homeDir, ".claude", "skills");
  const claudeConfig = path.join(homeDir, ".claude", "CLAUDE.md");
  if (fs.existsSync(path.join(homeDir, ".claude"))) {
    return { type: "claude", configPath: claudeSkillsDir };
  }

  // Check for Cursor (use new skills directory)
  const cursorSkillsDir = path.join(cwd, ".cursor", "skills");
  const cursorConfig = path.join(cwd, ".cursor", "rules");
  if (fs.existsSync(path.join(cwd, ".cursor"))) {
    return { type: "cursor", configPath: cursorSkillsDir };
  }

  // Check for Codex (use new skills directory)
  const codexSkillsDir = path.join(homeDir, ".codex", "skills");
  const codexConfig = path.join(homeDir, ".codex", "instructions.md");
  if (fs.existsSync(path.join(homeDir, ".codex"))) {
    return { type: "codex", configPath: codexSkillsDir };
  }

  // Default to local .skills folder
  return { type: "local", configPath: path.join(cwd, ".skills") };
}

// Install Skill (with optional pre-fetched skill info)
async function installSkill(input: string, options: InstallOptions = {}, skillInfo?: { githubUrl: string; skillId: string; name: string; source: string }): Promise<void> {
  log("");
  info(`Installing skill: ${colors.bright}${input}${colors.reset}`);

  const parsed = parseSkillInput(input);
  if (!parsed && !skillInfo) {
    error("Invalid input format");
    info("Supported formats:");
    info("  - skillId (e.g., react-best-practices)");
    info("  - owner/repo (e.g., vercel-labs/agent-skills)");
    info("  - owner/repo/skillId");
    info("  - https://github.com/owner/repo");
    info("  - ./local/path");
    process.exit(1);
  }

  let skill: { content: string; skillId: string; url?: string } | null = null;
  let source = "";
  let reportSkillId = input; // Track the full skillId for API reporting
  let reportGithubUrl: string | undefined; // Track GitHub URL for API reporting

  // If skillInfo is provided (from search), use it directly
  if (skillInfo && skillInfo.githubUrl) {
    info(`Found: ${colors.bright}${skillInfo.name}${colors.reset} (${skillInfo.source})`);
    debug(`GitHub URL: ${skillInfo.githubUrl}`);
    info("Downloading from GitHub...");
    
    // Use the full skillId from API for reporting
    reportSkillId = skillInfo.skillId;
    reportGithubUrl = skillInfo.githubUrl;
    
    // Extract skill name from name field
    const skillName = skillInfo.name.toLowerCase().replace(/\s+/g, '-');
    skill = await fetchSkillFromUrl(skillInfo.githubUrl, skillName);
    source = skillInfo.source;
  }
  
  // Fallback to parsing input
  if (!skill && parsed) {
    const { type, owner, repo, skillId, path: skillPath, url } = parsed;

    // Handle different input types
    if (type === 'local') {
      error("Local paths not yet supported");
      info("Coming soon!");
      process.exit(1);
    }

    if (type === 'gitlab-url') {
      error("GitLab URLs not yet supported");
      info("Use GitHub repositories for now");
      process.exit(1);
    }

    // For skillId type: use API
    if (type === 'skillId' && skillId) {
      info("Getting skill details from registry...");
      const apiSkillInfo = await getSkillDetails(skillId);
      
      if (apiSkillInfo && apiSkillInfo.githubUrl) {
        info(`Found: ${colors.bright}${apiSkillInfo.name}${colors.reset} (${apiSkillInfo.source})`);
        info("Downloading from GitHub...");
        const skillName = apiSkillInfo.name.toLowerCase().replace(/\s+/g, '-');
        skill = await fetchSkillFromUrl(apiSkillInfo.githubUrl, skillName);
        source = apiSkillInfo.source;
      }
    }

    // For GitHub formats: try API first if githubUrl not available, then fallback
    if (!skill && (type === 'github-shorthand' || type === 'github-url' || type === 'git-url') && owner && repo) {
      // If skillId provided, try API
      if (skillId) {
        info("Getting skill details from registry...");
        const apiSkillInfo = await getSkillDetails(skillId);
        if (apiSkillInfo && apiSkillInfo.githubUrl) {
          info(`Found: ${colors.bright}${apiSkillInfo.name}${colors.reset}`);
          const skillName = apiSkillInfo.name.toLowerCase().replace(/\s+/g, '-');
          skill = await fetchSkillFromUrl(apiSkillInfo.githubUrl, skillName);
          source = apiSkillInfo.source;
        }
      }

      // Fallback to direct GitHub fetch
      if (!skill) {
        // First, try scanning repository for all SKILL.md files using GitHub API
        info("Scanning repository for skills...");
        const foundSkills = await scanGitHubForSkills(owner, repo);
        
        if (foundSkills.length === 0) {
          // No skills found via API, try direct fetch as last resort
          info("Fetching from GitHub directly...");
          const directSkillId = skillId?.split('/').pop();
          skill = await fetchSkillFromGitHub(owner, repo, directSkillId);
          
          if (skill) {
            source = `${owner}/${repo}`;
            
            // Update reportSkillId and reportGithubUrl for API reporting
            if (skillId) {
              reportSkillId = skillId; // Use the full input path
            } else {
              // No skillId specified - use GitHub URL to SKILL.md for reporting
              reportSkillId = '';
              reportGithubUrl = skill.url || `https://github.com/${owner}/${repo}`;
            }
          }
        } else {
          debug(`Found ${foundSkills.length} skill(s) in repository`);
          foundSkills.forEach(s => debug(`  - ${s.name} (${s.dir})`));
          
          // If skillId specified, match by name
          if (skillId) {
            const directSkillId = skillId.split('/').pop();
            const matched = foundSkills.find(s => 
              s.name === directSkillId || 
              s.path.includes(`/${directSkillId}/`)
            );
            if (matched) {
              // Install single matched skill
              const branches = ['main', 'master'];
              for (const branch of branches) {
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${matched.path}`;
                try {
                  const res = await request(rawUrl);
                  if (res.status === 200) {
                    const githubUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${matched.dir}`;
                    skill = { content: res.data, skillId: matched.name, url: githubUrl };
                    source = `${owner}/${repo}`;
                    reportSkillId = skillId;
                    reportGithubUrl = githubUrl;
                    break;
                  }
                } catch {
                  // Try next branch
                }
              }
            } else {
              info(`Skill "${directSkillId}" not found, available skills:`);
              foundSkills.forEach(s => info(`  - ${s.name}`));
              process.exit(1);
            }
          } else {
            // Multiple skills found, no specific skill requested
            info(`Found ${foundSkills.length} skills in this repository:`);
            foundSkills.forEach(s => info(`  - ${s.name}`));
            info("");
            
            // Prompt user to select skills
            log(`${colors.bright}Which skill(s) to install?${colors.reset}`);
            log(`${colors.dim}Enter numbers separated by commas (e.g., 1,3,5) or 'all' for all skills${colors.reset}`);
            log("");
            
            foundSkills.forEach((s, index) => {
              log(`  [${index + 1}] ${s.name}`);
            });
            
            log(`  [all] All skills`);
            log(`  [q] Cancel`);
            log("");
            
            const skillChoice = await prompt("Select skill(s): ");
            
            if (skillChoice === 'q' || skillChoice === '') {
              log("Installation cancelled");
              process.exit(0);
            }
            
            let selectedSkills: typeof foundSkills = [];
            
            if (skillChoice.toLowerCase() === 'all') {
              selectedSkills = [...foundSkills];
            } else {
              const choices = skillChoice.split(',').map(s => s.trim());
              for (const choice of choices) {
                const num = parseInt(choice);
                if (num >= 1 && num <= foundSkills.length) {
                  selectedSkills.push(foundSkills[num - 1]);
                } else {
                  error(`Invalid selection: ${choice}`);
                  process.exit(1);
                }
              }
            }
            
            if (selectedSkills.length === 0) {
              error("No skills selected");
              process.exit(1);
            }
            
            // Prompt for agent and location
            if (!options.agents || options.agents.length === 0) {
              log("");
              log(`${colors.bright}Install to which agent(s)?${colors.reset}`);
              log(`${colors.dim}Enter numbers separated by commas (e.g., 1,3,5) or 'all' for all agents${colors.reset}`);
              log("");
              
              const availableAgents = Object.keys(AGENT_CONFIGS);
              const agentList: string[] = [];
              
              availableAgents.forEach((agent, index) => {
                agentList.push(agent);
                log(`  [${index + 1}] ${agent}`);
              });
              
              log(`  [all] All agents`);
              log(`  [q] Cancel`);
              log("");
              
              const agentChoice = await prompt("Select agent(s): ");
              
              if (agentChoice === 'q' || agentChoice === '') {
                log("Installation cancelled");
                process.exit(0);
              }
              
              let selectedAgents: string[] = [];
              
              if (agentChoice.toLowerCase() === 'all') {
                selectedAgents = [...agentList];
              } else {
                const choices = agentChoice.split(',').map(s => s.trim());
                for (const choice of choices) {
                  const num = parseInt(choice);
                  if (num >= 1 && num <= agentList.length) {
                    selectedAgents.push(agentList[num - 1]);
                  } else {
                    error(`Invalid selection: ${choice}`);
                    process.exit(1);
                  }
                }
              }
              
              if (selectedAgents.length === 0) {
                error("No agents selected");
                process.exit(1);
              }
              
              // Ask for project vs global
              log("");
              log(`${colors.bright}Installation location:${colors.reset}`);
              log(`  [1] Project (e.g., .cursor/skills/)`);
              log(`  [2] Global (e.g., ~/.cursor/skills/)`);
              log("");
              
              const locationChoice = await prompt("Select location [1]: ");
              const useGlobal = locationChoice === '2';
              
              // Install to all selected agents
              log("");
              info(`Installing ${selectedSkills.length} skill(s) to ${selectedAgents.length} agent(s)...`);
              
              for (const targetSkill of selectedSkills) {
                const branches = ['main', 'master'];
                let skillContent: { content: string; skillId: string; url?: string } | null = null;
                
                for (const branch of branches) {
                  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${targetSkill.path}`;
                  try {
                    const res = await request(rawUrl);
                    if (res.status === 200) {
                      const githubUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${targetSkill.dir}`;
                      skillContent = { content: res.data, skillId: targetSkill.name, url: githubUrl };
                      break;
                    }
                  } catch {
                    // Try next branch
                  }
                }
                
                if (skillContent) {
                  for (const agent of selectedAgents) {
                    try {
                      const agentConfig = getAgent(agent, useGlobal);
                      if (!agentConfig) continue;
                      
                      log("");
                      info(`Installing ${colors.bright}${skillContent.skillId}${colors.reset} to ${colors.bright}${agent}${colors.reset}...`);
                      await installSingleSkill(skillContent, `${owner}/${repo}`, skillContent.url || '', agentConfig);
                    } catch (err) {
                      error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }
                } else {
                  error(`Could not fetch: ${targetSkill.name}`);
                }
              }
              
              log("");
              success(`${colors.bright}Installation complete!${colors.reset}`);
              log("");
              return;
            }
            
            // If agent was specified, just ask for location
            // (This path would require additional handling - for now, treat as error)
            error("Multiple skills found. Please specify which skill to install.");
            foundSkills.forEach(s => info(`  - ${s.name}`));
            process.exit(1);
          }
        }
      }
    }
  }

  if (!skill) {
    error(`Could not find SKILL.md for ${input}`);
    info("Make sure the skill exists and has a SKILL.md file");
    process.exit(1);
  }

  success(`Found skill: ${skill.skillId}`);

  // If no agent specified, prompt for interactive selection
  let finalOptions = { ...options };
  
  if (!options.agents || options.agents.length === 0) {
    log("");
    log(`${colors.bright}Install to which agent(s)?${colors.reset}`);
    log(`${colors.dim}Enter numbers separated by commas (e.g., 1,3,5) or 'all' for all agents${colors.reset}`);
    log("");
    
    // List all available agents
    const availableAgents = Object.keys(AGENT_CONFIGS);
    const agentList: string[] = [];
    
    availableAgents.forEach((agent, index) => {
      agentList.push(agent);
      log(`  [${index + 1}] ${agent}`);
    });
    
    log(`  [all] All agents`);
    log(`  [q] Cancel`);
    log("");
    
    const agentChoice = await prompt("Select agent(s): ");
    
    if (agentChoice === 'q' || agentChoice === '') {
      log("Installation cancelled");
      process.exit(0);
    }
    
    let selectedAgents: string[] = [];
    
    if (agentChoice.toLowerCase() === 'all') {
      selectedAgents = [...agentList];
    } else {
      // Parse comma-separated numbers
      const choices = agentChoice.split(',').map(s => s.trim());
      for (const choice of choices) {
        const num = parseInt(choice);
        if (num >= 1 && num <= agentList.length) {
          selectedAgents.push(agentList[num - 1]);
        } else {
          error(`Invalid selection: ${choice}`);
          process.exit(1);
        }
      }
    }
    
    if (selectedAgents.length === 0) {
      error("No agents selected");
      process.exit(1);
    }
    
    // Ask for project vs global
    log("");
    log(`${colors.bright}Installation location:${colors.reset}`);
    log(`  [1] Project (e.g., .cursor/skills/)`);
    log(`  [2] Global (e.g., ~/.cursor/skills/)`);
    log("");
    
    const locationChoice = await prompt("Select location [1]: ");
    const useGlobal = locationChoice === '2';
    
    // Install to all selected agents
    log("");
    info(`Installing to ${selectedAgents.length} agent(s)...`);
    
    for (const agent of selectedAgents) {
      log("");
      info(`Installing to ${colors.bright}${agent}${colors.reset}...`);
      
      try {
        const agentConfig = getAgent(agent, useGlobal);
        if (!agentConfig) {
          error(`Could not configure agent: ${agent}`);
          continue;
        }
        
        const configDir = agentConfig.configPath;
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Create skill directory
        const skillDir = path.join(configDir, skill.skillId);
        if (!fs.existsSync(skillDir)) {
          fs.mkdirSync(skillDir, { recursive: true });
        }

        // Try to download entire directory from GitHub
        let downloadedDirectory = false;
        if (reportGithubUrl) {
          // Match URL with subdirectory: github.com/owner/repo/tree/branch/dirPath
          const urlMatchWithDir = reportGithubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
          if (urlMatchWithDir) {
            const [, owner, repo, branch, dirPath] = urlMatchWithDir;
            debug(`Downloading directory from GitHub: ${owner}/${repo}/${dirPath}`);
            downloadedDirectory = await downloadSkillDirectory(owner, repo, branch, dirPath, skillDir);
          } else {
            // Match URL without subdirectory (skill at repo root): github.com/owner/repo/tree/branch
            const urlMatchRoot = reportGithubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?$/);
            if (urlMatchRoot) {
              const [, owner, repo, branch] = urlMatchRoot;
              debug(`Downloading directory from GitHub root: ${owner}/${repo}`);
              downloadedDirectory = await downloadSkillDirectory(owner, repo, branch, '', skillDir);
            }
          }
        }
        
        if (downloadedDirectory) {
          success(`Downloaded skill directory to ${skillDir}`);
        } else {
          // Fallback: just save SKILL.md file
          const skillFile = path.join(skillDir, 'SKILL.md');
          fs.writeFileSync(skillFile, skill.content, "utf-8");
          success(`Saved to ${skillFile}`);
        }
        
        // Record install for each agent
        debug("Recording install...");
        const recorded = await recordInstall(reportSkillId, source, reportGithubUrl);
        if (recorded) {
          debug("Install recorded successfully");
        }
      } catch (err) {
        error(`Failed to install to ${agent}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    log("");
    success(`${colors.bright}Installed to ${selectedAgents.length} agent(s) successfully!${colors.reset}`);
    log("");
    return;
  }

  // Single agent installation (when agent was pre-specified)
  const agent = getAgent(finalOptions.agents?.[0], finalOptions.global);
  if (!agent) {
    error("Could not detect AI agent configuration");
    process.exit(1);
  }

  info(`Target agent: ${colors.bright}${agent.type}${colors.reset}`);
  if (finalOptions.agents?.[0]) {
    debug(`Using specified agent: ${finalOptions.agents[0]}`);
  }
  if (finalOptions.global) {
    debug(`Using global installation path`);
  }

  const configDir = agent.configPath;
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Create skill directory
  const skillDir = path.join(configDir, skill.skillId);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Try to download entire directory from GitHub
  let downloadedDirectory = false;
  if (reportGithubUrl) {
    // Match URL with subdirectory: github.com/owner/repo/tree/branch/dirPath
    const urlMatchWithDir = reportGithubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
    if (urlMatchWithDir) {
      const [, owner, repo, branch, dirPath] = urlMatchWithDir;
      debug(`Downloading directory from GitHub: ${owner}/${repo}/${dirPath}`);
      downloadedDirectory = await downloadSkillDirectory(owner, repo, branch, dirPath, skillDir);
    } else {
      // Match URL without subdirectory (skill at repo root): github.com/owner/repo/tree/branch
      const urlMatchRoot = reportGithubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?$/);
      if (urlMatchRoot) {
        const [, owner, repo, branch] = urlMatchRoot;
        debug(`Downloading directory from GitHub root: ${owner}/${repo}`);
        downloadedDirectory = await downloadSkillDirectory(owner, repo, branch, '', skillDir);
      }
    }
  }
  
  if (downloadedDirectory) {
    success(`Downloaded skill directory to ${skillDir}`);
  } else {
    // Fallback: just save SKILL.md file
    const skillFile = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillFile, skill.content, "utf-8");
    success(`Saved to ${skillFile}`);
  }

  info("Recording install...");
  const recorded = await recordInstall(reportSkillId, source, reportGithubUrl);
  if (recorded) {
    success("Install recorded successfully");
  } else {
    info("Could not record install (API may be unavailable)");
  }

  log("");
  success(`${colors.bright}Skill installed successfully!${colors.reset}`);
  log("");
}

// List installed Skills with interactive delete option
async function listSkills(): Promise<void> {
  // First, ask which agent to list
  log("");
  log(`${colors.bright}List skills for which agent?${colors.reset}`);
  log("");
  
  const availableAgents = Object.keys(AGENT_CONFIGS);
  const agentList: string[] = [];
  
  availableAgents.forEach((agent, index) => {
    agentList.push(agent);
    log(`  [${index + 1}] ${agent}`);
  });
  
  log(`  [q] Cancel`);
  log("");
  
  const agentChoice = await prompt("Select agent: ");
  
  if (agentChoice === 'q' || agentChoice === '') {
    log("Cancelled");
    return;
  }
  
  const agentNum = parseInt(agentChoice);
  if (agentNum < 1 || agentNum > agentList.length) {
    error("Invalid selection");
    return;
  }
  
  const selectedAgentType = agentList[agentNum - 1];
  
  // Ask for project vs global
  log("");
  log(`${colors.bright}List skills from:${colors.reset}`);
  log(`  [1] Project (e.g., .${selectedAgentType}/skills/)`);
  log(`  [2] Global (e.g., ~/.${selectedAgentType}/skills/)`);
  log("");
  
  const locationChoice = await prompt("Select location [1]: ");
  const useGlobal = locationChoice === '2';
  
  const agent = getAgent(selectedAgentType, useGlobal);
  if (!agent) {
    error("Could not configure agent");
    return;
  }

  log("");
  info(`Agent: ${colors.bright}${agent.type}${colors.reset}`);
  info(`Location: ${colors.bright}${useGlobal ? 'Global' : 'Project'}${colors.reset}`);
  info(`Path: ${agent.configPath}`);
  log("");

  let installedSkills: Array<{ id: string; name: string }> = [];

  // All agents use directory-based storage now
  if (!fs.existsSync(agent.configPath)) {
    info("No skills installed yet.");
    return;
  }
  
  // List all subdirectories (each is a skill)
  const items = fs.readdirSync(agent.configPath);
  const skillDirs = items.filter(item => {
    const itemPath = path.join(agent.configPath, item);
    return fs.statSync(itemPath).isDirectory();
  });
  
  if (skillDirs.length === 0) {
    info("No skills installed yet.");
    return;
  }
  
  installedSkills = skillDirs.map((dir) => ({
    id: dir,
    name: dir
  }));

  // Display skills with numbers
  log("Installed skills:");
  installedSkills.forEach((skill, index) => {
    log(`${colors.cyan}[${index + 1}]${colors.reset} ${skill.name}`);
  });
  log("");

  // Interactive prompt
  log(`${colors.bright}Actions:${colors.reset}`);
  log(`  [1-${installedSkills.length}] - Delete skill by number`);
  log(`  [q] - Quit`);
  log("");

  const answer = await prompt("Select an option: ");

  // Handle user input
  if (answer === 'q' || answer === '') {
    log("Exiting...");
    return;
  }

  // Check if it's a number selection
  const num = parseInt(answer);
  if (num >= 1 && num <= installedSkills.length) {
    const selectedSkill = installedSkills[num - 1];
    log("");
    info(`Selected: ${colors.bright}${selectedSkill.name}${colors.reset}`);
    
    // Confirm deletion
    const confirm = await prompt(`Delete "${selectedSkill.name}"? (y/N): `);
    if (confirm.toLowerCase() === 'y') {
      // Delete the skill directory
      const skillDir = path.join(agent.configPath, selectedSkill.id);
      if (fs.existsSync(skillDir)) {
        // Recursively delete directory
        fs.rmSync(skillDir, { recursive: true, force: true });
        success(`Deleted: ${selectedSkill.name}`);
      } else {
        error("Skill directory not found");
      }
      
      // Show list again
      log("");
      await listSkills();
    } else {
      info("Deletion cancelled");
      await listSkills();
    }
    return;
  }

  error("Invalid selection");
  await listSkills();
}

// Import readline for interactive prompts
import * as readline from "readline";

// Create readline interface
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Prompt user for input
function prompt(question: string): Promise<string> {
  const rl = createReadlineInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Search Skills with interactive selection
async function searchSkills(query: string, page: number = 1, options: InstallOptions = {}): Promise<void> {
  log("");
  info(`Searching for: ${colors.bright}${query}${colors.reset} (page ${page})`);
  
  // Show target agent if specified
  if (options.agents?.[0]) {
    info(`Target agent: ${colors.bright}${options.agents[0]}${colors.reset}`);
  } else {
    const agent = detectAgent();
    if (agent) {
      info(`Target agent: ${colors.bright}${agent.type}${colors.reset} (auto-detected)`);
    }
  }

  try {
    const res = await request(
      `${API_BASE_URL}/api/v1/skills/search?q=${encodeURIComponent(query)}&limit=10&page=${page}`,
      {
        headers: {
          "Authorization": `Bearer ${API_TOKEN}`,
        },
      }
    );
    
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
    log(`Found ${colors.bright}${pagination.total}${colors.reset} skills (page ${pagination.page}/${pagination.totalPages}):`);
    log("");

    // Display skills with numbers
    skills.forEach((skill: any, index: number) => {
      log(`${colors.cyan}[${index + 1}]${colors.reset} ${colors.bright}${skill.name}${colors.reset}`);
      log(`    ${colors.dim}${skill.skillId}${colors.reset}`);
      if (skill.description) {
        const shortDesc = skill.description.length > 60 
          ? skill.description.substring(0, 60) + '...' 
          : skill.description;
        log(`    ${shortDesc}`);
      }
      log(`    ${colors.yellow}★${colors.reset} ${skill.stars} stars`);
      log("");
    });

    // Show pagination info
    if (pagination.totalPages > 1) {
      log(`${colors.dim}Page ${pagination.page} of ${pagination.totalPages}${colors.reset}`);
      log("");
    }

    // Interactive prompt
    log(`${colors.bright}Actions:${colors.reset}`);
    log(`  [1-${skills.length}] - Install skill by number`);
    if (pagination.page < pagination.totalPages) {
      log(`  [n] - Next page`);
    }
    if (pagination.page > 1) {
      log(`  [p] - Previous page`);
    }
    log(`  [q] - Quit`);
    log("");

    const answer = await prompt("Select an option: ");

    // Handle user input
    if (answer === 'q' || answer === '') {
      log("Exiting...");
      return;
    }

    if (answer === 'n' && pagination.page < pagination.totalPages) {
      await searchSkills(query, page + 1, options);
      return;
    }

    if (answer === 'p' && pagination.page > 1) {
      await searchSkills(query, page - 1, options);
      return;
    }

    // Check if it's a number selection
    const num = parseInt(answer);
    if (num >= 1 && num <= skills.length) {
      const selectedSkill = skills[num - 1];
      log("");
      info(`Selected: ${colors.bright}${selectedSkill.name}${colors.reset}`);
      debug(`Full skillId: ${selectedSkill.skillId}`);
      
      // If agent not specified, prompt for agent and location
      let finalOptions = { ...options };
      
      if (!options.agents || options.agents.length === 0) {
        log("");
        log(`${colors.bright}Install to which agent(s)?${colors.reset}`);
        log(`${colors.dim}Enter numbers separated by commas (e.g., 1,3,5) or 'all' for all agents${colors.reset}`);
        log("");
        
        // List all available agents
        const availableAgents = Object.keys(AGENT_CONFIGS);
        const agentList: string[] = [];
        
        availableAgents.forEach((agent, index) => {
          agentList.push(agent);
          log(`  [${index + 1}] ${agent}`);
        });
        
        log(`  [all] All agents`);
        log(`  [q] Cancel`);
        log("");
        
        const agentChoice = await prompt("Select agent(s): ");
        
        if (agentChoice === 'q' || agentChoice === '') {
          log("Installation cancelled");
          await searchSkills(query, page, options);
          return;
        }
        
        let selectedAgents: string[] = [];
        
        if (agentChoice.toLowerCase() === 'all') {
          selectedAgents = [...agentList];
        } else {
          // Parse comma-separated numbers
          const choices = agentChoice.split(',').map(s => s.trim());
          for (const choice of choices) {
            const num = parseInt(choice);
            if (num >= 1 && num <= agentList.length) {
              selectedAgents.push(agentList[num - 1]);
            } else {
              error(`Invalid selection: ${choice}`);
              await searchSkills(query, page, options);
              return;
            }
          }
        }
        
        if (selectedAgents.length === 0) {
          error("No agents selected");
          await searchSkills(query, page, options);
          return;
        }
        
        // Ask for project vs global
        log("");
        log(`${colors.bright}Installation location:${colors.reset}`);
        log(`  [1] Project (e.g., .cursor/skills/)`);
        log(`  [2] Global (e.g., ~/.cursor/skills/)`);
        log("");
        
        const locationChoice = await prompt("Select location [1]: ");
        const useGlobal = locationChoice === '2';
        
        // Install to all selected agents
        log("");
        info(`Installing to ${selectedAgents.length} agent(s)...`);
        
        for (const agent of selectedAgents) {
          const agentOptions = {
            agents: [agent],
            global: useGlobal
          };
          
          log("");
          info(`Installing to ${colors.bright}${agent}${colors.reset}...`);
          
          try {
            await installSkill(selectedSkill.skillId, agentOptions, {
              githubUrl: selectedSkill.githubUrl,
              skillId: selectedSkill.skillId,
              name: selectedSkill.name,
              source: selectedSkill.source
            });
          } catch (err) {
            error(`Failed to install to ${agent}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        
        log("");
        success(`${colors.bright}Installed to ${selectedAgents.length} agent(s) successfully!${colors.reset}`);
        return;
      }
      
      // Install the selected skill with full info (when agent was pre-specified)
      await installSkill(selectedSkill.skillId, finalOptions, {
        githubUrl: selectedSkill.githubUrl,
        skillId: selectedSkill.skillId,
        name: selectedSkill.name,
        source: selectedSkill.source
      });
      return;
    }

    error("Invalid selection");
    await searchSkills(query, page, options);

  } catch (err) {
    error("Search failed. API may be unavailable.");
    info("Try browsing skills at https://skills.lc");
  }
}

// Show version
function showVersion(): void {
  log(`skills-lc-cli version ${PACKAGE_VERSION}`);
}

// Show help
function showHelp(): void {
  log(`
${colors.bright}skills-lc${colors.reset} - AI Agent Skills CLI (v${PACKAGE_VERSION})

${colors.bright}USAGE${colors.reset}
  npx skills-lc-cli add <input> [options]

${colors.bright}INPUT FORMATS${colors.reset}
  <skillId>                   Skill ID (e.g., react-best-practices)
  <owner/repo>                GitHub shorthand (e.g., vercel-labs/agent-skills)
  <owner/repo/skillId>        Full path (e.g., vercel-labs/agent-skills/react)
  https://github.com/...      GitHub URL
  https://gitlab.com/...      GitLab URL
  git@github.com:...          Git URL
  ./path                      Local path

${colors.bright}OPTIONS${colors.reset}
  -l, --list                  List available skills without installing
  -g, --global                Install to user directory instead of project
  -a, --agent <agent>         Target specific agent (claude-code, cursor, etc.)
  -s, --skill <name>          Install specific skill by name
  -y, --yes                   Skip confirmation prompts
  --all                       Install all skills to all agents

${colors.bright}COMMANDS${colors.reset}
  add <skillId>               Install a skill by ID
  add <owner/repo/skillId>    Install a skill from GitHub
  add <owner/repo>            Install default skill from a repo
  list                        List installed skills
  search <query>              Search for skills
  version                     Show CLI version
  help                        Show this help message

${colors.bright}EXAMPLES${colors.reset}
  # Install by skill ID
  npx skills-lc-cli add react-best-practices
  
  # GitHub shorthand
  npx skills-lc-cli add vercel-labs/agent-skills
  
  # Full GitHub URL
  npx skills-lc-cli add https://github.com/vercel-labs/agent-skills
  
  # Direct path to a skill
  npx skills-lc-cli add https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design
  
  # List skills in a repo
  npx skills-lc-cli add vercel-labs/agent-skills --list
  
  # Install specific skills
  npx skills-lc-cli add vercel-labs/agent-skills --skill frontend-design
  
  # Install to specific agent
  npx skills-lc-cli add vercel-labs/agent-skills --agent claude-code
  
  # Non-interactive install
  npx skills-lc-cli add vercel-labs/agent-skills --skill frontend-design -y
  
  # Search and list
  npx skills-lc-cli search react
  npx skills-lc-cli list

${colors.bright}GLOBAL INSTALL${colors.reset}
  npm install -g skills-lc-cli
  skills-lc add <owner/repo/skillId>

${colors.bright}ENVIRONMENT${colors.reset}
  SKILLS_API_URL      API base URL (default: https://skills.lc)
  SKILLS_API_TOKEN    API token (optional, has default)

${colors.bright}SUPPORTED AGENTS${colors.reset}
  amp, kimi-cli, antigravity, augment, claude, claude-code, openclaw,
  cline, codebuddy, codex, command-code, continue, crush, cursor, droid,
  gemini-cli, github-copilot, goose, junie, iflow-cli, kilo, kiro-cli,
  kode, mcpjam, mistral-vibe, mux, opencode, openclaude, openhands, pi,
  qoder, qwen-code, replit, roo, trae, trae-cn, windsurf, zencoder,
  neovate, pochi, adal, local
`);
}

// Main function
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Check for --debug flag (anywhere in args)
  const debugFlagIndex = args.findIndex(arg => arg === '--debug' || arg === '-d');
  if (debugFlagIndex !== -1) {
    DEBUG_MODE = true;
    args.splice(debugFlagIndex, 1); // Remove debug flag
    console.log(`${colors.dim}[DEBUG MODE ENABLED]${colors.reset}`);
  }
  
  const command = args[0];

  switch (command) {
    case "add":
    case "install":
      if (!args[1]) {
        error("Please specify a skill to install");
        log("Usage: npx skills-lc-cli add <skillId> [options]");
        log("   or: npx skills-lc-cli add <owner/repo/skillId> [options]");
        log("\nOptions:");
        log("  --agent <type>    Install to specific agent (claude, cursor, codex, local)");
        log("\nExample:");
        log("  npx skills-lc-cli add react-best-practices --agent cursor");
        process.exit(1);
      }
      
      // Parse options
      const parsedOptions = parseOptions(args.slice(1));
      if (parsedOptions) {
        await installSkill(parsedOptions.input, parsedOptions.options);
      } else {
        await installSkill(args[1]);
      }
      break;

    case "list":
    case "ls":
      await listSkills();
      break;

    case "search":
      if (!args[1]) {
        error("Please specify a search query");
        log("Usage: npx skills-lc-cli search <query> [options]");
        log("\nOptions:");
        log("  --agent <type>    Target agent for installation (claude, cursor, windsurf, etc.)");
        log("  --global          Install to global directory");
        log("\nExample:");
        log("  npx skills-lc-cli search react --agent cursor");
        log("  npx skills-lc-cli search python --agent windsurf --global");
        process.exit(1);
      }
      
      // Parse options for search command
      const searchParsed = parseOptions(args.slice(1));
      if (searchParsed) {
        await searchSkills(searchParsed.input, 1, searchParsed.options);
      } else {
        await searchSkills(args[1]);
      }
      break;

    case "version":
    case "--version":
    case "-v":
      showVersion();
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
