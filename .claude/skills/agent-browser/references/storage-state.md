# Storage Management

Manage cookies, localStorage, sessionStorage, and browser storage state.

## Storage State

Save and restore complete browser state including cookies and storage.

### Save Storage State

```bash
# Save to auto-generated filename (storage-state-{timestamp}.json)
agent-browser state-save

# Save to specific filename
agent-browser state-save my-auth-state.json
```

### Restore Storage State

```bash
# Load storage state from file
agent-browser state-load my-auth-state.json

# Reload page to apply cookies
agent-browser open https://example.com
```

### Storage State File Format

The saved file contains:

```json
{
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": "example.com",
      "path": "/",
      "expires": 1735689600,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://example.com",
      "localStorage": [
        { "name": "theme", "value": "dark" },
        { "name": "user_id", "value": "12345" }
      ]
    }
  ]
}
```

## Cookies

### List All Cookies

```bash
agent-browser cookie-list
```

### Filter Cookies by Domain

```bash
agent-browser cookie-list --domain=example.com
```

### Filter Cookies by Path

```bash
agent-browser cookie-list --path=/api
```

### Get Specific Cookie

```bash
agent-browser cookie-get session_id
```

### Set a Cookie

```bash
# Basic cookie
agent-browser cookie-set session abc123

# Cookie with options
agent-browser cookie-set session abc123 --domain=example.com --path=/ --httpOnly --secure --sameSite=Lax

# Cookie with expiration (Unix timestamp)
agent-browser cookie-set remember_me token123 --expires=1735689600
```

### Delete a Cookie

```bash
agent-browser cookie-delete session_id
```

### Clear All Cookies

```bash
agent-browser cookie-clear
```

### Advanced: Multiple Cookies or Custom Options

For complex scenarios like adding multiple cookies at once, use `run-code`:

```bash
agent-browser run-code "async page => {
  await page.context().addCookies([
    { name: 'session_id', value: 'sess_abc123', domain: 'example.com', path: '/', httpOnly: true },
    { name: 'preferences', value: JSON.stringify({ theme: 'dark' }), domain: 'example.com', path: '/' }
  ]);
}"
```

## Local Storage

### List All localStorage Items

```bash
agent-browser localstorage-list
```

### Get Single Value

```bash
agent-browser localstorage-get token
```

### Set Value

```bash
agent-browser localstorage-set theme dark
```

### Set JSON Value

```bash
agent-browser localstorage-set user_settings '{"theme":"dark","language":"en"}'
```

### Delete Single Item

```bash
agent-browser localstorage-delete token
```

### Clear All localStorage

```bash
agent-browser localstorage-clear
```

### Advanced: Multiple Operations

For complex scenarios like setting multiple values at once, use `run-code`:

```bash
agent-browser run-code "async page => {
  await page.evaluate(() => {
    localStorage.setItem('token', 'jwt_abc123');
    localStorage.setItem('user_id', '12345');
    localStorage.setItem('expires_at', Date.now() + 3600000);
  });
}"
```

## Session Storage

### List All sessionStorage Items

```bash
agent-browser sessionstorage-list
```

### Get Single Value

```bash
agent-browser sessionstorage-get form_data
```

### Set Value

```bash
agent-browser sessionstorage-set step 3
```

### Delete Single Item

```bash
agent-browser sessionstorage-delete step
```

### Clear sessionStorage

```bash
agent-browser sessionstorage-clear
```

## IndexedDB

### List Databases

```bash
agent-browser run-code "async page => {
  return await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases;
  });
}"
```

### Delete Database

```bash
agent-browser run-code "async page => {
  await page.evaluate(() => {
    indexedDB.deleteDatabase('myDatabase');
  });
}"
```

## Common Patterns

### Authentication State Reuse

```bash
# Step 1: Login and save state
agent-browser open https://app.example.com/login
agent-browser snapshot
agent-browser fill e1 "user@example.com"
agent-browser fill e2 "password123"
agent-browser click e3

# Save the authenticated state
agent-browser state-save auth.json

# Step 2: Later, restore state and skip login
agent-browser state-load auth.json
agent-browser open https://app.example.com/dashboard
# Already logged in!
```

### Save and Restore Roundtrip

```bash
# Set up authentication state
agent-browser open https://example.com
agent-browser eval "() => { document.cookie = 'session=abc123'; localStorage.setItem('user', 'john'); }"

# Save state to file
agent-browser state-save my-session.json

# ... later, in a new session ...

# Restore state
agent-browser state-load my-session.json
agent-browser open https://example.com
# Cookies and localStorage are restored!
```

## Security Notes

- Never commit storage state files containing auth tokens
- Add `*.auth-state.json` to `.gitignore`
- Delete state files after automation completes
- Use environment variables for sensitive data
- By default, sessions run in-memory mode which is safer for sensitive operations
