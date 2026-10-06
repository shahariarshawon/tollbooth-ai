# Architecture decision records

Short records of decisions that are specific to this repository: the context, the decision, what was
considered, and the consequences.

| ADR                                      | Decision                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| [0007](0007-public-demo-architecture.md) | A passwordless, read-only, time-limited session in a flagged demo tenant |

Records for the other decisions (backend-for-frontend authentication, tenant isolation, Redis atomic
enforcement, fail-open and fail-closed, provider abstraction and failover, transactional outbox) are not
written yet. The first four describe behaviour that exists and is documented in `docs/architecture`; the last
two describe work that is not implemented.
