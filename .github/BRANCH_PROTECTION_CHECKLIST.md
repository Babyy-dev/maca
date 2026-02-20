# Branch Protection Checklist

Use this checklist to enforce CI before merge on your default branch (`main` or `master`).

## Required CI Checks

These are the workflow job names from `.github/workflows/ci.yml`:

- `Frontend Typecheck`
- `Backend Tests`

## GitHub UI Steps

1. Open your repository on GitHub.
2. Go to `Settings` -> `Branches`.
3. Under `Branch protection rules`, click `Add rule`.
4. In `Branch name pattern`, enter your default branch name (usually `main`).
5. Enable:
   - `Require a pull request before merging`
   - `Require status checks to pass before merging`
6. In status checks, select:
   - `Frontend Typecheck`
   - `Backend Tests`
7. Recommended additional protections:
   - `Require conversation resolution before merging`
   - `Require linear history`
   - `Do not allow bypassing the above settings`
8. Click `Create` / `Save changes`.

## Optional (CLI via GitHub API)

If you use GitHub CLI and have repo admin rights, you can apply protection with:

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/OWNER/REPO/branches/main/protection \
  -f required_status_checks.strict=true \
  -f required_status_checks.contexts[]="Frontend Typecheck" \
  -f required_status_checks.contexts[]="Backend Tests" \
  -f enforce_admins=true \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -f restrictions=
```

Replace:

- `OWNER` with your GitHub username/org
- `REPO` with your repository name
- `main` with your protected branch (if different)
