# Implementation Roadmap

## Phase 1: Local MVP

Status: started.

Deliverables:

- TypeScript CLI project
- auth/profile management
- product and price commands
- checkout session command
- subscription command
- webhook signing and local simulation
- doctor and smoke-test commands

## Phase 2: Framework Starters

Parallelizable work:

- Next.js route generator
- Express route generator
- FastAPI route generator
- shared webhook verifier snippets
- generated curl examples per framework

## Phase 3: Merchant Integration Automation

Needs ClinkBill API support:

- webhook endpoint create/list/delete
- event list and event replay
- test event trigger
- hosted webhook relay or local tunnel service

CLI commands to add after API support:

- `clink webhook create`
- `clink webhook listen`
- `clink trigger`
- `clink events tail`
- `clink events replay`

## Phase 4: AI-Native Tooling

Parallelizable work:

- MCP server wrapper around the CLI/API client
- OpenAPI generated typed client
- structured integration reports
- production validation gate
- CI examples for integration smoke tests

