# Convex Endpoints Documentation for Mobile App

This document describes the Convex functions your Expo client should call.

Base endpoints:
- Cloud URL: `https://careful-elephant-671.convex.cloud`
- HTTP URL: `https://careful-elephant-671.convex.site`

In Expo, use Convex client with generated `api` references.

---

## 1) Authentication

## `agents.login` (mutation)
Authenticate an agent by email + password and create an auth log.

### Input
```ts
{
  email: string;
  password: string;
  deviceInfo?: string;
}
```

### Success output
```ts
{
  success: true;
  agent: {
    agentId: string;
    email: string;
    nom: string;
    role: "agent" | "admin";
    statut: "actif" | "inactif";
  };
}
```

### Error
- Throws `"Authentification echouee"` if agent not found, inactive, or wrong password.
- Throws `"Mot de passe non configure"` if account has no password set.
- On failure, backend logs `AUTH_LOGIN_FAILED` in `auditLogs`.

### Audit behavior
- Success: logs `AUTH_LOGIN_SUCCESS`
- Failure: logs `AUTH_LOGIN_FAILED`

---

## `agents.logout` (mutation)
Log out agent and create audit event.

### Input
```ts
{
  agentId: string;
  deviceInfo?: string;
}
```

### Success output
```ts
{
  success: true;
}
```

### Error
- Throws `"Agent introuvable"` if unknown `agentId`.

### Audit behavior
- Logs `AUTH_LOGOUT`

---

## `agents.setPassword` (mutation)
Set or reset password for an existing agent.

### Input
```ts
{
  agentId: string;
  newPassword: string; // min 8 characters
}
```

### Success output
```ts
{
  success: true;
}
```

### Error
- Throws `"Agent introuvable"`
- Throws `"Le mot de passe doit contenir au moins 8 caracteres"`

### Audit behavior
- Logs `AUTH_PASSWORD_SET`

---

## `agents.getCurrentAgent` (query)
Get agent profile by `authUserId` mapping.

### Input
```ts
{
  authUserId: string;
}
```

### Output
- Agent document or `null`

---

## `agents.updateProfile` (mutation)
Update agent **nom** and/or **email**. At least one field required.

### Input
```ts
{
  agentId: string;
  nom?: string;
  email?: string;
}
```

### Success output
```ts
{
  success: true;
  agent: {
    agentId: string;
    email: string;
    nom: string;
    role: "agent" | "admin";
    statut: "actif" | "inactif";
  };
}
```

### Error
- Throws `"Agent introuvable"`
- Throws `"Aucune modification"` if no field was sent
- Throws `"Le nom ne peut pas etre vide"` / `"L'email ne peut pas etre vide"`
- Throws `"Cet email est deja utilise"` if email belongs to another agent

### Audit behavior
- Logs `AGENT_PROFILE_UPDATED` with `metadata.fields` listing changed keys (`nom`, `email`)

---

## 2) Vehicle lookup by plate (mobile)

### Recommended: `carLookup.getByPlate` (query)
One call returns vehicle, all vignettes, computed **active** vignette, and recent infractions.  
Matricule is normalized server-side: `trim` + **UPPERCASE**.

### Input
```ts
{
  matricule: string;
  infractionsLimit?: number; // default 50, max 200
}
```

### Output
```ts
{
  matriculeNormalized: string;
  vehicule: VehiculeDoc | null;
  vignettes: VignetteDoc[];
  activeVignette: VignetteDoc | null;
  infractions: InfractionDoc[];
  /** true if at least one of vehicule, vignettes, infractions exists */
  hasAnyData: boolean;
}
```

**Active vignette rule:** `statutPaiement === "paye"` and `dateExpiration >= today` (UTC date `YYYY-MM-DD`).

### Expo
```ts
const data = useQuery(api.carLookup.getByPlate, { matricule: plateInput });
```

### Granular queries (optional)
Same data can be fetched with separate calls:
- `vehicules.getByMatricule`
- `vignettes.getByMatricule`
- `vignettes.getActiveByMatricule`
- `infractions.listByMatricule`

---

## 3) Vehicle and Vignette (granular)

## `vehicules.getByMatricule` (query)
### Input
```ts
{ matricule: string }
```
### Output
- Vehicle document or `null`

---

## `vignettes.getByMatricule` (query)
### Input
```ts
{ matricule: string }
```
### Output
- List of vignettes for this plate

---

## `vignettes.getActiveByMatricule` (query)
### Input
```ts
{ matricule: string }
```
### Output
- Active vignette or `null`

---

## 4) Infractions

## `infractions.create` (mutation)
### Input
```ts
{
  idInfraction: string;
  matricule: string;
  dateInfraction: string; // ISO date/time
  typeInfraction: string;
  description: string;
  montantAmende: number;
  statutInfraction: "brouillon" | "enregistree" | "contestee" | "payee" | "annulee";
  lieu: string;
  agentId?: string;
}
```

### Output
- Created document id (`Id<"infractions">`)

---

## `infractions.listByMatricule` (query)
### Input
```ts
{ matricule: string }
```
### Output
- Infractions list (desc order)

---

## `infractions.updateStatut` (mutation)
### Input
```ts
{
  idInfraction: string;
  statutInfraction: "brouillon" | "enregistree" | "contestee" | "payee" | "annulee";
}
```
### Output
- Updated document id

---

## 5) Audit Logs

## `audit.logAction` (mutation)
### Input
```ts
{
  actorAgentId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: any;
}
```
### Output
- Created audit log id

---

## `audit.listByEntity` (query)
### Input
```ts
{
  entityType: string;
  entityId: string;
}
```
### Output
- Audit logs list (desc order)

---

## `audit.listByActorAgentId` (query)
For agent profile activity timeline.

### Input
```ts
{
  actorAgentId: string;
}
```
### Output
- Audit logs list (desc order)

---

## 6) Seeding (Dev only)

## `seed.seedDemoData` (mutation)
Creates demo records if they do not exist.

### Input
```ts
{}
```

### Output
```ts
{ ok: true }
```

---

## 7) Expo Client Integration Example

```ts
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const login = useMutation(api.agents.login);
const setPassword = useMutation(api.agents.setPassword);
const updateProfile = useMutation(api.agents.updateProfile);
const logout = useMutation(api.agents.logout);
const carData = useQuery(api.carLookup.getByPlate, { matricule: "12345-A-6" });
const vehicule = useQuery(api.vehicules.getByMatricule, { matricule: "12345-A-6" });
```

---

## 8) Recommended Mobile Calling Sequence

1. During onboarding/dev setup call `agents.setPassword({ agentId, newPassword })` once.
2. Call `agents.login({ email, password, deviceInfo })`
3. Store returned `agent.agentId` in secure storage.
4. Use `agentId` to:
   - look up a vehicle by plate: `carLookup.getByPlate({ matricule })`,
   - create infractions,
   - update profile via `agents.updateProfile({ agentId, nom?, email? })`,
   - log actions via `audit.logAction`,
   - fetch profile activity via `audit.listByActorAgentId`.
5. On app exit/session end call `agents.logout({ agentId, deviceInfo })`.
