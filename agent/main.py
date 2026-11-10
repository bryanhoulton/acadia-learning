#!/usr/bin/env python3

import sys
from pathlib import Path

# Add src directory to Python path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))


# Import after path setup to avoid E402
def main():
    from livekit import agents

    from src.agent.main import entrypoint

    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint, agent_name="learning-agent"))


if __name__ == "__main__":
    main()
