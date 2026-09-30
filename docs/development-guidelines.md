# Development Guidelines

## Coding standards

### TypeScript

- `strict` mode is on for every package (see `tsconfig.base.json`), plus `noUncheckedIndexedAccess`.
  Do not weaken it per package. Avoid `any`; use `unknown` and narrow.
- Use `import type` for type-only imports (enforced by ESLint).
- Prettier owns formatting and ESLint owns linting. Do not add inline disables without a comment
  explaining why.

### Architecture

Each NestJS service follows clean architecture, with dependencies pointing inward:

```
controllers / consumers  ->  application services (use cases)  ->  domain  <-  infrastructure adapters
```

- **Domain**: entities and rules. No framework, database or HTTP imports.
- **Application**: use cases. They depend on interfaces (ports), never on Prisma, Redis or Kafka directly.
- **Infrastructure**: Prisma repositories, Redis clients, Kafka producers, provider SDK adapters.
  These implement the ports.
- **Interface**: controllers, guards, DTO validation, Kafka/BullMQ consumers. Keep them thin:
  validate, delegate, map the result.

### SOLID, applied

- One reason to change per class. A provider adapter talks to one provider.
- Add behaviour by adding implementations (a new LLM provider is a new adapter), not by editing
  `switch` blocks.
- Depend on abstractions through Nest DI tokens, so use cases can be tested with fakes.

### Naming

- Names describe intent: `calculateRequestCost`, not `process` or `handleData`.
- Files are `kebab-case` with a role suffix: `budget.service.ts`, `api-key.repository.ts`.
- Classes are `PascalCase`, variables and functions `camelCase`, constants `UPPER_SNAKE_CASE`.
- No abbreviations except widely known ones (`id`, `url`, `llm`).

### Error handling

- Throw typed errors (subclasses of a domain error or a Nest `HttpException`), never bare strings.
- Validate at the boundary (DTOs, env config). Trust validated data inside.
- Never swallow errors. Catch only to add context, recover or translate, then rethrow or handle.
- Do not leak internals (stack traces, SQL, raw provider responses) to API clients.
- Never log secrets, API keys, prompts or completions at info level.
- Configuration errors must fail at startup (`loadConfig`), not at first use.

## Git

### Branches

Branch from `main` and use a prefix:

- `feature/<short-description>` for new functionality
- `bugfix/<short-description>` for non-urgent fixes
- `hotfix/<short-description>` for urgent production fixes

### Commits

Conventional commits: `<type>: <summary in imperative mood>`

| Type        | Use for                                    |
| ----------- | ------------------------------------------ |
| `feat:`     | a new feature                              |
| `fix:`      | a bug fix                                  |
| `docs:`     | documentation only                         |
| `refactor:` | a code change that is neither fix nor feat |
| `test:`     | adding or correcting tests                 |

Keep commits small and focused. CI (lint, format, typecheck, tests) must pass before merging.
