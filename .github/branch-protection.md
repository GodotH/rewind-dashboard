# Branch Protection Baseline

`main` should enforce:

- require pull requests before merge
- require at least 1 approving review
- dismiss stale reviews on new commits
- require review from code owners
- require conversation resolution before merge
- require status checks to pass before merge
- block force pushes
- block branch deletion

Required checks:

- `Dependency Review`
- `Package Policy`
- `Cross-Platform Build (ubuntu-latest)`
- `Cross-Platform Build (macos-latest)`
- `Cross-Platform Build (windows-latest)`
- `Type Check`
- `Unit Tests`
- `Production Build`
- `Lint`
- `E2E Tests`
