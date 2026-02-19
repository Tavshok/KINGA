# Dev Role Override - Quick Reference

## All Accessible Roles

Copy and paste these URLs to instantly test different roles in development:

### Insurer Roles (4 roles)

```bash
# Insurer Admin - Full admin access
http://localhost:3000/?devRole=insurer_admin

# Risk Manager - Risk management dashboard
http://localhost:3000/?devRole=risk_manager

# Claims Manager - Claims management dashboard
http://localhost:3000/?devRole=claims_manager

# Executive - Executive analytics dashboard
http://localhost:3000/?devRole=executive
```

### Assessor Roles (2 roles)

```bash
# Internal Assessor - Internal damage assessment
http://localhost:3000/?devRole=assessor_internal

# External Assessor - External damage assessment
http://localhost:3000/?devRole=assessor_external
```

### Panel Beater Role (1 role)

```bash
# Panel Beater - Repair shop portal
http://localhost:3000/?devRole=panel_beater
```

---

## Role Details

| Dev Role | User Role | Insurer Role | Mock Email | Mock Name |
|----------|-----------|--------------|------------|-----------|
| `insurer_admin` | `insurer` | `insurer_admin` | dev.admin@kinga-dev.local | Dev Insurer Admin |
| `risk_manager` | `insurer` | `risk_manager` | dev.risk@kinga-dev.local | Dev Risk Manager |
| `claims_manager` | `insurer` | `claims_manager` | dev.claims@kinga-dev.local | Dev Claims Manager |
| `executive` | `insurer` | `executive` | dev.executive@kinga-dev.local | Dev Executive |
| `assessor_internal` | `assessor` | - | dev.internal.assessor@kinga-dev.local | Dev Internal Assessor |
| `assessor_external` | `assessor` | - | dev.external.assessor@kinga-dev.local | Dev External Assessor |
| `panel_beater` | `panel_beater` | - | dev.panelbeater@kinga-dev.local | Dev Panel Beater |

---

## Dashboard Access by Role

### Insurer Admin
- `/insurer/dashboard` - Main insurer dashboard
- `/insurer/role-selection` - Role selection page
- `/analytics` - Analytics hub
- `/governance` - Governance dashboard (with executive/insurer_admin)
- All insurer routes

### Risk Manager
- `/insurer/dashboard` - Main insurer dashboard
- `/risk-manager/dashboard` - Risk manager specific dashboard
- Risk-related analytics

### Claims Manager
- `/insurer/dashboard` - Main insurer dashboard
- `/claims-manager/dashboard` - Claims manager specific dashboard
- Claims triage and management

### Executive
- `/insurer/dashboard` - Main insurer dashboard
- `/executive/dashboard` - Executive dashboard
- `/governance` - Governance dashboard
- High-level analytics

### Internal Assessor
- `/assessor/dashboard` - Assessor dashboard
- Damage assessment tools
- Internal assessment workflows

### External Assessor
- `/assessor/dashboard` - Assessor dashboard
- Damage assessment tools
- External assessment workflows

### Panel Beater
- `/panel-beater/dashboard` - Panel beater dashboard
- Quote submission
- Repair tracking

---

## Testing Workflow

### 1. Start with Insurer Admin (Full Access)
```bash
http://localhost:3000/?devRole=insurer_admin
```
- Test all insurer features
- Verify admin-only functionality
- Check governance access

### 2. Test Restricted Roles
```bash
# Risk Manager - Limited to risk features
http://localhost:3000/?devRole=risk_manager

# Claims Manager - Limited to claims features
http://localhost:3000/?devRole=claims_manager

# Executive - Analytics and governance only
http://localhost:3000/?devRole=executive
```
- Verify role-based restrictions
- Check unauthorized route handling
- Test permission boundaries

### 3. Test Non-Insurer Roles
```bash
# Assessor roles
http://localhost:3000/?devRole=assessor_internal
http://localhost:3000/?devRole=assessor_external

# Panel beater role
http://localhost:3000/?devRole=panel_beater
```
- Verify different dashboard layouts
- Check role-specific features
- Test cross-role interactions

---

## Quick Tips

### Switch Roles Instantly
Just change the `?devRole` parameter and reload:
```bash
# From risk_manager to executive
http://localhost:3000/?devRole=executive
```

### Clear Override
Remove `?devRole` or click "Logout":
```bash
http://localhost:3000/
```

### Visual Confirmation
Look for:
- 🔺 Red badge in top-right corner
- Console warning: "⚠️ DEV ROLE OVERRIDE ACTIVE"

### Test Protected Routes
```bash
# Try accessing governance as different roles
http://localhost:3000/governance?devRole=executive  # ✅ Should work
http://localhost:3000/governance?devRole=risk_manager  # ❌ Should redirect
```

---

## Common Use Cases

### 1. Testing Role-Based UI
```bash
# Compare dashboards across roles
?devRole=insurer_admin
?devRole=risk_manager
?devRole=claims_manager
```

### 2. Testing Route Protection
```bash
# Try accessing restricted routes
?devRole=claims_manager  # Then navigate to /governance
```

### 3. Testing Permission Logic
```bash
# Test different permission levels
?devRole=executive  # Full analytics access
?devRole=claims_manager  # Limited analytics access
```

### 4. Testing Workflow Transitions
```bash
# Start as assessor, complete assessment
?devRole=assessor_internal

# Switch to claims manager to review
?devRole=claims_manager
```

---

## Verification Checklist

- [ ] All 7 roles accessible via `?devRole` parameter
- [ ] Console warning appears for each role
- [ ] Red badge shows in top-right corner
- [ ] Correct dashboard loads for each role
- [ ] Role-based restrictions enforced
- [ ] Logout clears override and removes parameter
- [ ] No database persistence (check DB after testing)
- [ ] Production build disables override

---

## Troubleshooting

**Role not working?**
1. Check console for error messages
2. Verify exact role name (case-sensitive)
3. Ensure dev server running (`pnpm dev`)
4. Check `import.meta.env.MODE === 'development'`

**Badge not showing?**
1. Verify `DevRoleBadge` imported in `App.tsx`
2. Check console for "DEV ROLE OVERRIDE ACTIVE" message
3. Refresh page with `?devRole` parameter

**Backend API failing?**
- Dev override only affects frontend
- For full-stack testing, use real OAuth login
- Backend still requires valid session cookies

---

## Security Notes

✅ **Safe for Development**
- Automatically disabled in production
- No database writes
- No backend bypass
- Frontend-only override

❌ **Not for Production**
- Never deploy with `NODE_ENV=development`
- Always use real OAuth in production
- Mock users have no backend session

---

For detailed documentation, see `DEV_ROLE_OVERRIDE_README.md`
