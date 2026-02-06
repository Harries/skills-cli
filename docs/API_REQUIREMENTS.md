# API Requirements Documentation

## Overview

Skills CLI uses the following API endpoints.

**Base URL:** `https://skills.lc`

---

## API Endpoints

### 1. POST /api/install
Record a skill installation (increments install count by 1).

No authentication required. This endpoint is public to allow CLI tools and integrations to report installs.

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| skillId | string | Yes | The unique skill identifier (e.g., owner/repo/skill-name) |
| source | string | No | Installation source (default: npx). Examples: cli, web, api |

**Example Request:**
```bash
curl -X POST "https://skills.lc/api/install" \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "vercel-labs/skills/find-skills",
    "source": "cli"
  }'
```

**Success Response:**
```json
{
  "success": true,
  "message": "Install recorded successfully"
}
```

**Error Responses:**

400 Bad Request - Missing skillId:
```json
{ "success": false, "error": "skillId is required" }
```

404 Not Found - Skill does not exist:
```json
{ "success": false, "error": "Skill not found" }
```

---

### 2. GET /api/v1/skills/search
Search and list skills with filtering and pagination.

**Authentication Required:** Yes - Bearer token in Authorization header.

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | `Bearer <token>` |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | No | Search query (searches name, description, tags, author) |
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 20, max: 100) |
| sortBy | string | No | `stars` (default) or `recent` |

**Example Request:**
```bash
curl -X GET "https://skills.lc/api/v1/skills/search?q=react&limit=10" \
  -H "Authorization: Bearer sk_live_xxxxx"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "id": "clxx...",
        "skillId": "react-best-practices",
        "name": "React Best Practices",
        "source": "owner/repo",
        "description": "A comprehensive guide...",
        "author": "John Doe",
        "tags": ["react", "frontend"],
        "stars": 1250,
        "githubUrl": "https://github.com/owner/repo",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-20T15:45:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasMore": true
    }
  }
}
```

---

## CLI Commands

| Command | API Used |
|---------|----------|
| `skills-lc add <owner/repo/skillId>` | `POST /api/install` |
| `skills-lc search <query>` | `GET /api/v1/skills/search` |
| `skills-lc list` | Local only |
| `skills-lc help` | Local only |

---

## Test Commands

```bash
# Search (requires token)
curl -X GET "https://skills.lc/api/v1/skills/search?q=react&limit=5" \
  -H "Authorization: Bearer sk_live_xxxxx"

# Record install (no token required)
curl -X POST "https://skills.lc/api/install" \
  -H "Content-Type: application/json" \
  -d '{"skillId": "vercel-labs/skills/find-skills", "source": "cli"}'
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SKILLS_API_TOKEN` | No | API token (optional, CLI has default) |
| `SKILLS_API_URL` | No | API base URL (default: https://skills.lc) |
