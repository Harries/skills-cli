# 发布 agent-skills-cli 到 npm

本文档介绍如何将 CLI 工具发布到 **npm 官方公共仓库**，让全世界都能使用。

## 前置条件

1. 拥有 npm 账号（在 https://www.npmjs.com 注册）
2. Node.js >= 18

## ⚠️ 重要：确保发布到官方 npm 仓库

如果你使用了阿里云、淘宝等国内镜像，需要确保发布到**官方 npm 仓库**，否则其他人无法安装。

### 检查当前 registry

```bash
npm config get registry
```

如果显示的不是 `https://registry.npmjs.org/`，需要在发布时指定官方仓库。

## 发布步骤

### 1. 登录官方 npm

```bash
# 登录到官方 npm 仓库（重要！）
npm login --registry https://registry.npmjs.org
```

按提示输入用户名、密码和邮箱。

### 2. 检查包名是否可用

```bash
npm search agent-skills-cli --registry https://registry.npmjs.org
```

如果包名已被占用，需要修改 `package.json` 中的 `name` 字段。

### 3. 构建项目

```bash
cd cli
npm install
npm run build
```

### 4. 检查将要发布的文件

```bash
npm pack --dry-run
```

确认只包含必要的文件：
- `dist/` - 编译后的代码
- `README.md` - 说明文档
- `package.json` - 包配置

### 5. 发布到官方 npm（重要！）

```bash
# 发布到官方 npm 仓库
npm publish --registry https://registry.npmjs.org
```

首次发布公开包：
```bash
npm publish --access public --registry https://registry.npmjs.org
```

### 6. 验证发布成功

```bash
# 从官方 npm 查看包信息
npm info agent-skills-cli --registry https://registry.npmjs.org

# 测试安装（全世界都可以使用）
npx agent-skills-cli help
```

## 更新版本

### 更新版本号

```bash
# 补丁版本 1.0.0 -> 1.0.1（bug 修复）
npm version patch

# 次版本 1.0.0 -> 1.1.0（新功能）
npm version minor

# 主版本 1.0.0 -> 2.0.0（破坏性变更）
npm version major
```

### 发布更新

```bash
npm run build
npm publish --registry https://registry.npmjs.org
```

## 使用方式

发布后，全世界的用户都可以这样使用：

```bash
# 使用 npx（无需安装）
npx agent-skills-cli add vercel-labs/agent-skills/react-best-practices

# 全局安装
npm install -g agent-skills-cli
skills add vercel-labs/agent-skills/react-best-practices
```

## 常见问题

### Q: 包名被占用怎么办？

修改 `package.json` 中的 `name`，可以使用：
- `skills-cli-tool`
- `ai-agent-skills`
- `@your-username/skills`（scoped 包）

### Q: 如何使用 scoped 包名？

1. 修改 `package.json`:
```json
{
  "name": "@your-username/skills"
}
```

2. 发布时需要 `--access public`:
```bash
npm publish --access public
```

### Q: 如何撤销发布？

```bash
# 72 小时内可以撤销
npm unpublish agent-skills-cli@1.0.0 --registry https://registry.npmjs.org
```

注意：撤销后 24 小时内不能重新发布同名包。

### Q: 发布到了阿里云/淘宝镜像怎么办？

如果你之前发布到了私有镜像（如 `packages.aliyun.com`），其他人无法访问。需要重新发布到官方仓库：

```bash
# 1. 登录官方 npm
npm login --registry https://registry.npmjs.org

# 2. 重新发布
npm publish --registry https://registry.npmjs.org
```

### Q: 如何永久设置使用官方 npm？

```bash
# 设置发布时始终使用官方仓库
npm config set registry https://registry.npmjs.org

# 或者只在项目中设置（创建 .npmrc 文件）
echo "registry=https://registry.npmjs.org" > .npmrc
```

## npm 仓库对比

| 仓库 | 地址 | 谁能访问 |
|------|------|----------|
| **npm 官方** | `https://registry.npmjs.org` | **全世界** ✅ |
| 淘宝镜像 | `https://registry.npmmirror.com` | 只读镜像 |
| 阿里云私有 | `https://packages.aliyun.com/...` | 仅组织内部 |

