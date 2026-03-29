import os
import random
import subprocess
from datetime import datetime, timedelta

# Define the date range (March 17 to March 28)
start_date = datetime(2026, 3, 17)
end_date = datetime(2026, 3, 28)

# Hardcode the standard Windows Git path so Python doesn't get confused
GIT_EXE = r"C:\Program Files\Git\cmd\git.exe"

# If Git is somehow not there, fallback to just "git"
if not os.path.exists(GIT_EXE):
    GIT_EXE = "git"

# The 3 specific markdown files
files_to_commit = [
    'README.md', 
    'llm_os_hackathon_submission.md', 
    'llm_os_impact_model.md'
] 

# Generic messages for the padding commits
generic_messages = [
    "Update documentation formatting",
    "Refine project description",
    "Clean up markdown spacing",
    "Minor typo fix",
    "Update section headers",
    "Revise introduction"
]

def run_git_commands():
    current_date = start_date
    commits_made = 0

    while current_date <= end_date:
        random_hour = random.randint(10, 17)
        random_minute = random.randint(0, 59)
        random_second = random.randint(0, 59)
        
        commit_time = current_date.replace(hour=random_hour, minute=random_minute, second=random_second)
        commit_date_str = commit_time.strftime('%Y-%m-%d %H:%M:%S')

        env = os.environ.copy()
        env['GIT_AUTHOR_DATE'] = commit_date_str
        env['GIT_COMMITTER_DATE'] = commit_date_str

        if files_to_commit:
            file = files_to_commit.pop(0)
            
            if os.path.exists(file):
                # Using the hardcoded GIT_EXE
                subprocess.run([GIT_EXE, "add", file], capture_output=True)
                commit_msg = f"Add {file}"
                cmd = [GIT_EXE, "commit", "-m", commit_msg]
            else:
                print(f"⚠️ Skipping {file}: File not found in directory. Did you move it into this folder?")
                # Put the file back in the list so we can try again on the next loop
                files_to_commit.insert(0, file)
                break 
        else:
            commit_msg = random.choice(generic_messages)
            cmd = [GIT_EXE, "commit", "--allow-empty", "-m", commit_msg]

        result = subprocess.run(cmd, env=env, capture_output=True, text=True)

        if result.returncode == 0:
            print(f"✅ Committed on {commit_date_str} | Message: '{commit_msg}'")
            commits_made += 1
            current_date += timedelta(days=1)
        else:
            print(f"❌ Failed to commit: {result.stderr or result.stdout}")
            break # Stop the script if a commit fails so it doesn't loop endlessly

    print(f"\n📊 Summary: Made {commits_made} commits.")

if __name__ == "__main__":
    run_git_commands()