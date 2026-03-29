import os
import random
import subprocess
from datetime import datetime, timedelta

# Define the date range (March 17, 2026 to March 28, 2026)
start_date = datetime(2026, 3, 17, 10, 0, 0)
end_date = datetime(2026, 3, 28, 18, 0, 0)

def get_random_date():
    time_between = end_date - start_date
    random_days = random.randrange(time_between.days + 1)
    random_hours = random.randrange(24)
    random_minutes = random.randrange(60)
    return start_date + timedelta(days=random_days, hours=random_hours, minutes=random_minutes)

# Directories to completely ignore during the walk
ignore_dirs = {'.git', '__pycache__', 'venv', 'node_modules', '.pytest_cache'}

def run_git_commands():
    files_found = 0
    commits_made = 0
    
    for root, dirs, files in os.walk('.'):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            # Skip hidden files and the auto-commit script itself
            if file.startswith('.') or file == 'auto_commit.py': 
                continue
                
            filepath = os.path.join(root, file)
            files_found += 1
            
            # 1. Stage the specific file
            subprocess.run(["git", "add", filepath], capture_output=True)
            
            # 2. Check if the file was successfully staged (respects .gitignore)
            status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
            if not status.stdout.strip():
                continue # Nothing was staged (file was likely in .gitignore)

            # 3. Generate random backdated time
            commit_date = get_random_date().strftime('%Y-%m-%d %H:%M:%S')
            
            # 4. Commit with environment variables injected
            env = os.environ.copy()
            env['GIT_AUTHOR_DATE'] = commit_date
            env['GIT_COMMITTER_DATE'] = commit_date
            
            commit_msg = f"Add {file}"
            result = subprocess.run(["git", "commit", "-m", commit_msg], env=env, capture_output=True, text=True)
            
            if result.returncode == 0:
                print(f"✅ Committed {filepath} on {commit_date}")
                commits_made += 1
            else:
                print(f"❌ Failed to commit {filepath}: {result.stderr or result.stdout}")

    print(f"\n📊 Summary: Found {files_found} files, made {commits_made} commits.")

if __name__ == "__main__":
    run_git_commands()