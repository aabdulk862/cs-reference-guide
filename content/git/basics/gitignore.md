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
- `.git/info/exclude` provides local-only ignore rules not shared with the team
- Leading `/` anchors the pattern to the `.gitignore` file's directory (e.g., `/build` only matches root `build/`)

---

## When to Use

Use `.gitignore` in every Git repository to prevent unnecessary, sensitive, or generated files from being committed. You should configure it at project initialization, before your first commit, to avoid accidentally tracking files that should never be in version control. Common scenarios include excluding dependency directories (`node_modules/`, `vendor/`), build outputs (`dist/`, `build/`, `target/`), environment configuration files containing secrets (`.env`, `application-local.yml`), IDE-specific files (`.idea/`, `.vscode/settings.json`), operating system artifacts (`.DS_Store`, `Thumbs.db`), and log files. For personal preferences that should not be imposed on the team (like editor configs), use a global gitignore file. For project-specific ignores that all contributors should share, commit the `.gitignore` file to the repository. Getting `.gitignore` right from the start prevents security incidents from leaked credentials and keeps your repository focused on source code.

Additional scenarios where `.gitignore` configuration is critical:

- **Monorepo environments**: In monorepos, each service or package may have its own build output directory. A root `.gitignore` handles common patterns, while nested `.gitignore` files in subdirectories handle service-specific exclusions. This layered approach keeps the root file manageable while allowing per-service customization.
- **CI/CD artifact management**: Build pipelines generate artifacts (test reports, coverage files, compiled binaries) that should never be committed. Ensure your `.gitignore` covers all CI-generated paths to prevent accidental commits from developers running CI scripts locally.
- **Terraform and IaC projects**: Infrastructure-as-code repositories must ignore state files (`*.tfstate`, `*.tfstate.backup`) which contain sensitive infrastructure details, provider plugins (`.terraform/`), and plan output files. Committing state files is a security risk and causes state conflicts between team members.
- **Machine learning projects**: ML repositories need to ignore large model files, dataset downloads, training checkpoints, and virtual environments while keeping notebooks, configuration, and small reference data tracked.

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

### Python/Data Science .gitignore

```gitignore
# Virtual environments
venv/
.venv/
env/
.env/

# Python bytecode
__pycache__/
*.py[cod]
*$py.class
*.so

# Distribution / packaging
dist/
build/
*.egg-info/
*.egg

# Jupyter Notebook checkpoints
.ipynb_checkpoints/

# Model files and datasets (use Git LFS for these)
*.h5
*.pkl
*.model
data/raw/
data/processed/

# Environment variables
.env
.env.local

# IDE
.idea/
.vscode/
*.swp

# Testing and coverage
.coverage
htmlcov/
.pytest_cache/
.mypy_cache/
```

### Infrastructure/Terraform .gitignore

```gitignore
# Terraform
.terraform/
*.tfstate
*.tfstate.backup
*.tfplan
crash.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# Terraform variables (may contain secrets)
*.auto.tfvars
terraform.tfvars

# Ansible
*.retry

# SSH keys (NEVER commit these)
*.pem
*.key
id_rsa
id_ed25519

# Kubernetes
kubeconfig
*.kubeconfig

# Helm
charts/*.tgz

# AWS
.aws/credentials
```

### Global .gitignore Setup

```bash
# Create a global gitignore file
cat > ~/.gitignore_global << 'EOF'
# macOS
.DS_Store
.AppleDouble
.LSOverride
._*

# Windows
Thumbs.db
ehthumbs.db
Desktop.ini
$RECYCLE.BIN/

# Linux
*~
.directory

# Editors
.idea/
*.swp
*.swo
*~
.vscode/settings.json
.vscode/launch.json
*.sublime-workspace

# Tags
tags
TAGS
EOF

# Configure Git to use it
git config --global core.excludesfile ~/.gitignore_global
```

### .gitattributes for File Handling

`.gitattributes` complements `.gitignore` by controlling how tracked files are handled. While `.gitignore` decides what to track, `.gitattributes` decides how to track it.

```gitattributes
# .gitattributes — controls file handling for tracked files

# Normalize line endings (CRLF on Windows, LF on Unix)
* text=auto

# Force specific line endings for certain files
*.sh text eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf

# Mark binary files (no diff, no merge, no line ending conversion)
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.pdf binary
*.zip binary
*.woff2 binary

# Custom diff drivers for better diffs
*.md diff=markdown
*.css diff=css
*.html diff=html

# Custom merge drivers
package-lock.json merge=ours
yarn.lock merge=ours
*.generated.ts merge=ours

# Linguist overrides (for GitHub language statistics)
docs/** linguist-documentation
vendor/** linguist-vendored
*.min.js linguist-generated

# Export ignore (files excluded from git archive)
.gitignore export-ignore
.gitattributes export-ignore
.github/ export-ignore
tests/ export-ignore
```

Key `.gitattributes` use cases:
- **Line ending normalization**: Prevents CRLF/LF conflicts between Windows and Unix developers
- **Binary file marking**: Prevents Git from attempting text diffs or merges on binary files
- **Custom merge drivers**: Auto-resolves conflicts in generated files (like lock files)
- **LFS tracking**: Specifies which files should use Git Large File Storage
- **Export control**: Excludes files from `git archive` output (release tarballs)

### Git LFS Integration

Git Large File Storage (LFS) replaces large files with text pointers in the repository while storing the actual file content on a separate server. This keeps the repository small and fast.

```bash
# Install Git LFS (one-time setup)
git lfs install

# Track large file types with LFS
git lfs track "*.psd"
git lfs track "*.zip"
git lfs track "*.mp4"
git lfs track "*.model"
git lfs track "datasets/**"

# This creates/updates .gitattributes:
# *.psd filter=lfs diff=lfs merge=lfs -text
# *.zip filter=lfs diff=lfs merge=lfs -text

# Commit the .gitattributes file
git add .gitattributes
git commit -m "Configure Git LFS for large files"

# Now add and commit large files normally
git add assets/design.psd
git commit -m "Add design mockup"
git push  # LFS files are uploaded to LFS server

# View LFS-tracked files
git lfs ls-files

# View LFS status
git lfs status

# Fetch LFS files (if not auto-fetched)
git lfs pull

# Migrate existing large files to LFS (rewrites history)
git lfs migrate import --include="*.psd,*.zip" --everything

# Check LFS storage usage
git lfs env
```

LFS is essential for repositories that contain:
- Design assets (PSD, Sketch, Figma exports)
- Video and audio files
- Machine learning models and datasets
- Compiled binaries and archives
- Game assets (textures, meshes, audio)

Without LFS, these files bloat the repository because Git stores every version of every file. A 100MB PSD file modified 10 times means 1GB of repository data. With LFS, only pointers are stored in Git history, and the LFS server handles versioned binary storage efficiently.

### Per-Directory .gitignore Overrides

Git supports `.gitignore` files in any directory, with rules applying to that directory and its subdirectories. This enables layered ignore configurations:

```text
# Repository structure with multiple .gitignore files:
project/
├── .gitignore              # Root: common patterns for all
├── src/
│   ├── .gitignore          # Source: ignore generated files
│   └── components/
│       └── .gitignore      # Components: ignore storybook cache
├── tests/
│   └── .gitignore          # Tests: ignore coverage, snapshots
└── docs/
    └── .gitignore          # Docs: ignore build output
```

```gitignore
# project/.gitignore (root)
node_modules/
.env
*.log

# project/src/.gitignore
*.generated.ts
__generated__/

# project/tests/.gitignore
coverage/
__snapshots__/
*.snap

# project/docs/.gitignore
_site/
.docusaurus/
```

Precedence rules for nested `.gitignore` files:
1. Patterns in a nested `.gitignore` override patterns from parent directories
2. Within a single file, later patterns override earlier ones
3. More specific patterns (with path separators) take precedence over general patterns
4. `.git/info/exclude` applies after all `.gitignore` files
5. Global gitignore (`core.excludesfile`) has the lowest precedence

### Common Templates for Different Stacks

```gitignore
# ===== Go Project =====
# Binaries
*.exe
*.exe~
*.dll
*.so
*.dylib
/bin/
/dist/

# Test binary
*.test

# Output of go coverage
*.out
coverage.html

# Dependency directories
vendor/

# IDE
.idea/
.vscode/
*.swp

# Environment
.env
.env.local
```

```gitignore
# ===== Rust Project =====
/target/
**/*.rs.bk
Cargo.lock  # Only for libraries; keep for binaries

# IDE
.idea/
.vscode/
*.swp

# Environment
.env
```

```gitignore
# ===== .NET / C# Project =====
## Build results
[Dd]ebug/
[Rr]elease/
x64/
x86/
[Bb]in/
[Oo]bj/

## NuGet
*.nupkg
**/[Pp]ackages/*
!**/[Pp]ackages/build/

## Visual Studio
.vs/
*.suo
*.user
*.userosscache
*.sln.docstates

## User-specific files
*.rsuser
*.suo
*.user
*.userosscache
```

```gitignore
# ===== React Native / Mobile =====
# Dependencies
node_modules/

# React Native
.expo/
dist/
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# iOS
ios/Pods/
ios/build/
*.xcworkspace
!default.xcworkspace

# Android
android/app/build/
android/.gradle/
*.apk
*.aab
local.properties

# Environment
.env
.env.*
!.env.example

# Metro
.metro-health-check*
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

**Q6: How do `.gitignore` and `.gitattributes` work together for repository hygiene?**
`.gitignore` controls which files are tracked, while `.gitattributes` controls how tracked files are handled. Together they provide comprehensive file management: `.gitignore` excludes build artifacts and secrets, while `.gitattributes` configures line ending normalization (`* text=auto`), marks binary files (`*.png binary`), sets up custom merge drivers for lock files (`package-lock.json merge=ours`), and enables Git LFS for large files (`*.psd filter=lfs`). Both files should be committed to the repository.

**Q7: How would you audit a repository to find files that should be ignored but are currently tracked?**
Run `git ls-files` to list all tracked files, then compare against your `.gitignore` patterns. Use `git ls-files --cached --ignored --exclude-standard` to find tracked files that match ignore patterns (these are files that were committed before the ignore rule was added). For each file found, evaluate whether it should be untracked with `git rm --cached`. Tools like `git-secrets` can scan the entire history for accidentally committed credentials.

**Q8: What is the difference between `build/` and `/build/` in a `.gitignore` file?**
`build/` without a leading slash matches any directory named `build` at any depth in the repository (e.g., `src/build/`, `lib/build/`, `./build/`). `/build/` with a leading slash is anchored to the directory containing the `.gitignore` file, so it only matches `build/` at that specific level. Use the anchored form when you want to ignore only the root-level build directory but not nested directories with the same name that might be legitimate source code.

---

## Real-World Use Cases

In enterprise Java projects, `.gitignore` excludes `target/` directories from Maven builds, IDE-specific files like `.idea/` and `*.iml`, and environment-specific property files like `application-local.yml` that contain database credentials. In Node.js microservices, teams ignore `node_modules/` (which can contain thousands of files), `dist/` build output, `.env` files with API keys, and coverage reports from test runs. For monorepos containing multiple services, a root `.gitignore` handles common patterns while each service directory may have its own `.gitignore` for service-specific exclusions. In data science projects, `.gitignore` excludes large dataset files, trained model binaries, and Jupyter notebook checkpoints while keeping the notebooks themselves tracked. Infrastructure-as-code repositories ignore Terraform state files (`*.tfstate`) which contain sensitive infrastructure details, and `.terraform/` directories containing downloaded provider plugins. Mobile development projects ignore platform-specific build directories (`Pods/` for iOS, `.gradle/` for Android) and signing certificates that should never be committed to version control.

## Production Tips

- **Use template generators for new projects**: GitHub maintains a comprehensive collection of `.gitignore` templates at github.com/github/gitignore. Start with the appropriate template for your language/framework and customize from there rather than building from scratch.
- **Audit `.gitignore` during security reviews**: Periodically verify that sensitive file patterns (credentials, keys, environment configs) are properly ignored. Use `git ls-files` to check what is actually tracked and compare against what should be excluded.
- **Set up pre-commit hooks to catch secrets**: Tools like `detect-secrets`, `git-secrets`, or `trufflehog` can scan staged changes for patterns that look like API keys, passwords, or tokens before they are committed, providing a safety net beyond `.gitignore`.
- **Document non-obvious ignore patterns**: Add comments above complex patterns explaining why they exist. Future team members will appreciate understanding why `!config/production.json` is negated or why a specific subdirectory is excluded.
- **Use `.dockerignore` alongside `.gitignore`**: When building Docker images, create a `.dockerignore` file to exclude files from the build context. This is separate from `.gitignore` but often overlaps — keeping both aligned reduces image size and prevents secrets from leaking into containers.
- **Version your `.gitignore` from day one**: The `.gitignore` file should be the first file committed to any new repository, even before application code. This prevents the common scenario where a developer commits `node_modules/` or `.env` on the initial commit and then has to rewrite history to remove it.
- **Use `git check-ignore -v` for debugging**: When a file is unexpectedly ignored (or not ignored), `git check-ignore -v path/to/file` shows exactly which rule in which `.gitignore` file is responsible. This is invaluable for debugging complex multi-level ignore configurations in monorepos.

---

## Related Topics

- [Git Commands](./commands.md) — commands for checking ignore status and untracking files
- [What is Git](./what-is-git.md) — understanding Git's tracking model and the staging area
- [Local vs Remote](./local-vs-remote.md) — how ignored files affect push and pull operations
- [Pull Requests](./pull-requests.md) — ensuring ignored files do not appear in code reviews
