# Project Agent Guide

## Instruction precedence

- Follow the nearest `AGENTS.md` for files being changed.
- This root file applies when no more specific instruction exists.
- Match established patterns in adjacent code when instructions are silent.

## Change scope

- Make the smallest change that fully solves the task.
- Do not reformat, rename, or refactor unrelated code.
- Do not introduce a new library or architectural pattern when an existing one
  already solves the problem.
- Preserve existing public APIs unless the task explicitly requires changing them.

## Workspace

- **Stack:** React 19, MUI v9, React Hook Form, React Router v8, Tanstack query
- **Package manager:** pnpm workspaces. Never run `npm install` or `yarn` — pnpm only.

## Validation

Run the narrowest relevant checks before finishing:

- `pnpm lint`
- Format only changed files; never run repository-wide formatting unless requested.
- Report any checks that were not run or failed.

## Naming & Code Practices

- Consistent numbering suffixes: `-count` (0 or 1 based), `-number` (starts from 1), `-index` (starts from 0), `numberOf-` (can start from 0)
- Boolean names must start with `is-`, `has-`, or `should-`
- Avoid suffixes like `-data`, `-info`, `-details` on variable names
- Name lookup records with the `valueByKey` pattern, e.g. `userById`
- Derive variable names from their types, e.g. `orderSummary: OrderSummary`
- Enum members use `SCREAMING_SNAKE_CASE`
- Extract non-obvious or reused values into named `SCREAMING_SNAKE_CASE` constants
- When a function accepts multiple parameters, use a single object parameter with named properties
- For spacing between elements, use `gap` on parent containers — not margins on children
- Extract reusable React stateful logic into custom hooks; keep stateless reusable logic in utility functions
- When behavior depends on multiple flags or nullable values, cover every meaningful state in tests
- Add comments only where intent, constraints, or non-obvious trade-offs aren't clear from the code

## Component Architecture

Container/presenter split: the hook owns logic and state, the presenter (`ComponentName.tsx`) owns rendering, `index.tsx` connects them.

```
ComponentName/
├── index.tsx              # Main export, connects hook to presenter
├── ComponentName.tsx      # UI rendering (presenter)
├── useComponentName.ts    # Logic and state (custom hook)
├── types.ts               # Type definitions (beyond the props interface)
├── utils.ts               # Utility functions
├── transformer.ts         # API transformation logic
├── items/                 # Internal subcomponents (same structure, recursively)
└── __tests__/             # Component tests
```

```typescript
// index.tsx
import { ComponentName as Component } from './ComponentName';
import { useComponentName } from './useComponentName';

export interface ComponentNameProps {}

export const ComponentName: React.FC<ComponentNameProps> = (props) => {
  const componentProps = useComponentName(props);
  return <Component {...componentProps} />;
};
```

```typescript
// useComponentName.ts
import type { ComponentNameProps } from '.';

export const useComponentName = (props: ComponentNameProps) => {
  // Logic, state, and handlers
  return {
    ...props,
    // Additional props for presenter
  };
};
```

```typescript
// ComponentName.tsx — should use props as returned by the useComponentName hook
type Props = ReturnType<typeof useComponentName>;

export const ComponentName: React.FC<Props> = (
  {
    /* destructured */
  },
) => {
  return <div />;
};
```

- Components in `items/` follow the same folder structure as their parent when they need hooks, types, utils, tests, or subcomponents. Simple presentational items may contain only `index.tsx` and `ComponentName.tsx`.
- The `items/` folder must NOT have a barrel `index.ts` — items are internal to the parent.

## Data Transformation

- API types and reusable API transformations live in `libs/services`; feature-specific UI-state to API transformations live near the feature in `transformer.ts`.
- Use separate API and client types when field names, nullability, nesting, or semantics differ. Suffix API-response interfaces with `API` (e.g. `MediaImageAPI` → `MediaImage`).
- Name transform functions `transform{Entity}From{Source}` / `transform{Entity}To{Target}`. Compose small transformers for nested structures; handle collections with a collection transformer that maps over the entity transformer.
- Handle nullable fields according to the API contract. Do not silently invent fallback values for required data.

## Async & Data Fetching

- Use `async/await` — no `.then()` chains.
- GraphQL → Apollo; REST → TanStack Query. Handle failures through the respective error flow.
- Use `try/catch` for awaited operations only when the caller must recover or add context.
- Use React error boundaries for unexpected rendering errors.

## Styling

- Use MUI v9 for all UI work. Follow the existing theme — do not introduce new themes.
- Prefer `sx` for MUI styling and state-driven styles; colocate styles with components.
- Use CSS modules (`styles.module.scss`, next to the component) only for complex selectors, keyframes, pseudo-elements, and browser-specific rules awkward in `sx`. camelCase, purpose-descriptive class names.
- Never use `!important`. Avoid z-index via layout positioning; if unavoidable, use theme z-index tokens, never arbitrary numbers.

## Config Files

- Nx: `nx.json` · TS: `tsconfig.base.json` + per-project · ESLint: `eslint.config.cjs` (flat) · Prettier: `.prettierrc`

## Available Skills

Read the skill file before starting any task that matches its description.

| Skill                                     | Use when                                                                                                    | Skill file                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| add-staging-env                           | Adding a new staging environment to app.                                                                    | [SKILL.md](.agents/skills/add-staging-env/SKILL.md)                           |
| igniteui-react-components                 | Choosing Ignite UI React components, project setup, component JSX, events, or React state/form integration. | [SKILL.md](.agents/skills/igniteui-react-components/SKILL.md)                 |
| igniteui-react-customize-theme            | Brand colors, dark mode, component-level overrides, or scoped themes for Ignite UI React.                   | [SKILL.md](.agents/skills/igniteui-react-customize-theme/SKILL.md)            |
| igniteui-react-generate-from-image-design | Building a working React view with Ignite UI from a design image (screenshot, mockup, wireframe).           | [SKILL.md](.agents/skills/igniteui-react-generate-from-image-design/SKILL.md) |
| igniteui-react-optimize-bundle-size       | Bundle too large, setting up tree-shaking, or lazy loading heavy components like grids and charts.          | [SKILL.md](.agents/skills/igniteui-react-optimize-bundle-size/SKILL.md)       |
| link-workspace-packages                   | Wiring dependencies between monorepo packages, or "cannot find module" errors for workspace packages.       | [SKILL.md](.agents/skills/link-workspace-packages/SKILL.md)                   |
| modernize-component                       | Modernizing a monolithic component to a container/presenter split.                                          | [SKILL.md](.agents/skills/modernize-component/SKILL.md)                       |
| monitor-ci                                | Monitoring the Nx Cloud CI pipeline and self-healing fixes for the current branch.                          | [SKILL.md](.agents/skills/monitor-ci/SKILL.md)                                |
| nx-generate                               | Scaffolding apps, libraries, features, or project structure with Nx generators.                             | [SKILL.md](.agents/skills/nx-generate/SKILL.md)                               |
| nx-import                                 | Importing, merging, or combining external repositories into this Nx workspace.                              | [SKILL.md](.agents/skills/nx-import/SKILL.md)                                 |
| nx-plugins                                | Discovering Nx plugins or adding support for a new framework or technology.                                 | [SKILL.md](.agents/skills/nx-plugins/SKILL.md)                                |
| nx-run-tasks                              | Running build, test, lint, serve, or other Nx workspace tasks.                                              | [SKILL.md](.agents/skills/nx-run-tasks/SKILL.md)                              |
| nx-workspace                              | Exploring workspace structure, project configuration, available targets, or debugging Nx task failures.     | [SKILL.md](.agents/skills/nx-workspace/SKILL.md)                              |
