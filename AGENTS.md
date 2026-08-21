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

- **Repo:** `tuya-home-assistant-ir-bridge`
- **Backend:** Fastify, TypeScript, Node 24 LTS (`.nvmrc`)
- **Frontend:** Vite, React 19, MUI v9 (`colorSchemes` light/dark), React Hook Form,
  React Router v8, TanStack Query, `material-react-toastify`
- **Package manager:** pnpm workspaces. Never run `npm install` or `yarn` — pnpm only.
- **License:** GNU GPL v3 (`LICENSE`). Do not replace with MIT.

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

- API types and reusable API transformations live in `frontend/src/libs/services`; feature-specific UI-state to API transformations live near the feature in `transformer.ts`.
- Use separate API and client types when field names, nullability, nesting, or semantics differ. Suffix API-response interfaces with `API` (e.g. `MediaImageAPI` → `MediaImage`).
- Name transform functions `transform{Entity}From{Source}` / `transform{Entity}To{Target}`. Compose small transformers for nested structures; handle collections with a collection transformer that maps over the entity transformer.
- Handle nullable fields according to the API contract. Do not silently invent fallback values for required data.

## Async & Data Fetching

- Use `async/await` — no `.then()` chains.
- REST → TanStack Query. Handle failures through the query/mutation error flow.
- Use `try/catch` for awaited operations only when the caller must recover or add context.
- Use React error boundaries for unexpected rendering errors.

## Styling

- Use MUI v9 for all UI work. Use the existing theme with `colorSchemes` light/dark — do not add a second design system.
- Prefer `sx` for MUI styling and state-driven styles; colocate styles with components.
- Use CSS modules (`styles.module.scss`, next to the component) only for complex selectors, keyframes, pseudo-elements, and browser-specific rules awkward in `sx`. camelCase, purpose-descriptive class names.
- Never use `!important`. Avoid z-index via layout positioning; if unavoidable, use theme z-index tokens, never arbitrary numbers.

## Secrets

- Never commit `.env`, `data/catalog.json`, or `data/mapping.json`.
- Frontend must not receive Tuya secrets or raw IR codes.

## Config Files

- TS: `tsconfig.base.json` + per-project
- ESLint: `backend/eslint.config.cjs`, `frontend/eslint.config.js`
- Prettier: `.prettierrc`
- Node: `.nvmrc` (`24`)
