# CARBID

App multiplataforma (iOS, Android, Web) con frontend y backend.

## Stack elegido

- **Mobile + Web**: React Native + React Native Web (codebase compartido)
- **Backend**: Node.js
- **Monorepo recomendado**: `apps/mobile`, `apps/web`, `apps/api`, `packages/shared`

## Agentes instalados (project-scoped en `.claude/agents/`)

### Engineering

- engineering-mobile-app-builder — iOS/Android, React Native, Flutter
- engineering-frontend-developer — React/Vue, UI, performance
- engineering-backend-architect — APIs, DB, microservicios
- engineering-database-optimizer — schema, queries, índices
- engineering-software-architect — system design, DDD
- engineering-devops-automator — CI/CD, cloud
- engineering-security-engineer — threat modeling, secure code
- engineering-rapid-prototyper — POCs, MVPs
- engineering-senior-developer — implementación premium
- engineering-code-reviewer — PR reviews
- engineering-technical-writer — docs, READMEs, API refs
- engineering-git-workflow-master — branching, conventional commits
- engineering-minimal-change-engineer — diffs mínimos sin scope creep
- engineering-ai-engineer — ML/AI features
- engineering-data-engineer — pipelines, ETL
- engineering-codebase-onboarding-engineer — entender repos rápido
- engineering-sre — SLOs, observabilidad

### Design

- design-ui-designer, design-ux-architect, design-ux-researcher, design-brand-guardian

### Testing

- testing-api-tester, testing-accessibility-auditor, testing-performance-benchmarker
- testing-test-results-analyzer, testing-evidence-collector, testing-reality-checker

### Product / PM

- product-manager, product-sprint-prioritizer, product-feedback-synthesizer, product-trend-researcher
- project-manager-senior, project-management-project-shepherd
- agents-orchestrator (coordina pipelines multi-agente)

> Hay 184 agentes adicionales instalados globalmente en `~/.claude/agents/` (de `agency-agents`).

## Cómo usar los agentes

Lanzar un agente con la herramienta `Agent` indicando `subagent_type` (p. ej. `Mobile App Builder`, `Backend Architect`). Para pipelines complejos, usar `Agents Orchestrator`.

## Próximos pasos sugeridos

1. Definir requisitos de CARBID (qué hace la app, usuarios, features clave) → usar skill `superpowers:brainstorming`
2. Diseñar arquitectura → agente `Software Architect`
3. Crear scaffolding monorepo (Turborepo o Nx) → agente `Rapid Prototyper`
4. Setup CI/CD → agente `DevOps Automator`
