  # Contributing to QEYRO FI app

Thanks for helping. This file explains how to get a change merged.

## Set up

```bash
git clone <your fork>
cd qeyro-fi-app
npm install
npm run typecheck
npm run build
```

## Making a change

1. Open an issue first for anything bigger than a typo, so we can agree on the direction.
2. Create a branch from `main`: `git checkout -b fix/short-description`.
3. Keep the change focused. One concern per pull request.
4. Run the checks above and make sure they pass.
5. Update documentation and the changelog when behaviour changes.
6. Open a pull request using the template.

## Commit messages

Use the imperative mood and explain the why in the body when it is not obvious.

```
Reject delegatecall executions in TransactionLimitHook

They cannot be evaluated, so letting them through would bypass the limits.
```

## Security-sensitive changes

Anything that touches access control, authorization, or funds-adjacent logic needs a second reviewer
and a test for the failure path, not only the success path.
