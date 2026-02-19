# Development-Only Role Override System

## Overview

The Dev Role Override system allows developers to bypass OAuth authentication and instantly test different user roles and permissions using a simple URL query parameter. This dramatically speeds up development and testing workflows.

**⚠️ SECURITY**: This feature is **automatically disabled in production** and only works when `NODE_ENV === 'development'`.

---

## Quick Start

### Basic Usage

Add `?devRole=ROLE_NAME` to any URL:

```
http://localhost:3000/?devRole=risk_manager
http://localhost:3000/insurer/dashboard?devRole=executive
http://localhost:3000/analytics?devRole=claims_manager
```

### Supported Roles

| Dev Role | User Role | Insurer Role | Description |
|----------|-----------|--------------|-------------|
| `insurer_admin` | `insurer` | `insurer_admin` | Full insurer admin access |
| `risk_manager` | `insurer` | `risk_manager` | Risk management dashboard |
| `claims_manager` | `insurer` | `claims_manager` | Claims management dashboard |
| `executive` | `insurer` | `executive` | Executive analytics dashboard |
| `internal_assessor` | `assessor` | - | Internal damage assessor |
| `external_assessor` | `assessor` | - | External damage assessor |
| `panel_beater` | `panel_beater` | - | Panel beater/repair shop |

---

## Features

### 1. **Automatic Mock User Injection**

When `?devRole` is detected:
- Skips real OAuth authentication
- Generates mock user with appropriate role and permissions
- Injects user into `useAuth()` state
- **Does NOT persist to database** (client-state only)

### 2. **Visual Indicators**

- **Console Warning**: Styled warning message in browser console
  ```
  ⚠️ DEV ROLE OVERRIDE ACTIVE: risk_manager
  ```

- **UI Badge**: Red badge in top-right corner showing active override
  ```
  🔺 DEV OVERRIDE: insurer (risk_manager)
  ```

### 3. **Production Safety**

- Checks `import.meta.env.MODE !== "development"` before activating
- Automatically disabled in production builds
- No security vulnerabilities in deployed code

### 4. **Easy Logout**

Click "Logout" button to:
- Clear mock user state
- Remove `?devRole` query parameter
- Reload page to normal state

---

## Implementation Details

### File Structure

```
client/src/_core/
├── devRoleOverride.ts          # Core override logic and mock user generator
└── hooks/
    └── useAuth.ts              # Modified to support dev override

client/src/components/
└── DevRoleBadge.tsx            # Visual indicator component

client/src/App.tsx              # DevRoleBadge added to root
```

### How It Works

1. **URL Detection** (`devRoleOverride.ts`)
   - `isDevRoleOverrideEnabled()` checks `NODE_ENV` and `?devRole` existence
   - `getDevRoleFromURL()` validates role against whitelist

2. **Mock User Generation** (`devRoleOverride.ts`)
   - `generateMockUser(devRole)` creates user object with:
     - Unique ID: `dev-user-{role}`
     - Dev email: `dev.{role}@kinga-dev.local`
     - Appropriate `role` and `insurerRole`
     - Tenant ID: `dev-tenant-001`

3. **Auth Hook Integration** (`useAuth.ts`)
   - On mount, checks for `?devRole` parameter
   - If found, sets `devMockUser` state
   - Skips real `trpc.auth.me.useQuery()` (via `enabled: !devMockUser`)
   - Returns mock user in auth state with `isDevOverride: true` flag

4. **Visual Feedback**
   - Console warning logged via `logDevRoleOverrideWarning()`
   - `DevRoleBadge` component renders when `isDevOverride === true`

---

## Testing Workflow

### Example: Testing Risk Manager Dashboard

```bash
# 1. Start dev server
pnpm dev

# 2. Open browser with dev role override
http://localhost:3000/?devRole=risk_manager

# 3. Verify:
#    - Console shows: "⚠️ DEV ROLE OVERRIDE ACTIVE: risk_manager"
#    - Top-right badge shows: "DEV OVERRIDE: insurer (risk_manager)"
#    - Dashboard renders with risk manager permissions

# 4. Test different role:
http://localhost:3000/?devRole=executive

# 5. Logout to clear override
#    - Click "Logout" button
#    - Page reloads without ?devRole parameter
```

### Testing All Roles

```bash
# Insurer roles
?devRole=insurer_admin
?devRole=risk_manager
?devRole=claims_manager
?devRole=executive

# Assessor roles
?devRole=internal_assessor
?devRole=external_assessor

# Panel beater role
?devRole=panel_beater
```

---

## Security Guarantees

### ✅ Production Safety

```typescript
// devRoleOverride.ts
export function isDevRoleOverrideEnabled(): boolean {
  // Only enable in development environment
  if (import.meta.env.MODE !== "development") {
    return false;
  }
  // ...
}
```

**Result**: In production builds, `import.meta.env.MODE === "production"`, so override is **always disabled**.

### ✅ No Database Persistence

Mock users exist **only in client state**:
- Not written to `users` table
- Not written to `sessions` table
- Not stored in backend
- Cleared on page reload (unless `?devRole` still present)

### ✅ No Backend Bypass

- Real tRPC procedures still require authentication
- Backend validates session cookies (mock users have no cookies)
- **Dev override only affects frontend routing and UI rendering**
- Backend API calls will fail without real authentication

**Recommendation**: For full-stack testing, use real OAuth login with test accounts.

---

## Troubleshooting

### Override Not Working

**Symptom**: `?devRole=risk_manager` doesn't activate override

**Causes**:
1. **Production mode**: Check `import.meta.env.MODE` in console
   - Solution: Ensure dev server is running (`pnpm dev`)

2. **Invalid role**: Typo in role name
   - Solution: Check supported roles list (case-sensitive)

3. **Console error**: Check browser console for warnings
   - Solution: Fix any TypeScript errors in `devRoleOverride.ts`

### Backend API Calls Failing

**Symptom**: tRPC queries return `UNAUTHORIZED` errors

**Cause**: Dev override only affects frontend; backend still requires real auth

**Solution**: 
- For frontend-only testing: Use dev override
- For full-stack testing: Use real OAuth login with test accounts

### Badge Not Showing

**Symptom**: Override active (console warning shows) but no UI badge

**Cause**: `DevRoleBadge` component not imported in `App.tsx`

**Solution**: Verify `App.tsx` includes:
```typescript
import DevRoleBadge from "./components/DevRoleBadge";

// Inside App function:
<DevRoleBadge />
```

---

## Best Practices

### 1. **Use for Frontend Testing Only**

Dev override is ideal for:
- ✅ Testing role-based UI rendering
- ✅ Testing route protection logic
- ✅ Testing dashboard layouts
- ✅ Testing permission-based component visibility

**Not suitable for**:
- ❌ Testing backend authorization logic
- ❌ Testing database queries
- ❌ Testing API security

### 2. **Combine with Real Auth for Full Testing**

```bash
# Frontend testing: Use dev override
?devRole=risk_manager

# Full-stack testing: Use real login
# (Create test accounts with different roles)
```

### 3. **Clear Override When Done**

Always logout or remove `?devRole` parameter when finished testing to avoid confusion.

---

## Extending the System

### Adding New Roles

1. **Update `DevRole` type** (`devRoleOverride.ts`):
```typescript
export type DevRole =
  | "insurer_admin"
  | "risk_manager"
  // ... existing roles
  | "new_role_name"; // Add here
```

2. **Add to `validRoles` array** (`devRoleOverride.ts`):
```typescript
const validRoles: DevRole[] = [
  // ... existing roles
  "new_role_name",
];
```

3. **Add case to `generateMockUser()`** (`devRoleOverride.ts`):
```typescript
case "new_role_name":
  return {
    ...baseUser,
    email: "dev.newrole@kinga-dev.local",
    name: "Dev New Role",
    role: "insurer", // or "assessor", "panel_beater", etc.
    insurerRole: "new_role_name", // if applicable
  };
```

---

## FAQ

**Q: Can this be used in production?**  
A: No. The system automatically disables itself when `NODE_ENV !== 'development'`.

**Q: Does this bypass backend security?**  
A: No. It only affects frontend routing and UI rendering. Backend API calls still require real authentication.

**Q: Will mock users appear in the database?**  
A: No. Mock users exist only in client state and are never persisted.

**Q: Can I use multiple roles at once?**  
A: No. Only one `?devRole` parameter is supported at a time.

**Q: How do I switch roles?**  
A: Change the `?devRole` parameter in the URL and reload the page.

**Q: Is this safe to commit to version control?**  
A: Yes. The code includes production safeguards and is designed to be committed.

---

## Changelog

### v1.0.0 (2026-02-19)
- Initial implementation
- Support for 7 dev roles (insurer_admin, risk_manager, claims_manager, executive, internal_assessor, external_assessor, panel_beater)
- Console warning and UI badge indicators
- Production safety checks
- Automatic logout and query parameter cleanup

---

## Support

For issues or questions:
1. Check console for warning messages
2. Verify `import.meta.env.MODE === 'development'`
3. Review this README
4. Check `devRoleOverride.ts` implementation

**Remember**: This is a development tool. For production testing, always use real OAuth authentication.
