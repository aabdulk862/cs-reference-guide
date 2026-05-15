# .gitignore

## Quick Reference

- `.gitignore` tells Git which files and directories to exclude from version control
- Patterns use glob syntax: `*` (wildcard), `**` (any directory depth), `?` (single char)
- Trailing `/` matches directories only (e.g., `build/`)
- Leading `!` negates a pattern, re-including a previously ignored file
- `#` starts a comment line
- Patterns are matched relative to the `.gitignore` file's location
- `.gitignore` can exist in any directory; rules apply to that directory and below
- Global ignore: `git config --global core.excludesfile ~/.gitignore_global`
- Already-tracked files are not affected by `.gitignore` — use `git rm --cached` to untrack

---

## When to Use

Use `.gitignore` in every Git repository to prevent unnecessary, sensitive, or generated files from being committed. You should configure it at project initialization, before your first commit, to avoid accidentally tracking files that should never be in version control. Common scenarios include excluding dependency directories (`node_modules/`, `vendor/`), build outputs (`dist/`, `build/`, `target/`), environment configuration files containing secrets (`.env`, `application-local.yml`), IDE-specific files (`.idea/`, `.vscode/settings.json`), operating system artifacts (`.DS_Store`, `Thumbs.db`), and log files. For personal preferences that should not be imposed on the team (like editor configs), use a global gitignore file. For project-specific ignores that all contributors should share, commit the `.gitignore` file to the repository. Getting `.gitignore` right from the start prevents security incidents from leaked credentials and keeps your repository focused on source code.

---

## Code Examples

### Standard Web Project .gitignore

```gitignore
# Dependencies
node_modules/
bower_components/

# Build output
dist/
build/
.next/
out/

# Environment and secrets
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS files
.DS_Store
Thumbs.db
Desktop.ini

# IDE files
.idea/
.vscode/
*.swp
*.swo
*~

# Test coverage
coverage/
.nyc_output/

# Cache
.cache/
.parcel-cache/
.eslintcache
```

### Java/Spring Boot .gitignore

```gitignore
# Compiled class files
*.class

# Build directories
target/
build/
out/

# Gradle
.gradle/
gradle-app.setting

# Maven
*.jar
*.war
*.ear

# IDE
.idea/
*.iml
.project
.classpath
.settings/

# Environment
application-local.yml
application-local.properties
*.env

# Logs
*.log
logs/
```

### Using Negation Patterns

```gitignore
# Ignore all .json files in config/
config/*.json

# But DO track the default config
!config/default.json

# Ignore all files in secrets/
secrets/*

# But keep the directory (with a .gitkeep)
!secrets/.gitkeep

# Ignore everything in vendor/ except a specific lib
vendor/*
!vendor/critical-lib/
```

### Checking What Is Ignored

```bash
# Check if a specific file is ignored and why
git check-ignore -v path/to/file

# List all ignored files in the repository
git status --ignored

# List all ignored files (short format)
git status --ignored -s

# Remove a file from tracking (after adding to .gitignore)
git rm --cached path/to/file
git rm --cached -r path/to/directory/

# Commit the removal
git commit -m "Remove tracked file now in .gitignore"
```

---

## Pattern Syntax Diagram

```mermaid
graph TD
    A[.gitignore Pattern] --> B{Pattern Type}
    B --> C[Literal filename<br/>e.g., .env]
    B --> D[Wildcard *<br/>e.g., *.log]
    B --> E[Directory trailing /<br/>e.g., node_modules/]
    B --> F[Negation !<br/>e.g., !important.log]
    B --> G[Double star **<br/>e.g., **/build/]
    B --> H[Character class<br/>e.g., *.[oa]]
    C --> I[Matches exact filename<br/>in any subdirectory]
    D --> J[Matches any file<br/>with that extension]
    E --> K[Matches entire<br/>directory tree]
    F --> L[Re-includes a<br/>previously ignored file]
    G --> M[Matches pattern at<br/>any directory depth]
    H --> N[Matches files ending<br/>in .o or .a]
```

| Pattern | Meaning | Example Match |
| --- | --- | --- |
| `*.log` | All files with `.log` extension | `error.log`, `debug.log` |
| `node_modules/` | Entire directory tree | `node_modules/express/index.js` |
| `!important.log` | Re-include previously ignored file | `important.log` is tracked |
| `**/build/` | `build/` directory at any depth | `src/build/`, `lib/build/` |
| `doc/*.txt` | `.txt` files only in `doc/` (not subdirs) | `doc/readme.txt` |
| `doc/**/*.pdf` | `.pdf` files in `doc/` at any depth | `doc/v2/spec.pdf` |
| `/TODO` | Only `TODO` in repo root (not subdirs) | `./TODO` only |
| `*.py[cod]` | Character class matching | `file.pyc`, `file.pyo` |

---

## Common Pitfalls

- **Adding `.gitignore` after files are already tracked**: `.gitignore` only prevents untracked files from being added. Files already committed continue to be tracked. Fix with `git rm --cached <file>` followed by a commit.
- **Forgetting to ignore `.env` files**: Environment files often contain API keys, database passwords, and other secrets. If committed even once, they remain in Git history forever. Use `git-secrets` or pre-commit hooks to prevent this.
- **Overly broad patterns**: Using `*.json` at the root level ignores all JSON files including `package.json` and `tsconfig.json`. Be specific with paths or use negation patterns to re-include essential files.
- **Not committing `.gitignore` to the repository**: The `.gitignore` file itself should be tracked so all team members share the same ignore rules. Only personal preferences belong in the global gitignore.
- **Platform-specific patterns in project `.gitignore`**: Patterns like `.DS_Store` or `Thumbs.db` are personal environment artifacts. These belong in your global `~/.gitignore_global`, not in the project file, unless the team agrees to include them.
- **Ignoring the wrong directory level**: `build/` ignores any directory named `build` at any depth. `/build/` only ignores `build` at the repository root. Understand the difference to avoid accidentally ignoring nested directories you need.

---

## Interview Questions

**Q1: How does `.gitignore` work and what are its limitations?**
`.gitignore` uses glob patterns to tell Git which untracked files to exclude from `git add` and `git status`. Its main limitation is that it only affects untracked files — once a file is committed, `.gitignore` has no effect on it. You must explicitly untrack it with `git rm --cached`. Additionally, `.gitignore` cannot prevent someone from force-adding an ignored file with `git add -f`.

**Q2: A developer accidentally committed a `.env` file with secrets. How do you fix this?**
First, add `.env` to `.gitignore` and run `git rm --cached .env` to untrack it. Commit this change. However, the secret is still in Git history. For true removal, use `git filter-branch` or `BFG Repo Cleaner` to rewrite history, then force-push. Most importantly, rotate all exposed credentials immediately since anyone with repo access could have seen them.

**Q3: What is the difference between `.gitignore` and `.git/info/exclude`?**
`.gitignore` is committed to the repository and shared with all collaborators. `.git/info/exclude` serves the same purpose but is local to your clone and never shared. Use `exclude` for personal ignores that should not affect the team, like custom editor backup files or local test scripts.

**Q4: How would you ignore all files in a directory but keep the directory itself in Git?**
Git does not track empty directories. The convention is to add a `.gitkeep` file inside the directory, then configure `.gitignore` to ignore everything else: add `directory/*` followed by `!directory/.gitkeep`. This keeps the directory structure while ignoring its contents.

**Q5: Explain the order of precedence for gitignore rules.**
Rules are evaluated from top to bottom within a file, with later rules overriding earlier ones. Nested `.gitignore` files override parent directory rules. `.git/info/exclude` applies after `.gitignore`. The global gitignore (`core.excludesfile`) has the lowest precedence. Within a single file, more specific patterns (with path components) take precedence over general patterns.

---

## Real-World Use Cases

In enterprise Java projects, `.gitignore` excludes `target/` directories from Maven builds, IDE-specific files like `.idea/` and `*.iml`, and environment-specific property files like `application-local.yml` that contain database credentials. In Node.js microservices, teams ignore `node_modules/` (which can contain thousands of files), `dist/` build output, `.env` files with API keys, and coverage reports from test runs. For monorepos containing multiple services, a root `.gitignore` handles common patterns while each service directory may have its own `.gitignore` for service-specific exclusions. In data science projects, `.gitignore` excludes large dataset files, trained model binaries, and Jupyter notebook checkpoints while keeping the notebooks themselves tracked. Infrastructure-as-code repositories ignore Terraform state files (`*.tfstate`) which contain sensitive infrastructure details, and `.terraform/` directories containing downloaded provider plugins. Mobile development projects ignore platform-specific build directories (`Pods/` for iOS, `.gradle/` for Android) and signing certificates that should never be committed to version control.

## Production Tips

- **Use template generators for new projects**: GitHub maintains a comprehensive collection of `.gitignore` templates at github.com/github/gitignore. Start with the appropriate template for your language/framework and customize from there rather than building from scratch.
- **Audit `.gitignore` during security reviews**: Periodically verify that sensitive file patterns (credentials, keys, environment configs) are properly ignored. Use `git ls-files` to check what is actually tracked and compare against what should be excluded.
- **Set up pre-commit hooks to catch secrets**: Tools like `detect-secrets`, `git-secrets`, or `trufflehog` can scan staged changes for patterns that look like API keys, passwords, or tokens before they are committed, providing a safety net beyond `.gitignore`.
- **Document non-obvious ignore patterns**: Add comments above complex patterns explaining why they exist. Future team members will appreciate understanding why `!config/production.json` is negated or why a specific subdirectory is excluded.
- **Use `.dockerignore` alongside `.gitignore`**: When building Docker images, create a `.dockerignore` file to exclude files from the build context. This is separate from `.gitignore` but often overlaps — keeping both aligned reduces image size and prevents secrets from leaking into containers.

---

## Related Topics

- [Git Commands](./git-commands.md) — commands for checking ignore status and untracking files
- [What is Git](./what-is-git.md) — understanding Git's tracking model and the staging area
- [Local vs Remote](./local-vs-remote.md) — how ignored files affect push and pull operations
- [Pull Requests](./pull-requests.md) — ensuring ignored files do not appear in code reviews
