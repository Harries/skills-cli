#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

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
    // Try direct skillId paths first (most common)
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
    
    // Priority 1: use skillId if it looks like a valid skill identifier (not a URL)
    if (skillId && !skillId.startsWith('http')) {
      payload.skillId = skillId;
    } else if (githubUrl) {
      // Priority 2: use githubUrl if provided
      payload.githubUrl = githubUrl;
    } else if (skillId) {
      // Fallback: use skillId as githubUrl if it's a URL
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

// Install a single skill and record it
async function installSingleSkill(
  skill: { content: string; skillId: string; url?: string },
  source: string,
  githubUrl: string,
  agent: { type: string; configPath: string }
): Promise<void> {
  info(`Installing: ${colors.bright}${skill.skillId}${colors.reset}`);
  
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
        debug("Skill already installed, updating...");
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

  // Record install
  debug("Recording install...");
  const recorded = await recordInstall('', source, githubUrl);
  if (recorded) {
    debug("Install recorded successfully");
  } else {
    debug("Could not record install (API may be unavailable)");
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
          
          // Detect agent first (needed for multiple skills installation)
          const agent = detectAgent();
          if (!agent) {
            error("Could not detect AI agent configuration");
            process.exit(1);
          }
          
          // If skillId specified, match by name
          let targetSkill = foundSkills[0]; // Default to first
          if (skillId) {
            const directSkillId = skillId.split('/').pop();
            const matched = foundSkills.find(s => 
              s.name === directSkillId || 
              s.path.includes(`/${directSkillId}/`)
            );
            if (matched) {
              targetSkill = matched;
            } else {
              info(`Skill "${directSkillId}" not found, available skills:`);
              foundSkills.forEach(s => info(`  - ${s.name}`));
              process.exit(1);
            }
            
            // Install single skill
            const branches = ['main', 'master'];
            for (const branch of branches) {
              const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${targetSkill.path}`;
              try {
                const res = await request(rawUrl);
                if (res.status === 200) {
                  const githubUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${targetSkill.dir}`;
                  skill = { content: res.data, skillId: targetSkill.name, url: githubUrl };
                  source = `${owner}/${repo}`;
                  reportSkillId = skillId;
                  break;
                }
              } catch {
                // Try next branch
              }
            }
          } else if (foundSkills.length > 1) {
            // Multiple skills found - install all
            info(`Found ${foundSkills.length} skills in this repository:`);
            foundSkills.forEach(s => info(`  - ${s.name}`));
            info("");
            info("Installing all skills...");
            
            // Install all skills
            for (const targetSkill of foundSkills) {
              const branches = ['main', 'master'];
              let installed = false;
              
              for (const branch of branches) {
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${targetSkill.path}`;
                try {
                  const res = await request(rawUrl);
                  if (res.status === 200) {
                    // Use tree URL (directory) not blob URL (file)
                    const githubUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${targetSkill.dir}`;
                    const skillContent = { content: res.data, skillId: targetSkill.name, url: githubUrl };
                    
                    // Install this skill
                    await installSingleSkill(skillContent, `${owner}/${repo}`, githubUrl, agent);
                    installed = true;
                    break;
                  }
                } catch {
                  // Try next branch
                }
              }
              
              if (!installed) {
                info(`Could not fetch: ${targetSkill.name}`);
              }
            }
            
            log("");
            success(`${colors.bright}All skills installed successfully!${colors.reset}`);
            log("");
            return;
          } else {
            // Only one skill found - install it
            const branches = ['main', 'master'];
            for (const branch of branches) {
              const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${targetSkill.path}`;
              try {
                const res = await request(rawUrl);
                if (res.status === 200) {
                  const githubUrl = `https://github.com/${owner}/${repo}/tree/${branch}/${targetSkill.dir}`;
                  skill = { content: res.data, skillId: targetSkill.name, url: githubUrl };
                  source = `${owner}/${repo}`;
                  reportGithubUrl = githubUrl;
                  break;
                }
              } catch {
                // Try next branch
              }
            }
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
  const agent = detectAgent();
  if (!agent) {
    error("Could not detect AI agent configuration");
    process.exit(1);
  }

  log("");
  info(`Agent: ${colors.bright}${agent.type}${colors.reset}`);
  info(`Config: ${agent.configPath}`);
  log("");

  let installedSkills: Array<{ id: string; name: string; source?: string }> = [];

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
    
    installedSkills = files.map((f) => ({
      id: f.replace(".md", ""),
      name: f.replace(".md", "")
    }));
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
    
    installedSkills = matches.map((m) => {
      const match = m.match(/<!-- Skill: ([^ ]+) from ([^ ]+) -->/);
      if (match) {
        return { id: match[1], name: match[1], source: match[2] };
      }
      return { id: "", name: "" };
    }).filter(s => s.id);
  }

  // Display skills with numbers
  log("Installed skills:");
  installedSkills.forEach((skill, index) => {
    if (skill.source) {
      log(`${colors.cyan}[${index + 1}]${colors.reset} ${skill.name} ${colors.dim}(${skill.source})${colors.reset}`);
    } else {
      log(`${colors.cyan}[${index + 1}]${colors.reset} ${skill.name}`);
    }
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
      // Delete the skill
      if (agent.type === "local") {
        const skillFile = path.join(agent.configPath, `${selectedSkill.id}.md`);
        if (fs.existsSync(skillFile)) {
          fs.unlinkSync(skillFile);
          success(`Deleted: ${selectedSkill.name}`);
        } else {
          error("Skill file not found");
        }
      } else {
        const content = fs.readFileSync(agent.configPath, "utf-8");
        const regex = new RegExp(
          `<!-- Skill: ${selectedSkill.id} from [^>]+ -->\\n[\\s\\S]*?(?=<!-- Skill:|$)`,
          "g"
        );
        const updated = content.replace(regex, "").replace(/\n{3,}/g, "\n\n");
        fs.writeFileSync(agent.configPath, updated, "utf-8");
        success(`Deleted: ${selectedSkill.name}`);
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
async function searchSkills(query: string, page: number = 1): Promise<void> {
  log("");
  info(`Searching for: ${colors.bright}${query}${colors.reset} (page ${page})`);

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
      await searchSkills(query, page + 1);
      return;
    }

    if (answer === 'p' && pagination.page > 1) {
      await searchSkills(query, page - 1);
      return;
    }

    // Check if it's a number selection
    const num = parseInt(answer);
    if (num >= 1 && num <= skills.length) {
      const selectedSkill = skills[num - 1];
      log("");
      info(`Selected: ${colors.bright}${selectedSkill.name}${colors.reset}`);
      debug(`Full skillId: ${selectedSkill.skillId}`);
      
      // Install the selected skill with full info
      await installSkill(selectedSkill.skillId, {}, {
        githubUrl: selectedSkill.githubUrl,
        skillId: selectedSkill.skillId,
        name: selectedSkill.name,
        source: selectedSkill.source
      });
      return;
    }

    error("Invalid selection");
    await searchSkills(query, page);

  } catch (err) {
    error("Search failed. API may be unavailable.");
    info("Try browsing skills at https://skills.lc");
  }
}

// Show help
function showHelp(): void {
  log(`
${colors.bright}skills-lc${colors.reset} - AI Agent Skills CLI

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
  • Claude Code    ~/.claude/CLAUDE.md
  • Cursor         .cursor/rules/skill.mdc
  • Codex          ~/.codex/instructions.md
  • Local          .skills/*.md
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
        log("Usage: npx skills-lc-cli add <skillId>");
        log("   or: npx skills-lc-cli add <owner/repo/skillId>");
        process.exit(1);
      }
      await installSkill(args[1]);
      break;

    case "list":
    case "ls":
      await listSkills();
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
